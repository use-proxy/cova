import os
import json
import time
import urllib.request

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
    print("=== Script 2: FLUX Depth Pro — Geometry-Locked Restyle ===")

    payload = {
        "version": "black-forest-labs/flux-depth-pro",
        "input": {
            "prompt": (
                "Japandi style bedroom interior. The bed stays exactly as it is with white bedding. "
                "The blue rolling cabinet stays exactly as it is. The carpet stays exactly as it is. "
                "The walls stay exactly as they are. Replace the office chair with a minimalist oak Japandi accent chair. "
                "Remove all clutter and clothes from the floor. Add dried pampas grass in a ceramic vase. "
                "Add a warm paper pendant light. Clean, minimal, photorealistic interior design magazine photograph."
            ),
            "control_image": INPUT_PHOTO,
            "aspect_ratio": "match_input_image",
            "output_format": "jpg",
            "num_inference_steps": 28,
            "guidance_scale": 7.5,
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
    public_url = supabase_upload("room-videos/test-redesign/test_2_depth_pro.jpg", img_bytes)
    print(f"Supabase URL: {public_url}")

    results = {
        "prediction_id": prediction_id,
        "replicate_output_url": output_url,
        "supabase_url": public_url,
        "status": "success",
    }
    with open("modal_pipeline/test_2_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Saved to test_2_results.json")
    print("=== Script 2 DONE ===\n")


if __name__ == "__main__":
    main()
