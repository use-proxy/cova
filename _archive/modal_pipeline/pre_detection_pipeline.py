"""
Cova — Pre-Detection Pipeline
Fires on first capture photo to detect furniture before quiz ends.
Fast, lightweight Claude Vision call — result needed within 15 seconds.
"""
import modal
import os
import json
import base64
import time

app = modal.App("cova-pre-detection")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("requests", "Pillow", "fastapi[standard]")
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
)


@app.function(
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
    image=image,
    timeout=30,
    max_containers=10,
)
def detect_furniture(room_id: str, photo_url: str) -> dict:
    """
    Takes first capture photo, detects all furniture pieces.
    Returns structured list with azimuth estimates and fixed/movable classification.
    """
    import requests

    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    anthropic_key = os.environ["ANTHROPIC_API_KEY"]

    sb_headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
    }

    # Download and encode photo — one retry for transient failures.
    img_resp = None
    last_err = None
    for attempt in (1, 2):
        try:
            img_resp = requests.get(photo_url, timeout=15)
            img_resp.raise_for_status()
            break
        except Exception as e:
            last_err = e
            print(f"[pre-detection] room {room_id}: image fetch attempt {attempt} failed: {e}")
            if attempt < 2:
                time.sleep(5)
    if img_resp is None:
        raise RuntimeError(f"Failed to download room photo: {last_err}")
    img_data = base64.standard_b64encode(img_resp.content).decode("utf-8")

    prompt = """Analyze this room photo and identify EVERY distinct object visible — furniture, structural elements, fixtures, decor, and clutter alike. Be exhaustive. Do not skip small, mounted, ceiling-height, or corner items.

Detect ALL of the following when present:
- Seating (sofa, chair, bench, stool, ottoman)
- Tables/desks (coffee, dining, side, console, desk)
- Storage (bookshelf, dresser, cabinet, wardrobe, nightstand, media unit)
- Beds and bedding (bed frame, mattress, headboard)
- Rugs and floor coverings
- Lighting (floor lamp, table lamp, pendant, chandelier, ceiling fan, wall sconce, track light, recessed light)
- Wall-mounted items (art, photos, mirrors, TVs, shelves, wall decals, letters, text, signage, tapestries, clocks)
- Ceiling fixtures (fans, pendants, chandeliers, flush mounts)
- Built-ins (built-in shelving, radiators, fireplaces, built-in wardrobes)
- Windows, doors, and their treatments (curtains, blinds, shades)
- Plants and planters
- Decor (vases, books, candles, sculptures)
- Appliances
- Clutter (visible cables, power cords, bags, clothing on floor, trash, random items)

For each detected object provide:
1. label: concise generic name (e.g. "sofa", "ceiling fan", "wall art", "power cord")
2. estimated_bbox_pct: object with {x, y, w, h} as fractions (0.0-1.0) of image dimensions
   - x,y = top-left corner of bounding box as fraction of image width/height
   - w,h = bounding box width/height as fraction of image width/height
   - This is a rough visual estimate — it is only used as a fallback indicator when pixel-perfect masks are not ready.
3. is_fixed: true if structural/immovable (walls, floor, ceiling, windows, doors, built-ins, radiators, fireplaces) — false otherwise
4. confidence: 0.0-1.0
5. category: one of [sofa, chair, table, desk, bed, storage, lighting, rug, wall_art, plant, decorative, appliance, ceiling, wall, floor, window, door, built_in_shelving, radiator, fireplace, built_in_wardrobe, cable, power_cord, bag, clothing_on_floor, trash, random_item, other]
6. dominant_color: primary color in plain language
7. material: inferred material in plain language
8. size_in_room: "large", "medium", or "small"
9. style_descriptors: array of 2-3 short descriptor phrases

Return ONLY a JSON array. No preamble, no explanation, no markdown.
Example: [{"label":"sofa","estimated_bbox_pct":{"x":0.15,"y":0.45,"w":0.4,"h":0.35},"is_fixed":false,"confidence":0.95,"category":"sofa","dominant_color":"cream linen","material":"linen upholstery","size_in_room":"large","style_descriptors":["low-profile","tufted back","tapered legs"]}]"""

    ceiling_prompt = """Look ONLY at the top portion of this room image. Identify every ceiling-mounted or high-wall fixture: ceiling fans, pendant lights, chandeliers, flush-mount lights, track lighting, recessed lights, exposed beams, skylights, ceiling medallions, smoke detectors, vents, fire sprinklers, tall wall art above eye level.

For each provide: label, estimated_bbox_pct {x,y,w,h} as fractions of the ORIGINAL full image (the crop is the top 35% — so y values should be within 0.0-0.35), is_fixed (true if structural, e.g. beam or recessed light; false if a fixture like a fan or pendant), confidence, category (ceiling, lighting, wall_art, etc.), dominant_color, material, size_in_room, style_descriptors.

Return ONLY a JSON array. No preamble, no markdown. Empty array [] if nothing is present."""

    # Detect media type from URL or content
    media_type = "image/jpeg"
    if photo_url.lower().endswith(".png"):
        media_type = "image/png"
    elif photo_url.lower().endswith(".webp"):
        media_type = "image/webp"

    def _call_vision(img_b64: str, media: str, text_prompt: str) -> list:
        resp = None
        last = None
        for attempt in (1, 2):
            try:
                resp = requests.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": anthropic_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-sonnet-4-20250514",
                        "max_tokens": 2048,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": media,
                                            "data": img_b64,
                                        },
                                    },
                                    {"type": "text", "text": text_prompt},
                                ],
                            }
                        ],
                    },
                    timeout=25,
                )
                resp.raise_for_status()
                break
            except Exception as e:
                last = e
                print(f"[pre-detection] room {room_id}: Anthropic attempt {attempt} failed: {e}")
                if attempt < 2:
                    time.sleep(5)
        if resp is None:
            raise RuntimeError(f"Anthropic Vision call failed: {last}")
        rj = resp.json()
        if "error" in rj:
            raise RuntimeError(f"Anthropic API error: {rj['error']}")
        text = rj["content"][0]["text"].strip()
        clean = text.replace("```json", "").replace("```", "").strip()
        try:
            return json.loads(clean)
        except Exception as e:
            print(f"[pre-detection] room {room_id}: parse failure: {e}")
            return []

    # Pass 1: full-image exhaustive detection
    furniture_list = _call_vision(img_data, media_type, prompt)

    # Pass 2: targeted ceiling/high-wall detection on top 35% crop
    try:
        from PIL import Image as _PILImage
        import io as _io
        _img = _PILImage.open(_io.BytesIO(img_resp.content))
        _w, _h = _img.size
        _crop = _img.crop((0, 0, _w, int(_h * 0.35)))
        _buf = _io.BytesIO()
        _fmt = "PNG" if media_type == "image/png" else "JPEG"
        _crop.save(_buf, format=_fmt)
        _crop_b64 = base64.standard_b64encode(_buf.getvalue()).decode("utf-8")
        ceiling_list = _call_vision(_crop_b64, media_type, ceiling_prompt)
    except Exception as e:
        print(f"[pre-detection] room {room_id}: ceiling pass skipped: {e}")
        ceiling_list = []

    # Merge + dedupe by normalized label similarity
    def _norm(s):
        return "".join(ch for ch in (s or "").lower() if ch.isalnum())

    merged = list(furniture_list) if isinstance(furniture_list, list) else []
    seen = {_norm(f.get("label")) for f in merged if isinstance(f, dict)}
    if isinstance(ceiling_list, list):
        for c in ceiling_list:
            if not isinstance(c, dict):
                continue
            k = _norm(c.get("label"))
            if k and k not in seen:
                merged.append(c)
                seen.add(k)

    from utils import HARD_STRUCTURAL as STRUCTURAL_CATS
    from utils import normalize_label_key

    CLUTTER_CATS = {
        "cable", "power_cord", "bag", "clothing_on_floor", "trash", "random_item",
    }

    required_fields = {"label", "is_fixed", "confidence", "category"}
    validated = []
    for f in merged:
        if not isinstance(f, dict) or not required_fields.issubset(f.keys()):
            continue

        cat = normalize_label_key(str(f.get("category") or ""))

        # Auto-classify structural and clutter categories for downstream UI
        if cat in STRUCTURAL_CATS:
            f["is_fixed"] = True
            f["auto_decision"] = "keep"
        elif cat in CLUTTER_CATS:
            f["is_fixed"] = False
            f["auto_decision"] = "remove"
        else:
            f.setdefault("auto_decision", None)

        # Normalize estimated_bbox_pct; fall back to center if missing or malformed
        bbox = f.get("estimated_bbox_pct")
        if not (
            isinstance(bbox, dict)
            and all(isinstance(bbox.get(k), (int, float)) for k in ("x", "y", "w", "h"))
        ):
            bbox = {"x": 0.4, "y": 0.4, "w": 0.2, "h": 0.2}
        f["estimated_bbox_pct"] = {
            "x": max(0.0, min(1.0, float(bbox["x"]))),
            "y": max(0.0, min(1.0, float(bbox["y"]))),
            "w": max(0.01, min(1.0, float(bbox["w"]))),
            "h": max(0.01, min(1.0, float(bbox["h"]))),
        }

        # Strip legacy angular fields — they are no longer used
        f.pop("azimuth_degrees", None)
        f.pop("elevation_degrees", None)

        # Enriched fields — optional
        f.setdefault("dominant_color", None)
        f.setdefault("material", None)
        f.setdefault("size_in_room", None)
        f.setdefault("style_descriptors", [])
        if not isinstance(f.get("style_descriptors"), list):
            f["style_descriptors"] = []
        validated.append(f)

    # Store in Supabase — retry once, fail loudly if the write drops.
    patch_resp = None
    last_err = None
    for attempt in (1, 2):
        try:
            patch_resp = requests.patch(
                f"{sb_url}/rest/v1/rooms?id=eq.{room_id}",
                headers=sb_headers,
                json={"pre_detection_result": validated},
                timeout=10,
            )
            patch_resp.raise_for_status()
            break
        except Exception as e:
            last_err = e
            print(f"[pre-detection] room {room_id}: Supabase patch attempt {attempt} failed: {e}")
            if attempt < 2:
                time.sleep(3)
    if patch_resp is None or not patch_resp.ok:
        raise RuntimeError(f"Failed to persist pre_detection_result: {last_err}")

    print(f"[pre-detection] room {room_id}: detected {len(validated)} pieces")
    return {"room_id": room_id, "furniture": validated, "count": len(validated)}


@app.function(
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
    image=image,
    timeout=30,
    max_containers=10,
)
@modal.fastapi_endpoint(method="POST")
def pre_detection_webhook(item: dict):
    room_id = item.get("room_id")
    photo_url = item.get("photo_url")
    if not room_id or not photo_url:
        return {"error": "room_id and photo_url required"}
    try:
        result = detect_furniture.local(room_id, photo_url)
        return {"status": "complete", **result}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[pre-detection] ERROR: {tb}")
        return {"status": "error", "error": str(e), "traceback": tb}


@app.local_entrypoint()
def main(room_id: str = "test", photo_url: str = ""):
    if not photo_url:
        print("Usage: modal run pre_detection_pipeline.py --room-id <id> --photo-url <url>")
        return
    result = detect_furniture.remote(room_id, photo_url)
    print(json.dumps(result, indent=2))
