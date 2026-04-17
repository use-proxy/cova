"""
Standalone test for postprocess.py — runs locally without Modal or API keys.

Usage:
    python modal_pipeline/test_postprocess_local.py [path/to/image.jpg]

If no image path given, generates a synthetic test image (gradient + shapes).
Saves before/after PNGs in modal_pipeline/test_output/.

Steps that require fal-ai (IC-Light, AuraSR/SUPIR) are skipped by default.
Pass --with-api to enable them (requires FAL_KEY env var).
"""

import argparse
import os
import sys
import time

import cv2
import numpy as np

# Add parent dir so we can import postprocess
sys.path.insert(0, os.path.dirname(__file__))


def generate_synthetic_room(h: int = 1200, w: int = 1600) -> tuple:
    """
    Generate a synthetic room-like image with walls, floor, and furniture shapes.
    Returns (image, arch_mask, furniture_mask, depth_map).
    """
    img = np.zeros((h, w, 3), dtype=np.uint8)

    # Ceiling — light gray
    img[:int(h * 0.15), :] = [200, 200, 210]
    # Walls — warm beige
    img[int(h * 0.15):int(h * 0.75), :] = [180, 170, 155]
    # Floor — wood brown
    img[int(h * 0.75):, :] = [120, 95, 70]

    # Add some noise to simulate camera
    noise = np.random.normal(0, 8, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # Furniture: sofa (dark rectangle in lower-center)
    cv2.rectangle(img, (w // 4, int(h * 0.50)), (3 * w // 4, int(h * 0.72)), (80, 60, 50), -1)
    # Coffee table
    cv2.rectangle(img, (w // 3, int(h * 0.60)), (2 * w // 3, int(h * 0.68)), (100, 80, 60), -1)
    # Lamp
    cv2.circle(img, (w // 6, int(h * 0.35)), 30, (220, 200, 150), -1)
    cv2.rectangle(img, (w // 6 - 5, int(h * 0.37)), (w // 6 + 5, int(h * 0.55)), (150, 130, 100), -1)

    # Architecture mask: ceiling + floor + walls (but not furniture zone)
    arch_mask = np.zeros((h, w), dtype=np.uint8)
    arch_mask[:int(h * 0.06), :] = 255  # ceiling strip
    arch_mask[int(h * 0.85):, :] = 255  # floor strip

    # Furniture mask: sofa + table region
    furn_mask = np.zeros((h, w), dtype=np.float32)
    furn_mask[int(h * 0.50):int(h * 0.72), w // 4:3 * w // 4] = 1.0
    furn_mask[int(h * 0.60):int(h * 0.68), w // 3:2 * w // 3] = 1.0

    # Depth map: simple gradient (near at bottom, far at top)
    depth = np.linspace(1.0, 0.0, h).reshape(h, 1).repeat(w, axis=1).astype(np.float32)

    return img, arch_mask, furn_mask, depth


def main():
    parser = argparse.ArgumentParser(description="Test postprocess chain locally")
    parser.add_argument("image_path", nargs="?", help="Path to input image (optional)")
    parser.add_argument("--with-api", action="store_true", help="Enable fal-ai steps (IC-Light, upscale)")
    args = parser.parse_args()

    # Output directory
    out_dir = os.path.join(os.path.dirname(__file__), "test_output")
    os.makedirs(out_dir, exist_ok=True)

    if args.image_path:
        print(f"Loading image: {args.image_path}")
        img = cv2.imread(args.image_path)
        if img is None:
            print(f"ERROR: Could not read {args.image_path}")
            sys.exit(1)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        h, w = img.shape[:2]

        # Create dummy masks
        arch_mask = np.zeros((h, w), dtype=np.uint8)
        arch_mask[:int(h * 0.06), :] = 255
        arch_mask[int(h * 0.85):, :] = 255

        furn_mask = np.zeros((h, w), dtype=np.float32)
        furn_mask[int(h * 0.30):int(h * 0.75), int(w * 0.15):int(w * 0.85)] = 1.0

        depth = np.linspace(1.0, 0.0, h).reshape(h, 1).repeat(w, axis=1).astype(np.float32)
    else:
        print("No image provided — generating synthetic room")
        img, arch_mask, furn_mask, depth = generate_synthetic_room()

    # Save before
    before_path = os.path.join(out_dir, "before_postprocess.png")
    cv2.imwrite(before_path, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    print(f"Saved before: {before_path}")

    # Import and run postprocess chain
    from postprocess import (
        denoise_architecture_region,
        enhance_local_contrast,
        apply_teal_orange_grade,
        apply_dof,
        enhance_micro_shadows,
        sharpen_luminance,
        add_vignette,
        apply_lut,
        add_film_grain,
    )

    original = img.copy()
    result = img

    print("\n--- Running steps (API steps skipped unless --with-api) ---\n")

    # Step 1: Denoise
    t = time.time()
    result = denoise_architecture_region(result, arch_mask, enabled=True)
    print(f"  Step 1 (denoise): {time.time() - t:.2f}s")

    # Step 2: IC-Light — skip unless --with-api
    if args.with_api:
        print("  Step 2 (IC-Light): enabled via --with-api")
        from postprocess import harmonize_lighting
        t = time.time()
        result = harmonize_lighting(result, original, furn_mask, enabled=True)
        print(f"  Step 2 took {time.time() - t:.2f}s")
    else:
        print("  Step 2 (IC-Light): SKIPPED (no --with-api)")

    # Step 3: Upscale — skip unless --with-api
    if args.with_api:
        print("  Step 3 (upscale): enabled via --with-api")
        from postprocess import upscale_image
        t = time.time()
        result = upscale_image(result, tier="default", enabled=True)
        print(f"  Step 3 took {time.time() - t:.2f}s")
    else:
        print("  Step 3 (upscale): SKIPPED (no --with-api)")

    # Step 4: CLAHE
    t = time.time()
    result = enhance_local_contrast(result, blend=0.25, enabled=True)
    print(f"  Step 4 (CLAHE): {time.time() - t:.2f}s")

    # Step 5: Teal-orange
    t = time.time()
    result = apply_teal_orange_grade(result, strength=0.15, enabled=True)
    print(f"  Step 5 (teal-orange): {time.time() - t:.2f}s")

    # Step 6: DoF (disabled — no real depth map)
    t = time.time()
    result = apply_dof(result, depth_map=depth, enabled=False)
    print(f"  Step 6 (DoF): {time.time() - t:.2f}s")

    # Step 7: Micro-shadows (disabled — no real depth map)
    t = time.time()
    result = enhance_micro_shadows(result, depth_map=depth, strength=0.15, enabled=False)
    print(f"  Step 7 (shadows): {time.time() - t:.2f}s")

    # Step 8: Sharpen
    t = time.time()
    result = sharpen_luminance(result, enabled=True)
    print(f"  Step 8 (sharpen): {time.time() - t:.2f}s")

    # Step 9: Vignette
    t = time.time()
    result = add_vignette(result, strength=0.12, radius=0.85, enabled=True)
    print(f"  Step 9 (vignette): {time.time() - t:.2f}s")

    # Step 10: LUT
    t = time.time()
    result = apply_lut(result, enabled=True)
    print(f"  Step 10 (LUT): {time.time() - t:.2f}s")

    # Step 11: Grain (editorial mode for testing)
    t = time.time()
    result = add_film_grain(result, sigma=5.0, luminance_only=True, enabled=True)
    print(f"  Step 11 (grain): {time.time() - t:.2f}s")

    # Save after
    after_path = os.path.join(out_dir, "after_postprocess.png")
    cv2.imwrite(after_path, cv2.cvtColor(result, cv2.COLOR_RGB2BGR))
    print(f"\nSaved after: {after_path}")

    # Create side-by-side comparison
    h1, w1 = img.shape[:2]
    h2, w2 = result.shape[:2]
    # Resize to same height for comparison
    target_h = min(h1, h2, 1080)
    scale1 = target_h / h1
    scale2 = target_h / h2
    before_resized = cv2.resize(img, (int(w1 * scale1), target_h))
    after_resized = cv2.resize(result, (int(w2 * scale2), target_h))

    # Add labels
    cv2.putText(before_resized, "BEFORE", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    cv2.putText(after_resized, "AFTER", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

    comparison = np.hstack([before_resized, after_resized])
    comparison_path = os.path.join(out_dir, "comparison.png")
    cv2.imwrite(comparison_path, cv2.cvtColor(comparison, cv2.COLOR_RGB2BGR))
    print(f"Saved comparison: {comparison_path}")
    print("\nDone!")


if __name__ == "__main__":
    main()
