import os, json, time, urllib.request, tempfile
from pathlib import Path

env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
env_vars = {}
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            env_vars[key.strip()] = val.strip().strip('"').strip("'")

SUPABASE_URL = env_vars["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = env_vars["SUPABASE_SERVICE_ROLE_KEY"]
REPLICATE_TOKEN = env_vars["REPLICATE_API_TOKEN"]

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE_ROOMS = [
    {
        "name": "kitchen",
        "path": "kitchen-stock-1.jpg",
        "prompt": "photorealistic interior kitchen, completely neutral, white shaker cabinets, white walls, light oak hardwood floor, simple white island with two bar stools, stainless steel sink, no art, no color accents, no style, natural daylight from window, architectural photography, 8k",
    },
    {
        "name": "bathroom",
        "path": "bathroom-stock-1.jpg",
        "prompt": "photorealistic interior bathroom, completely neutral, white subway tiles, white walls, white freestanding bathtub, simple white vanity with white basin, frameless rectangular mirror, light oak floor, soft natural light, no art, no color, no style, architectural photography, 8k",
    },
    {
        "name": "dining_room",
        "path": "dining-room-stock-1.jpg",
        "prompt": "photorealistic interior dining room, completely neutral, white walls, light oak hardwood floor, simple rectangular white oak dining table, six simple white chairs, pendant light above table, no art, no color, no style, natural daylight from window, architectural photography, 8k",
    },
]

def replicate_generate(prompt, retries=3):
    for attempt in range(retries):
        try:
            create_data = json.dumps({
                "version": "black-forest-labs/flux-dev",
                "input": {
                    "prompt": prompt,
                    "width": 1024,
                    "height": 1024,
                    "num_inference_steps": 28,
                    "guidance": 3.5,
                    "output_format": "png",
                    "output_quality": 95,
                }
            }).encode()
            req = urllib.request.Request(
                "https://api.replicate.com/v1/predictions",
                data=create_data,
                headers={
                    "Authorization": f"Bearer {REPLICATE_TOKEN}",
                    "Content-Type": "application/json",
                    "Prefer": "wait=60",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read())
            prediction_id = result.get("id")
            status = result.get("status")
            output = result.get("output")
            polls = 0
            while status not in ("succeeded", "failed", "canceled") and polls < 60:
                time.sleep(3)
                polls += 1
                poll_req = urllib.request.Request(
                    f"https://api.replicate.com/v1/predictions/{prediction_id}",
                    headers={"Authorization": f"Bearer {REPLICATE_TOKEN}"},
                )
                with urllib.request.urlopen(poll_req, timeout=30) as resp:
                    result = json.loads(resp.read())
                status = result.get("status")
                output = result.get("output")
            if status == "succeeded" and output:
                return output[0] if isinstance(output, list) else output
            raise RuntimeError(f"Prediction {status}")
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(8)
    raise RuntimeError(f"Failed after {retries} attempts")

def upload_to_supabase(image_url, storage_path, bucket="room-photos"):
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        urllib.request.urlretrieve(image_url, tmp.name)
        with open(tmp.name, "rb") as f:
            image_bytes = f.read()
    supabase.storage.from_(bucket).upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": "image/jpeg", "upsert": "true"}
    )
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}"

def main():
    print(f"Generating {len(BASE_ROOMS)} neutral base rooms")
    print("=" * 50)
    for room in BASE_ROOMS:
        print(f"\nGenerating {room['name']}...")
        try:
            url = replicate_generate(room["prompt"])
            public_url = upload_to_supabase(url, room["path"])
            print(f"  ✓ Uploaded: {public_url}")
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
        time.sleep(3)
    print("\nDone")

if __name__ == "__main__":
    main()
