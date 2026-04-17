"""
Cova v5 — Post-Processing Chain for Magazine-Quality Output

11-step ordered pipeline applied after pixel_perfect_composite().
Every step is individually toggleable (enabled param).
If any step fails, it logs the error and continues with previous output.
Film grain is ALWAYS last — grain destroys every step if not last.

Steps:
  1. Denoise architecture region (cv2, phone camera noise)
  2. IC-Light V2 lighting harmonization (fal-ai)
  3. AuraSR v2 upscale 4x (fal-ai) / SUPIR for premium
  4. CLAHE local contrast (cv2, LAB L-channel)
  5. Teal-orange color grade (numpy, LAB)
  6. Depth-of-field simulation (cv2, depth-based)
  7. Micro-shadow enhancement (cv2 Sobel + multiply)
  8. Unsharp mask sharpening (cv2, LAB L-channel)
  9. Subtle vignette (numpy, elliptical multiply)
  10. Kodak Portra 400 LUT (colour-science)
  11. Film grain (numpy, luminance only, DISABLED by default)

Entry point: run_postprocessing_chain()
"""

import io
import os
import time as _time

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Step 1 — Denoise Architecture Region
# ---------------------------------------------------------------------------

def denoise_architecture_region(
    image: np.ndarray,
    arch_mask: np.ndarray,
    enabled: bool = True,
) -> np.ndarray:
    """
    Denoise architecture region (walls/ceiling/floor) where phone camera adds noise.
    Uses cv2.fastNlMeansDenoisingColored — CPU-compatible, no torch needed.
    Skips if input resolution < 1080p (upscaler handles low-res noise better).
    """
    if not enabled:
        return image
    try:
        h, w = image.shape[:2]
        if min(h, w) < 1080:
            print(f"[postprocess] Step 1 SKIP — resolution {w}x{h} < 1080p, upscaler handles noise")
            return image

        # Resize arch_mask if needed
        if arch_mask.shape[:2] != (h, w):
            arch_mask = cv2.resize(arch_mask, (w, h), interpolation=cv2.INTER_NEAREST)

        # Denoise the full image
        # cv2.fastNlMeansDenoisingColored(src, dst, h, hColor, templateWindowSize, searchWindowSize)
        denoised = cv2.fastNlMeansDenoisingColored(image, None, 10, 10, 7, 21)

        # Apply denoised ONLY to architecture regions, keep furniture untouched
        result = image.copy()
        arch_region = arch_mask > 127
        result[arch_region] = denoised[arch_region]

        print(f"[postprocess] Step 1 DONE — denoised {np.count_nonzero(arch_region)} arch pixels")
        return result
    except Exception as e:
        print(f"[postprocess] Step 1 FAILED (denoise): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 2 — IC-Light V2 Lighting Harmonization
# ---------------------------------------------------------------------------

def harmonize_lighting(
    composite: np.ndarray,
    original: np.ndarray,
    furniture_mask: np.ndarray,
    window_direction: str = None,
    intensity: float = 0.3,
    enabled: bool = True,
) -> np.ndarray:
    """
    Harmonize generated furniture lighting with original room lighting.
    Uses fal-ai/ic-light-v2.
    Graceful skip if API unavailable.
    """
    if not enabled:
        return composite
    try:
        import fal_client
        from PIL import Image

        h, w = composite.shape[:2]

        # Resize furniture_mask if needed
        if furniture_mask.shape[:2] != (h, w):
            if furniture_mask.dtype == np.float32 or furniture_mask.dtype == np.float64:
                fm = (furniture_mask * 255).clip(0, 255).astype(np.uint8)
            else:
                fm = furniture_mask
            fm = cv2.resize(fm, (w, h), interpolation=cv2.INTER_NEAREST)
        else:
            if furniture_mask.dtype == np.float32 or furniture_mask.dtype == np.float64:
                fm = (furniture_mask * 255).clip(0, 255).astype(np.uint8)
            else:
                fm = furniture_mask

        # Build foreground (furniture region only) as RGBA with mask as alpha
        fg_rgba = np.zeros((h, w, 4), dtype=np.uint8)
        fg_rgba[:, :, :3] = composite
        fg_rgba[:, :, 3] = fm

        # Convert to PNG bytes for API
        fg_pil = Image.fromarray(fg_rgba, mode="RGBA")
        fg_buf = io.BytesIO()
        fg_pil.save(fg_buf, format="PNG")
        fg_bytes = fg_buf.getvalue()

        bg_pil = Image.fromarray(original, mode="RGB")
        bg_buf = io.BytesIO()
        bg_pil.save(bg_buf, format="PNG")
        bg_bytes = bg_buf.getvalue()

        # Determine light description from window direction
        light_desc = "natural ambient light from the side"
        if window_direction == "left":
            light_desc = "natural light from the left window"
        elif window_direction == "right":
            light_desc = "natural light from the right window"
        elif window_direction == "center":
            light_desc = "natural light from the center window"

        import base64
        fg_b64 = base64.b64encode(fg_bytes).decode()
        bg_b64 = base64.b64encode(bg_bytes).decode()

        result = fal_client.run("fal-ai/ic-light-v2", arguments={
            "prompt": f"interior photograph, {light_desc}, consistent lighting",
            "image_url": f"data:image/png;base64,{fg_b64}",
            "background_image_url": f"data:image/png;base64,{bg_b64}",
            "light_source": window_direction or "auto",
        })

        # Download result
        result_url = None
        images = result.get("images") or []
        if images:
            result_url = images[0].get("url")
        elif result.get("image") and isinstance(result["image"], dict):
            result_url = result["image"].get("url")

        if not result_url:
            print("[postprocess] Step 2 SKIP — IC-Light returned no image")
            return composite

        import requests
        resp = requests.get(result_url, timeout=60)
        resp.raise_for_status()
        lit_img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        lit_arr = np.array(lit_img)

        # Resize to match if needed
        if lit_arr.shape[:2] != (h, w):
            lit_arr = cv2.resize(lit_arr, (w, h), interpolation=cv2.INTER_LANCZOS4)

        # Blend at intensity (only in furniture region)
        mask_f = fm.astype(np.float32) / 255.0
        mask_3ch = mask_f[:, :, np.newaxis]
        blended = composite.astype(np.float32)
        lit_f = lit_arr.astype(np.float32)
        # Apply IC-Light result only where furniture is, at specified intensity
        blended = blended + mask_3ch * intensity * (lit_f - blended)
        result_arr = blended.clip(0, 255).astype(np.uint8)

        print(f"[postprocess] Step 2 DONE — IC-Light harmonization at intensity={intensity}")
        return result_arr
    except Exception as e:
        print(f"[postprocess] Step 2 SKIP (IC-Light unavailable): {e}")
        return composite


# ---------------------------------------------------------------------------
# Step 3 — AuraSR v2 Upscale 4x (or SUPIR for premium)
# ---------------------------------------------------------------------------

def upscale_image(
    image: np.ndarray,
    tier: str = "default",
    enabled: bool = True,
) -> np.ndarray:
    """
    Upscale image 4x using AuraSR v2 (default) or SUPIR (premium).
    CRITICAL: AuraSR uses overlapping_tiles=true to avoid seam artifacts.
    """
    if not enabled:
        return image
    try:
        import fal_client
        from PIL import Image
        import requests

        h, w = image.shape[:2]

        # Convert to PNG bytes for API
        pil_img = Image.fromarray(image, mode="RGB")
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        import base64
        img_b64 = base64.b64encode(png_bytes).decode()
        data_url = f"data:image/png;base64,{img_b64}"

        if tier == "premium":
            # SUPIR — higher quality, ~$0.08 extra, ~20s extra
            print("[postprocess] Step 3 — using SUPIR (premium tier)")
            result = fal_client.run("fal-ai/supir", arguments={
                "image_url": data_url,
                "upscale": 4,
            })
        else:
            # AuraSR v2 — fast, good quality
            # CRITICAL: overlapping_tiles=true prevents seam artifacts
            print("[postprocess] Step 3 — using AuraSR v2 with overlapping tiles")
            result = fal_client.run("fal-ai/aura-sr", arguments={
                "image_url": data_url,
                "upscaling_factor": 4,
                "overlapping_tiles": True,
            })

        # Extract result URL
        result_url = None
        images = result.get("images") or []
        if images:
            result_url = images[0].get("url")
        elif result.get("image") and isinstance(result["image"], dict):
            result_url = result["image"].get("url")
        elif isinstance(result.get("output"), str):
            result_url = result["output"]

        if not result_url:
            print("[postprocess] Step 3 SKIP — upscaler returned no image")
            return image

        resp = requests.get(result_url, timeout=120)
        resp.raise_for_status()
        upscaled = Image.open(io.BytesIO(resp.content)).convert("RGB")
        upscaled_arr = np.array(upscaled)

        print(f"[postprocess] Step 3 DONE — {w}x{h} → {upscaled_arr.shape[1]}x{upscaled_arr.shape[0]} "
              f"(tier={tier})")
        return upscaled_arr
    except Exception as e:
        print(f"[postprocess] Step 3 FAILED (upscale): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 4 — CLAHE Local Contrast Enhancement
# ---------------------------------------------------------------------------

def enhance_local_contrast(
    image: np.ndarray,
    blend: float = 0.25,
    enabled: bool = True,
) -> np.ndarray:
    """
    CLAHE on LAB L-channel only. Blend with original at 40% to prevent over-processing.
    """
    if not enabled:
        return image
    try:
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l_ch)

        # Blend enhanced L with original L at specified strength
        l_blended = cv2.addWeighted(l_enhanced, blend, l_ch, 1.0 - blend, 0)

        lab_out = cv2.merge([l_blended, a_ch, b_ch])
        result = cv2.cvtColor(lab_out, cv2.COLOR_LAB2RGB)

        print(f"[postprocess] Step 4 DONE — CLAHE contrast, blend={blend}")
        return result
    except Exception as e:
        print(f"[postprocess] Step 4 FAILED (CLAHE): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 5 — Teal-Orange Color Grade
# ---------------------------------------------------------------------------

def apply_teal_orange_grade(
    image: np.ndarray,
    strength: float = 0.15,
    enabled: bool = True,
) -> np.ndarray:
    """
    Interior editorial teal-orange grade in LAB color space.
    Shadow region (L < 80): B channel -4, A channel -1 → subtle cool shadows
    Highlight region (L > 180): A channel +2, B channel +2 → subtle warm highlights
    Blended at strength (default 0.15).
    """
    if not enabled:
        return image
    try:
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.float32)
        l_ch = lab[:, :, 0]
        a_ch = lab[:, :, 1]
        b_ch = lab[:, :, 2]

        graded_a = a_ch.copy()
        graded_b = b_ch.copy()

        # Shadow region (L < 80): subtle cool
        shadow_mask = l_ch < 80
        graded_b[shadow_mask] -= 4.0
        graded_a[shadow_mask] -= 1.0

        # Highlight region (L > 180): subtle warm
        highlight_mask = l_ch > 180
        graded_a[highlight_mask] += 2.0
        graded_b[highlight_mask] += 2.0

        # Blend graded with original at strength
        a_out = a_ch * (1.0 - strength) + graded_a * strength
        b_out = b_ch * (1.0 - strength) + graded_b * strength

        lab[:, :, 1] = np.clip(a_out, 0, 255)
        lab[:, :, 2] = np.clip(b_out, 0, 255)

        result = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2RGB)

        print(f"[postprocess] Step 5 DONE — teal-orange grade, strength={strength}")
        return result
    except Exception as e:
        print(f"[postprocess] Step 5 FAILED (color grade): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 6 — Depth-of-Field Simulation
# ---------------------------------------------------------------------------

def apply_dof(
    image: np.ndarray,
    depth_map: np.ndarray = None,
    enabled: bool = True,
) -> np.ndarray:
    """
    Depth-of-field simulation using depth map.
    Foreground (depth percentile < 20%): sigma = 1.0
    Background (depth percentile > 80%): sigma = 0.8
    Midground: no blur
    """
    if not enabled:
        return image
    if depth_map is None:
        print("[postprocess] Step 6 SKIP — no depth map available")
        return image
    try:
        h, w = image.shape[:2]

        # Resize depth map if needed
        if depth_map.shape[:2] != (h, w):
            depth_map = cv2.resize(depth_map, (w, h), interpolation=cv2.INTER_LINEAR)

        # Normalize depth to 0-1
        dm = depth_map.astype(np.float32)
        dm_min, dm_max = dm.min(), dm.max()
        if dm_max - dm_min < 1e-6:
            print("[postprocess] Step 6 SKIP — depth map is flat")
            return image
        dm = (dm - dm_min) / (dm_max - dm_min)

        # Compute percentile thresholds
        p20 = np.percentile(dm, 20)
        p80 = np.percentile(dm, 80)

        # Foreground blur (slight)
        fg_blur = cv2.GaussianBlur(image, (0, 0), sigmaX=1.0, sigmaY=1.0)
        # Background blur (slight)
        bg_blur = cv2.GaussianBlur(image, (0, 0), sigmaX=0.8, sigmaY=0.8)

        result = image.copy().astype(np.float32)
        fg_f = fg_blur.astype(np.float32)
        bg_f = bg_blur.astype(np.float32)

        # Foreground region
        fg_mask = (dm < p20)[:, :, np.newaxis].astype(np.float32)
        result = result * (1.0 - fg_mask) + fg_f * fg_mask

        # Background region
        bg_mask = (dm > p80)[:, :, np.newaxis].astype(np.float32)
        result = result * (1.0 - bg_mask) + bg_f * bg_mask

        result = result.clip(0, 255).astype(np.uint8)
        print(f"[postprocess] Step 6 DONE — DoF applied (p20={p20:.2f}, p80={p80:.2f})")
        return result
    except Exception as e:
        print(f"[postprocess] Step 6 FAILED (DoF): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 7 — Micro-Shadow Enhancement
# ---------------------------------------------------------------------------

def enhance_micro_shadows(
    image: np.ndarray,
    depth_map: np.ndarray = None,
    strength: float = 0.15,
    enabled: bool = True,
) -> np.ndarray:
    """
    Contact shadows where furniture meets floor, shadows under objects.
    Compute Sobel gradient of depth map, apply multiply blend at strength opacity.
    """
    if not enabled:
        return image
    if depth_map is None:
        print("[postprocess] Step 7 SKIP — no depth map available")
        return image
    try:
        h, w = image.shape[:2]

        # Resize depth map if needed
        if depth_map.shape[:2] != (h, w):
            depth_map = cv2.resize(depth_map, (w, h), interpolation=cv2.INTER_LINEAR)

        dm = depth_map.astype(np.float32)
        dm_min, dm_max = dm.min(), dm.max()
        if dm_max - dm_min < 1e-6:
            print("[postprocess] Step 7 SKIP — depth map is flat")
            return image
        dm = (dm - dm_min) / (dm_max - dm_min)

        # Compute Sobel gradient magnitude
        grad_x = cv2.Sobel(dm, cv2.CV_32F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(dm, cv2.CV_32F, 0, 1, ksize=3)
        gradient = np.sqrt(grad_x ** 2 + grad_y ** 2)

        # Normalize gradient to 0-1
        g_max = gradient.max()
        if g_max > 1e-6:
            gradient = gradient / g_max

        # Invert: high gradient = shadow (dark), low gradient = no effect
        shadow_layer = 1.0 - gradient * strength

        # Apply multiply blend
        shadow_3ch = shadow_layer[:, :, np.newaxis]
        result = (image.astype(np.float32) * shadow_3ch).clip(0, 255).astype(np.uint8)

        print(f"[postprocess] Step 7 DONE — micro-shadows, strength={strength}")
        return result
    except Exception as e:
        print(f"[postprocess] Step 7 FAILED (micro-shadows): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 8 — Unsharp Mask (Sharpening)
# ---------------------------------------------------------------------------

def sharpen_luminance(
    image: np.ndarray,
    amount: float = 1.5,
    sigma: float = 1.2,
    threshold: int = 3,
    enabled: bool = True,
) -> np.ndarray:
    """
    Unsharp mask on LAB L-channel ONLY.
    Do NOT sharpen A or B channels — causes color fringing.
    """
    if not enabled:
        return image
    try:
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l_ch = lab[:, :, 0].astype(np.float32)

        # Gaussian blur for unsharp mask
        blurred = cv2.GaussianBlur(l_ch, (0, 0), sigmaX=sigma, sigmaY=sigma)

        # Unsharp mask: sharpened = original + amount * (original - blurred)
        diff = l_ch - blurred

        # Apply threshold — only sharpen edges above threshold
        mask = np.abs(diff) > threshold
        sharpened = l_ch + amount * diff * mask.astype(np.float32)

        lab[:, :, 0] = np.clip(sharpened, 0, 255).astype(np.uint8)
        result = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

        print(f"[postprocess] Step 8 DONE — unsharp mask, amount={amount}, sigma={sigma}")
        return result
    except Exception as e:
        print(f"[postprocess] Step 8 FAILED (sharpen): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 9 — Subtle Vignette
# ---------------------------------------------------------------------------

def add_vignette(
    image: np.ndarray,
    strength: float = 0.12,
    radius: float = 0.85,
    enabled: bool = True,
) -> np.ndarray:
    """
    Elliptical vignette, multiply blend. strength=0.30, radius=0.75 of diagonal.
    """
    if not enabled:
        return image
    try:
        h, w = image.shape[:2]
        cy, cx = h / 2.0, w / 2.0

        # Create coordinate grids
        y_grid, x_grid = np.ogrid[:h, :w]
        # Elliptical distance from center (normalized)
        dist = np.sqrt(((x_grid - cx) / (w / 2.0)) ** 2 + ((y_grid - cy) / (h / 2.0)) ** 2)

        # Vignette: 1.0 at center, darkens toward edges
        # Using cosine falloff for smooth transition
        vignette = np.clip(1.0 - strength * (dist / radius) ** 2, 0.0, 1.0)

        # Multiply blend
        vignette_3ch = vignette[:, :, np.newaxis].astype(np.float32)
        result = (image.astype(np.float32) * vignette_3ch).clip(0, 255).astype(np.uint8)

        print(f"[postprocess] Step 9 DONE — vignette, strength={strength}, radius={radius}")
        return result
    except Exception as e:
        print(f"[postprocess] Step 9 FAILED (vignette): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 10 — Kodak Portra 400 LUT
# ---------------------------------------------------------------------------

def apply_lut(
    image: np.ndarray,
    lut_path: str = None,
    opacity: float = 0.70,
    enabled: bool = True,
) -> np.ndarray:
    """
    Apply Kodak Portra 400 .cube LUT via colour-science trilinear interpolation.
    Graceful skip if LUT file missing or colour-science not installed.
    """
    if not enabled:
        return image

    # Resolve default LUT path
    if lut_path is None:
        # Check relative to this file first, then /root/luts/ (Modal container)
        candidates = [
            os.path.join(os.path.dirname(__file__), "luts", "portra400.cube"),
            "/root/luts/portra400.cube",
        ]
        for c in candidates:
            if os.path.exists(c):
                lut_path = c
                break

    if not lut_path or not os.path.exists(lut_path):
        print("[postprocess] Step 10 SKIP — LUT file not found")
        return image

    try:
        import colour

        # Read .cube LUT
        lut = colour.io.read_LUT(lut_path)

        # Normalize image to 0-1 float
        img_f = image.astype(np.float32) / 255.0

        # Apply LUT (trilinear interpolation)
        h, w, c = img_f.shape
        flat = img_f.reshape(-1, 3)
        graded = lut.apply(flat)
        graded = graded.reshape(h, w, 3)

        # Blend with original at opacity
        blended = img_f * (1.0 - opacity) + graded * opacity
        result = (np.clip(blended, 0.0, 1.0) * 255).astype(np.uint8)

        print(f"[postprocess] Step 10 DONE — Portra 400 LUT at {opacity:.0%} opacity")
        return result
    except ImportError:
        print("[postprocess] Step 10 SKIP — colour-science not installed")
        return image
    except Exception as e:
        print(f"[postprocess] Step 10 FAILED (LUT): {e}")
        return image


# ---------------------------------------------------------------------------
# Step 11 — Film Grain (ALWAYS LAST)
# ---------------------------------------------------------------------------

def add_film_grain(
    image: np.ndarray,
    sigma: float = 5.0,
    luminance_only: bool = True,
    enabled: bool = False,
) -> np.ndarray:
    """
    Film grain on luminance channel only (zero chroma grain).
    Default: DISABLED for product renders.
    Enable via editorial_mode=True in run_postprocessing_chain.
    Industrial style: sigma=6.0.
    """
    if not enabled:
        return image
    try:
        if luminance_only:
            lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.float32)
            noise = np.random.normal(0, sigma, lab[:, :, 0].shape).astype(np.float32)
            lab[:, :, 0] = np.clip(lab[:, :, 0] + noise, 0, 255)
            result = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2RGB)
        else:
            noise = np.random.normal(0, sigma, image.shape).astype(np.float32)
            result = np.clip(image.astype(np.float32) + noise, 0, 255).astype(np.uint8)

        print(f"[postprocess] Step 11 DONE — film grain, sigma={sigma}, luminance_only={luminance_only}")
        return result
    except Exception as e:
        print(f"[postprocess] Step 11 FAILED (grain): {e}")
        return image


# ---------------------------------------------------------------------------
# Orchestrator — runs all 11 steps in order
# ---------------------------------------------------------------------------

def run_postprocessing_chain(
    composite: np.ndarray,
    original: np.ndarray,
    arch_mask: np.ndarray,
    furniture_mask: np.ndarray,
    depth_map: np.ndarray = None,
    window_direction: str = None,
    style_name: str = "",
    tier: str = "default",
    editorial_mode: bool = False,
) -> np.ndarray:
    """
    Run all 11 post-processing steps in order.
    Each step receives the output of the previous step.
    If any step fails, the chain continues with the previous output.

    Args:
        composite: RGB uint8, output of pixel_perfect_composite
        original: RGB uint8, original room photo
        arch_mask: uint8 (h,w), 255=architecture
        furniture_mask: float32 (h,w) 0-1 or uint8 (h,w) 0-255
        depth_map: float32 (h,w) or None
        window_direction: "left"/"right"/"center"/None
        style_name: for grain sigma selection (e.g. "industrial")
        tier: "default" or "premium" (affects upscaler choice)
        editorial_mode: if True, enables film grain (Step 11)

    Returns:
        Processed RGB uint8 array
    """
    t_start = _time.time()
    print(f"[postprocess] == Chain START — {composite.shape[1]}x{composite.shape[0]}, "
          f"tier={tier}, editorial={editorial_mode} ==")

    img = composite

    # Step 1 — Denoise architecture region
    t = _time.time()
    img = denoise_architecture_region(img, arch_mask, enabled=True)
    print(f"[postprocess] Step 1 took {_time.time() - t:.2f}s")

    # Step 2 — IC-Light V2 lighting harmonization
    t = _time.time()
    img = harmonize_lighting(
        img, original, furniture_mask,
        window_direction=window_direction,
        intensity=0.3,
        enabled=True,
    )
    print(f"[postprocess] Step 2 took {_time.time() - t:.2f}s")

    # Step 3 — Upscale 4x
    t = _time.time()
    img = upscale_image(img, tier=tier, enabled=True)
    print(f"[postprocess] Step 3 took {_time.time() - t:.2f}s")

    # Step 4 — CLAHE contrast
    t = _time.time()
    img = enhance_local_contrast(img, blend=0.25, enabled=True)
    print(f"[postprocess] Step 4 took {_time.time() - t:.2f}s")

    # Step 5 — Teal-orange grade
    t = _time.time()
    img = apply_teal_orange_grade(img, strength=0.15, enabled=True)
    print(f"[postprocess] Step 5 took {_time.time() - t:.2f}s")

    # Step 6 — Depth-of-field (disabled until real depth maps available)
    t = _time.time()
    img = apply_dof(img, depth_map=depth_map, enabled=False)
    print(f"[postprocess] Step 6 took {_time.time() - t:.2f}s")

    # Step 7 — Micro-shadows (disabled until real depth maps available)
    t = _time.time()
    img = enhance_micro_shadows(img, depth_map=depth_map, strength=0.15, enabled=False)
    print(f"[postprocess] Step 7 took {_time.time() - t:.2f}s")

    # Step 8 — Sharpen luminance
    t = _time.time()
    img = sharpen_luminance(img, amount=1.5, sigma=1.2, threshold=3, enabled=True)
    print(f"[postprocess] Step 8 took {_time.time() - t:.2f}s")

    # Step 9 — Vignette
    t = _time.time()
    img = add_vignette(img, strength=0.12, radius=0.85, enabled=True)
    print(f"[postprocess] Step 9 took {_time.time() - t:.2f}s")

    # Step 10 — Portra 400 LUT
    t = _time.time()
    img = apply_lut(img, lut_path=None, opacity=0.70, enabled=True)
    print(f"[postprocess] Step 10 took {_time.time() - t:.2f}s")

    # Step 11 — Film grain (LAST — always last)
    grain_sigma = 5.0
    if "industrial" in style_name.lower():
        grain_sigma = 6.0
    t = _time.time()
    img = add_film_grain(
        img, sigma=grain_sigma, luminance_only=True,
        enabled=editorial_mode,
    )
    print(f"[postprocess] Step 11 took {_time.time() - t:.2f}s")

    total = _time.time() - t_start
    print(f"[postprocess] == Chain COMPLETE — {img.shape[1]}x{img.shape[0]}, "
          f"total={total:.2f}s ==")

    return img
