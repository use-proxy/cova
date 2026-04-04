"""
Cova — Pre-Detection Pipeline
Fires on first capture photo to detect furniture before quiz ends.
Fast, lightweight Claude Vision call — result needed within 15 seconds.
"""
import modal
import os
import json
import base64

app = modal.App("cova-pre-detection")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("requests", "Pillow", "fastapi[standard]")
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

    # Download and encode photo
    img_resp = requests.get(photo_url, timeout=15)
    img_data = base64.standard_b64encode(img_resp.content).decode("utf-8")

    prompt = """Analyze this room photo and identify every distinct furniture piece visible.

For each piece, provide:
1. label: concise name (e.g. "sofa", "coffee table", "floor lamp", "bed", "desk")
2. azimuth_degrees: estimated horizontal angle from room center where this piece sits
   - 0° = directly ahead (center of this photo)
   - Adjust for pieces to the left (negative) or right (positive) within ±90°
3. elevation_degrees: vertical angle from eye level
   - 0° = eye level
   - Negative = below eye level (floor furniture: -20 to -40°)
   - Positive = above eye level (wall art: +10 to +30°, ceiling light: +60 to +80°)
4. is_fixed: true if this is structural/immovable (built-in shelving, radiator, fireplace, built-in desk) — false if movable/decorative
5. confidence: 0.0-1.0 how confident you are in the detection
6. category: one of [sofa, chair, table, desk, bed, storage, lighting, rug, wall_art, plant, decorative, appliance, other]

Return ONLY a JSON array. No preamble, no explanation, no markdown.
Example: [{"label":"sofa","azimuth_degrees":-15,"elevation_degrees":-25,"is_fixed":false,"confidence":0.95,"category":"sofa"}]"""

    # Detect media type from URL or content
    media_type = "image/jpeg"
    if photo_url.lower().endswith(".png"):
        media_type = "image/png"

    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": img_data,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        },
        timeout=25,
    )

    resp_json = response.json()
    if "error" in resp_json:
        raise Exception(f"Anthropic API error: {resp_json['error']}")
    result_text = resp_json["content"][0]["text"].strip()
    clean = result_text.replace("```json", "").replace("```", "").strip()
    furniture_list = json.loads(clean)

    required_fields = {"label", "azimuth_degrees", "elevation_degrees", "is_fixed", "confidence", "category"}
    validated = [f for f in furniture_list if required_fields.issubset(f.keys())]

    # Store in Supabase
    requests.patch(
        f"{sb_url}/rest/v1/rooms?id=eq.{room_id}",
        headers=sb_headers,
        json={"pre_detection_result": validated},
        timeout=10,
    )

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
