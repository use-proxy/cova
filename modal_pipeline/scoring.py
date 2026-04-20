"""
Cova — 3-Model Ensemble Quality Scorer (Cached)

Scores render candidates using weighted ensemble of up to 3 models:
  1. HPSv2 (weight 0.5) — human preference prediction, Spearman 0.94
     License: MIT (xswu/HPSv2). NOT v3 which is CC BY-NC-SA non-commercial.
  2. Q-Align (weight 0.3) — technical quality assessment (artifacts, blur, noise)
     Model: q-future/one-align (LLaVA-based, ~7B params, needs ~14GB VRAM)
  3. Aesthetic Predictor V2.5 (weight 0.2) — fast SigLIP-based aesthetic scalar
     Model: discus0434/aesthetic-predictor-v2-5

Models are loaded ONCE per container lifetime using module-level globals.
After warm start, scoring 4 candidates takes <30s total vs 120s+ with cold loading.

Auto-reject gate: overall < 5.0 triggers regeneration in the caller.

All scores normalized to 0-10 scale for ensemble combination.
"""

import io
import logging
import tempfile

log = logging.getLogger("cova.scoring")

# ---------------------------------------------------------------------------
# Module-level model caches — loaded lazily on first call, reused thereafter
# ---------------------------------------------------------------------------

_hps_loaded = False
_clip_model = None
_clip_preprocess = None
_aesthetic_mlp = None
_q_align_model = None
_q_align_tokenizer = None


def _ensure_hps():
    """HPSv2 loads its own models internally — just ensure the library is imported."""
    global _hps_loaded
    if not _hps_loaded:
        import hpsv2  # noqa: F401 — warms the module-level cache in hpsv2
        _hps_loaded = True
        log.info("[scoring] HPSv2 library loaded")


def _ensure_clip_aesthetic():
    """Load CLIP ViT-L/14 + Aesthetic MLP once."""
    global _clip_model, _clip_preprocess, _aesthetic_mlp
    if _clip_model is not None:
        return

    import torch
    import clip
    import os
    import urllib.request

    device = "cuda" if torch.cuda.is_available() else "cpu"
    _clip_model, _clip_preprocess = clip.load("ViT-L/14", device=device)

    # Download aesthetic predictor weights if needed
    weights_path = "/tmp/sac+logos+ava1-l14-linearMSE.pth"
    if not os.path.exists(weights_path):
        urllib.request.urlretrieve(
            "https://github.com/christophschuhmann/improved-aesthetic-predictor/raw/main/sac+logos+ava1-l14-linearMSE.pth",
            weights_path,
        )

    state_dict = torch.load(weights_path, map_location=device)
    cleaned = {k.replace("layers.", ""): v for k, v in state_dict.items()}

    _aesthetic_mlp = torch.nn.Sequential(
        torch.nn.Linear(768, 1024),
        torch.nn.Dropout(0.2),
        torch.nn.Linear(1024, 128),
        torch.nn.Dropout(0.2),
        torch.nn.Linear(128, 64),
        torch.nn.Dropout(0.1),
        torch.nn.Linear(64, 16),
        torch.nn.Linear(16, 1),
    ).to(device)
    _aesthetic_mlp.load_state_dict(cleaned)
    _aesthetic_mlp.eval()
    log.info("[scoring] CLIP ViT-L/14 + Aesthetic MLP loaded")


def _ensure_q_align():
    """Load Q-Align model once. May fail on low-VRAM GPUs — that's expected."""
    global _q_align_model, _q_align_tokenizer
    if _q_align_model is not None:
        return

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model_name = "q-future/one-align"
    _q_align_tokenizer = AutoTokenizer.from_pretrained(
        model_name, trust_remote_code=True
    )
    _q_align_model = AutoModelForCausalLM.from_pretrained(
        model_name,
        trust_remote_code=True,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    log.info("[scoring] Q-Align model loaded")


# ---------------------------------------------------------------------------
# Model 1: HPSv2 (Human Preference Score v2.1)
# ---------------------------------------------------------------------------

def compute_hps_v2(image_path: str, prompt: str) -> float:
    """
    Compute HPSv2.1 score for an image+prompt pair.
    Returns normalized 0-10 scale: raw_score * 30.
    """
    _ensure_hps()
    import hpsv2

    effective_prompt = prompt if prompt else "interior design photograph"
    scores = hpsv2.score(image_path, effective_prompt, hps_version="v2.1")

    if isinstance(scores, (list, tuple)) and len(scores) > 0:
        raw = float(scores[0])
    elif isinstance(scores, (int, float)):
        raw = float(scores)
    else:
        raise ValueError(f"Unexpected HPSv2 return type: {type(scores)}")

    normalized = max(0.0, min(10.0, raw * 30.0))
    log.info(f"HPSv2: raw={raw:.4f} normalized={normalized:.2f}")
    return normalized


# ---------------------------------------------------------------------------
# Model 2: Q-Align (Technical Quality Assessment)
# ---------------------------------------------------------------------------

def compute_q_align(image_path: str) -> float:
    """
    Compute Q-Align quality score using the one-align model.
    Returns normalized 0-10 scale: (mos - 1) / 4 * 10.
    Uses cached model — no cold-load after first call.
    """
    _ensure_q_align()
    from PIL import Image

    img = Image.open(image_path).convert("RGB")
    mos = _q_align_model.score(
        [img],
        task_="quality",
        input_="image",
    )

    if isinstance(mos, (list, tuple)):
        mos_val = float(mos[0])
    else:
        mos_val = float(mos)

    normalized = max(0.0, min(10.0, (mos_val - 1.0) / 4.0 * 10.0))
    log.info(f"Q-Align: mos={mos_val:.2f} normalized={normalized:.2f}")
    return normalized


# ---------------------------------------------------------------------------
# Model 3: Aesthetic Predictor V2.5 (SigLIP + MLP)
# ---------------------------------------------------------------------------

def compute_aesthetic_v25(image_path: str) -> float:
    """
    Compute aesthetic score using LAION Aesthetic Predictor with CLIP ViT-L/14.
    Uses cached CLIP model + MLP — no cold-load after first call.
    Returns score on 0-10 scale.
    """
    _ensure_clip_aesthetic()
    import torch
    from PIL import Image

    device = "cuda" if torch.cuda.is_available() else "cpu"
    img = Image.open(image_path).convert("RGB")
    img_tensor = _clip_preprocess(img).unsqueeze(0).to(device)

    with torch.no_grad():
        image_features = _clip_model.encode_image(img_tensor)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        score = float(_aesthetic_mlp(image_features.float()).squeeze().cpu())

    score = max(0.0, min(10.0, score))
    log.info(f"Aesthetic V2.5: score={score:.2f}")
    return score


# ---------------------------------------------------------------------------
# Ensemble scorer
# ---------------------------------------------------------------------------

WEIGHTS = {"hps": 0.5, "q_align": 0.3, "aesthetic": 0.2}
REJECT_THRESHOLD = 5.0


def score_render(image_url: str, prompt: str) -> dict:
    """
    Scores a render using weighted ensemble of 3 models.

    Downloads the image once, saves to temp file, runs all 3 models.
    Each model is independently try/excepted — if one fails, the ensemble
    reweights using only available models.

    Models are cached after first load — subsequent calls are fast.
    """
    import requests
    from PIL import Image

    # Download image once, save to temp file
    response = requests.get(image_url, timeout=60)
    response.raise_for_status()
    img_bytes = response.content

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp_path = None
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        tmp_path = tmp.name
        img.save(tmp, format="PNG")
        tmp.close()

        scores = {}

        # Model 1: HPSv2
        try:
            scores["hps"] = compute_hps_v2(tmp_path, prompt)
        except Exception as e:
            log.warning(f"HPSv2 failed: {e}. Skipping.")
            scores["hps"] = None

        # Model 2: Q-Align (may OOM on A10G — that's expected)
        try:
            scores["q_align"] = compute_q_align(tmp_path)
        except Exception as e:
            log.warning(f"Q-Align failed: {e}. Skipping.")
            scores["q_align"] = None

        # Model 3: Aesthetic Predictor V2.5
        try:
            scores["aesthetic"] = compute_aesthetic_v25(tmp_path)
        except Exception as e:
            log.warning(f"Aesthetic V2.5 failed: {e}. Skipping.")
            scores["aesthetic"] = None

        # Weighted ensemble — use available models only
        available = {k: v for k, v in scores.items() if v is not None}

        if not available:
            log.warning("All scoring models failed — returning neutral 5.0")
            return {
                "overall": 5.0,
                "reject": False,
                **scores,
            }

        total_weight = sum(WEIGHTS[k] for k in available)
        overall = sum(available[k] * WEIGHTS[k] / total_weight for k in available)

        scores["overall"] = round(overall, 3)
        scores["reject"] = overall < REJECT_THRESHOLD

        models_used = list(available.keys())
        log.info(
            f"Ensemble: overall={overall:.2f} reject={scores['reject']} "
            f"models={models_used} "
            f"hps={scores.get('hps', 'N/A')} "
            f"q_align={scores.get('q_align', 'N/A')} "
            f"aesthetic={scores.get('aesthetic', 'N/A')}"
        )

        return scores

    finally:
        import os
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
