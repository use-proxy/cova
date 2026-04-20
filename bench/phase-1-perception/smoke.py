"""Phase 1 Task 1.6 — smoke test for cova-perception."""

import json
import os
import sys
import time
from pathlib import Path

import fal_client  # type: ignore
import requests

ENDPOINT = "https://cova-interior--cova-perception-perception-api.modal.run"
BENCH_USER_ID = os.getenv("BENCH_USER_ID", "863c7799-accd-42e6-bac2-d4697b111542")
ROOM = Path("bench/rooms/room-01_bedroom-cat-popcorn.webp")


def ensure_fal_key() -> None:
    if os.getenv("FAL_KEY"):
        return
    for cand in (Path("apps/web/.env.local"), Path(".env.local")):
        if cand.exists():
            for line in cand.read_text().splitlines():
                if line.startswith("FAL_KEY="):
                    os.environ["FAL_KEY"] = line.split("=", 1)[1].strip()
                    return


def main() -> int:
    ensure_fal_key()
    print(f"uploading {ROOM}...")
    url = fal_client.upload_file(str(ROOM))
    print(f"url={url}")

    def hit(path: str, body: dict, *, timeout: int = 180) -> tuple[int, dict, float]:
        t0 = time.perf_counter()
        r = requests.post(f"{ENDPOINT}{path}", json=body, timeout=timeout)
        dt = time.perf_counter() - t0
        try:
            j = r.json()
        except Exception:
            j = {"raw": r.text[:500]}
        return r.status_code, j, dt

    print("\n--- /v1/detect_preservation_spec ---")
    s, j, dt = hit(
        "/v1/detect_preservation_spec",
        {"image_url": url},
        timeout=300,
    )
    print(f"status={s} wall={dt:.1f}s")
    if s == 200:
        print(
            f"  image {j['image_width']}x{j['image_height']} "
            f"hash={j['image_hash'][:12]}  "
            f"detections={len(j['keep_class_detections'])}  "
            f"faces={len(j['face_in_frame_flags'])}  "
            f"wall_text={len(j['wall_text_flags'])}  "
            f"failures={len(j['partial_failures'])}  "
            f"latency_ms={j['latency_ms']}"
        )
        if j.get("partial_failures"):
            print("  partial failures sample:", j["partial_failures"][:3])
    else:
        print("  body:", json.dumps(j, indent=2)[:600])

    print("\n--- /v1/encode_sam2_for_cache ---")
    s, j, dt = hit(
        "/v1/encode_sam2_for_cache",
        {"image_url": url, "user_id": BENCH_USER_ID},
        timeout=180,
    )
    print(f"status={s} wall={dt:.1f}s")
    if s == 200:
        print(
            f"  shape={j['embedding_shape']}  "
            f"size_bytes={j['embedding_size_bytes']}  "
            f"row={j['supabase_row_id']}  "
            f"latency_ms={j['latency_ms']}"
        )
    else:
        print("  body:", json.dumps(j, indent=2)[:600])

    print("\n--- /v1/depth_anything_v2 ---")
    s, j, dt = hit("/v1/depth_anything_v2", {"image_url": url}, timeout=120)
    print(f"status={s} wall={dt:.1f}s")
    if s == 200:
        print(f"  depth_url={j['depth_url']}  latency_ms={j['latency_ms']}")
    else:
        print("  body:", json.dumps(j, indent=2)[:600])

    return 0


if __name__ == "__main__":
    sys.exit(main())
