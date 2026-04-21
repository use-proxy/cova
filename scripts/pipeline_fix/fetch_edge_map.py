#!/usr/bin/env python3
"""Generate a Canny edge map for the target room and upload to fal."""
from __future__ import annotations

import io
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

def _load_env():
    env_path = ROOT / "apps/web/.env.local"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if k == "FAL_KEY" and not os.getenv(k):
                os.environ[k] = v

_load_env()

import cv2
import numpy as np
import fal_client as fc
from PIL import Image

target = ROOT / "benchmarks/target_room.jpg"
img = Image.open(target).convert("RGB")
if max(img.size) > 1600:
    s = 1600 / max(img.size)
    img = img.resize((int(img.width * s), int(img.height * s)), Image.LANCZOS)
arr = np.array(img)
gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
edges = cv2.Canny(gray, 30, 90)
# Soft-blur the edges so FLUX gets line guidance, not hard pixel mask
edges = cv2.GaussianBlur(edges, (3, 3), 0)
edge_pil = Image.fromarray(edges).convert("RGB")
buf = io.BytesIO()
edge_pil.save(buf, format="PNG")
url = fc.upload(buf.getvalue(), "image/png")
print(url)
(ROOT / "docs/pipeline-fix/edge-url.txt").write_text(url)
