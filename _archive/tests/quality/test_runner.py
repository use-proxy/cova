"""
Cova Pipeline Quality Test Runner

Runs a list of room images through the current pipeline and saves outputs to
Supabase Storage for manual quality review.

Usage:
    modal run tests/quality/test_runner.py --image-urls "url1,url2,url3"

Outputs are stored under room-videos/tests/quality/outputs/ and the signed
URLs are printed at the end for manual review.
"""

import os
import time
import uuid
import modal

app = modal.App(
    "cova-quality-test-runner",
    image=modal.Image.debian_slim(python_version="3.10").pip_install(
        "supabase", "requests"
    ),
)


@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("cova-secrets"),
    ],
)
def run_quality_test(image_urls: list[str]) -> list[dict]:
    """
    Runs each image URL through the current pipeline and returns output URLs.

    Args:
        image_urls: List of publicly accessible input image URLs

    Returns:
        List of dicts with keys: input_url, output_url, room_id, duration_s
    """
    from supabase import create_client
    import requests

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    client = create_client(supabase_url, supabase_key)
    results = []

    for input_url in image_urls:
        room_id = str(uuid.uuid4())
        start = time.time()

        print(f"\n[test] Running room {room_id}")
        print(f"[test] Input: {input_url}")

        try:
            # Create a test rooms row
            client.table("rooms").insert({
                "id": room_id,
                "user_id": "00000000-0000-0000-0000-000000000000",  # test user
                "original_photo_url": input_url,
                "room_type": "living_room",
                "style_blend": {"warm japandi": 0.6, "pure minimal white": 0.4},
                "redesign_status": "pending",
            }).execute()

            # Trigger the pipeline by calling redesign_room
            # Note: generate_with_flux raises NotImplementedError until Session 5
            # This test will surface once the fal.ai implementation is wired in.
            try:
                from modal_pipeline.redesign_pipeline import redesign_room
                output = redesign_room.remote(
                    room_id=room_id,
                    user_id="00000000-0000-0000-0000-000000000000",
                )
                output_url = output.get("redesigned_pano_url") or output.get("render_url")
            except NotImplementedError as e:
                print(f"[test] Pipeline stub not yet implemented: {e}")
                output_url = None

            duration = round(time.time() - start, 1)

            if output_url:
                # Store result reference in Supabase
                client.table("rooms").update({
                    "redesign_pano_url": output_url,
                    "redesign_status": "complete",
                }).eq("id", room_id).execute()

                print(f"[test] Output: {output_url}")
                print(f"[test] Duration: {duration}s")
            else:
                print(f"[test] No output URL (pipeline stub — implement in Session 5)")

            results.append({
                "input_url": input_url,
                "output_url": output_url,
                "room_id": room_id,
                "duration_s": duration,
            })

        except Exception as e:
            duration = round(time.time() - start, 1)
            print(f"[test] ERROR for {input_url}: {e}")
            results.append({
                "input_url": input_url,
                "output_url": None,
                "room_id": room_id,
                "duration_s": duration,
                "error": str(e),
            })

    print("\n[test] === RESULTS ===")
    for r in results:
        status = "OK" if r.get("output_url") else "STUB/FAIL"
        print(f"[{status}] {r['input_url'][:60]}... → {r.get('output_url', 'N/A')}")

    return results


@app.local_entrypoint()
def main(image_urls: str = ""):
    """
    modal run tests/quality/test_runner.py --image-urls "url1,url2"
    """
    if not image_urls:
        print("Usage: modal run tests/quality/test_runner.py --image-urls 'url1,url2'")
        return

    urls = [u.strip() for u in image_urls.split(",") if u.strip()]
    print(f"[test] Running quality test on {len(urls)} images...")

    results = run_quality_test.remote(urls)

    print("\n[test] === FINAL OUTPUT URLS ===")
    for r in results:
        if r.get("output_url"):
            print(f"  {r['output_url']}")
        else:
            print(f"  (no output — {r.get('error', 'pipeline stub')})")
