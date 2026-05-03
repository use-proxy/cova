"""
Cova — CLIP Text Embedding Endpoint on Modal

Runs the text encoder of openai/clip-vit-large-patch14 — the same model used
to embed product images in embed_catalog_gpu.py.  This ensures text query
embeddings live in the same vector space as the stored image embeddings,
enabling accurate cosine-similarity search.

Deploy:
    modal deploy modal_pipeline/clip_text_embed.py

Usage:
    POST https://<modal-url>/embed_text
    Body: {"text": "japandi sofa"}
    Response: {"embedding": [0.01, ...], "dim": 768}
"""

import modal

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "numpy<2",
        "torch==2.2.0",
        "transformers==4.38.0",
        "fastapi[standard]",
    )
)

volume = modal.Volume.from_name("clip-text-model-cache", create_if_missing=True)

app = modal.App("cova-clip-text-embed", image=image)


@app.cls(
    gpu="T4",
    timeout=60,
    volumes={"/model_cache": volume},
    scaledown_window=300,
)
@modal.concurrent(max_inputs=8)
class CLIPTextEmbedder:
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import CLIPModel, CLIPTokenizer

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[CLIP-text] Loading openai/clip-vit-large-patch14 on {self.device}...")

        self.model = CLIPModel.from_pretrained(
            "openai/clip-vit-large-patch14",
            cache_dir="/model_cache",
        ).to(self.device)
        self.model.eval()

        self.tokenizer = CLIPTokenizer.from_pretrained(
            "openai/clip-vit-large-patch14",
            cache_dir="/model_cache",
        )
        volume.commit()
        print("[CLIP-text] Model loaded!")

    @modal.fastapi_endpoint(method="POST")
    def embed_text(self, item: dict) -> dict:
        import torch

        text = item.get("text", "")
        if not text:
            return {"error": "missing text field", "embedding": None, "dim": 0}

        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=77,
        ).to(self.device)

        with torch.no_grad():
            feat = self.model.get_text_features(**inputs)

        # L2-normalize — matches embed_catalog_gpu.py line 114
        normalized = (feat[0] / feat[0].norm()).cpu().tolist()

        return {"embedding": normalized, "dim": len(normalized)}
