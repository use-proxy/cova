import os

# Load env vars from .env.local if not already set
if not os.environ.get('OPENAI_API_KEY'):
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'apps/web/.env.local')
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, value = line.partition('=')
                    key = key.strip()
                    value = value.strip()
                    if key and value:
                        os.environ.setdefault(key, value)
        print("Loaded env vars from apps/web/.env.local")

import urllib.request
import urllib.error
import base64
import json
import time
import threading

SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
MARBLE_API_KEY = os.environ["MARBLE_API_KEY"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

PHOTO_A = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/A.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvQS5KUEciLCJpYXQiOjE3NzUxNzAxMzMsImV4cCI6MTc3NTc3NDkzM30.1K0QmhN0AFq-yAFk9U3YTfhejObwowcGYl3OHrrNiJo"
PHOTO_B = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/B.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvQi5KUEciLCJpYXQiOjE3NzUxNzAxNDMsImV4cCI6MTc3NTc3NDk0M30.MiMqhIbYeO8rTbZKp78zArwStASEDkSlyd0IgqHGMP4"
PHOTO_C = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/C.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvQy5KUEciLCJpYXQiOjE3NzUxNzAxNTUsImV4cCI6MTc3NTc3NDk1NX0.ZlHlG1_mgIG6M1PiyUEYKyOiLmLsBdrZmvZS0WqNlA4"
PHOTO_D = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/D.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvRC5KUEciLCJpYXQiOjE3NzUxNzAxNjMsImV4cCI6MTc3NTc3NDk2M30.GrhAMWuUnn9TzJTmeCfOI_d4QWwjYLxddVjwKsEbLaE"

JAPANDI_PROMPT = """This is a shared bedroom with three beds. Transform it into a stunning Japandi interior design.

KEEP EXACTLY AS-IS — do not change these:
- All three beds and their wooden frames in their exact current positions
- All desks and their positions
- Wood paneling on walls and ceiling
- The large window and blinds
- All rugs on the floor
- All wall posters and artwork
- The ceiling fan
- Closets and storage furniture

CHANGE THESE:
- Remove any people from the room
- Remove ALL clothing, bags, and items from the floor completely
- Replace the office chair with a minimalist solid natural oak Japandi accent chair with woven rush seat and tapered legs
- Make all beds with clean crisp white linen bedding, neatly made
- Add a tall wabi-sabi ceramic vase with dried pampas grass near the window
- Add small potted plants on each desk
- Add warm paper pendant light hanging from ceiling
- Clean and organize desk surfaces — keep only essentials

Result must look like a professional Japandi interior design magazine photograph. Same room structure, dramatically cleaner and more intentional. Natural daylight, warm ambient light, photorealistic."""

MARBLE_TEXT_PROMPT = "Japandi bedroom interior, natural oak furniture, white linen bedding, dried pampas grass, warm paper pendant light, clean minimal aesthetic, photorealistic interior design"


def download_image(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def gpt_image_edit(prompt, image_bytes_list, output_filename):
    boundary = b'----FormBoundary7MA4YWxkTrZu0gW'
    body = b''

    for key, value in [('prompt', prompt), ('model', 'gpt-image-1'), ('n', '1'), ('size', '1536x1024'), ('quality', 'high')]:
        body += b'--' + boundary + b'\r\n'
        body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
        body += value.encode() + b'\r\n'

    for i, img_bytes in enumerate(image_bytes_list):
        body += b'--' + boundary + b'\r\n'
        body += f'Content-Disposition: form-data; name="image[]"; filename="room_{i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode()
        body += img_bytes + b'\r\n'

    body += b'--' + boundary + b'--\r\n'

    req = urllib.request.Request(
        'https://api.openai.com/v1/images/edits',
        data=body,
        method='POST',
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': f'multipart/form-data; boundary={boundary.decode()}'
        }
    )

    print(f"  GPT-image-1 generating {output_filename}...")
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            response = json.loads(r.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  HTTP {e.code}: {error_body}")
        raise
    print(f"  Done in {time.time()-start:.1f}s")

    result_bytes = base64.b64decode(response['data'][0]['b64_json'])

    os.makedirs('results/three_tests', exist_ok=True)
    with open(f'results/three_tests/{output_filename}', 'wb') as f:
        f.write(result_bytes)

    return result_bytes


def upload_to_supabase(data, path, content_type='image/png'):
    """Upload to room-videos bucket."""
    url = f"{SUPABASE_URL}/storage/v1/object/room-videos/{path}"
    req = urllib.request.Request(
        url,
        data=data,
        method='POST',
        headers={
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': content_type,
            'x-upsert': 'true',
            'Cache-Control': '3600'
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  Upload error {e.code}: {error_body}")
        # Don't crash — image is saved locally, continue pipeline
        return e.code


def marble_upload_media_asset(image_bytes, filename):
    body = json.dumps({
        "file_name": filename,
        "mime_type": "image/png",
        "kind": "image"
    }).encode()

    req = urllib.request.Request(
        'https://api.worldlabs.ai/marble/v1/media-assets:prepare_upload',
        data=body,
        method='POST',
        headers={
            'WLT-Api-Key': MARBLE_API_KEY,
            'Content-Type': 'application/json'
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  Marble media asset error {e.code}: {error_body}")
        raise

    print(f"  Marble prepare_upload response: {json.dumps(resp, indent=2)}")

    upload_url = resp['upload_info']['upload_url']
    media_asset_id = resp['media_asset']['media_asset_id']
    required_headers = resp['upload_info'].get('required_headers', {})

    req2 = urllib.request.Request(
        upload_url,
        data=image_bytes,
        method='PUT',
        headers={'Content-Type': 'image/png', **required_headers}
    )
    with urllib.request.urlopen(req2) as r:
        print(f"  Image uploaded to GCS: {r.status}")

    print(f"  Media asset ready: {media_asset_id}")
    return media_asset_id


def marble_generate_world(display_name, media_asset_ids, text_prompt):
    if len(media_asset_ids) == 1:
        world_prompt = {
            "type": "image",
            "image_prompt": {
                "source": "media_asset",
                "media_asset_id": media_asset_ids[0]
            },
            "text_prompt": text_prompt
        }
        request_body = {
            "model": "Marble 0.1-plus",
            "display_name": display_name,
            "world_prompt": world_prompt,
            "permission": {"public": False}
        }
    else:
        world_prompt = {
            "type": "multi-image",
            "multi_image_prompt": [
                {"content": {"source": "media_asset", "media_asset_id": mid}, "azimuth": None}
                for mid in media_asset_ids
            ],
            "text_prompt": text_prompt
        }
        request_body = {
            "model": "Marble 0.1-plus",
            "display_name": display_name,
            "reconstruct_images": True,
            "world_prompt": world_prompt,
            "permission": {"public": False}
        }

    body = json.dumps(request_body).encode()

    req = urllib.request.Request(
        'https://api.worldlabs.ai/marble/v1/worlds:generate',
        data=body,
        method='POST',
        headers={'WLT-Api-Key': MARBLE_API_KEY, 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  Marble HTTP {e.code}: {error_body}")
        raise

    operation_id = resp['operation_id']
    print(f"  Marble operation submitted: {operation_id}")
    return operation_id


def marble_poll_until_complete(operation_id, timeout=900):
    """Poll operation until done, then poll the world until splats are ready. Returns world response."""
    print(f"  Polling Marble operation {operation_id}...")
    start = time.time()

    # Step 1: poll operation until done
    world_id = None
    while time.time() - start < timeout:
        req = urllib.request.Request(
            f'https://api.worldlabs.ai/marble/v1/operations/{operation_id}',
            headers={'WLT-Api-Key': MARBLE_API_KEY}
        )
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())

        elapsed = int(time.time() - start)
        done = resp.get('done', False)
        error = resp.get('error')
        print(f"  [{elapsed}s] done={done} error={error}")

        if error:
            raise Exception(f"Marble operation failed: {resp}")

        if done:
            response = resp.get('response', {})
            print(f"  Operation complete. Response: {json.dumps(response, indent=2)}")
            # Extract world_id from response
            if 'world_id' in response:
                world_id = response['world_id']
            elif 'id' in response:
                world_id = response['id']
            elif 'name' in response:
                world_id = response['name'].split('/')[-1]
            elif 'world' in response:
                w = response['world']
                world_id = w.get('world_id') or w.get('id') or w.get('name', '').split('/')[-1]
            else:
                # response itself may be the world object
                world_id = None
            print(f"  World ID: {world_id}")
            break

        time.sleep(15)
    else:
        raise TimeoutError(f"Marble operation timeout after {timeout}s")

    if not world_id:
        raise ValueError(f"Could not extract world_id from operation response: {resp}")

    # Step 2: poll world until splats are ready
    print(f"  Polling world {world_id} for splats...")
    while time.time() - start < timeout:
        req = urllib.request.Request(
            f'https://api.worldlabs.ai/marble/v1/worlds/{world_id}',
            headers={'WLT-Api-Key': MARBLE_API_KEY}
        )
        with urllib.request.urlopen(req) as r:
            world_resp = json.loads(r.read())

        state = world_resp.get('state', '')
        elapsed = int(time.time() - start)
        print(f"  [{elapsed}s] World state: {state}")

        if world_resp.get('assets', {}).get('splats') or state == 'COMPLETE':
            print(f"  World complete in {elapsed}s")
            world_resp['_world_id'] = world_id
            return world_resp

        if state in ['FAILED', 'ERROR']:
            raise Exception(f"Marble world failed: {world_resp}")

        time.sleep(15)

    raise TimeoutError(f"Marble world timeout after {timeout}s")


def poll_world(test_name, operation_id, results_dict):
    try:
        resp = marble_poll_until_complete(operation_id)
        world_id = resp.get('_world_id', '')
        splats = resp.get('assets', {}).get('splats', {})
        spz_urls = splats.get('spz_urls', {})
        results_dict[test_name]['world_id'] = world_id
        results_dict[test_name]['marble_url'] = f"https://marble.worldlabs.ai/world/{world_id}"
        results_dict[test_name]['spz_full'] = spz_urls.get('full_res', '')
        results_dict[test_name]['spz_500k'] = spz_urls.get('500k', '')
        results_dict[test_name]['complete'] = True
        print(f"\n[DONE] {test_name} COMPLETE")
        print(f"   World: https://marble.worldlabs.ai/world/{world_id}")
        print(f"   SPZ: {spz_urls.get('full_res', 'N/A')}")
    except Exception as e:
        print(f"\n[FAIL] {test_name} FAILED: {e}")
        results_dict[test_name]['error'] = str(e)


# ============================================================
# DOWNLOAD ALL PHOTOS
# ============================================================
print("Downloading room photos...")
photo_a = download_image(PHOTO_A)
photo_b = download_image(PHOTO_B)
photo_c = download_image(PHOTO_C)
photo_d = download_image(PHOTO_D)
print(f"Photos downloaded: A={len(photo_a)//1024}KB B={len(photo_b)//1024}KB C={len(photo_c)//1024}KB D={len(photo_d)//1024}KB")

results = {}

# ============================================================
# TEST 1: Single image (Photo A) → GPT-image-1 → Marble
# ============================================================
print("\n" + "="*60)
print("TEST 1: Single image → Marble")
print("="*60)
t1_start = time.time()

# Test 1 — load existing local image instead of regenerating
with open('results/three_tests/test1_redesign_A.png', 'rb') as f:
    redesign_1 = f.read()
print(f"  Loaded existing Test 1 redesign: {len(redesign_1)//1024}KB")
# upload_to_supabase(redesign_1, 'test-three-options/test1_redesign_A.png')
print(f"  Local file: results/three_tests/test1_redesign_A.png")

asset_1 = marble_upload_media_asset(redesign_1, 'test1_redesign.png')
op_id_1 = marble_generate_world("Test 1 — Single Image Japandi", [asset_1], MARBLE_TEXT_PROMPT)

results['test1'] = {
    'local_file': 'results/three_tests/test1_redesign_A.png',
    'operation_id': op_id_1,
}
print(f"  Operation ID: {op_id_1}")
print(f"  Test 1 submitted in {int(time.time()-t1_start)}s — Marble processing in background")

# ============================================================
# TEST 2: Two images (A + B) → GPT-image-1 both → Marble
# ============================================================
print("\n" + "="*60)
print("TEST 2: Two images (A + B) → Marble")
print("="*60)
t2_start = time.time()

with open('results/three_tests/test2_redesign_A.png', 'rb') as f:
    redesign_2a = f.read()
print(f"  Loaded existing Test 2A redesign: {len(redesign_2a)//1024}KB")

with open('results/three_tests/test2_redesign_B.png', 'rb') as f:
    redesign_2b = f.read()
print(f"  Loaded existing Test 2B redesign: {len(redesign_2b)//1024}KB")

asset_2a = marble_upload_media_asset(redesign_2a, 'test2_redesign_A.png')
asset_2b = marble_upload_media_asset(redesign_2b, 'test2_redesign_B.png')
op_id_2 = marble_generate_world("Test 2 — Two Images Japandi", [asset_2a, asset_2b], MARBLE_TEXT_PROMPT)

results['test2'] = {
    'local_files': ['results/three_tests/test2_redesign_A.png', 'results/three_tests/test2_redesign_B.png'],
    'operation_id': op_id_2,
}
print(f"  Operation ID: {op_id_2}")
print(f"  Test 2 submitted in {int(time.time()-t2_start)}s — Marble processing in background")

# ============================================================
# TEST 3: Four images (A+B+C+D) → GPT-image-1 all four → Marble
# ============================================================
print("\n" + "="*60)
print("TEST 3: Four images (A+B+C+D) → Marble")
print("="*60)
t3_start = time.time()

all_photos = [photo_a, photo_b, photo_c, photo_d]

redesign_3a = gpt_image_edit(
    JAPANDI_PROMPT + "\n\nGenerate from DOORWAY perspective (Photo A angle) looking into the room.",
    all_photos, 'test3_redesign_A.png'
)
# upload_to_supabase(redesign_3a, 'test-three-options/test3_redesign_A.png')
print(f"  Local file: results/three_tests/test3_redesign_A.png")

redesign_3b = gpt_image_edit(
    JAPANDI_PROMPT + "\n\nGenerate from BACK WALL perspective (Photo B angle) looking toward the door.",
    all_photos, 'test3_redesign_B.png'
)
# upload_to_supabase(redesign_3b, 'test-three-options/test3_redesign_B.png')
print(f"  Local file: results/three_tests/test3_redesign_B.png")

redesign_3c = gpt_image_edit(
    JAPANDI_PROMPT + "\n\nGenerate from LEFT WALL perspective (Photo C angle) looking toward the right wall.",
    all_photos, 'test3_redesign_C.png'
)
# upload_to_supabase(redesign_3c, 'test-three-options/test3_redesign_C.png')
print(f"  Local file: results/three_tests/test3_redesign_C.png")

redesign_3d = gpt_image_edit(
    JAPANDI_PROMPT + "\n\nGenerate from RIGHT WALL perspective (Photo D angle) looking toward the left wall.",
    all_photos, 'test3_redesign_D.png'
)
# upload_to_supabase(redesign_3d, 'test-three-options/test3_redesign_D.png')
print(f"  Local file: results/three_tests/test3_redesign_D.png")

print(f"  All 4 redesigns generated")

asset_3a = marble_upload_media_asset(redesign_3a, 'test3_redesign_A.png')
asset_3b = marble_upload_media_asset(redesign_3b, 'test3_redesign_B.png')
asset_3c = marble_upload_media_asset(redesign_3c, 'test3_redesign_C.png')
asset_3d = marble_upload_media_asset(redesign_3d, 'test3_redesign_D.png')
op_id_3 = marble_generate_world("Test 3 — Four Images Japandi", [asset_3a, asset_3b, asset_3c, asset_3d], MARBLE_TEXT_PROMPT)

results['test3'] = {
    'local_files': [
        'results/three_tests/test3_redesign_A.png',
        'results/three_tests/test3_redesign_B.png',
        'results/three_tests/test3_redesign_C.png',
        'results/three_tests/test3_redesign_D.png',
    ],
    'operation_id': op_id_3,
}
print(f"  Operation ID: {op_id_3}")
print(f"  Test 3 submitted in {int(time.time()-t3_start)}s — Marble processing in background")

# ============================================================
# POLL ALL THREE MARBLE WORLDS SIMULTANEOUSLY
# ============================================================
print("\n" + "="*60)
print("POLLING ALL THREE MARBLE WORLDS SIMULTANEOUSLY")
print("="*60)

threads = [
    threading.Thread(target=poll_world, args=('test1', op_id_1, results)),
    threading.Thread(target=poll_world, args=('test2', op_id_2, results)),
    threading.Thread(target=poll_world, args=('test3', op_id_3, results))
]
for t in threads:
    t.start()
for t in threads:
    t.join()

# Save results
os.makedirs('results/three_tests', exist_ok=True)
with open('results/three_tests/results.json', 'w') as f:
    json.dump(results, f, indent=2)

print("\n" + "="*60)
print("ALL THREE TESTS COMPLETE")
print("="*60)
print(json.dumps({
    'test1_marble': results['test1'].get('marble_url', f"op:{results['test1'].get('operation_id')}"),
    'test2_marble': results['test2'].get('marble_url', f"op:{results['test2'].get('operation_id')}"),
    'test3_marble': results['test3'].get('marble_url', f"op:{results['test3'].get('operation_id')}"),
}, indent=2))
print("\nFull results:")
print(json.dumps(results, indent=2))
