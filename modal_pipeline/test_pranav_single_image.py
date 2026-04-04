"""
Pranav Single Image — Full Redesign Pipeline
Stages: Analysis + Depth → Segmentation → FLUX Fill (2-pass) → Quality Gate → Kontext Polish → Marble Plus
"""

import base64
import io
import json
import os
import time
import threading
import urllib.request
import urllib.error

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# ── Constants ─────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
INPUT_PHOTO = (
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9885.JPG"
    "?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0w"
    "N2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4ODUuSlBH"
    "IiwiaWF0IjoxNzc1MTY0NTkxLCJleHAiOjE3NzU3NjkzOTF9.kmBSw4JgmbH3eqLGpyswYN76vXUaV1gv"
    "Jr_ILvjWwqc"
)
STYLE = "Japandi"
OUTPUT_PREFIX = "test-pranav-single"

REPLICATE_TOKEN = os.environ["REPLICATE_API_TOKEN"]
ANTHROPIC_KEY = os.environ["ANTHROPIC_API_KEY"]
MARBLE_KEY = os.environ["MARBLE_API_KEY"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

RESULTS_DIR = "results/pranav_single"
STORAGE_PATH = f"room-videos/{OUTPUT_PREFIX}"

# ── HTTP helpers ───────────────────────────────────────────────────────────────

def http_post(url, payload, headers):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def http_post_raw(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as r:
        return r.read()


def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def http_put(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method="PUT")
    with urllib.request.urlopen(req) as r:
        return r.read()


def download_bytes(url):
    with urllib.request.urlopen(url) as r:
        return r.read()


# ── Replicate helpers ──────────────────────────────────────────────────────────

def replicate_post(path, payload):
    return http_post(
        f"https://api.replicate.com/v1/{path}",
        payload,
        {"Authorization": f"Bearer {REPLICATE_TOKEN}", "Content-Type": "application/json"},
    )


def replicate_models_post(owner_model, payload):
    """POST to models/{owner}/{model}/predictions endpoint."""
    return http_post(
        f"https://api.replicate.com/v1/models/{owner_model}/predictions",
        payload,
        {"Authorization": f"Bearer {REPLICATE_TOKEN}", "Content-Type": "application/json"},
    )


def replicate_poll(prediction_id, timeout=600, interval=5):
    url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
    start = time.time()
    while True:
        result = http_get(url, {"Authorization": f"Bearer {REPLICATE_TOKEN}"})
        status = result["status"]
        print(f"  [{prediction_id[:8]}] {status}")
        if status == "succeeded":
            return result
        if status in ("failed", "canceled"):
            raise RuntimeError(f"Prediction {prediction_id} {status}: {result.get('error')}")
        if time.time() - start > timeout:
            raise TimeoutError(f"Prediction {prediction_id} timed out after {timeout}s")
        time.sleep(interval)


def replicate_output_url(result):
    out = result["output"]
    if isinstance(out, list):
        return out[0]
    return out


# ── Supabase helpers ───────────────────────────────────────────────────────────

def supabase_upload(path, data, content_type="image/png"):
    """Upload to private bucket and return public path string (use sign for external access)."""
    url = f"{SUPABASE_URL}/storage/v1/object/{path}"
    req = urllib.request.Request(
        url, data=data,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        r.read()
    return f"{SUPABASE_URL}/storage/v1/object/public/{path}"


def supabase_sign(path, expires=86400):
    """Generate a signed URL for a private-bucket object. path = bucket/key."""
    bucket, key = path.split("/", 1)
    url = f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{key}"
    result = http_post(
        url,
        {"expiresIn": expires},
        {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
    )
    signed = result.get("signedURL") or result.get("signedUrl") or result.get("signed_url", "")
    if signed.startswith("http"):
        return signed
    if signed.startswith("/object/"):
        return f"{SUPABASE_URL}/storage/v1{signed}"
    return f"{SUPABASE_URL}{signed}"


def upload_and_sign(storage_path, data, content_type="image/png"):
    """Upload to private bucket and return a signed URL."""
    supabase_upload(storage_path, data, content_type)
    return supabase_sign(storage_path)


# ── PIL resize ─────────────────────────────────────────────────────────────────

MAX_SIDE = 1536

def pil_resize(img, max_side=MAX_SIDE):
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    scale = max_side / max(w, h)
    return img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def to_jpeg_bytes(img, quality=92):
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def to_png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 0: Parallel — Claude Vision analysis + Depth Anything V2
# ═══════════════════════════════════════════════════════════════════════════════

def stage0_claude_analysis(shared):
    print("\n[Stage 0A] Starting Claude Vision analysis (URL source)...")

    prompt = (
        "You are a senior interior designer analyzing a room photo for an AI redesign pipeline.\n\n"
        "Analyze this room and return ONLY valid JSON with these exact keys:\n\n"
        "{\n"
        '  "room_description": "describe wall color, floor type, ceiling, window positions, lighting direction and color temperature",\n'
        '  "fixed_items": ["list every piece of furniture and fixture that should stay exactly as-is"],\n'
        '  "movable_items": ["list every piece of furniture, clutter, or item that should be replaced or removed"],\n'
        '  "replacement_descriptions": {\n'
        '    "item_name": "extremely detailed inpainting prompt for replacement in Japandi style — include material, color, finish, leg style, texture, how it complements the fixed items and room lighting"\n'
        "  },\n"
        '  "lighting_analysis": "exact description of light direction, color temperature, shadow direction and intensity",\n'
        '  "segmentation_prompts": "period-separated noun list for Grounding DINO detection of ONLY movable items — e.g. office chair. clothes on floor. bag."\n'
        "}\n\n"
        "Be extremely specific in replacement_descriptions. These descriptions will be used directly as AI image generation prompts. "
        f"Assume the style is {STYLE}: natural materials, clean lines, wabi-sabi elements, warm neutral palette."
    )

    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 4096,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "url",
                            "url": INPUT_PHOTO,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    }

    print("[Stage 0A] Calling Claude Vision...")
    result = http_post(
        "https://api.anthropic.com/v1/messages",
        payload,
        {
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )

    text = result["content"][0]["text"].strip()
    print(f"[Stage 0A] Raw response length: {len(text)} chars, stop_reason: {result.get('stop_reason')}")

    # strip markdown fences
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            stripped = part.strip()
            if stripped.startswith("json"):
                stripped = stripped[4:].strip()
            if stripped.startswith("{"):
                text = stripped
                break

    # Find JSON object boundaries
    if not text.startswith("{"):
        start = text.find("{")
        if start != -1:
            text = text[start:]

    try:
        analysis = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"[Stage 0A] JSON parse error: {e}. Response preview:\n{text[:500]}")
        # Try to salvage: find the last valid closing brace
        # Build a minimal valid JSON from what we have
        raise
    save_json(f"{RESULTS_DIR}/stage0_analysis.json", analysis)
    print("[Stage 0A] Claude analysis complete:")
    print(json.dumps(analysis, indent=2))
    shared["analysis"] = analysis


def stage0_depth(shared):
    print("\n[Stage 0B] Starting Depth Anything V2...")
    result = replicate_post(
        "predictions",
        {
            "version": "b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4",
            "input": {"image": INPUT_PHOTO, "model_size": "Large"},
        },
    )
    pred_id = result["id"]
    print(f"[Stage 0B] Prediction ID: {pred_id}")
    result = replicate_poll(pred_id, timeout=300)
    raw_out = replicate_output_url(result)
    # Depth Anything V2 returns {'color_depth': url, 'grey_depth': url}
    if isinstance(raw_out, dict):
        depth_url = raw_out.get("grey_depth") or raw_out.get("color_depth") or list(raw_out.values())[0]
    else:
        depth_url = raw_out
    print(f"[Stage 0B] Depth map URL: {depth_url}")

    depth_bytes = download_bytes(depth_url)
    storage_path = f"{STORAGE_PATH}/stage0_depth.png"
    signed_url = upload_and_sign(storage_path, depth_bytes, "image/png")
    print(f"[Stage 0B] Depth uploaded: {signed_url}")
    shared["depth_url"] = signed_url


def run_stage0():
    shared = {}
    errors = {}

    def run(fn, key):
        try:
            fn(shared)
        except Exception as e:
            errors[key] = str(e)
            print(f"[Stage 0] ERROR in {key}: {e}")

    t_a = threading.Thread(target=run, args=(stage0_claude_analysis, "analysis"))
    t_b = threading.Thread(target=run, args=(stage0_depth, "depth"))
    t_a.start()
    t_b.start()
    t_a.join()
    t_b.join()

    if errors:
        raise RuntimeError(f"Stage 0 errors: {errors}")
    return shared


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 1: Segmentation — Grounding DINO → SAM 2 → Mask variants
# ═══════════════════════════════════════════════════════════════════════════════

def stage1_segmentation(analysis):
    seg_prompt = analysis["segmentation_prompts"]
    print(f"\n[Stage 1A] Grounding DINO prompt: {seg_prompt}")

    gdino_result = replicate_post(
        "predictions",
        {
            "version": "efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa",
            "input": {
                "image": INPUT_PHOTO,
                "query": seg_prompt,
                "box_threshold": 0.3,
                "text_threshold": 0.25,
            },
        },
    )
    pred_id = gdino_result["id"]
    print(f"[Stage 1A] DINO prediction ID: {pred_id}")
    gdino_result = replicate_poll(pred_id, timeout=300)
    gdino_output = gdino_result.get("output", {})
    print(f"[Stage 1A] DINO output: {str(gdino_output)[:500]}")

    # Extract bounding boxes — adirik/grounding-dino returns {"detections": [...], "result_image": url}
    boxes = []
    if isinstance(gdino_output, dict):
        detections = gdino_output.get("detections", [])
        for det in detections:
            if isinstance(det, dict):
                # may have 'bbox', 'box', or [x1,y1,x2,y2] directly
                b = det.get("bbox") or det.get("box") or det.get("xyxy")
                if b and len(b) == 4:
                    boxes.append(list(b))
            elif isinstance(det, list) and len(det) >= 4:
                boxes.append(det[:4])
        # Also check for raw list of boxes
        if not boxes:
            raw_boxes = gdino_output.get("boxes", gdino_output.get("bboxes", []))
            if isinstance(raw_boxes, list):
                for b in raw_boxes:
                    if isinstance(b, (list, tuple)) and len(b) == 4:
                        boxes.append(list(b))
    elif isinstance(gdino_output, list):
        for item in gdino_output:
            if isinstance(item, dict):
                b = item.get("bbox") or item.get("box")
                if b and len(b) == 4:
                    boxes.append(list(b))
            elif isinstance(item, list) and len(item) == 4:
                boxes.append(item)

    save_json(f"{RESULTS_DIR}/stage1_dino_raw.json", gdino_output if isinstance(gdino_output, dict) else {"output": str(gdino_output)[:2000]})

    if not boxes:
        print("[Stage 1A] WARNING: No detections from DINO. Will use fallback full-image mask.")
        # Get image dimensions for fallback
        img_bytes = download_bytes(INPUT_PHOTO)
        img = Image.open(io.BytesIO(img_bytes))
        w, h = img.size
        # Use bottom 60% as fallback mask (floor area + furniture)
        boxes = [[0, int(h * 0.4), w, h]]

    save_json(f"{RESULTS_DIR}/stage1_dino_detections.json", {"boxes": boxes, "raw_output": str(gdino_output)[:500]})
    print(f"[Stage 1A] Detected {len(boxes)} boxes: {boxes}")

    # ── Step 1B: PIL mask from DINO bounding boxes ─────────────────────────
    # Skip SAM (rate-limited, wrong endpoint) — use DINO boxes directly with PIL.
    # Rectangular masks work well for FLUX Fill inpainting.
    print(f"\n[Stage 1B] Building PIL mask from {len(boxes)} DINO bounding boxes...")

    # Download original image to get dimensions
    img_bytes = download_bytes(INPUT_PHOTO)
    orig_img = Image.open(io.BytesIO(img_bytes))
    orig_w, orig_h = orig_img.size
    print(f"[Stage 1B] Original image: {orig_w}x{orig_h}")

    # Start with black mask, paint white over each detected bbox
    combined = Image.new("L", (orig_w, orig_h), 0)
    draw = ImageDraw.Draw(combined)
    for box in boxes:
        x0, y0, x1, y1 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        # Clamp to image bounds
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(orig_w, x1), min(orig_h, y1)
        draw.rectangle([x0, y0, x1, y1], fill=255)
        print(f"  Box: [{x0},{y0},{x1},{y1}]")

    print("[Stage 1B] Mask created from DINO boxes.")

    # ── Step 1C: Mask variants ─────────────────────────────────────────────
    print("\n[Stage 1C] Creating mask variants with PIL...")

    mask_original = combined
    mask_dilated = combined.filter(ImageFilter.MaxFilter(31))   # expand 15px
    mask_eroded = combined.filter(ImageFilter.MinFilter(11))    # shrink 5px

    def upload_mask(name, img):
        path = f"{STORAGE_PATH}/{name}"
        data = to_png_bytes(img)
        url = upload_and_sign(path, data, "image/png")
        print(f"[Stage 1C] {name}: {url}")
        return url

    mask_orig_url = upload_mask("mask_original.png", mask_original)
    mask_dilated_url = upload_mask("mask_dilated.png", mask_dilated)
    mask_eroded_url = upload_mask("mask_eroded.png", mask_eroded)

    print("\n=== VERIFY MASKS BEFORE CONTINUING ===")
    print(f"  Original:  {mask_orig_url}")
    print(f"  Dilated:   {mask_dilated_url}")
    print(f"  Eroded:    {mask_eroded_url}")
    print("[Auto-proceeding — review mask URLs above to verify fixed items are not masked]")

    return {
        "mask_original_url": mask_orig_url,
        "mask_dilated_url": mask_dilated_url,
        "mask_eroded_url": mask_eroded_url,
        "orig_w": orig_w,
        "orig_h": orig_h,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 2: Two-pass FLUX Fill Pro
# ═══════════════════════════════════════════════════════════════════════════════

def stage2_flux_fill(mask_data, analysis):
    mask_dilated_url = mask_data["mask_dilated_url"]
    mask_eroded_url = mask_data["mask_eroded_url"]

    # ── Resize input photo for FLUX Fill (max 1536px) ─────────────────────
    print("\n[Stage 2] Resizing input photo for FLUX Fill...")
    img_bytes = download_bytes(INPUT_PHOTO)
    orig_img = Image.open(io.BytesIO(img_bytes))
    resized = pil_resize(orig_img)
    resized_w, resized_h = resized.size
    print(f"[Stage 2] Resized to {resized_w}x{resized_h}")
    resized_bytes = to_jpeg_bytes(resized)

    resized_path = f"{STORAGE_PATH}/input_resized.jpg"
    resized_url = upload_and_sign(resized_path, resized_bytes, "image/jpeg")
    print(f"[Stage 2] Resized input: {resized_url}")

    # Resize masks too
    def resize_mask_url(url, suffix):
        mb = download_bytes(url)
        mimg = Image.open(io.BytesIO(mb)).convert("L")
        if mimg.size != (resized_w, resized_h):
            mimg = mimg.resize((resized_w, resized_h), Image.NEAREST)
        path = f"{STORAGE_PATH}/mask_{suffix}_resized.png"
        u = upload_and_sign(path, to_png_bytes(mimg), "image/png")
        print(f"[Stage 2] Resized mask {suffix}: {u}")
        return u

    resized_dilated_url = resize_mask_url(mask_dilated_url, "dilated")
    resized_eroded_url = resize_mask_url(mask_eroded_url, "eroded")

    # ── Pass A: Furniture removal ──────────────────────────────────────────
    print("\n[Stage 2 Pass A] Furniture removal...")
    pass_a_result = replicate_models_post(
        "black-forest-labs/flux-fill-pro",
        {
            "input": {
                "image": resized_url,
                "mask": resized_dilated_url,
                "prompt": (
                    "Empty room. Clean floor where furniture was, completely bare with no items, "
                    "clothes, or clutter. The floor texture matches the surrounding floor exactly. "
                    "Natural daylight. Photorealistic, seamless, no artifacts."
                ),
                "guidance": 45,
                "steps": 35,
                "prompt_upsampling": True,
                "output_format": "png",
                "safety_tolerance": 5,
            }
        },
    )
    pred_id = pass_a_result["id"]
    print(f"[Stage 2 Pass A] Prediction ID: {pred_id}")
    pass_a_result = replicate_poll(pred_id, timeout=600)
    pass_a_url_replicate = replicate_output_url(pass_a_result)
    print(f"[Stage 2 Pass A] Output: {pass_a_url_replicate}")

    pass_a_bytes = download_bytes(pass_a_url_replicate)
    # Detect actual output dimensions (FLUX may resize)
    pass_a_img = Image.open(io.BytesIO(pass_a_bytes))
    pass_a_w, pass_a_h = pass_a_img.size
    print(f"[Stage 2 Pass A] Output dimensions: {pass_a_w}x{pass_a_h}")
    pass_a_path = f"{STORAGE_PATH}/stage2_pass_a_clean.png"
    pass_a_supabase_url = upload_and_sign(pass_a_path, pass_a_bytes, "image/png")
    print(f"[Stage 2 Pass A] Supabase URL: {pass_a_supabase_url}")

    # Re-resize eroded mask to exactly match Pass A output dimensions
    if (pass_a_w, pass_a_h) != (resized_w, resized_h):
        print(f"[Stage 2 Pass B] Re-resizing eroded mask from {resized_w}x{resized_h} to {pass_a_w}x{pass_a_h}...")
        eroded_mb = download_bytes(resized_eroded_url)
        eroded_img = Image.open(io.BytesIO(eroded_mb)).convert("L")
        eroded_img = eroded_img.resize((pass_a_w, pass_a_h), Image.NEAREST)
        new_eroded_path = f"{STORAGE_PATH}/mask_eroded_passa_size.png"
        resized_eroded_url = upload_and_sign(new_eroded_path, to_png_bytes(eroded_img), "image/png")
        print(f"[Stage 2 Pass B] Re-sized eroded mask: {resized_eroded_url[:60]}...")

    # ── Pass B: Generate new furniture — 3 parallel variations ────────────
    replacement_parts = list(analysis.get("replacement_descriptions", {}).values())
    combined_replacement = " ".join(replacement_parts)
    combined_replacement += (
        " Photorealistic interior design magazine photography, natural daylight, "
        "warm ambient light, sharp focus, 8K quality."
    )
    print(f"\n[Stage 2 Pass B] Replacement prompt: {combined_replacement[:200]}...")

    seeds = [42, 123, 777]
    pass_b_pred_ids = []
    for seed in seeds:
        result = replicate_models_post(
            "black-forest-labs/flux-fill-pro",
            {
                "input": {
                    "image": pass_a_supabase_url,
                    "mask": resized_eroded_url,
                    "prompt": combined_replacement,
                    "guidance": 45,
                    "steps": 35,
                    "prompt_upsampling": True,
                    "output_format": "png",
                    "safety_tolerance": 5,
                    "seed": seed,
                }
            },
        )
        pass_b_pred_ids.append(result["id"])
        print(f"[Stage 2 Pass B] Seed {seed} prediction ID: {result['id']}")

    # Poll all 3 in parallel
    pass_b_results = [None] * 3
    pass_b_errors = {}

    def poll_pass_b(i, pred_id):
        try:
            r = replicate_poll(pred_id, timeout=600)
            pass_b_results[i] = replicate_output_url(r)
        except Exception as e:
            pass_b_errors[i] = str(e)
            print(f"[Stage 2 Pass B] Error on variation {i+1}: {e}")

    threads = [threading.Thread(target=poll_pass_b, args=(i, pid)) for i, pid in enumerate(pass_b_pred_ids)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    pass_b_urls = {}
    for i, rep_url in enumerate(pass_b_results):
        v_name = f"v{i+1}"
        if rep_url:
            img_bytes = download_bytes(rep_url)
            path = f"{STORAGE_PATH}/stage2_pass_b_{v_name}.png"
            sb_url = upload_and_sign(path, img_bytes, "image/png")
            pass_b_urls[v_name] = sb_url
            print(f"[Stage 2 Pass B] {v_name}: {sb_url}")
        else:
            print(f"[Stage 2 Pass B] {v_name} FAILED: {pass_b_errors.get(i)}")

    return {
        "pass_a_url": pass_a_supabase_url,
        "pass_b_urls": pass_b_urls,
        "combined_replacement_prompt": combined_replacement,
        "resized_eroded_url": resized_eroded_url,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 3: Claude Vision quality gate
# ═══════════════════════════════════════════════════════════════════════════════

def stage3_quality_gate(pass_b_urls, combined_prompt, eroded_url, analysis, attempt=1):
    print(f"\n[Stage 3] Quality gate (attempt {attempt})...")

    if not pass_b_urls:
        print("[Stage 3] No Pass B images available. Skipping quality gate.")
        return {"winner": "v1", "winner_url": None, "scores": {}, "gate_data": {}}

    # Build multi-image Claude call
    content = []
    ordered_keys = sorted(pass_b_urls.keys())  # v1, v2, v3
    for k in ordered_keys:
        url = pass_b_urls[k]
        img_bytes = download_bytes(url)
        b64 = base64.b64encode(img_bytes).decode()
        mime = "image/png"
        content.append({"type": "text", "text": f"Image {k}:"})
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": mime, "data": b64},
        })

    eval_prompt = (
        "You are evaluating three AI-generated interior design images.\n"
        f"Rate each ({', '.join(ordered_keys)}) on these criteria, score 1-10 each:\n"
        f"1. Photorealism — does new furniture look like a real photo?\n"
        f"2. Style match — does it genuinely look {STYLE}?\n"
        f"3. Lighting consistency — does new furniture match room lighting?\n"
        f"4. Room recognition — is it clearly the same room with unchanged fixed items?\n"
        f"5. Designer quality — would a professional designer be proud of this?\n\n"
        'Return ONLY valid JSON:\n'
        '{\n'
        '  "scores": {\n'
        '    "v1": {"photorealism": 0, "style_match": 0, "lighting": 0, "room_recognition": 0, "designer_quality": 0, "total": 0},\n'
        '    "v2": {...},\n'
        '    "v3": {...}\n'
        '  },\n'
        '  "winner": "v1",\n'
        '  "winner_total": 0,\n'
        '  "issues": "specific problems with the winner",\n'
        '  "recommendation": "proceed or regenerate"\n'
        '}'
    )
    content.append({"type": "text", "text": eval_prompt})

    result = http_post(
        "https://api.anthropic.com/v1/messages",
        {
            "model": "claude-sonnet-4-6",
            "max_tokens": 1000,
            "messages": [{"role": "user", "content": content}],
        },
        {
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )

    text = result["content"][0]["text"].strip()
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            stripped = part.strip()
            if stripped.startswith("json"):
                stripped = stripped[4:].strip()
            if stripped.startswith("{"):
                text = stripped
                break

    gate = json.loads(text)
    save_json(f"{RESULTS_DIR}/stage3_quality_gate.json", gate)
    print("[Stage 3] Quality gate results:")
    print(json.dumps(gate, indent=2))

    winner = gate.get("winner", "v1")
    recommendation = gate.get("recommendation", "proceed")

    if recommendation == "regenerate" and attempt == 1:
        print("[Stage 3] Recommendation: regenerate. Refining prompt and retrying Pass B...")
        issues = gate.get("issues", "")
        refined_prompt = (
            f"{combined_prompt} "
            f"Fix these issues from previous attempt: {issues}. "
            f"Ensure perfect photorealism and consistent {STYLE} style throughout."
        )
        # Rerun Pass B with refined prompt
        seeds = [42, 123, 777]
        new_pass_b_pred_ids = []
        for seed in seeds:
            r = replicate_models_post(
                "black-forest-labs/flux-fill-pro",
                {
                    "input": {
                        "image": pass_b_urls.get("v1", "").replace(
                            "stage2_pass_b_v1", "stage2_pass_a_clean"
                        ),  # reuse pass A output
                        "mask": eroded_url,
                        "prompt": refined_prompt,
                        "guidance": 45,
                        "steps": 35,
                        "prompt_upsampling": True,
                        "output_format": "png",
                        "safety_tolerance": 5,
                        "seed": seed,
                    }
                },
            )
            new_pass_b_pred_ids.append(r["id"])

        new_pass_b_urls = {}
        new_results = [None] * 3
        new_errors = {}

        def poll_retry(i, pid):
            try:
                r = replicate_poll(pid, timeout=600)
                new_results[i] = replicate_output_url(r)
            except Exception as e:
                new_errors[i] = str(e)

        threads = [threading.Thread(target=poll_retry, args=(i, pid)) for i, pid in enumerate(new_pass_b_pred_ids)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        for i, rep_url in enumerate(new_results):
            v_name = f"v{i+1}"
            if rep_url:
                img_bytes = download_bytes(rep_url)
                path = f"{STORAGE_PATH}/stage3_retry_pass_b_{v_name}.png"
                sb_url = upload_and_sign(path, img_bytes, "image/png")
                new_pass_b_urls[v_name] = sb_url
                print(f"[Stage 3 Retry] {v_name}: {sb_url}")

        if new_pass_b_urls:
            return stage3_quality_gate(new_pass_b_urls, refined_prompt, eroded_url, analysis, attempt=2)

    return {
        "winner": winner,
        "winner_url": pass_b_urls.get(winner, pass_b_urls.get("v1")),
        "scores": gate.get("scores", {}),
        "gate_data": gate,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 4: Kontext Pro polish pass
# ═══════════════════════════════════════════════════════════════════════════════

def stage4_kontext_polish(winner_url):
    print(f"\n[Stage 4] Kontext Pro polish on: {winner_url[:60]}...")

    result = replicate_models_post(
        "black-forest-labs/flux-kontext-pro",
        {
            "input": {
                "prompt": (
                    f"This room is being redesigned in {STYLE} style. Make only these subtle adjustments: "
                    "ensure all new furniture has consistent lighting and shadows matching the room's natural light direction. "
                    "Add soft natural shadows beneath new furniture pieces on the floor. "
                    "Fix any visible edge artifacts where edited areas meet the original photo. "
                    "Do not change any fixed furniture, walls, floor color, ceiling, or windows. "
                    "Photorealistic interior design magazine quality."
                ),
                "input_image": winner_url,
                "aspect_ratio": "match_input_image",
                "output_format": "png",
                "safety_tolerance": 5,
            }
        },
    )
    pred_id = result["id"]
    print(f"[Stage 4] Prediction ID: {pred_id}")
    result = replicate_poll(pred_id, timeout=600)
    final_url_replicate = replicate_output_url(result)
    print(f"[Stage 4] Output: {final_url_replicate}")

    final_bytes = download_bytes(final_url_replicate)
    final_path = f"{STORAGE_PATH}/stage4_final_redesign.png"
    final_url = upload_and_sign(final_path, final_bytes, "image/png")
    print(f"[Stage 4] Final redesign: {final_url}")
    return final_url, final_bytes


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 5: Marble Plus single image
# ═══════════════════════════════════════════════════════════════════════════════

def stage5_marble(final_bytes):
    print("\n[Stage 5] Marble Plus — uploading redesign...")
    marble_base = "https://api.worldlabs.ai/marble/v1"
    marble_auth = {"WLT-Api-Key": MARBLE_KEY}
    marble_json_headers = {"WLT-Api-Key": MARBLE_KEY, "Content-Type": "application/json"}

    # Step 5a: Prepare upload
    prep_result = http_post(
        f"{marble_base}/media-assets:prepare_upload",
        {"file_name": "pranav_redesign.png", "kind": "image", "extension": "png"},
        marble_json_headers,
    )
    print(f"[Stage 5] Prepare response keys: {list(prep_result.keys())}")
    media_asset_id = prep_result["media_asset"]["media_asset_id"]
    upload_url = prep_result["upload_info"]["upload_url"]
    size_limit = prep_result["upload_info"].get("required_headers", {}).get("x-goog-content-length-range", "")
    print(f"[Stage 5] Media asset ID: {media_asset_id}")

    # PUT image bytes to GCS
    gcs_headers = {"Content-Type": "image/png"}
    if size_limit:
        gcs_headers["x-goog-content-length-range"] = size_limit
    http_put(upload_url, final_bytes, gcs_headers)
    print(f"[Stage 5] Uploaded {len(final_bytes)/1e6:.1f}MB to Marble GCS.")

    # Step 5b: Generate world
    text_prompt = (
        f"{STYLE} bedroom interior, natural oak furniture, linen textiles, "
        "warm ambient lighting, clean minimal aesthetic, photorealistic"
    )
    gen_payload = {
        "model": "Marble 0.1-plus",
        "display_name": f"Pranav Room — {STYLE} Single Image",
        "world_prompt": {
            "type": "image",
            "image_prompt": {
                "source": "media_asset",
                "media_asset_id": media_asset_id,
            },
            "text_prompt": text_prompt,
        },
        "permission": {"public": False},
    }
    try:
        world_result = http_post(f"{marble_base}/worlds:generate", gen_payload, marble_json_headers)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[Stage 5] worlds:generate failed ({e.code}): {body}")
        if e.code == 402:
            print("[Stage 5] Marble account has insufficient credits. Skipping 3D generation.")
            print(f"[Stage 5] To proceed: add credits at worldlabs.ai. Media asset ID: {media_asset_id}")
            return {
                "world_url": "",
                "spz_full": "",
                "spz_500k": "",
                "error": f"402 Insufficient credits. Media asset ID: {media_asset_id}",
                "media_asset_id": media_asset_id,
            }
        raise
    print(f"[Stage 5] Generate response: {json.dumps(world_result)[:300]}")

    operation_id = world_result.get("operation_id")
    world_id = world_result.get("world_id") or world_result.get("id")

    # Step 5c: Poll operation then fetch assets
    print("[Stage 5] Polling Marble operation (15s intervals, 15min timeout)...")
    start = time.time()
    timeout = 15 * 60

    if operation_id:
        while True:
            op_data = http_get(f"{marble_base}/operations/{operation_id}", marble_auth)
            done = op_data.get("done", False)
            elapsed = int(time.time() - start)
            print(f"  Operation done={done} ({elapsed}s) keys={list(op_data.keys())}")

            if done:
                if op_data.get("error"):
                    print(f"[Stage 5] Marble failed: {op_data}")
                    return {"world_url": "", "spz_full": "", "spz_500k": "", "error": str(op_data)}
                world_id = (op_data.get("metadata", {}).get("world_id")
                            or op_data.get("response", {}).get("world_id")
                            or world_id)
                break

            if time.time() - start > timeout:
                print("[Stage 5] Marble operation timed out.")
                world_url = f"https://marble.worldlabs.ai/world/{world_id}" if world_id else ""
                return {"world_url": world_url, "spz_full": "", "spz_500k": "", "timeout": True}
            time.sleep(15)

    if not world_id:
        print("[Stage 5] No world_id. Cannot fetch assets.")
        return {"world_url": "", "spz_full": "", "spz_500k": "", "error": "no world_id"}

    print(f"[Stage 5] World ID: {world_id}. Fetching assets...")
    world_url = f"https://marble.worldlabs.ai/world/{world_id}"

    for attempt in range(12):
        world_data = http_get(f"{marble_base}/worlds/{world_id}", marble_auth)
        spz_urls = world_data.get("assets", {}).get("splats", {}).get("spz_urls", {})
        elapsed = int(time.time() - start)
        print(f"  Assets attempt {attempt+1}: spz_urls={bool(spz_urls)} ({elapsed}s)")

        if spz_urls.get("full_res"):
            spz_full = spz_urls["full_res"]
            spz_500k = spz_urls.get("500k", "")
            print(f"[Stage 5] SPZ ready! World: {world_url}")
            print(f"[Stage 5] SPZ full res: {spz_full}")
            print(f"[Stage 5] SPZ 500k: {spz_500k}")
            return {"world_url": world_url, "spz_full": spz_full, "spz_500k": spz_500k}

        if time.time() - start > timeout:
            break
        time.sleep(15)

    print(f"[Stage 5] Timed out waiting for SPZ. World URL: {world_url}")
    return {"world_url": world_url, "spz_full": "", "spz_500k": "", "timeout": True}


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    pipeline_start = time.time()
    os.makedirs(RESULTS_DIR, exist_ok=True)
    print("=" * 60)
    print("PRANAV SINGLE IMAGE PIPELINE — START")
    print(f"Input: {INPUT_PHOTO[:80]}...")
    print("=" * 60)

    results = {
        "input_photo": INPUT_PHOTO,
        "depth_map_url": "",
        "mask_original_url": "",
        "mask_dilated_url": "",
        "mask_eroded_url": "",
        "pass_a_clean_room_url": "",
        "pass_b_v1_url": "",
        "pass_b_v2_url": "",
        "pass_b_v3_url": "",
        "quality_gate_winner": "",
        "quality_gate_scores": {},
        "final_redesign_url": "",
        "marble_world_url": "",
        "marble_spz_full": "",
        "marble_spz_500k": "",
        "total_time_seconds": 0,
    }

    # Stage 0
    stage0_data = run_stage0()
    analysis = stage0_data["analysis"]
    results["depth_map_url"] = stage0_data.get("depth_url", "")

    # Stage 1
    mask_data = stage1_segmentation(analysis)
    results["mask_original_url"] = mask_data["mask_original_url"]
    results["mask_dilated_url"] = mask_data["mask_dilated_url"]
    results["mask_eroded_url"] = mask_data["mask_eroded_url"]

    # Stage 2
    stage2_data = stage2_flux_fill(mask_data, analysis)
    results["pass_a_clean_room_url"] = stage2_data["pass_a_url"]
    for v_name, url in stage2_data["pass_b_urls"].items():
        results[f"pass_b_{v_name}_url"] = url

    # Stage 3
    gate_result = stage3_quality_gate(
        stage2_data["pass_b_urls"],
        stage2_data["combined_replacement_prompt"],
        stage2_data["resized_eroded_url"],
        analysis,
    )
    results["quality_gate_winner"] = gate_result["winner"]
    results["quality_gate_scores"] = gate_result["scores"]

    # Stage 4
    final_url, final_bytes = stage4_kontext_polish(gate_result["winner_url"])
    results["final_redesign_url"] = final_url

    # Stage 5
    marble_result = stage5_marble(final_bytes)
    results["marble_world_url"] = marble_result.get("world_url", "")
    results["marble_spz_full"] = marble_result.get("spz_full", "")
    results["marble_spz_500k"] = marble_result.get("spz_500k", "")

    # Stage 6
    results["total_time_seconds"] = int(time.time() - pipeline_start)
    save_json(f"{RESULTS_DIR}/pipeline_results.json", results)

    print("\n" + "=" * 60)
    print("=== PRANAV SINGLE IMAGE PIPELINE COMPLETE ===")
    print(f"Final redesigned image: {results['final_redesign_url']}")
    print(f"Marble world (navigate here): {results['marble_world_url']}")
    print(f"SPZ full res: {results['marble_spz_full']}")
    print(f"Total time: {results['total_time_seconds']}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
