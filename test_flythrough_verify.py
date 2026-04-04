"""Quick flythrough verification: 8 photos -> Mini -> depth-video -> verify MP4 URL."""
import os, json, time, uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SB_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
SB_KEY = "sb_secret_cJ8WZF5uvgwcKnJlZqqOEA_pkQnKsV3"
MULTI_IMAGE = "https://cova-interior--cova-marble-multi-image-marble-multi-imag-8e33ed.modal.run"
DEPTH_VIDEO = "https://cova-interior--cova-depth-video-depth-video-webhook.modal.run"
USER_ID = "863c7799-accd-42e6-bac2-d4697b111542"

PHOTOS = [
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9864.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjQuanBlZyIsImlhdCI6MTc3NTA5MjU0OCwiZXhwIjoxNzc1Njk3MzQ4fQ.U9ZaG_T8A0Lel6hvji7hjK1XbA7fYPBZzF9XDwIggug",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9865.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjUuanBlZyIsImlhdCI6MTc3NTA5MjU1MywiZXhwIjoxNzc1Njk3MzUzfQ.9oLEzwm86Phn4Sbak_Gx58M4SkZag2CyGUlC_6rK_6c",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9866.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjYuanBlZyIsImlhdCI6MTc3NTA5MjU1OCwiZXhwIjoxNzc1Njk3MzU4fQ.78pu7tu-f_0yx8Fh0s7mSKRh-EE4XKtZwJ0H22yWnFQ",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9867.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjcuanBlZyIsImlhdCI6MTc3NTA5MjU2MywiZXhwIjoxNzc1Njk3MzYzfQ.6THWsEfixPQLTX5D2Bt-2Fi5gYI0lJsO2-ZGMWE2WUc",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9868.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjguanBlZyIsImlhdCI6MTc3NTA5MjU3MCwiZXhwIjoxNzc1Njk3MzcwfQ.-fzLLvlIbOfwL_Vu_qI8fJKHlAtY2H74zem_mcRuPHY",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9869.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjkuanBlZyIsImlhdCI6MTc3NTA5MjU3NywiZXhwIjoxNzc1Njk3Mzc3fQ.zRNmIdJlLxsoI2iZ9Lxe74m0MwaC39E_gmRcDfkPKIc",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9870.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzAuanBlZyIsImlhdCI6MTc3NTA5MjU4MSwiZXhwIjoxNzc1Njk3MzgxfQ.84C_gZCtl0znaD5eOznpKqFOxPHXjhZMfqEhrPN_hHs",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9871.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzEuanBlZyIsImlhdCI6MTc3NTA5MjU4OCwiZXhwIjoxNzc1Njk3Mzg4fQ.MoZii0vQ-iGosDkkCMlP96xG0nM2SIzmdMMmsXTBeDg",
]

H = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}

def sb(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    h = dict(H)
    if method == "POST": h["Prefer"] = "return=representation"
    req = Request(f"{SB_URL}/rest/v1/{path}", data=data, headers=h, method=method)
    with urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else None

def webhook(url, body):
    req = Request(url, json.dumps(body).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=600) as r: return json.loads(r.read())

def get_room(rid, fields):
    return sb("GET", f"rooms?id=eq.{rid}&select={fields}")[0]

# 1. Create room
rid = str(uuid.uuid4())
print(f"Room: {rid}")
sb("POST", "rooms", {
    "id": rid, "user_id": USER_ID, "name": "Flythrough Verify",
    "room_type": "living_room", "status": "processing", "redesign_status": "queued",
    "capture_mode": "multi_image", "capture_photo_urls": PHOTOS, "pipeline_mode": "full",
    "style_blend": {"japandi": 0.7, "minimalist": 0.3, "coastal": 0, "bohemian": 0, "mid_century": 0},
    "budget": 2500, "dimensions_json": {"width": 16, "depth": 14, "height": 9, "unit": "ft"},
})

# 2. Multi-Image Mini
print(f"\n[{time.strftime('%H:%M:%S')}] Firing Multi-Image Mini (8 photos)...")
t0 = time.time()
r = webhook(MULTI_IMAGE, {"room_id": rid, "photo_urls": PHOTOS})
print(f"[{time.strftime('%H:%M:%S')}] Mini done in {time.time()-t0:.0f}s — {r.get('status')}")
if r.get("status") != "complete":
    print(f"  ERROR: {r.get('error','')[:200]}")
    exit(1)

# 3. Set redesign_pano_url = marble_pano_url (skip FLUX)
room = get_room(rid, "marble_pano_url,style_blend")
pano = room["marble_pano_url"]
print(f"  Pano: {pano[:80]}...")
sb("PATCH", f"rooms?id=eq.{rid}", {"redesign_pano_url": pano, "redesign_status": "kontext_complete"})

# 4. Depth Video
print(f"\n[{time.strftime('%H:%M:%S')}] Firing Depth Video...")
t1 = time.time()
r2 = webhook(DEPTH_VIDEO, {
    "room_id": rid, "pano_url": pano,
    "style_blend": room.get("style_blend", {}), "hotspot_azimuths": [],
})
print(f"[{time.strftime('%H:%M:%S')}] Depth done in {time.time()-t1:.0f}s — {r2.get('status')}")
if r2.get("status") != "complete":
    print(f"  ERROR: {r2.get('error','')[:200]}")
    exit(1)

# 5. Read flythrough_video_url from DB
room2 = get_room(rid, "flythrough_video_url,flythrough_ready,flythrough_duration_seconds,redesign_status")
url = room2.get("flythrough_video_url")
print(f"\n  redesign_status:          {room2['redesign_status']}")
print(f"  flythrough_ready:          {room2['flythrough_ready']}")
print(f"  flythrough_duration_seconds: {room2['flythrough_duration_seconds']}")
print(f"  flythrough_video_url:      {url}")

# 6. GET the video URL — verify it serves MP4
if url:
    print(f"\n[{time.strftime('%H:%M:%S')}] Verifying video URL...")
    try:
        vreq = Request(url, method="HEAD")
        with urlopen(vreq, timeout=15) as vr:
            print(f"  HTTP {vr.status}")
            print(f"  Content-Type: {vr.headers.get('Content-Type')}")
            cl = vr.headers.get('Content-Length')
            if cl: print(f"  Content-Length: {int(cl)/1e6:.1f}MB")
    except HTTPError as e:
        print(f"  HTTP {e.code} — {e.read().decode()[:200]}")
else:
    print("\n  ERROR: flythrough_video_url is None!")

# 7. Save
out = {"room_id": rid, "flythrough_video_url": url, "flythrough_ready": room2["flythrough_ready"],
       "redesign_status": room2["redesign_status"], "flythrough_duration_seconds": room2["flythrough_duration_seconds"]}
with open("test_flythrough_verify.json", "w") as f: json.dump(out, f, indent=2)
print(f"\nSaved to test_flythrough_verify.json")
