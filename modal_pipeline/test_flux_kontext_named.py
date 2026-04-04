import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error

INPUT_PHOTO = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_2093.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzIwOTMuanBlZyIsImlhdCI6MTc3NTE1OTkwNywiZXhwIjoxNzc1NzY0NzA3fQ.9KHD2_TuPLQV2yh_ZVY-BSOhNU-ARhuweXM629Th6F0"

REPLICATE_TOKEN = os.environ["REPLICATE_API_TOKEN"]
SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def replicate_post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"https://api.replicate.com/v1/{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {REPLICATE_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def replicate_poll(prediction_id, timeout=300):
    url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
    start = time.time()
    while True:
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {REPLICATE_TOKEN}"},
        )
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
        status = result["status"]
        print(f"  status: {status}")
        if status == "succeeded":
            return result
        if status in ("failed", "canceled"):
            raise RuntimeError(f"Prediction {status}: {result.get('error')}")
        if time.time() - start > timeout:
            raise TimeoutError("Prediction timed out")
        time.sleep(5)


def download_bytes(url):
    with urllib.request.urlopen(url) as resp:
        return resp.read()


def supabase_upload(path, data, content_type="image/jpeg"):
    url = f"{SUPABASE_URL}/storage/v1/object/{path}"
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        resp.read()
    return f"{SUPABASE_URL}/storage/v1/object/public/{path}"


def main():
    print("=== Script 1: FLUX Kontext Pro — Named Furniture ===")

    payload = {
        "version": "black-forest-labs/flux-kontext-pro",
        "input": {
            "prompt": (
                "This is a bedroom. Make these EXACT changes and nothing else: "
                "(1) Replace the black mesh office chair with a minimalist solid oak Japandi dining chair with a woven rush seat. "
                "(2) Remove all clothing, bags, and items from the floor completely — the carpet should be fully visible and clean. "
                "(3) Add a small ceramic wabi-sabi vase with dried pampas grass on the desk. "
                "(4) Add a linen table lamp with a natural wood base on the desk. "
                "DO NOT change any of the following: the bed and its position, the white bed frame, the blue rolling cabinet, "
                "the carpet texture or color, the walls and their color, the ceiling fan, the window and blinds, "
                "the DAKSH letters on the wall, the desk, the posters and photos on the wall. "
                "The room must be immediately recognizable as the same room. Photorealistic interior photography."
            ),
            "input_image": INPUT_PHOTO,
            "aspect_ratio": "match_input_image",
            "output_format": "jpg",
            "safety_tolerance": 5,
        },
    }

    print("Starting prediction...")
    result = replicate_post("predictions", payload)
    prediction_id = result["id"]
    print(f"Prediction ID: {prediction_id}")

    result = replicate_poll(prediction_id)
    output = result["output"]
    if isinstance(output, list):
        output_url = output[0]
    else:
        output_url = output
    print(f"Output URL: {output_url}")

    print("Downloading output image...")
    img_bytes = download_bytes(output_url)

    print("Uploading to Supabase...")
    public_url = supabase_upload("room-videos/test-redesign/test_1_kontext_named.jpg", img_bytes)
    print(f"Supabase URL: {public_url}")

    results = {
        "prediction_id": prediction_id,
        "replicate_output_url": output_url,
        "supabase_url": public_url,
        "status": "success",
    }
    with open("modal_pipeline/test_1_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Saved to test_1_results.json")
    print("=== Script 1 DONE ===\n")


if __name__ == "__main__":
    main()
