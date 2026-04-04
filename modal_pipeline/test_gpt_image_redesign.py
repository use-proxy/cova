import urllib.request
import urllib.error
import base64
import json
import os
import time

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

INPUT_PHOTO = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9885.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4ODUuSlBHIiwiaWF0IjoxNzc1MTY0NTkxLCJleHAiOjE3NzU3NjkzOTF9.kmBSw4JgmbH3eqLGpyswYN76vXUaV1gvJr_ILvjWwqc"

REDESIGN_PROMPT = """This is a shared bedroom with three beds. Transform it into a Japandi interior design.

KEEP EXACTLY AS-IS — do not change these under any circumstances:
- All three beds and their wooden frames, exact positions, and locations in the room
- All desks, their positions and locations
- Most items currently on the desks (laptop, monitor, lamps, books, personal items)
- The wall color and all wood paneling on walls and ceiling
- The large window and blinds in the center
- All rugs currently on the floor
- All wall posters and artwork
- The ceiling fan

CHANGE THESE SPECIFIC THINGS:
- Remove the person sitting on the right bed completely — replace with clean made bed
- Remove ALL clothing, bags, and items from the floor completely — floor should be bare
- Replace the office chair with a minimalist solid natural oak Japandi accent chair with a woven rush seat and thin tapered legs
- Make all three beds with clean crisp white linen bedding, neatly and tightly made, no wrinkles
- Add a tall wabi-sabi ceramic vase with dried pampas grass near the window
- Add one small potted plant on each desk
- Add a warm paper lantern pendant light hanging from ceiling

The result should look like a professional Japandi interior design magazine photograph of the same room. Same walls, same structure, same beds in same positions — but dramatically cleaner, more intentional, and styled. Natural daylight from the window, warm ambient light, photorealistic."""

REDESIGN_PROMPT_V2 = """Redesign this shared bedroom in Japandi style while keeping the structure identical.

MUST KEEP UNCHANGED:
- All three beds in their exact current positions with wooden frames
- All desks exactly where they are
- Wood paneling on walls and ceiling
- Large window with blinds
- Floor rugs
- Wall art and posters
- Ceiling fan

REDESIGN THESE:
- Remove the person from the right bed — show a neatly made bed instead
- Clear ALL items from the floor — completely bare floor
- Swap the office chair for a Japandi oak chair with woven seat
- Dress all beds in clean white Japandi linen, perfectly made
- Declutter the desk surfaces — keep only essentials (lamp, laptop, one plant)
- Replace desk lamp with warm paper pendant light
- Add pampas grass in ceramic vase by window
- Style should feel like a high-end Japandi hotel room — calm, clean, natural

Same room. Same bones. Completely different feeling. Photorealistic."""


def build_multipart(fields, files):
    boundary = b'----FormBoundary7MA4YWxkTrZu0gW'
    body = b''
    for key, value in fields.items():
        body += b'--' + boundary + b'\r\n'
        body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
        body += value.encode() + b'\r\n'
    for key, (filename, data, content_type) in files.items():
        body += b'--' + boundary + b'\r\n'
        body += f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'.encode()
        body += f'Content-Type: {content_type}\r\n\r\n'.encode()
        body += data + b'\r\n'
    body += b'--' + boundary + b'--\r\n'
    ct = f'multipart/form-data; boundary={boundary.decode()}'
    return body, ct


def run_redesign(prompt, version_label, image_bytes):
    fields = {
        'prompt': prompt,
        'model': 'gpt-image-1',
        'n': '1',
        'size': '1536x1024',
        'quality': 'high'
    }
    files = {
        'image[]': ('room.jpg', image_bytes, 'image/jpeg')
    }
    body, content_type = build_multipart(fields, files)

    req = urllib.request.Request(
        'https://api.openai.com/v1/images/edits',
        data=body,
        method='POST'
    )
    req.add_header('Authorization', f'Bearer {OPENAI_API_KEY}')
    req.add_header('Content-Type', content_type)

    print(f"\n[{version_label}] Calling GPT-image-1 edit endpoint...")
    start = time.time()

    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            response = json.loads(r.read())
        elapsed = time.time() - start
        print(f"[{version_label}] Completed in {elapsed:.1f}s")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"[{version_label}] HTTP {e.code}: {error_body}")
        raise

    result_b64 = response['data'][0]['b64_json']
    result_bytes = base64.b64decode(result_b64)

    filename = f"redesign_{version_label}.png"
    os.makedirs('results/pranav_gpt', exist_ok=True)
    with open(f'results/pranav_gpt/{filename}', 'wb') as f:
        f.write(result_bytes)
    print(f"[{version_label}] Saved locally: {len(result_bytes)} bytes")

    upload_url = f"{SUPABASE_URL}/storage/v1/object/room-videos/test-pranav-gpt/{filename}"
    req2 = urllib.request.Request(upload_url, data=result_bytes, method='POST')
    req2.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req2.add_header('Content-Type', 'image/png')
    req2.add_header('x-upsert', 'true')
    with urllib.request.urlopen(req2) as r:
        print(f"[{version_label}] Upload status: {r.status}")

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/room-videos/test-pranav-gpt/{filename}"
    print(f"[{version_label}] Result URL: {public_url}")
    return public_url, elapsed


# Step 1: Download input image
print("Downloading input image...")
req = urllib.request.Request(INPUT_PHOTO)
with urllib.request.urlopen(req) as r:
    image_bytes = r.read()
image_b64 = base64.b64encode(image_bytes).decode('utf-8')
print(f"Image downloaded: {len(image_bytes)} bytes")

# Step 2+3+4: V1
v1_url, v1_elapsed = run_redesign(REDESIGN_PROMPT, 'v1', image_bytes)

# Step 5: V2
v2_url, v2_elapsed = run_redesign(REDESIGN_PROMPT_V2, 'v2', image_bytes)

# Step 6: Save results
results = {
    "input_photo": INPUT_PHOTO,
    "v1_url": v1_url,
    "v2_url": v2_url,
    "v1_time_seconds": round(v1_elapsed, 1),
    "v2_time_seconds": round(v2_elapsed, 1),
    "total_time_seconds": round(v1_elapsed + v2_elapsed, 1)
}
with open('results/pranav_gpt/results.json', 'w') as f:
    json.dump(results, f, indent=2)
print("\n=== FINAL RESULTS ===")
print(json.dumps(results, indent=2))
