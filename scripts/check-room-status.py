"""Check room redesign status in Supabase."""
import os

os.environ.setdefault("SUPABASE_URL", "https://xdeacbmkdwqrwxonqaqh.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_cJ8WZF5uvgwcKnJlZqqOEA_pkQnKsV3")

try:
    from supabase import create_client
except ImportError:
    os.system("pip3 install supabase -q --break-system-packages")
    from supabase import create_client

ROOM_ID = "7ddfb921-21e8-4db4-9f29-ffba526fd981"

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

room = client.table("rooms").select(
    "id, redesign_status, redesign_pano_url, generation_seed, redesign_error, "
    "render_context, flux_prompt, negative_prompt, "
    "professionalized_image_url, original_photo_url, original_image_url"
).eq("id", ROOM_ID).single().execute().data

print(f"Room: {room['id']}")
print(f"Status: {room['redesign_status']}")
print(f"Error: {(room.get('redesign_error') or 'null')[:200]}")
print(f"Pano URL: {(room.get('redesign_pano_url') or 'null')[:80]}")
print(f"Generation seed: {room.get('generation_seed')}")
print(f"Negative prompt: {(room.get('negative_prompt') or 'null')[:60]}")
print(f"Flux prompt words: {len((room.get('flux_prompt') or '').split())}")
print()
print("Image URLs:")
print(f"  professionalized_image_url: {(room.get('professionalized_image_url') or 'null')[:100]}")
print(f"  original_photo_url:         {(room.get('original_photo_url') or 'null')[:100]}")
print(f"  original_image_url:         {(room.get('original_image_url') or 'null')[:100]}")

rc = room.get("render_context") or {}
print(f"\nRender context keys: {list(rc.keys()) if isinstance(rc, dict) else type(rc)}")
if isinstance(rc, dict):
    print(f"  lora_scale_used: {rc.get('lora_scale_used')}")
    print(f"  lora_url_used:   {(rc.get('lora_url_used') or 'null')[:60]}")
    print(f"  depth_map_url:   {(rc.get('depth_map_url') or 'null')[:80]}")
    print(f"  edge_map_url:    {(rc.get('edge_map_url') or 'null')[:80]}")
