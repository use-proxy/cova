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

MAX_FRAMES = 80  # Safe limit for A100-40GB with full SH export
TARGET_FPS = 4  # Extract 4 frames per second from video
MIN_FRAMES = 10  # Minimum frames before rejecting video


# ---------------------------------------------------------------------------
# Helper: extract frames from video
# ---------------------------------------------------------------------------
def extract_frames(video_path: str, output_dir: str) -> list[str]:
    """Extract frames from video at TARGET_FPS, with quality filtering."""
    import cv2
    import numpy as np

    vs = cv2.VideoCapture(video_path)
    fps = vs.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0

    total_frames = int(vs.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    print(f"[cova] Video: {duration:.1f}s, {fps}fps, {total_frames} total frames")

    frame_interval = max(1, int(fps / TARGET_FPS))
    print(f"[cova] Extracting every {frame_interval}th frame (TARGET_FPS={TARGET_FPS})")

    frame_paths = []
    last_frame = None
    count = 0
    saved = 0
    skipped_blur = 0
    skipped_dark = 0
    skipped_similar = 0

    while True:
        got_frame, frame = vs.read()
        if not got_frame:
            break
        count += 1

        if count % frame_interval != 0:
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Skip dark frames
        if gray.mean() < 30:
            skipped_dark += 1
            continue

        # Skip blurry frames
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < 20:
            skipped_blur += 1
            continue

        # Skip frames too similar to previous (redundant)
        if last_frame is not None:
            diff = np.mean(np.abs(gray.astype(float) - last_frame.astype(float)))
            if diff < 1.5:
                skipped_similar += 1
                continue

        path = os.path.join(output_dir, f"{saved:06d}.png")
        cv2.imwrite(path, frame)
        frame_paths.append(path)
        last_frame = gray
        saved += 1

        if saved >= MAX_FRAMES:
            break

    vs.release()

    print(f"[cova] Frame extraction: {saved} kept, {skipped_blur} blurry, "
          f"{skipped_dark} dark, {skipped_similar} redundant")

    if len(frame_paths) < MIN_FRAMES:
        raise ValueError(
            f"Only {len(frame_paths)} usable frames extracted. "
            "Video may be too short, too dark, or too shaky."
        )

    return sorted(frame_paths)






# ---------------------------------------------------------------------------
# Helper: validate reconstruction quality
# ---------------------------------------------------------------------------
def _validate_reconstruction(gaussians) -> dict:
    import numpy as np
    import torch

    means = gaussians.means[0].detach().cpu().numpy()
    opacities = gaussians.opacities[0].detach().cpu().numpy()

    scene_extent = np.max(means, axis=0) - np.min(means, axis=0)
    max_extent = float(np.max(scene_extent))
    mean_opacity = float(np.mean(opacities))
    num_gaussians = len(means)

    issues = []
    if max_extent < 0.3:
        issues.append(f"Scene too small (extent={max_extent:.3f}) - likely collapsed")
    if mean_opacity < 0.3:
        issues.append(f"Low opacity (mean={mean_opacity:.3f}) - likely noisy")
    if num_gaussians < 500000:
        issues.append(f"Too few Gaussians ({num_gaussians}) - likely failed")

    quality = "good" if not issues else "poor"

    print(f"[cova] Reconstruction quality: {quality}")
    print(f"[cova] Scene extent: {scene_extent}, max: {max_extent:.3f}")
    print(f"[cova] Mean opacity: {mean_opacity:.3f}")
    print(f"[cova] Gaussians: {num_gaussians}")
    if issues:
        for issue in issues:
            print(f"[cova] WARNING: {issue}")

    return {
        "quality": quality,
        "num_gaussians": num_gaussians,
        "max_extent": max_extent,
        "mean_opacity": mean_opacity,
        "issues": issues,
    }


# ---------------------------------------------------------------------------
# Helper: upload to Supabase with retry
# ---------------------------------------------------------------------------
def _upload_with_retry(client, storage_path: str, file_bytes: bytes, max_retries: int = 3):
    import time

    file_size_mb = len(file_bytes) / 1e6
    print(f"[cova] Uploading {file_size_mb:.1f}MB to {storage_path}")

    for attempt in range(max_retries):
        try:
            client.storage.from_("room-videos").upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": "application/octet-stream"},
            )
            print(f"[cova] Upload successful on attempt {attempt + 1}")
            return
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"[cova] Upload attempt {attempt + 1} failed: {e}. "
                      f"Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"[cova] Falling back to update...")
                client.storage.from_("room-videos").update(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"content-type": "application/octet-stream"},
                )
                print(f"[cova] Update successful")
                return


# ---------------------------------------------------------------------------
# Core reconstruction logic (shared by webhook and CLI)
# ---------------------------------------------------------------------------
def _run_reconstruction(video_bytes: bytes, room_id: str, user_id: str) -> dict:
    import sys
    sys.path.insert(0, "/AnySplat")

    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

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

        import subprocess
        rotated_path = os.path.join(tmpdir, "input_rotated.mp4")
        result = subprocess.run([
            "ffmpeg", "-i", video_path,
            "-vf", "transpose=1",
            "-c:a", "copy",
            rotated_path, "-y"
        ], capture_output=True)
        if result.returncode == 0:
            video_path = rotated_path
            print("[cova] Rotated portrait video to landscape")
        else:
            print("[cova] ffmpeg rotation failed, using original")

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

        # Process images with CLAHE contrast enhancement
        def process_image(img_path: str) -> torch.Tensor:
            import cv2
            import numpy as np

            # Read with OpenCV for preprocessing
            img_cv = cv2.imread(img_path)

            # Apply CLAHE to improve contrast for indoor scenes
            lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            lab[:, :, 0] = clahe.apply(lab[:, :, 0])
            img_cv = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

            # Convert to PIL and resize
            img = Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB))

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
        torch.cuda.empty_cache()
        with torch.no_grad():
            gaussians, pred_context_pose = model.inference(images)
        num_gaussians = int(gaussians.means.shape[1])
        print(f"[cova] Reconstruction complete — {num_gaussians} gaussians")

        del model, images
        gc.collect()
        torch.cuda.empty_cache()

        # Validate reconstruction quality
        import numpy as np
        quality_info = _validate_reconstruction(gaussians)

        # Export full Gaussian PLY (binary, all attributes)
        from src.model.ply_export import export_ply

        ply_path = os.path.join(tmpdir, "room.ply")
        export_ply(
            gaussians.means[0],
            gaussians.scales[0],
            gaussians.rotations[0],
            gaussians.harmonics[0],
            gaussians.opacities[0],
            Path(ply_path),
            save_sh_dc_only=False,
        )

        file_size = os.path.getsize(ply_path)
        print(f"[cova] PLY exported: {file_size / 1e6:.1f} MB ({num_gaussians} gaussians)")

        # If full SH file is too large, re-export with DC only
        if file_size > 480 * 1e6:
            print(f"[cova] WARNING: PLY too large ({file_size / 1e6:.0f}MB), "
                  f"re-exporting with DC-only SH")
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
            print(f"[cova] Re-exported PLY: {file_size / 1e6:.1f} MB")

        # If DC-only is still too large, downsample by opacity
        if file_size > 480 * 1e6:
            print(f"[cova] PLY still too large ({file_size / 1e6:.1f}MB), "
                  f"downsampling Gaussians by opacity...")
            MAX_GAUSSIANS = 2_000_000
            opacities_flat = gaussians.opacities[0]
            if opacities_flat.shape[0] > MAX_GAUSSIANS:
                _, top_idx = torch.topk(opacities_flat, MAX_GAUSSIANS)
                top_idx = top_idx.sort().values
                from src.model.types import Gaussians as GaussiansType
                gaussians_ds = GaussiansType(
                    means=gaussians.means[0][top_idx].unsqueeze(0),
                    covariances=gaussians.covariances[0][top_idx].unsqueeze(0),
                    harmonics=gaussians.harmonics[0][top_idx].unsqueeze(0),
                    opacities=gaussians.opacities[0][top_idx].unsqueeze(0),
                    scales=gaussians.scales[0][top_idx].unsqueeze(0),
                    rotations=gaussians.rotations[0][top_idx].unsqueeze(0),
                )
                export_ply(
                    gaussians_ds.means[0],
                    gaussians_ds.scales[0],
                    gaussians_ds.rotations[0],
                    gaussians_ds.harmonics[0],
                    gaussians_ds.opacities[0],
                    Path(ply_path),
                    save_sh_dc_only=True,
                )
                file_size = os.path.getsize(ply_path)
                num_gaussians = MAX_GAUSSIANS
                print(f"[cova] Downsampled to {MAX_GAUSSIANS:,} Gaussians: "
                      f"{file_size / 1e6:.1f}MB")

        # Upload to Supabase Storage
        supabase_url = os.environ["SUPABASE_URL"]
        supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        client = create_client(supabase_url, supabase_key)

        storage_path = f"{user_id}/{room_id}/room.ply"

        with open(ply_path, "rb") as f:
            file_bytes = f.read()

        _upload_with_retry(client, storage_path, file_bytes)

        print(f"[cova] Uploaded to Supabase: {storage_path}")

        # Generate signed URL
        signed = client.storage.from_("room-videos").create_signed_url(storage_path, 86400)
        splat_url = signed.get("signedURL", "") if isinstance(signed, dict) else ""

        import uuid as _uuid
        # Only upsert if user_id is a valid UUID (skip for CLI test runs)
        try:
            _uuid.UUID(user_id)
            client.table("rooms").upsert({
                "id": room_id,
                "user_id": user_id,
                "splat_url": splat_url,
                "splat_path": storage_path,
                "status": "complete",
                "room_type": "living_room",
            }).execute()
            print(f"[cova] Updated rooms table for {room_id} → status=complete")
        except ValueError:
            print(f"[cova] Skipping DB upsert — test-user is not a valid UUID")

        return {
            "room_id": room_id,
            "splat_url": splat_url,
            "splat_path": storage_path,
            "num_gaussians": num_gaussians,
            "num_frames": len(frame_paths),
            "file_size_bytes": file_size,
            "quality": quality_info["quality"],
            "max_extent": quality_info["max_extent"],
            "mean_opacity": quality_info["mean_opacity"],
        }


# ---------------------------------------------------------------------------
# Modal function: reconstruct room (direct call)
# ---------------------------------------------------------------------------
@app.function(
    gpu="a100-40gb",
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
    gpu="a100-40gb",
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

    print("""
[cova] === CAPTURE GUIDANCE FOR BEST RESULTS ===
[cova] 1. Record in LANDSCAPE orientation (horizontal)
[cova] 2. Record for 60-90 seconds minimum
[cova] 3. Walk slowly - barely walking pace
[cova] 4. Three passes: waist height, lower, upper
[cova] 5. Cover all walls, corners, and furniture
[cova] 6. Keep all lights on, avoid direct sunlight
[cova] 7. Use standard lens (not ultra-wide)
[cova] ==========================================
""")

    with open(input_video, "rb") as f:
        video_bytes = f.read()

    print(f"Sending {len(video_bytes) / 1e6:.1f} MB video to Modal...")
    result = reconstruct_room.remote(video_bytes, room_id, user_id)

    print("\n--- Result ---")
    for k, v in result.items():
        print(f"  {k}: {v}")
