"""
Cova — Depth Pro + Parallax Video Pipeline
Input: FLUX redesigned equirectangular panorama
Output: 15-second cinematic flythrough MP4 + depth map PNG

This video is the FIRST thing the user sees. Must be photorealistic.
Derives entirely from FLUX output — no Gaussian splat artifacts.

Cost: ~$0.02 Modal A10G GPU time
Time: ~40 seconds on A10G (depth ~10s + render ~30s)
"""
import modal
import os
import json
import math
import base64

app = modal.App("cova-depth-video")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.2.0",
        "torchvision==0.17.0",
        "timm==0.6.12",
        "transformers>=4.38.0",
        "Pillow==10.2.0",
        "numpy<2",
        "requests",
        "opencv-python-headless",
        "imageio[ffmpeg]",
        "scipy",
        "fastapi[standard]",
    )
)

# Model cache volume for ZoeDepth weights
model_volume = modal.Volume.from_name("cova-model-weights", create_if_missing=True)

VIDEO_FPS = 30
VIDEO_DURATION = 15
VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080

CAMERA_PATH_SEGMENTS = [
    # (start_second, end_second, motion_type, params)
    (0, 2, "dolly_in", {"depth": 0.08}),
    (2, 8, "pan_sweep", {"degrees": 120, "direction": "left_to_right"}),
    (8, 11, "tilt_rise", {"degrees": 8}),
    (11, 13, "hold", {}),
    (13, 15, "ease_out", {"depth": -0.04}),
]

STYLE_COLOR_GRADES = {
    "japandi": {"warmth": 0.08, "saturation": -0.12, "contrast": 0.05},
    "coastal": {"warmth": -0.05, "saturation": 0.08, "contrast": 0.03},
    "bohemian": {"warmth": 0.12, "saturation": 0.10, "contrast": 0.02},
    "minimalist": {"warmth": 0.03, "saturation": -0.15, "contrast": 0.08},
    "mid_century": {"warmth": 0.10, "saturation": 0.05, "contrast": 0.06},
    "industrial": {"warmth": -0.08, "saturation": -0.10, "contrast": 0.10},
    "maximalist": {"warmth": 0.05, "saturation": 0.15, "contrast": 0.04},
    "transitional": {"warmth": 0.04, "saturation": 0.02, "contrast": 0.04},
}

FOV_H = 90  # degrees horizontal field of view


def compute_camera_state(t: float):
    """Compute camera yaw, pitch, and depth offset at time t."""
    yaw = 0.0
    pitch = 0.0
    depth = 0.0

    for seg_start, seg_end, motion_type, params in CAMERA_PATH_SEGMENTS:
        if seg_start <= t < seg_end:
            seg_duration = seg_end - seg_start
            seg_progress = (t - seg_start) / seg_duration
            eased = seg_progress * seg_progress * (3 - 2 * seg_progress)

            if motion_type == "pan_sweep":
                direction = 1 if params["direction"] == "left_to_right" else -1
                yaw = direction * params["degrees"] * eased
            elif motion_type == "dolly_in":
                depth = params["depth"] * eased
            elif motion_type == "tilt_rise":
                pitch = params["degrees"] * eased
            elif motion_type == "ease_out":
                depth = params["depth"] * eased
            break

    return yaw, pitch, depth


@app.function(
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
    ],
    image=image,
    gpu="A10G",
    timeout=180,
    max_containers=3,
    volumes={"/model-cache": model_volume},
)
def generate_depth_video(
    room_id: str,
    redesign_pano_url: str,
    style_blend: dict,
    hotspot_azimuths: list,
) -> dict:
    """Full pipeline: pano -> depth -> video."""
    import requests
    import numpy as np
    import torch
    import cv2
    import imageio
    from PIL import Image, ImageEnhance
    from io import BytesIO

    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb_headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
    }

    def update_room(data):
        requests.patch(
            f"{sb_url}/rest/v1/rooms?id=eq.{room_id}",
            headers=sb_headers,
            json=data,
            timeout=10,
        )

    # Step 1: Download pano
    update_room({"redesign_status": "depth_processing"})

    pano_resp = requests.get(redesign_pano_url, timeout=30)
    pano_img = Image.open(BytesIO(pano_resp.content)).convert("RGB")

    PANO_W, PANO_H = 2048, 1024
    pano_img = pano_img.resize((PANO_W, PANO_H), Image.LANCZOS)
    pano_np = np.array(pano_img)

    # Step 2: Depth estimation via Apple Depth Pro (HuggingFace Transformers).
    #
    # NORMALIZATION CRITICAL — DO NOT SKIP:
    # Apple Depth Pro outputs float32 metric depth tensors in meters (range ~0.5–8.0m).
    # Casting these directly to uint8 maps ALL values to 0–8, producing an
    # essentially black depth map that makes all downstream parallax/depth operations
    # return 0.
    #
    # WRONG (always returns 0):
    #   depth_uint8 = depth_np.astype(np.uint8)
    #
    # CORRECT — normalize to [0,1] BEFORE casting to uint8:
    #   depth_min, depth_max = depth_np.min(), depth_np.max()
    #   depth_normalized = (depth_np - depth_min) / (depth_max - depth_min)
    #   depth_uint8 = (depth_normalized * 255).astype(np.uint8)
    #
    # We use the HuggingFace Transformers pipeline("depth-estimation") to avoid
    # checkpoint path issues on ephemeral Modal filesystems (no torch.hub caching
    # required — transformers downloads to ~/.cache/huggingface automatically).
    print("[depth-video] Running Apple Depth Pro via HuggingFace Transformers...")
    from transformers import pipeline as hf_pipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    depth_raw = None
    try:
        depth_pipe = hf_pipeline(
            "depth-estimation",
            model="apple/DepthPro-hf",
            device=0 if device == "cuda" else -1,
        )
        pano_pil = Image.fromarray(pano_np)
        depth_output = depth_pipe(pano_pil)
        # depth_output["depth"] is a PIL Image (uint16 or float) — convert to float32 numpy
        import numpy as _np
        depth_raw = _np.array(depth_output["depth"]).astype(np.float32)
    except Exception as depth_pro_err:
        print(f"[depth-video] Depth Pro failed ({depth_pro_err}), falling back to ZoeDepth...")

    if depth_raw is None:
        # Fallback: ZoeDepth (MIT License — confirmed safe for commercial use)
        os.makedirs("/model-cache", exist_ok=True)
        torch.hub.set_dir("/model-cache")
        zoe = torch.hub.load("isl-org/ZoeDepth", "ZoeD_N", pretrained=True)
        zoe.to(device).eval()
        with torch.no_grad():
            pano_tensor = torch.from_numpy(pano_np).permute(2, 0, 1).float() / 255.0
            pano_tensor = pano_tensor.unsqueeze(0).to(device)
            depth_raw = zoe.infer(pano_tensor).squeeze().cpu().numpy()

    # CRITICAL: normalize float32 metric depth to [0,1] before any uint8 conversion.
    # See normalization note above — skipping this step produces an all-zero depth map.
    depth_min = depth_raw.min()
    depth_max = depth_raw.max()
    if depth_max - depth_min > 0:
        depth_norm = (depth_raw - depth_min) / (depth_max - depth_min)
    else:
        depth_norm = np.zeros_like(depth_raw)
    depth_resized = cv2.resize(depth_norm, (PANO_W, PANO_H))
    depth_filtered = cv2.bilateralFilter(
        depth_resized.astype(np.float32), d=9, sigmaColor=0.1, sigmaSpace=15
    )

    print(f"[depth-video] depth shape={depth_filtered.shape} min={depth_filtered.min():.4f} max={depth_filtered.max():.4f}")

    # Step 3: Color grade from style
    dominant_style = max(style_blend.items(), key=lambda x: x[1])[0] if style_blend else "transitional"
    grade = STYLE_COLOR_GRADES.get(dominant_style, STYLE_COLOR_GRADES["transitional"])

    # Step 4: Generate frames
    update_room({"redesign_status": "video_processing"})

    total_frames = VIDEO_DURATION * VIDEO_FPS
    FOV_V = int(FOV_H * VIDEO_HEIGHT / VIDEO_WIDTH)
    crop_w = int(FOV_H / 360 * PANO_W)
    crop_h = int(FOV_V / 180 * PANO_H)

    # Precompute vignette
    center_vx, center_vy = VIDEO_WIDTH // 2, VIDEO_HEIGHT // 2
    Y, X = np.ogrid[:VIDEO_HEIGHT, :VIDEO_WIDTH]
    dist = np.sqrt((X - center_vx) ** 2 + (Y - center_vy) ** 2)
    max_dist = np.sqrt(center_vx ** 2 + center_vy ** 2)
    vignette = 1 - 0.3 * (dist / max_dist) ** 2

    frames = []
    for frame_idx in range(total_frames):
        t = frame_idx / VIDEO_FPS
        current_yaw, current_pitch, current_depth_offset = compute_camera_state(t)

        # Extract viewport from equirectangular pano
        center_x = int((current_yaw % 360) / 360 * PANO_W) % PANO_W
        center_y = int((90 - current_pitch) / 180 * PANO_H)
        center_y = max(crop_h // 2, min(PANO_H - crop_h // 2, center_y))

        x1 = center_x - crop_w // 2
        y1 = center_y - crop_h // 2

        # Handle horizontal wrap
        if x1 < 0:
            left = pano_np[y1 : y1 + crop_h, x1 % PANO_W :, :]
            right = pano_np[y1 : y1 + crop_h, : crop_w - left.shape[1], :]
            crop = np.concatenate([left, right], axis=1)
        elif x1 + crop_w > PANO_W:
            left = pano_np[y1 : y1 + crop_h, x1:, :]
            right = pano_np[y1 : y1 + crop_h, : crop_w - left.shape[1], :]
            crop = np.concatenate([left, right], axis=1)
        else:
            crop = pano_np[y1 : y1 + crop_h, x1 : x1 + crop_w, :]

        # Ensure crop dimensions are correct
        if crop.shape[0] != crop_h or crop.shape[1] != crop_w:
            crop = cv2.resize(crop, (crop_w, crop_h))

        # Parallax offset
        if abs(current_depth_offset) > 0.001:
            # Get depth for this crop region
            if x1 >= 0 and x1 + crop_w <= PANO_W:
                depth_crop = depth_filtered[y1 : y1 + crop_h, x1 : x1 + crop_w]
            else:
                depth_crop = np.ones((crop_h, crop_w), dtype=np.float32) * 0.5

            if depth_crop.shape != (crop_h, crop_w):
                depth_crop = cv2.resize(depth_crop, (crop_w, crop_h))

            parallax_x = (depth_crop - 0.5) * current_depth_offset * crop_w * 0.15
            map_x = (
                np.tile(np.arange(crop_w, dtype=np.float32), (crop_h, 1))
                + parallax_x.astype(np.float32)
            )
            map_y = np.tile(
                np.arange(crop_h, dtype=np.float32).reshape(-1, 1), (1, crop_w)
            )
            map_x = np.clip(map_x, 0, crop_w - 1)
            crop = cv2.remap(
                crop.astype(np.float32),
                map_x,
                map_y.astype(np.float32),
                cv2.INTER_LINEAR,
            ).astype(np.uint8)

        # Resize to output
        frame = cv2.resize(crop, (VIDEO_WIDTH, VIDEO_HEIGHT), interpolation=cv2.INTER_LANCZOS4)

        # Color grade
        frame_pil = Image.fromarray(frame)

        if grade["warmth"] != 0:
            r, g, b = frame_pil.split()
            r_arr = np.array(r).astype(np.float32)
            b_arr = np.array(b).astype(np.float32)
            if grade["warmth"] > 0:
                r_arr = np.clip(r_arr * (1 + grade["warmth"]), 0, 255)
                b_arr = np.clip(b_arr * (1 - grade["warmth"] * 0.5), 0, 255)
            else:
                b_arr = np.clip(b_arr * (1 - grade["warmth"]), 0, 255)
            frame_pil = Image.merge(
                "RGB",
                (
                    Image.fromarray(r_arr.astype(np.uint8)),
                    g,
                    Image.fromarray(b_arr.astype(np.uint8)),
                ),
            )

        if grade["saturation"] != 0:
            frame_pil = ImageEnhance.Color(frame_pil).enhance(1 + grade["saturation"])
        if grade["contrast"] != 0:
            frame_pil = ImageEnhance.Contrast(frame_pil).enhance(1 + grade["contrast"])

        # Vignette
        frame_np = np.array(frame_pil).astype(np.float32)
        frame_np *= vignette[:, :, np.newaxis]
        frame_np = np.clip(frame_np, 0, 255).astype(np.uint8)
        frames.append(frame_np)

        if frame_idx % 90 == 0:
            print(f"[depth-video] Frame {frame_idx}/{total_frames} ({t:.1f}s)")

    print(f"[depth-video] All {len(frames)} frames rendered")

    # Step 5: Encode MP4
    video_buffer = BytesIO()
    with imageio.get_writer(
        video_buffer,
        format="mp4",
        fps=VIDEO_FPS,
        quality=8,
        codec="libx264",
        output_params=["-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p"],
    ) as writer:
        for frame in frames:
            writer.append_data(frame)

    video_bytes = video_buffer.getvalue()
    video_mb = len(video_bytes) / 1024 / 1024
    print(f"[depth-video] Video encoded: {video_mb:.1f}MB")

    # Step 6: Store depth map in room-videos bucket
    depth_png_bytes = BytesIO()
    Image.fromarray((depth_filtered * 255).astype(np.uint8)).save(depth_png_bytes, format="PNG")

    depth_storage_path = f"{room_id}/depth_map.png"
    requests.post(
        f"{sb_url}/storage/v1/object/room-videos/{depth_storage_path}",
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type": "image/png",
            "x-upsert": "true",
        },
        data=depth_png_bytes.getvalue(),
        timeout=30,
    )

    # Step 7: Store video in room-videos bucket
    video_storage_path = f"{room_id}/flythrough.mp4"
    requests.post(
        f"{sb_url}/storage/v1/object/room-videos/{video_storage_path}",
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type": "video/mp4",
            "x-upsert": "true",
        },
        data=video_bytes,
        timeout=60,
    )

    # Generate signed URLs (7-day TTL) — room-videos is a private bucket
    def get_signed_url(storage_path):
        resp = requests.post(
            f"{sb_url}/storage/v1/object/sign/room-videos/{storage_path}",
            headers={
                "apikey": sb_key,
                "Authorization": f"Bearer {sb_key}",
                "Content-Type": "application/json",
            },
            json={"expiresIn": 604800},
            timeout=10,
        )
        if resp.ok:
            signed_path = resp.json().get("signedURL", "")
            # signedURL returns /object/sign/... — needs /storage/v1 prefix
            if signed_path.startswith("/object/"):
                return f"{sb_url}/storage/v1{signed_path}"
            return f"{sb_url}{signed_path}"
        return f"{sb_url}/storage/v1/object/room-videos/{storage_path}"

    video_signed_url = get_signed_url(video_storage_path)
    depth_signed_url = get_signed_url(depth_storage_path)

    # Step 8: Compute hotspot timing
    hotspot_timing = []
    for hotspot in hotspot_azimuths:
        azimuth = hotspot.get("azimuth", 0)
        label = hotspot.get("label", "")
        product_id = hotspot.get("room_product_id")

        visible_times = []
        for fi in range(total_frames):
            ft = fi / VIDEO_FPS
            frame_yaw, _, _ = compute_camera_state(ft)
            angle_diff = abs((azimuth - frame_yaw + 180) % 360 - 180)
            if angle_diff < FOV_H / 2:
                visible_times.append(ft)

        if visible_times:
            hotspot_timing.append({
                "label": label,
                "room_product_id": product_id,
                "azimuth": azimuth,
                "visible_from_second": round(min(visible_times), 2),
                "visible_to_second": round(max(visible_times), 2),
            })

    # Step 9: Update room — write data first, status last
    update_room({
        "flythrough_video_url": video_signed_url,
        "flythrough_ready": True,
        "flythrough_duration_seconds": VIDEO_DURATION,
        "depth_map_url_v2": depth_signed_url,
        "hotspot_timing": hotspot_timing,
    })
    update_room({
        "redesign_status": "video_ready",
    })

    # Serialize depth as base64 float32 bytes so callers can reconstruct the
    # depth array without re-fetching and PNG-decoding the stored image.
    # Format: { depth_b64: str, shape: [H, W], dtype: "float32" }
    depth_b64 = base64.b64encode(
        depth_filtered.astype(np.float32).tobytes()
    ).decode("utf-8")

    print(f"[depth-video] Complete. Video: {video_signed_url}")
    return {
        "flythrough_video_url": video_signed_url,
        "depth_map_url": depth_signed_url,
        "depth_data": {
            "depth_b64": depth_b64,
            "shape": list(depth_filtered.shape),
            "dtype": "float32",
        },
        "hotspot_timing": hotspot_timing,
        "video_duration_seconds": VIDEO_DURATION,
        "video_size_mb": round(video_mb, 2),
    }


@app.function(
    secrets=[modal.Secret.from_name("supabase-credentials")],
    image=image,
    gpu="A10G",
    timeout=180,
    max_containers=3,
    volumes={"/model-cache": model_volume},
)
@modal.fastapi_endpoint(method="POST")
def depth_video_webhook(item: dict):
    import requests as _req
    room_id = item.get("room_id")
    pano_url = item.get("pano_url")
    style_blend = item.get("style_blend", {})
    hotspot_azimuths = item.get("hotspot_azimuths", [])
    if not room_id or not pano_url:
        return {"error": "room_id and pano_url required"}
    try:
        result = generate_depth_video.local(room_id, pano_url, style_blend, hotspot_azimuths)
        return {"status": "complete", **result}
    except Exception as e:
        # Write explicit failure status to Supabase
        try:
            sb_url = os.environ["SUPABASE_URL"]
            sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
            _req.patch(
                f"{sb_url}/rest/v1/rooms?id=eq.{room_id}",
                headers={
                    "apikey": sb_key,
                    "Authorization": f"Bearer {sb_key}",
                    "Content-Type": "application/json",
                },
                json={"redesign_status": "failed", "redesign_error": str(e)[:2000]},
                timeout=10,
            )
        except Exception as update_err:
            print(f"[depth-video] Failed to write error status: {update_err}")
        return {"status": "error", "error": str(e)}


@app.local_entrypoint()
def main(room_id: str = "test", pano_url: str = "", style: str = '{"japandi":0.7,"minimalist":0.3}'):
    if not pano_url:
        print("Usage: modal run depth_video_pipeline.py --room-id <id> --pano-url <url>")
        return
    result = generate_depth_video.remote(room_id, pano_url, json.loads(style), [])
    print(json.dumps(result, indent=2))
