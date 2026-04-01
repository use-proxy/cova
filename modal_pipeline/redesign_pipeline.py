"""
Cova M7 Session 2 — FLUX Kontext Redesign Pipeline
Takes marble_pano_url from rooms table, generates style prompt via Claude,
runs FLUX Kontext Pro, stores redesigned panorama.
"""

import os
import json
import time

import modal

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("supabase", "requests", "Pillow", "fastapi[standard]")
)

app = modal.App("cova-redesign-pipeline", image=image)

REPLICATE_API_BASE = "https://api.replicate.com/v1"
ANTHROPIC_API_BASE = "https://api.anthropic.com/v1"
FLUX_KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro"

STYLE_VOCABULARY = {
    "coastal": {
        "furniture": [
            "natural rattan armchair", "whitewashed oak coffee table",
            "linen upholstered sofa in off-white", "woven seagrass rug",
            "driftwood side table", "wicker storage basket",
        ],
        "materials": ["rattan", "seagrass", "whitewashed oak", "linen"],
        "colors": ["off-white", "soft blue", "sandy beige", "warm white"],
        "feel": "airy relaxed coastal",
    },
    "japandi": {
        "furniture": [
            "low solid oak platform bed",
            "minimalist walnut coffee table with tapered legs",
            "clean-lined linen sofa in warm grey", "natural jute rug",
            "simple oak bookshelf", "ceramic accent stool",
        ],
        "materials": ["solid oak", "walnut", "natural linen", "ceramic"],
        "colors": ["warm white", "natural wood tones", "soft grey", "muted sage"],
        "feel": "warm minimalist japandi",
    },
    "bohemian": {
        "furniture": [
            "colorful Moroccan rug", "eclectic velvet sofa in jewel tone",
            "woven pouf ottoman", "rattan peacock chair", "layered kilim rug",
        ],
        "materials": ["macrame", "kilim", "velvet", "rattan"],
        "colors": ["terracotta", "deep teal", "warm mustard", "burnt orange"],
        "feel": "eclectic bohemian",
    },
    "minimalist": {
        "furniture": [
            "white platform bed", "glass and steel coffee table",
            "all-white modular sofa", "floating white shelves",
            "matte black accent chair",
        ],
        "materials": ["glass", "steel", "concrete", "matte lacquer"],
        "colors": ["pure white", "light grey", "matte black", "charcoal"],
        "feel": "clean contemporary minimalist",
    },
    "mid_century": {
        "furniture": [
            "walnut credenza with tapered legs", "Eames-style lounge chair",
            "low profile tufted sofa in mustard velvet",
            "hairpin leg coffee table", "arc floor lamp",
        ],
        "materials": ["teak", "walnut", "molded plywood", "brass"],
        "colors": ["mustard yellow", "burnt orange", "teal", "walnut brown"],
        "feel": "retro mid-century modern",
    },
}


def get_dominant_styles(blend: dict) -> list:
    return [
        style for style, weight
        in sorted(blend.items(), key=lambda x: x[1], reverse=True)
        if weight > 0.1
    ]


def generate_prompt_with_claude(blend: dict, room_type: str, anthropic_key: str) -> str:
    import requests

    dominant = get_dominant_styles(blend)
    style_context = "\n".join([
        f"{s} ({round(blend.get(s, 0) * 100)}%): "
        f"{STYLE_VOCABULARY.get(s, {}).get('feel', s)}"
        for s in dominant
    ])

    furniture_items = []
    for s in dominant:
        vocab = STYLE_VOCABULARY.get(s, {})
        n = max(1, round(blend.get(s, 0) * 5))
        furniture_items.extend(vocab.get("furniture", [])[:n])

    system_prompt = (
        "You are an expert interior designer creating precise image editing "
        "prompts for FLUX Kontext Pro, an AI image editor.\n\n"
        "FLUX Kontext edits existing images. It excels at replacing furniture "
        "while preserving room architecture.\n\n"
        "Your prompts must:\n"
        "1. Be extremely specific about furniture pieces with materials and colors\n"
        "2. Explicitly preserve walls, floors, windows, ceiling, doors\n"
        "3. Specify photorealistic result\n"
        "4. Include 'equirectangular panorama, 360 degree view'\n"
        "5. Stay under 280 words\n"
        "6. Sound like directing a real interior designer, not an AI"
    )

    user_message = (
        f"Create a FLUX Kontext prompt to redesign this {room_type}.\n\n"
        f"Style blend:\n{style_context}\n\n"
        f"Suggested furniture:\n{', '.join(furniture_items[:6])}\n\n"
        "Requirements:\n"
        "- Replace ALL existing furniture and soft furnishings\n"
        "- Keep walls, floors, windows, ceiling, doors exactly as they are\n"
        "- Preserve room dimensions, proportions, existing lighting\n"
        "- Photorealistic interior design photograph result\n"
        "- Blend styles naturally\n\n"
        "Output ONLY the prompt text."
    )

    resp = requests.post(
        f"{ANTHROPIC_API_BASE}/messages",
        headers={
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 512,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"].strip()


def generate_prompt_fallback(blend: dict, room_type: str) -> str:
    dominant = get_dominant_styles(blend)
    if not dominant:
        dominant = ["minimalist"]
    top = dominant[0]
    vocab = STYLE_VOCABULARY.get(top, STYLE_VOCABULARY["minimalist"])
    furniture = ", ".join(vocab["furniture"][:4])
    materials = ", ".join(vocab["materials"][:3])
    colors = ", ".join(vocab["colors"][:3])
    return (
        f"Redesign this {room_type} in {vocab['feel']} style. "
        f"Replace all furniture with: {furniture}. "
        f"Use materials: {materials}. Color palette: {colors}. "
        f"Keep all walls, floors, windows, ceiling, doors, and architectural "
        f"features exactly as they are. Preserve all room dimensions, "
        f"proportions, and existing lighting. The result must look like a "
        f"photorealistic interior design photograph. "
        f"Equirectangular panorama, 360 degree view."
    )


def run_flux_kontext(pano_url: str, prompt: str, replicate_token: str, timeout: int = 120) -> str:
    import requests

    print(f"[kontext] Starting prediction...")
    print(f"[kontext] Prompt: {prompt[:120]}...")

    create_resp = requests.post(
        f"{REPLICATE_API_BASE}/models/{FLUX_KONTEXT_MODEL}/predictions",
        headers={
            "Authorization": f"Token {replicate_token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        },
        json={
            "input": {
                "input_image": pano_url,
                "prompt": prompt,
                "guidance": 2.5,
            }
        },
        timeout=90,
    )

    if not create_resp.ok:
        raise RuntimeError(
            f"Replicate create failed: {create_resp.status_code} "
            f"{create_resp.text[:300]}"
        )

    prediction = create_resp.json()
    prediction_id = prediction["id"]
    print(f"[kontext] Prediction ID: {prediction_id}")

    if prediction.get("status") == "succeeded":
        output = prediction.get("output", [])
        url = output[0] if isinstance(output, list) else output
        print("[kontext] Succeeded synchronously!")
        return url

    start = time.time()
    while time.time() - start < timeout:
        time.sleep(3)
        poll_resp = requests.get(
            f"{REPLICATE_API_BASE}/predictions/{prediction_id}",
            headers={"Authorization": f"Token {replicate_token}"},
            timeout=30,
        )
        poll_resp.raise_for_status()
        prediction = poll_resp.json()
        status = prediction.get("status")
        print(f"[kontext] Status: {status} ({time.time() - start:.0f}s)")

        if status == "succeeded":
            output = prediction.get("output", [])
            url = output[0] if isinstance(output, list) else output
            if not url:
                raise RuntimeError("Prediction succeeded but no output URL")
            return url

        if status in ("failed", "canceled"):
            raise RuntimeError(
                f"Prediction {status}: {prediction.get('error', 'unknown')}"
            )

    raise RuntimeError(f"FLUX Kontext timed out after {timeout}s")


def store_redesigned_pano(
    image_url: str, room_id: str, user_id: str, supabase_client,
    prompt: str, style_info: dict,
) -> str:
    import requests

    print("[kontext] Downloading redesigned panorama...")
    img_resp = requests.get(image_url, timeout=60)
    img_resp.raise_for_status()
    img_bytes = img_resp.content
    print(f"[kontext] Downloaded: {len(img_bytes) / 1e6:.1f}MB")

    storage_path = f"{user_id}/{room_id}/redesigned_pano.png"
    metadata_path = f"{user_id}/{room_id}/redesign_metadata.json"
    metadata = json.dumps({
        "prompt": prompt,
        "style_info": style_info,
        "source_model": FLUX_KONTEXT_MODEL,
        "timestamp": time.time(),
    }).encode()

    for path, content, ct in [
        (storage_path, img_bytes, "image/png"),
        (metadata_path, metadata, "application/json"),
    ]:
        try:
            supabase_client.storage.from_("room-videos").upload(
                path=path, file=content, file_options={"content-type": ct},
            )
        except Exception:
            supabase_client.storage.from_("room-videos").update(
                path=path, file=content, file_options={"content-type": ct},
            )

    print(f"[kontext] Stored at: {storage_path}")
    return storage_path


@app.function(
    timeout=300,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("replicate-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
def redesign_room(room_id: str, user_id: str) -> dict:
    """
    Main pipeline: fetch pano_url → generate style prompt → FLUX Kontext →
    store redesigned pano → update DB.
    """
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    replicate_token = os.environ["REPLICATE_API_TOKEN"]
    anthropic_key = os.environ["ANTHROPIC_API_KEY"]

    client = create_client(supabase_url, supabase_key)

    client.table("rooms").update({
        "redesign_status": "kontext_processing",
    }).eq("id", room_id).execute()

    try:
        room = client.table("rooms").select(
            "marble_pano_url, style_blend, room_type, user_id"
        ).eq("id", room_id).single().execute().data

        if not room:
            raise RuntimeError(f"Room {room_id} not found")

        pano_url = room.get("marble_pano_url")
        if not pano_url:
            raise RuntimeError(f"Room {room_id} has no marble_pano_url")

        style_blend = room.get("style_blend") or {
            "coastal": 0.0, "japandi": 0.7, "minimalist": 0.3,
            "bohemian": 0.0, "mid_century": 0.0,
        }
        room_type = room.get("room_type", "living room")

        print(f"[kontext] Room: {room_type}, styles: {get_dominant_styles(style_blend)}")

        # Generate prompt
        try:
            prompt = generate_prompt_with_claude(style_blend, room_type, anthropic_key)
            prompt_source = "claude"
        except Exception as e:
            print(f"[kontext] Claude failed: {e}, using fallback")
            prompt = generate_prompt_fallback(style_blend, room_type)
            prompt_source = "fallback"

        print(f"[kontext] Prompt ({prompt_source}): {prompt[:150]}...")

        # Run FLUX Kontext
        redesigned_url = run_flux_kontext(pano_url, prompt, replicate_token)

        # Store
        dominant_styles = get_dominant_styles(style_blend)
        style_info = {
            "dominant_styles": dominant_styles,
            "blend": style_blend,
            "prompt_source": prompt_source,
        }
        storage_path = store_redesigned_pano(
            redesigned_url, room_id, user_id, client, prompt, style_info,
        )

        signed = client.storage.from_("room-videos").create_signed_url(
            storage_path, 86400,
        )
        redesign_signed_url = signed.get("signedURL", redesigned_url)

        client.table("rooms").update({
            "redesign_pano_url": redesigned_url,
            "redesign_status": "kontext_complete",
            "status": "redesign_processing",
        }).eq("id", room_id).execute()

        print(f"[kontext] Session 2 complete!")
        return {
            "room_id": room_id,
            "redesigned_pano_url": redesigned_url,
            "redesigned_pano_signed_url": redesign_signed_url,
            "storage_path": storage_path,
            "prompt": prompt,
            "prompt_source": prompt_source,
            "dominant_styles": dominant_styles,
        }

    except Exception as e:
        print(f"[kontext] ERROR: {e}")
        client.table("rooms").update({
            "redesign_status": "error",
        }).eq("id", room_id).execute()
        raise


@app.function(
    timeout=300,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("replicate-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def redesign_webhook(item: dict):
    """HTTP webhook for triggering redesign from Next.js."""
    room_id = item.get("room_id")
    user_id = item.get("user_id", "test-user")
    if not room_id:
        return {"error": "room_id required"}
    try:
        result = redesign_room.local(room_id, user_id)
        return {"status": "complete", **result}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.local_entrypoint()
def test_local(room_id: str = "", user_id: str = "test-user"):
    """modal run modal_pipeline/redesign_pipeline.py --room-id <id>"""
    import uuid
    if not room_id:
        room_id = str(uuid.uuid4())
        print(f"Generated room_id: {room_id}")
    result = redesign_room.remote(room_id, user_id)
    print("\n=== RESULT ===")
    for k, v in result.items():
        if k != "prompt":
            print(f"  {k}: {v}")
    print(f"\n  Prompt:\n  {result.get('prompt', 'N/A')}")
