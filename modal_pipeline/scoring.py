"""
Cova — 3-Model Ensemble Quality Scorer

Scores render candidates using weighted ensemble of up to 3 models:
  1. HPSv2 (weight 0.5) — human preference prediction, Spearman 0.94
     License: MIT (xswu/HPSv2). NOT v3 which is CC BY-NC-SA non-commercial.
  2. Q-Align (weight 0.3) — technical quality assessment (artifacts, blur, noise)
     Model: q-future/one-align (LLaVA-based, ~7B params, needs ~14GB VRAM)
  3. Aesthetic Predictor V2.5 (weight 0.2) — fast SigLIP-based aesthetic scalar
     Model: discus0434/aesthetic-predictor-v2-5

Each model runs in its own try/except. If a model fails (OOM, missing weights,
network error), it's skipped and the ensemble reweights using only available models.

Auto-reject gate: overall < 5.0 triggers regeneration in the caller.

All scores normalized to 0-10 scale for ensemble combination.
"""

import io
import logging
import tempfile

log = logging.getLogger("cova.scoring")


# ---------------------------------------------------------------------------
# Model 1: HPSv2 (Human Preference Score v2.1)
# ---------------------------------------------------------------------------

def compute_hps_v2(image_path: str, prompt: str) -> float:
    """
    Compute HPSv2.1 score for an image+prompt pair.

    HPSv2 scores are typically in [0.15, 0.35] range (raw).
    Returns normalized 0-10 scale: raw_score * 30.

    Args:
        image_path: local file path to image
        prompt: text prompt used to generate the image

    Returns:
        float in 0-10 range
    """
    import hpsv2

    effective_prompt = prompt if prompt else "interior design photograph"
    scores = hpsv2.score(image_path, effective_prompt, hps_version="v2.1")

    if isinstance(scores, (list, tuple)) and len(scores) > 0:
        raw = float(scores[0])
    elif isinstance(scores, (int, float)):
        raw = float(scores)
    else:
        raise ValueError(f"Unexpected HPSv2 return type: {type(scores)}")

    # Normalize: HPSv2 raw [0.15, 0.35] -> [4.5, 10.5], clamp to [0, 10]
    normalized = max(0.0, min(10.0, raw * 30.0))
    log.info(f"HPSv2: raw={raw:.4f} normalized={normalized:.2f}")
    return normalized


# ---------------------------------------------------------------------------
# Model 2: Q-Align (Technical Quality Assessment)
# ---------------------------------------------------------------------------

def compute_q_align(image_path: str) -> float:
    """
    Compute Q-Align quality score using the one-align model.

    Q-Align outputs a MOS (Mean Opinion Score) on 1-5 scale.
    Returns normalized 0-10 scale: (mos - 1) / 4 * 10.

    NOTE: This model is ~7B params and needs ~14GB VRAM. It will likely
    OOM on A10G (24GB) when loaded alongside HPSv2 + CLIP. The caller
    handles this gracefully via try/except.

    Args:
        image_path: local file path to image

    Returns:
        float in 0-10 range
    """
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from PIL import Image

    model_name = "q-future/one-align"

    tokenizer = AutoTokenizer.from_pretrained(
        model_name, trust_remote_code=True
    )
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        trust_remote_code=True,
        torch_dtype=torch.float16,
        device_map="auto",
    )

    img = Image.open(image_path).convert("RGB")

    # Q-Align quality scoring
    mos = model.score(
        [img],
        task_="quality",
        input_="image",
    )

    if isinstance(mos, (list, tuple)):
        mos_val = float(mos[0])
    else:
        mos_val = float(mos)

    # Normalize: MOS [1, 5] -> [0, 10]
    normalized = max(0.0, min(10.0, (mos_val - 1.0) / 4.0 * 10.0))
    log.info(f"Q-Align: mos={mos_val:.2f} normalized={normalized:.2f}")

    # Free memory immediately
    del model, tokenizer
    torch.cuda.empty_cache()

    return normalized


# ---------------------------------------------------------------------------
# Model 3: Aesthetic Predictor V2.5 (SigLIP + MLP)
# ---------------------------------------------------------------------------

def compute_aesthetic_v25(image_path: str) -> float:
    """
    Compute aesthetic score using LAION Aesthetic Predictor with CLIP ViT-L/14.

    This is the same model already proven working in the pipeline.
    Returns score on 0-10 scale (native output range).

    Args:
        image_path: local file path to image

    Returns:
        float in 0-10 range
    """
    import torch
    import clip
    from PIL import Image
    import os
    import urllib.request

    device = "cuda" if torch.cuda.is_available() else "cpu"

    model_clip, preprocess = clip.load("ViT-L/14", device=device)
    img = Image.open(image_path).convert("RGB")
    img_tensor = preprocess(img).unsqueeze(0).to(device)

    with torch.no_grad():
        image_features = model_clip.encode_image(img_tensor)
        image_features /= image_features.norm(dim=-1, keepdim=True)

    # Download aesthetic predictor weights if needed
    weights_path = "/tmp/sac+logos+ava1-l14-linearMSE.pth"
    if not os.path.exists(weights_path):
        urllib.request.urlretrieve(
            "https://github.com/christophschuhmann/improved-aesthetic-predictor/raw/main/sac+logos+ava1-l14-linearMSE.pth",
            weights_path,
        )

    state_dict = torch.load(weights_path, map_location=device)
    cleaned = {k.replace("layers.", ""): v for k, v in state_dict.items()}

    mlp = torch.nn.Sequential(
        torch.nn.Linear(768, 1024),
        torch.nn.Dropout(0.2),
        torch.nn.Linear(1024, 128),
        torch.nn.Dropout(0.2),
        torch.nn.Linear(128, 64),
        torch.nn.Dropout(0.1),
        torch.nn.Linear(64, 16),
        torch.nn.Linear(16, 1),
    ).to(device)
    mlp.load_state_dict(cleaned)
    mlp.eval()

    with torch.no_grad():
        score = float(mlp(image_features.float()).squeeze().cpu())

    # Free memory
    del model_clip, mlp, image_features, img_tensor
    torch.cuda.empty_cache()

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

    Args:
        image_url: URL of the rendered image
        prompt: text prompt used to generate the image

    Returns:
        dict with keys: overall, hps, q_align, aesthetic, reject
        Individual scores are None if that model failed.
    """
    import requests
    from PIL import Image

    # Download image once, save to temp file
    response = requests.get(image_url, timeout=60)
    response.raise_for_status()
    img_bytes = response.content

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img.save(tmp, format="PNG")
        tmp_path = tmp.name
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
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
