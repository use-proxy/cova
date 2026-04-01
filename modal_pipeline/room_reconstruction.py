"""
Cova M5 — Room Reconstruction Pipeline on Modal
Accepts a video, runs AnySplat on A10G GPU, outputs SPZ, uploads to Supabase Storage.

Usage:
    # Deploy to Modal
    modal deploy modal_pipeline/room_reconstruction.py

    # Run locally (test)
    modal run modal_pipeline/room_reconstruction.py --input-video /path/to/video.mp4 --room-id <uuid>
"""

import io
import os
import subprocess
import tempfile
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Modal resources
# ---------------------------------------------------------------------------

volume = modal.Volume.from_name("anysplat-model-cache", create_if_missing=True)

anysplat_dir = Path(__file__).parent / "anysplat"

image = (
    modal.Image.from_registry(
        "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
        add_python="3.10",
    )
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "ffmpeg",
        "ninja-build",
    )
    .add_local_dir(str(anysplat_dir), remote_path="/AnySplat", copy=True)
    .pip_install(
        # Core AnySplat inference dependencies
        "numpy==1.25.0",
        "einops",
        "timm",
        "huggingface_hub",
        "safetensors",
        "opencv-python-headless",
        "Pillow",
        "scikit-image",
        "scikit-video",
        "plyfile",
        "hydra-core",
        "omegaconf",
        "pydantic",
        "dacite",
        "jaxtyping",
        "beartype",
        "scipy",
        "lpips",
        "lightning",
        "roma",
        "ninja",
        "torchvision==0.17.0",
        # Transitive imports from AnySplat encoder/visualization modules
        "wandb",
        "colorama",
        "moviepy==1.0.3",
        "imageio",
        "matplotlib",
        "tqdm",
        "tabulate",
        # Remaining transitive deps (from full import scan)
        "e3nn",
        "open3d",
        "colorspacious",
        "scikit-learn",
        "tensorly",
        "torchmetrics",
        "typing_extensions",
        "pyyaml",
        # xformers matched to PyTorch 2.2.0
        "xformers==0.0.24",
        # Supabase client for upload
        "supabase",
        "fastapi[standard]",
    )
    .pip_install(
        # gsplat prebuilt wheel from official index (not GitHub)
        "gsplat==1.4.0",
        index_url="https://docs.gsplat.studio/whl/pt22cu121",
    )
    .run_commands(
        # torch_scatter from PyG wheel index (not GitHub)
        "pip install torch_scatter==2.1.2 -f https://data.pyg.org/whl/torch-2.2.0+cu121.html",
    )
    .env({"HF_HOME": "/model_cache/huggingface"})
)

app = modal.App("cova-room-reconstruction", image=image)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_FRAMES = 32  # Cap frames to stay within A10G 24GB VRAM
TARGET_FPS = 1   # Extract 1 frame per second from video


# ---------------------------------------------------------------------------
# Helper: extract frames from video
# ---------------------------------------------------------------------------
def extract_frames(video_path: str, output_dir: str) -> list[str]:
    """Extract frames from video at 1 FPS, capped at MAX_FRAMES."""
    import cv2

    vs = cv2.VideoCapture(video_path)
    fps = vs.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0
    frame_interval = max(1, int(fps * TARGET_FPS))

    frame_paths = []
    count = 0
    frame_num = 0

    while True:
        got_frame, frame = vs.read()
        if not got_frame:
            break
        count += 1
        if count % frame_interval == 0:
            path = os.path.join(output_dir, f"{frame_num:06d}.png")
            cv2.imwrite(path, frame)
            frame_paths.append(path)
            frame_num += 1
            if frame_num >= MAX_FRAMES:
                break

    vs.release()

    if len(frame_paths) < 2:
        raise ValueError(
            f"Need at least 2 frames, got {len(frame_paths)}. "
            "Video may be too short or corrupted."
        )

    return sorted(frame_paths)






# ---------------------------------------------------------------------------
# Core reconstruction logic (shared by webhook and CLI)
# ---------------------------------------------------------------------------
def _run_reconstruction(video_bytes: bytes, room_id: str, user_id: str) -> dict:
    import sys
    sys.path.insert(0, "/AnySplat")

    import gc
    import torch
    import torchvision
    from PIL import Image
    from supabase import create_client

    from src.model.model.anysplat import AnySplat

    device = torch.device("cuda")

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "input.mp4")
        frames_dir = os.path.join(tmpdir, "frames")
        os.makedirs(frames_dir)

        with open(video_path, "wb") as f:
            f.write(video_bytes)

        print(f"[cova] Extracting frames from video ({len(video_bytes) / 1e6:.1f} MB)...")
        frame_paths = extract_frames(video_path, frames_dir)
        print(f"[cova] Extracted {len(frame_paths)} frames")

        # Load model (cached on volume)
        print("[cova] Loading AnySplat model...")
        model = AnySplat.from_pretrained("lhjiang/anysplat")
        model = model.to(device)
        model.eval()
        volume.commit()
        print("[cova] Model loaded")

        # Process images
        def process_image(img_path: str) -> torch.Tensor:
            img = Image.open(img_path).convert("RGB")
            w, h = img.size
            if w > h:
                new_h = 448
                new_w = int(w * (new_h / h))
            else:
                new_w = 448
                new_h = int(h * (new_w / w))
            img = img.resize((new_w, new_h), Image.LANCZOS)
            left = (new_w - 448) // 2
            top = (new_h - 448) // 2
            img = img.crop((left, top, left + 448, top + 448))
            return torchvision.transforms.ToTensor()(img) * 2.0 - 1.0

        images = torch.stack([process_image(p) for p in frame_paths], dim=0)
        images = images.unsqueeze(0).to(device)
        images = (images + 1) * 0.5

        print(f"[cova] Input tensor shape: {images.shape}")

        # Run inference
        print("[cova] Running AnySplat inference...")
        with torch.no_grad():
            gaussians, pred_context_pose = model.inference(images)
        num_gaussians = int(gaussians.means.shape[1])
        print(f"[cova] Reconstruction complete — {num_gaussians} gaussians")

        del model, images
        gc.collect()
        torch.cuda.empty_cache()

        # Export full Gaussian PLY (binary, all attributes, no downsampling)
        from src.model.ply_export import export_ply

        ply_path = os.path.join(tmpdir, "room.ply")
        export_ply(
            gaussians.means[0],
            gaussians.scales[0],
            gaussians.rotations[0],
            gaussians.harmonics[0],
            gaussians.opacities[0],
            Path(ply_path),
            save_sh_dc_only=True,
        )

        file_size = os.path.getsize(ply_path)
        print(f"[cova] PLY exported: {file_size / 1e6:.1f} MB ({num_gaussians} gaussians)")

        # Upload to Supabase Storage (Pro plan — no size limit)
        supabase_url = os.environ["SUPABASE_URL"]
        supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        client = create_client(supabase_url, supabase_key)

        storage_path = f"{user_id}/{room_id}/room.ply"

        with open(ply_path, "rb") as f:
            file_bytes = f.read()

        client.storage.from_("room-videos").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "application/octet-stream", "upsert": "true"},
        )

        print(f"[cova] Uploaded to Supabase: {storage_path}")

        # Generate signed URL
        signed = client.storage.from_("room-videos").create_signed_url(storage_path, 86400)
        splat_url = signed.get("signedURL", "") if isinstance(signed, dict) else ""

        # Upsert rooms table (update if exists, insert if not — handles CLI test runs)
        client.table("rooms").upsert({
            "id": room_id,
            "user_id": user_id,
            "splat_url": splat_url,
            "splat_path": storage_path,
            "status": "complete",
            "room_type": "living_room",
        }).execute()

        print(f"[cova] Updated rooms table for {room_id} → status=complete")

        return {
            "room_id": room_id,
            "splat_url": splat_url,
            "splat_path": storage_path,
            "num_gaussians": num_gaussians,
            "num_frames": len(frame_paths),
            "file_size_bytes": file_size,
        }


# ---------------------------------------------------------------------------
# Modal function: reconstruct room (direct call)
# ---------------------------------------------------------------------------
@app.function(
    gpu="a10g",
    timeout=600,
    volumes={"/model_cache": volume},
    secrets=[modal.Secret.from_name("supabase-credentials")],
)
def reconstruct_room(
    video_bytes: bytes,
    room_id: str,
    user_id: str,
    skip_db_update: bool = False,
) -> dict:
    return _run_reconstruction(video_bytes, room_id, user_id)


# ---------------------------------------------------------------------------
# Modal web endpoint: reconstruct room (HTTP webhook)
# ---------------------------------------------------------------------------
@app.function(
    gpu="a10g",
    timeout=600,
    volumes={"/model_cache": volume},
    secrets=[modal.Secret.from_name("supabase-credentials")],
)
@modal.fastapi_endpoint(method="POST")
def reconstruct_room_webhook(item: dict):
    """
    HTTP webhook for triggering reconstruction from Next.js API route.

    POST body: { "video_path": "user/room/video.webm", "room_id": "...", "user_id": "..." }
    """
    from supabase import create_client

    video_path = item["video_path"]
    room_id = item["room_id"]
    user_id = item["user_id"]

    # Update status to processing
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    client.table("rooms").update({
        "status": "processing",
        "modal_job_id": f"webhook_{room_id}",
    }).eq("id", room_id).execute()

    try:
        # Fetch video from Supabase Storage
        video_bytes = client.storage.from_("room-videos").download(video_path)
        print(f"[cova] Downloaded video: {len(video_bytes) / 1e6:.1f} MB from {video_path}")

        result = _run_reconstruction(video_bytes, room_id, user_id)
        return {"status": "complete", **result}

    except Exception as e:
        print(f"[cova] Pipeline error: {e}")
        client.table("rooms").update({
            "status": "error",
        }).eq("id", room_id).execute()
        return {"status": "error", "error": str(e)}


# ---------------------------------------------------------------------------
# CLI entry point for local testing
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(input_video: str, room_id: str = "", user_id: str = "test-user"):
    """Run reconstruction from CLI: modal run room_reconstruction.py --input-video video.mp4"""
    import uuid as _uuid

    if not room_id:
        room_id = str(_uuid.uuid4())
        print(f"Generated room_id: {room_id}")

    with open(input_video, "rb") as f:
        video_bytes = f.read()

    print(f"Sending {len(video_bytes) / 1e6:.1f} MB video to Modal...")
    result = reconstruct_room.remote(video_bytes, room_id, user_id)

    print("\n--- Result ---")
    for k, v in result.items():
        print(f"  {k}: {v}")
