"""
Cova — Fusion Embedding Generator (CLIP image + text → fused vector)
Generates fusion embeddings: 0.6 * image_embed + 0.4 * text_embed (L2-normalized)
Run: modal run modal_pipeline/embed_fusion_gpu.py
Test: modal run modal_pipeline/embed_fusion_gpu.py --test
Sample: modal run modal_pipeline/embed_fusion_gpu.py --sample 500
"""

import modal
import os
import time

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "numpy<2",
        "torch==2.2.0",
        "transformers==4.38.0",
        "Pillow==10.2.0",
        "requests",
    )
)

app = modal.App("cova-fusion-embedder", image=image)

BATCH_SIZE = 100
IMAGE_WEIGHT = 0.6
TEXT_WEIGHT = 0.4


@app.cls(
    secrets=[modal.Secret.from_name("supabase-credentials")],
    gpu="A10G",
    timeout=3600,
    max_containers=3,
)
class FusionEmbedder:
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import CLIPProcessor, CLIPModel, CLIPTokenizerFast

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[fusion] Loading openai/clip-vit-large-patch14 on {self.device}...")
        self.model = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(self.device)
        full_processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
        self.image_processor = full_processor.image_processor
        self.tokenizer = CLIPTokenizerFast.from_pretrained("openai/clip-vit-large-patch14")
        self.model.eval()
        print("[fusion] Model loaded!")

    @modal.method()
    def embed_batch(self, product_ids: list[str]) -> dict:
        import torch
        import numpy as np
        import requests
        from PIL import Image
        from io import BytesIO

        sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        headers = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}
        update_headers = {**headers, "Content-Type": "application/json", "Prefer": "return=minimal"}

        ids_str = ",".join(product_ids)
        resp = requests.get(
            f"{sb_url}/rest/v1/products?select=id,name,image_url,category,clip_embedding&id=in.({ids_str})",
            headers=headers, timeout=30,
        )
        products = resp.json() if resp.status_code == 200 else []
        print(f"[fusion] Processing {len(products)} products...")

        embedded = 0
        failed = 0
        failures = []

        for idx, p in enumerate(products):
            try:
                existing_image_embed = p.get("clip_embedding")

                # Get image embedding (use existing or compute fresh)
                if existing_image_embed and len(existing_image_embed) == 768:
                    image_embed = np.array(existing_image_embed, dtype=np.float32)
                    norm = np.linalg.norm(image_embed)
                    if norm > 0:
                        image_embed = image_embed / norm
                else:
                    img_resp = requests.get(p["image_url"], timeout=15, headers={
                        "User-Agent": "Mozilla/5.0 (compatible; CovaCatalog/1.0)"
                    })
                    if img_resp.status_code != 200:
                        failed += 1
                        failures.append({"id": p["id"], "reason": f"HTTP {img_resp.status_code}"})
                        continue
                    img = Image.open(BytesIO(img_resp.content)).convert("RGB")
                    inputs = self.image_processor(images=img, return_tensors="pt").to(self.device)
                    with torch.no_grad():
                        feat = self.model.get_image_features(**inputs)
                    image_embed = (feat[0] / feat[0].norm()).cpu().numpy()

                # Get text embedding from product name + category
                text = f"{p['name']} {p.get('category', '')}".strip()
                text_inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=77).to(self.device)
                with torch.no_grad():
                    text_feat = self.model.get_text_features(**text_inputs)
                text_embed = (text_feat[0] / text_feat[0].norm()).cpu().numpy()

                # Fuse: weighted combination, re-normalize
                fused = IMAGE_WEIGHT * image_embed + TEXT_WEIGHT * text_embed
                fused = fused / np.linalg.norm(fused)

                if len(fused) != 768:
                    failed += 1
                    failures.append({"id": p["id"], "reason": f"wrong dim: {len(fused)}"})
                    continue

                update_resp = requests.patch(
                    f"{sb_url}/rest/v1/products?id=eq.{p['id']}",
                    headers=update_headers,
                    json={"clip_fusion_embedding": fused.tolist()},
                    timeout=15,
                )
                if update_resp.status_code in (200, 204):
                    embedded += 1
                else:
                    failed += 1
                    failures.append({"id": p["id"], "reason": f"DB update: {update_resp.status_code}"})

            except Exception as e:
                failed += 1
                failures.append({"id": p["id"], "reason": str(e)[:200]})

            if (idx + 1) % 50 == 0:
                print(f"[fusion] Progress: {idx + 1}/{len(products)} (embedded={embedded}, failed={failed})")

        print(f"[fusion] Batch done: {embedded} embedded, {failed} failed")
        return {"embedded": embedded, "failed": failed, "total": len(products), "failures": failures}


@app.local_entrypoint()
def main(test: bool = False, sample: int = 0):
    import urllib.request
    import json
    from pathlib import Path

    env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
    if env_path.exists():
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

    # Fetch products that have image embeddings but no fusion embedding
    all_ids = []
    offset = 0
    while True:
        batch = sb_get(
            f"products?select=id&clip_embedding=not.is.null&clip_fusion_embedding=is.null"
            f"&order=id&limit=1000&offset={offset}"
        )
        if not batch:
            break
        all_ids.extend([p["id"] for p in batch])
        if len(batch) < 1000:
            break
        offset += 1000

    total = len(all_ids)
    print(f"[fusion] {total} products need fusion embedding")

    if total == 0:
        print("[fusion] All products already have fusion embeddings!")
        return

    if test:
        all_ids = all_ids[:5]
        total = 5
        print(f"[fusion] TEST MODE — processing {total} products")
    elif sample > 0:
        all_ids = all_ids[:sample]
        total = min(sample, len(all_ids))
        print(f"[fusion] SAMPLE MODE — processing {total} products")

    batches = [all_ids[i:i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    print(f"[fusion] Running {len(batches)} batches on A10G GPU")

    embedder = FusionEmbedder()
    start = time.time()
    results = list(embedder.embed_batch.map(batches, order_outputs=False))

    total_embedded = sum(r["embedded"] for r in results)
    total_failed = sum(r["failed"] for r in results)
    elapsed = time.time() - start

    print(f"[fusion] COMPLETE — {total_embedded} embedded, {total_failed} failed out of {total}")
    print(f"[fusion] Time: {elapsed:.0f}s ({elapsed/60:.1f}m)")
