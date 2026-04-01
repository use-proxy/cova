"""
M6 CLIP Embedding — Runs CLIP on Modal GPU, one image at a time.
Run: modal run modal_pipeline/embed_catalog_gpu.py
Test: modal run modal_pipeline/embed_catalog_gpu.py --test
"""

import modal
import os
import time

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch==2.2.0",
        "transformers==4.38.0",
        "Pillow==10.2.0",
        "requests",
    )
)

app = modal.App("cova-clip-embedder-gpu", image=image)

BATCH_SIZE = 200  # Products per Modal call


def infer_styles(name: str, category: str) -> list[str]:
    name_lower = name.lower()
    styles = []
    if any(k in name_lower for k in ["coastal", "beach", "ocean", "nautical", "rattan", "wicker", "seagrass", "driftwood", "linen"]):
        styles.append("coastal")
    if any(k in name_lower for k in ["japandi", "japanese", "scandinavian", "oak", "walnut", "neutral", "zen", "bamboo"]):
        styles.append("japandi")
    if any(k in name_lower for k in ["bohemian", "boho", "eclectic", "macrame", "fringe", "tassel", "colorful", "vintage", "moroccan", "tribal", "kilim"]):
        styles.append("bohemian")
    if any(k in name_lower for k in ["minimalist", "modern", "clean", "simple", "sleek", "concrete", "steel", "lacquer"]):
        styles.append("minimalist")
    if any(k in name_lower for k in ["mid-century", "midcentury", "retro", "eames", "danish", "teak", "hairpin", "tulip"]):
        styles.append("mid_century")
    if not styles:
        styles = ["coastal", "japandi", "bohemian", "minimalist", "mid_century"]
    return styles


@app.cls(
    secrets=[modal.Secret.from_name("supabase-credentials")],
    gpu="A10G",
    timeout=3600,
    max_containers=5,
)
class CLIPEmbedder:
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import CLIPProcessor, CLIPModel

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[CLIP] Loading openai/clip-vit-large-patch14 on {self.device}...")
        self.model = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(self.device)
        # Use only the image processor — avoids text tokenizer padding issues
        full_processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
        self.image_processor = full_processor.image_processor
        self.model.eval()
        print("[CLIP] Model loaded!")

    @modal.method()
    def embed_batch(self, product_ids: list[str]) -> dict:
        import torch
        import requests
        from PIL import Image
        from io import BytesIO

        sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        headers = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}
        update_headers = {**headers, "Content-Type": "application/json", "Prefer": "return=minimal"}

        # Fetch products
        ids_str = ",".join(f'"{pid}"' for pid in product_ids)
        resp = requests.get(
            f"{sb_url}/rest/v1/products?select=id,name,image_url,category&id=in.({ids_str})",
            headers=headers, timeout=30,
        )
        products = resp.json() if resp.status_code == 200 else []
        print(f"[CLIP] Processing {len(products)} products...")

        embedded = 0
        failed = 0
        failures = []

        # Process ONE image at a time — no batching, no padding issues
        for idx, p in enumerate(products):
            try:
                # Step 1: Download image
                img_resp = requests.get(p["image_url"], timeout=15, headers={
                    "User-Agent": "Mozilla/5.0 (compatible; CovaCatalog/1.0)"
                })
                if img_resp.status_code != 200:
                    failed += 1
                    failures.append({"id": p["id"], "reason": f"HTTP {img_resp.status_code}"})
                    continue

                # Step 2: Open as PIL image
                img = Image.open(BytesIO(img_resp.content)).convert("RGB")

                # Step 3: Process single image through CLIP image processor (no text tokenizer)
                inputs = self.image_processor(images=img, return_tensors="pt").to(self.device)

                # Step 4: Get image features
                with torch.no_grad():
                    feat = self.model.get_image_features(**inputs)

                # Step 5: Normalize embedding
                embedding = (feat[0] / feat[0].norm()).cpu().tolist()

                # Step 6: Verify 768-dim
                if len(embedding) != 768:
                    failed += 1
                    failures.append({"id": p["id"], "reason": f"wrong dim: {len(embedding)}"})
                    continue

                # Step 7: Update Supabase
                styles = infer_styles(p["name"], p.get("category", ""))
                resp = requests.patch(
                    f"{sb_url}/rest/v1/products?id=eq.{p['id']}",
                    headers=update_headers,
                    json={"clip_embedding": embedding, "style_tags": styles},
                    timeout=15,
                )
                if resp.status_code in (200, 204):
                    embedded += 1
                else:
                    failed += 1
                    failures.append({"id": p["id"], "reason": f"DB update: {resp.status_code}"})

            except Exception as e:
                failed += 1
                failures.append({"id": p["id"], "reason": str(e)[:100]})

            # Log progress every 100 products
            if (idx + 1) % 100 == 0:
                print(f"[CLIP] Progress: {idx + 1}/{len(products)} (embedded={embedded}, failed={failed})")

        print(f"[CLIP] Batch done: {embedded} embedded, {failed} failed")
        return {"embedded": embedded, "failed": failed, "total": len(products), "failures": failures}


@app.local_entrypoint()
def main(test: bool = False):
    import urllib.request
    import json
    from pathlib import Path

    env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        if key and value:
            os.environ.setdefault(key.strip(), value.strip())

    sb_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    def sb_get(path):
        req = urllib.request.Request(
            f"{sb_url}/rest/v1/{path}",
            headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    # Fetch unembedded IDs
    all_ids = []
    offset = 0
    while True:
        batch = sb_get(f"products?select=id&clip_embedding=is.null&order=id&limit=1000&offset={offset}")
        if not batch:
            break
        all_ids.extend([p["id"] for p in batch])
        if len(batch) < 1000:
            break
        offset += 1000

    total = len(all_ids)
    print(f"[embed] {total} products need embedding")

    if total == 0:
        print("[embed] All products already embedded!")
        return

    if test:
        # Test mode: only process 5 products
        all_ids = all_ids[:5]
        total = 5
        print(f"[embed] TEST MODE — processing only {total} products")

    batches = [all_ids[i:i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    print(f"[embed] Running {len(batches)} batches of {BATCH_SIZE} on A10G GPU (max 5 containers)")

    embedder = CLIPEmbedder()
    start = time.time()
    results = list(embedder.embed_batch.map(batches, order_outputs=False))

    total_embedded = sum(r["embedded"] for r in results)
    total_failed = sum(r["failed"] for r in results)
    all_failures = []
    for r in results:
        all_failures.extend(r.get("failures", []))

    elapsed = time.time() - start
    print(f"[embed] COMPLETE — {total_embedded} embedded, {total_failed} failed out of {total}")
    print(f"[embed] Time: {elapsed:.0f}s ({elapsed/60:.1f}m)")

    # Save failures log
    if all_failures:
        failures_path = Path(__file__).parent / "catalog_data" / "embedding_failures.json"
        failures_path.parent.mkdir(parents=True, exist_ok=True)
        failures_path.write_text(json.dumps(all_failures, indent=2))
        print(f"[embed] Failures saved to {failures_path}")
