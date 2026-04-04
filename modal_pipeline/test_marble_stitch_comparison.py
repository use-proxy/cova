import os, json, time, urllib.request, urllib.error, base64, threading
import numpy as np
from PIL import Image
import cv2
import py360convert
import io

# Load env vars
env_file = 'apps/web/.env.local'
with open(env_file) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, _, value = line.partition('=')
            os.environ.setdefault(key.strip(), value.strip())

MARBLE_API_KEY = os.environ['MARBLE_API_KEY']

SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"

PANO_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9892.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4OTIuanBlZyIsImlhdCI6MTc3NTE4NTAwMCwiZXhwIjoxNzc1Nzg5ODAwfQ.vhtp6ZhuThy9Ajg4Cq0DVljsVPBBduL9LoQNyEtmTsE"

MIDPOINT_4 = [
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/A.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvQS5KUEciLCJpYXQiOjE3NzUxODUwMTcsImV4cCI6MTc3NTc4OTgxN30.mpbSOM1a220LyJzWdxwajBYKyuDC5ZIngUdAMk8ELW0",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/B.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvQi5KUEciLCJpYXQiOjE3NzUxODUwMjIsImV4cCI6MTc3NTc4OTgyMn0.v6c6ry8vxCcYIuBL9QOIOoFwsfci3GUK1TbOd0lAmKY",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/C.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvQy5KUEciLCJpYXQiOjE3NzUxODUwMjYsImV4cCI6MTc3NTc4OTgyNn0.awmiOl82n0XuGeXiLd3REXG54FzCJAlphyexenPK1mY",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/D.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvRC5KUEciLCJpYXQiOjE3NzUxODUwMzIsImV4cCI6MTc3NTc4OTgzMn0.U8XS7B7SZAGZYAqbXQ6wKiJoGBg08HFp4Ol6Gmg1SlA"
]

CENTER_8 = [
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9864.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjQuanBlZyIsImlhdCI6MTc3NTE4NTA1OSwiZXhwIjoxNzc1Nzg5ODU5fQ.hKNdfqw5smkrvvT-sZ7OXaYGfX-2fQ8rdYR5fTqUMa8",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9865.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjUuanBlZyIsImlhdCI6MTc3NTE4NTA2NCwiZXhwIjoxNzc1Nzg5ODY0fQ.Sn0XU7GyVgJILN7VBEvEQFU_EeOZtO7E_MV2Qg9W9yc",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9866.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjYuanBlZyIsImlhdCI6MTc3NTE4NTA3MiwiZXhwIjoxNzc1Nzg5ODcyfQ.vqLiZeEOWffXEQ28moG_SFDKxp-c30hONXYTjRflrV8",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9867.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjcuanBlZyIsImlhdCI6MTc3NTE4NTA3NiwiZXhwIjoxNzc1Nzg5ODc2fQ.X0oC7bvq-_Utc-VbZA90UiC64lBCNr8UiU4TMLedrn8",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9868.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjguanBlZyIsImlhdCI6MTc3NTE4NTA4MywiZXhwIjoxNzc1Nzg5ODgzfQ.upPY34yUIPEP_3tmre_6m1r53vlilu1XjcVpxWyhkDU",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9869.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjkuanBlZyIsImlhdCI6MTc3NTE4NTA4OCwiZXhwIjoxNzc1Nzg5ODg4fQ.t5KIkaqDl-IG2PBE0hDBXPlq-5QZ83UHTfHn2W2MZvI",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9870.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzAuanBlZyIsImlhdCI6MTc3NTE4NTA5MywiZXhwIjoxNzc1Nzg5ODkzfQ.mgkWJwAH1auTMNHTHzLKbma0pG6OYjtDCrQaYGtQpyI",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9871.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzEuanBlZyIsImlhdCI6MTc3NTE4NTA5OCwiZXhwIjoxNzc1Nzg5ODk4fQ.iHW4nXh44L7EOAg1ELNK7dXzKIU4KLjZnaCtH46ovoI"
]

# ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

def download_image(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def bytes_to_pil(img_bytes):
    return Image.open(io.BytesIO(img_bytes)).convert('RGB')

def pil_to_bytes(img, fmt='JPEG'):
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()

def save_local(img_bytes, filename):
    os.makedirs('results/stitch_tests', exist_ok=True)
    path = f'results/stitch_tests/{filename}'
    with open(path, 'wb') as f:
        f.write(img_bytes)
    print(f"  Saved: {path}")
    return path

def marble_upload(image_bytes, filename):
    body = json.dumps({
        "file_name": filename,
        "mime_type": "image/jpeg",
        "kind": "image"
    }).encode()
    req = urllib.request.Request(
        'https://api.worldlabs.ai/marble/v1/media-assets:prepare_upload',
        data=body, method='POST',
        headers={'WLT-Api-Key': MARBLE_API_KEY, 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as r:
        resp = json.loads(r.read())
    upload_url = resp['upload_info']['upload_url']
    media_asset_id = resp['media_asset']['media_asset_id']
    required_headers = resp['upload_info'].get('required_headers', {})
    headers = {'Content-Type': 'image/jpeg'}
    headers.update(required_headers)
    req2 = urllib.request.Request(upload_url, data=image_bytes, method='PUT', headers=headers)
    with urllib.request.urlopen(req2) as r:
        pass
    print(f"  Marble asset uploaded: {media_asset_id}")
    return media_asset_id

def marble_generate(display_name, media_asset_id, is_pano=False, text_prompt=""):
    image_prompt = {"source": "media_asset", "media_asset_id": media_asset_id}
    world_prompt = {
        "type": "image",
        "image_prompt": image_prompt,
        "text_prompt": text_prompt or "Interior bedroom, consistent wall color and texture throughout, natural lighting"
    }
    if is_pano:
        world_prompt["is_pano"] = True
    body = json.dumps({
        "model": "Marble 0.1-plus",
        "display_name": display_name,
        "world_prompt": world_prompt,
        "permission": {"public": False}
    }).encode()
    req = urllib.request.Request(
        'https://api.worldlabs.ai/marble/v1/worlds:generate',
        data=body, method='POST',
        headers={'WLT-Api-Key': MARBLE_API_KEY, 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        print(f"  marble_generate HTTP {e.code}: {err_body}")
        raise
    # API returns an async operation
    if 'operation_id' in resp:
        operation_id = resp['operation_id']
        print(f"  Marble operation submitted: {operation_id}")
        return operation_id, 'operation'
    elif 'name' in resp:
        world_id = resp['name'].split('/')[-1]
        print(f"  Marble world submitted: {world_id}")
        return world_id, 'world'
    else:
        raise ValueError(f"Unexpected marble_generate response: {resp}")

def marble_resolve_world_id(operation_id_or_world_id, kind, timeout=60):
    """If kind=='operation', extract world_id from metadata (available immediately). If 'world', return as-is."""
    if kind == 'world':
        return operation_id_or_world_id
    operation_id = operation_id_or_world_id
    start = time.time()
    while time.time() - start < timeout:
        req = urllib.request.Request(
            f'https://api.worldlabs.ai/marble/v1/operations/{operation_id}',
            headers={'WLT-Api-Key': MARBLE_API_KEY}
        )
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
        # world_id available in metadata immediately after job creation
        metadata = resp.get('metadata') or {}
        if metadata.get('world_id'):
            world_id = metadata['world_id']
            print(f"  Got world_id from operation metadata: {world_id}")
            return world_id
        # Fallback: check done response
        if resp.get('done'):
            if resp.get('error'):
                raise RuntimeError(f"Operation failed: {resp['error']}")
            response = resp.get('response') or {}
            for key in ('world_id', 'id'):
                if key in response:
                    return response[key]
            if 'name' in response:
                return response['name'].split('/')[-1]
            raise ValueError(f"Cannot find world_id in operation: {resp}")
        elapsed = int(time.time() - start)
        print(f"  Operation {elapsed}s — waiting for world_id in metadata...")
        time.sleep(5)
    raise TimeoutError(f"Operation {operation_id} timed out after {timeout}s")


def marble_poll(world_id, label, results_dict, timeout=900):
    print(f"  [{label}] Polling...")
    start = time.time()
    while time.time() - start < timeout:
        req = urllib.request.Request(
            f'https://api.worldlabs.ai/marble/v1/worlds/{world_id}',
            headers={'WLT-Api-Key': MARBLE_API_KEY}
        )
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
        state = resp.get('state', '')
        elapsed = int(time.time() - start)
        print(f"  [{label}] {elapsed}s — {state}")
        splats = (resp.get('assets') or {}).get('splats', {})
        if splats or state == 'COMPLETE':
            spz_urls = splats.get('spz_urls', {})
            results_dict[label] = {
                'world_url': f"https://marble.worldlabs.ai/world/{world_id}",
                'spz_full': spz_urls.get('full_res', ''),
                'spz_500k': spz_urls.get('500k', ''),
                'complete': True
            }
            print(f"  [{label}] COMPLETE ✅")
            print(f"  [{label}] World: {results_dict[label]['world_url']}")
            return
        if state in ['FAILED', 'ERROR']:
            results_dict[label] = {'error': f"Marble failed: {state}", 'complete': False}
            return
        time.sleep(15)
    results_dict[label] = {'error': 'Timeout', 'complete': False}


# ─── TEST 1: iPhone Panoramic → Marble with is_pano:true ─────────────────────

print("\n" + "="*60)
print("TEST 1: iPhone Pano → Marble (is_pano: true)")
print("="*60)

print("  Downloading panorama...")
pano_bytes = download_image(PANO_URL)
pano_img = bytes_to_pil(pano_bytes)
print(f"  Original pano size: {pano_img.size}")

w, h = pano_img.size
aspect = w / h
print(f"  Aspect ratio: {aspect:.2f} (2.0 = equirectangular, >2.0 = cylindrical)")

if aspect > 2.5:
    print("  iPhone cylindrical pano detected — padding top/bottom to make 2:1 equirectangular...")
    # Resize width to 4096, then pad height to 2048 (2:1 equirectangular)
    target_w = 4096
    scale = target_w / pano_img.size[0]
    scaled_h = int(pano_img.size[1] * scale)
    pano_resized = pano_img.resize((target_w, scaled_h), Image.LANCZOS)
    target_h = target_w // 2  # 2048
    pad_top = (target_h - scaled_h) // 2
    pad_bottom = target_h - scaled_h - pad_top
    equirect_img = Image.new('RGB', (target_w, target_h), (0, 0, 0))
    equirect_img.paste(pano_resized, (0, max(0, pad_top)))
    print(f"  Equirectangular size: {equirect_img.size} (padded from {pano_resized.size})")
    pano_final_bytes = pil_to_bytes(equirect_img)
else:
    print("  Aspect ratio close to 2:1, using as-is")
    target_w = h * 2
    if w != target_w:
        pano_img = pano_img.resize((target_w, h), Image.LANCZOS)
    pano_final_bytes = pil_to_bytes(pano_img)

save_local(pano_final_bytes, 'test1_equirect_pano.jpg')
print(f"  Final pano size: {Image.open(io.BytesIO(pano_final_bytes)).size}")

asset_1 = marble_upload(pano_final_bytes, 'test1_pano.jpg')
op_id_1, kind_1 = marble_generate(
    "Test 1 — iPhone Pano is_pano:true",
    asset_1,
    is_pano=True,
    text_prompt="Interior bedroom with wood paneled walls and ceiling, multiple beds, large window with blinds, natural warm lighting throughout"
)
world_id_1 = marble_resolve_world_id(op_id_1, kind_1)
print(f"  Test 1 world_id → {world_id_1}")


# ─── TEST 2: 4 Wall Midpoint Photos → OpenCV Stitch → Marble ─────────────────

print("\n" + "="*60)
print("TEST 2: 4 Wall Midpoint Photos → OpenCV Stitch → Marble")
print("="*60)

print("  Downloading 4 midpoint photos...")
midpoint_images = []
for i, url in enumerate(MIDPOINT_4):
    img_bytes = download_image(url)
    img = bytes_to_pil(img_bytes)
    img = img.resize((1920, int(1920 * img.size[1] / img.size[0])), Image.LANCZOS)
    midpoint_images.append(np.array(img))
    print(f"  Downloaded midpoint photo {i+1}: {img.size}")

print("  Running OpenCV stitcher on 4 midpoint photos...")
stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
imgs_bgr = [cv2.cvtColor(img, cv2.COLOR_RGB2BGR) for img in midpoint_images]

status, stitched = stitcher.stitch(imgs_bgr)

if status == cv2.Stitcher_OK:
    stitched_rgb = cv2.cvtColor(stitched, cv2.COLOR_BGR2RGB)
    stitched_pil = Image.fromarray(stitched_rgb)
    print(f"  Stitch SUCCESS: {stitched_pil.size}")
    stitched_bytes = pil_to_bytes(stitched_pil)
    save_local(stitched_bytes, 'test2_stitched_4midpoint.jpg')

    asset_2 = marble_upload(stitched_bytes, 'test2_stitched.jpg')
    op_id_2, kind_2 = marble_generate(
        "Test 2 — 4 Midpoint Stitch → Marble",
        asset_2,
        is_pano=False,
        text_prompt="Interior bedroom with wood paneled walls and ceiling, multiple beds, large window with blinds, natural warm lighting throughout"
    )
    world_id_2 = marble_resolve_world_id(op_id_2, kind_2)
    print(f"  Test 2 world_id → {world_id_2}")
    test2_success = True
else:
    status_msgs = {
        cv2.Stitcher_ERR_NEED_MORE_IMGS: "NEED_MORE_IMGS",
        cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "HOMOGRAPHY_EST_FAIL",
        cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "CAMERA_PARAMS_ADJUST_FAIL"
    }
    print(f"  Stitch FAILED: {status_msgs.get(status, f'Error {status}')}")
    print("  Skipping Test 2 Marble submission")
    world_id_2 = None
    test2_success = False


# ─── TEST 3: 8 Center Photos 45° → OpenCV Stitch → Marble ───────────────────

print("\n" + "="*60)
print("TEST 3: 8 Center Photos 45° → OpenCV Stitch → Marble")
print("="*60)

print("  Downloading 8 center photos...")
center_images = []
for i, url in enumerate(CENTER_8):
    img_bytes = download_image(url)
    img = bytes_to_pil(img_bytes)
    img = img.resize((1920, int(1920 * img.size[1] / img.size[0])), Image.LANCZOS)
    center_images.append(np.array(img))
    print(f"  Downloaded center photo {i+1}: {img.size}")

print("  Running OpenCV stitcher on 8 center photos...")
stitcher3 = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
imgs_bgr3 = [cv2.cvtColor(img, cv2.COLOR_RGB2BGR) for img in center_images]

status3, stitched3 = stitcher3.stitch(imgs_bgr3)

if status3 == cv2.Stitcher_OK:
    stitched3_rgb = cv2.cvtColor(stitched3, cv2.COLOR_BGR2RGB)
    stitched3_pil = Image.fromarray(stitched3_rgb)
    print(f"  Stitch SUCCESS: {stitched3_pil.size}")
    stitched3_bytes = pil_to_bytes(stitched3_pil)
    save_local(stitched3_bytes, 'test3_stitched_8center.jpg')

    w3, h3 = stitched3_pil.size
    aspect3 = w3 / h3
    use_pano3 = aspect3 > 1.8
    print(f"  Stitched aspect ratio: {aspect3:.2f} → is_pano: {use_pano3}")

    asset_3 = marble_upload(stitched3_bytes, 'test3_stitched.jpg')
    op_id_3, kind_3 = marble_generate(
        "Test 3 — 8 Center 45° Stitch → Marble",
        asset_3,
        is_pano=use_pano3,
        text_prompt="Interior bedroom with wood paneled walls and ceiling, multiple beds, large window with blinds, natural warm lighting throughout"
    )
    world_id_3 = marble_resolve_world_id(op_id_3, kind_3)
    print(f"  Test 3 world_id → {world_id_3}")
    test3_success = True
else:
    status_msgs = {
        cv2.Stitcher_ERR_NEED_MORE_IMGS: "NEED_MORE_IMGS",
        cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "HOMOGRAPHY_EST_FAIL",
        cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "CAMERA_PARAMS_ADJUST_FAIL"
    }
    print(f"  Stitch FAILED: {status_msgs.get(status3, f'Error {status3}')}")
    print("  Skipping Test 3 Marble submission")
    world_id_3 = None
    test3_success = False


# ─── POLL ALL IN PARALLEL ────────────────────────────────────────────────────

print("\n" + "="*60)
print("POLLING ALL MARBLE WORLDS IN PARALLEL")
print("="*60)

results = {}
threads = []

t1 = threading.Thread(target=marble_poll, args=(world_id_1, 'test1_pano', results))
threads.append(t1)

if test2_success and world_id_2:
    t2 = threading.Thread(target=marble_poll, args=(world_id_2, 'test2_4midpoint', results))
    threads.append(t2)

if test3_success and world_id_3:
    t3 = threading.Thread(target=marble_poll, args=(world_id_3, 'test3_8center', results))
    threads.append(t3)

for t in threads:
    t.start()
for t in threads:
    t.join()

os.makedirs('results/stitch_tests', exist_ok=True)
with open('results/stitch_tests/results.json', 'w') as f:
    json.dump(results, f, indent=2)

print("\n" + "="*60)
print("ALL TESTS COMPLETE — OPEN THESE URLS AND COMPARE")
print("="*60)
for label, data in results.items():
    if data.get('complete'):
        print(f"\n{label}:")
        print(f"  World URL: {data['world_url']}")
        print(f"  SPZ full:  {data.get('spz_full', 'N/A')}")
    else:
        print(f"\n{label}: FAILED — {data.get('error', 'unknown')}")

print("\nAlso check local stitched images:")
print("  results/stitch_tests/test1_equirect_pano.jpg")
print("  results/stitch_tests/test2_stitched_4midpoint.jpg (if stitch succeeded)")
print("  results/stitch_tests/test3_stitched_8center.jpg (if stitch succeeded)")
