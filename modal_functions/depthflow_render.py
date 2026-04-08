"""
DepthFlow parallax video generator on Modal.

Generates a Ken Burns-style parallax MP4 from a render image + depth map.
Uploads result to Supabase Storage and returns the public URL.

Deploy: modal deploy modal_functions/depthflow_render.py
"""

import modal
import os
import tempfile
import subprocess
import sys
import urllib.request
import urllib.parse
import json

app = modal.App('cova-depthflow')

depthflow_image = (
    modal.Image.debian_slim(python_version='3.11')
    .apt_install([
        'ffmpeg', 'libgl1-mesa-glx', 'libglib2.0-0',
        'libsm6', 'libxext6', 'libxrender-dev',
        'libgomp1',
    ])
    .pip_install([
        'depthflow==0.9.1',
        'Pillow>=10.0.0',
        'numpy',
    ])
)


def _download(url: str, dest: str) -> None:
    """Download a URL to a local file using stdlib only."""
    with urllib.request.urlopen(url, timeout=60) as resp:
        with open(dest, 'wb') as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)


def _upload_supabase(path: str, storage_path: str, supabase_url: str, service_key: str) -> str:
    """Upload a file to Supabase Storage, return public URL."""
    with open(path, 'rb') as f:
        data = f.read()

    upload_url = f'{supabase_url}/storage/v1/object/room-videos/{storage_path}'
    req = urllib.request.Request(
        upload_url,
        data=data,
        method='PUT',
        headers={
            'Authorization': f'Bearer {service_key}',
            'Content-Type': 'video/mp4',
            'x-upsert': 'true',
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f'Upload failed: {resp.status}')

    return f'{supabase_url}/storage/v1/object/public/room-videos/{storage_path}'


@app.function(
    image=depthflow_image,
    gpu='t4',
    timeout=180,
    memory=4096,
    secrets=[modal.Secret.from_name('supabase-cova')],
)
@modal.fastapi_endpoint(method='POST')
def generate_parallax(item: dict) -> dict:
    """
    Input: { render_url, depth_map_url, room_id }
    Output: { video_url } or { error, video_url: null }
    """
    render_url = item.get('render_url')
    depth_map_url = item.get('depth_map_url')
    room_id = item.get('room_id')

    if not render_url or not depth_map_url:
        return {'error': 'render_url and depth_map_url required', 'video_url': None}

    try:
        with tempfile.TemporaryDirectory() as tmp:
            render_path = os.path.join(tmp, 'render.jpg')
            depth_path = os.path.join(tmp, 'depth.png')
            output_path = os.path.join(tmp, 'parallax.mp4')

            # Download render and depth map
            _download(render_url, render_path)
            _download(depth_map_url, depth_path)

            # Run DepthFlow via Python module
            result = subprocess.run(
                [
                    sys.executable, '-m', 'DepthFlow', 'main',
                    '--image', render_path,
                    '--depth', depth_path,
                    '--output', output_path,
                    '--time', '3',
                    '--fps', '30',
                    '--width', '1080',
                    '--height', '1080',
                    '--ssaa', '1',
                    '--animation', 'dolly',
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0 or not os.path.exists(output_path):
                # Try alternative CLI
                result2 = subprocess.run(
                    [
                        'depthflow', 'dolly', 'main',
                        '--image', render_path,
                        '--depth', depth_path,
                        '--output', output_path,
                        '--time', '3',
                        '--fps', '30',
                        '--width', '1080',
                        '--height', '1080',
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )

                if result2.returncode != 0 or not os.path.exists(output_path):
                    return {
                        'error': f'DepthFlow failed: {result.stderr[:200]} | {result2.stderr[:200]}',
                        'video_url': None,
                    }

            file_size = os.path.getsize(output_path)
            if file_size < 1024:
                return {'error': f'Output too small ({file_size} bytes)', 'video_url': None}

            # Upload to Supabase Storage
            supabase_url = os.environ.get('SUPABASE_URL', '')
            service_key = os.environ.get('SUPABASE_SERVICE_KEY', '')

            if not supabase_url or not service_key:
                return {'error': 'Supabase credentials not configured', 'video_url': None}

            storage_path = f'{room_id}/parallax.mp4' if room_id else 'test/parallax.mp4'
            video_url = _upload_supabase(output_path, storage_path, supabase_url, service_key)

            return {'video_url': video_url, 'room_id': room_id}

    except Exception as e:
        return {'error': str(e), 'video_url': None}
