"""
Analyze reference input and output images to extract visual metrics.
Produces thresholds for automated render comparison.
"""
import sys
import os
import numpy as np
from PIL import Image, ImageFilter, ImageStat
import json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

def analyze_image(path, label):
    img = Image.open(path).convert('RGB')
    arr = np.array(img)

    brightness = arr.mean()

    gray = img.convert('L')
    edges = np.array(gray.filter(ImageFilter.FIND_EDGES))
    edge_density = (edges > 30).mean()

    r_mean = arr[:,:,0].mean()
    g_mean = arr[:,:,1].mean()
    b_mean = arr[:,:,2].mean()
    warmth = (r_mean - b_mean) / 255.0

    color_var = arr.std()

    max_c = arr.max(axis=2).astype(float)
    min_c = arr.min(axis=2).astype(float)
    sat = ((max_c - min_c) / (max_c + 1)).mean()

    contrast = ImageStat.Stat(gray).stddev[0]

    print(f"\n=== {label} ===")
    print(f"  Size:          {img.size}")
    print(f"  Brightness:    {brightness:.1f}/255  ({brightness/255*100:.0f}%)")
    print(f"  Edge density:  {edge_density:.4f}  ({edge_density*100:.1f}% - decor complexity)")
    print(f"  Color warmth:  {warmth:.3f}  (positive = warm)")
    print(f"  Color var:     {color_var:.1f}  (richness)")
    print(f"  Saturation:    {sat:.3f}")
    print(f"  Contrast:      {contrast:.1f}")

    return {
        'brightness': brightness, 'edge_density': edge_density,
        'warmth': warmth, 'color_var': color_var, 'sat': sat,
        'contrast': contrast, 'r': r_mean, 'g': g_mean, 'b': b_mean
    }

inp = analyze_image(os.path.join(ROOT, 'test-assets/reference-input.png'), 'INPUT (before)')
out = analyze_image(os.path.join(ROOT, 'test-assets/reference-output.png'), 'OUTPUT TARGET (after)')

print("\n=== WHAT OUR RENDER MUST HIT ===")
print(f"  Brightness:   {out['brightness']:.0f}  (delta from input: {out['brightness']-inp['brightness']:+.0f})")
print(f"  Edge density: {out['edge_density']:.4f}  ({out['edge_density']/inp['edge_density']:.1f}x more complex than input)")
print(f"  Color warmth: {out['warmth']:.3f}")
print(f"  Color var:    {out['color_var']:.1f}")
print(f"  Saturation:   {out['sat']:.3f}")

thresholds = {
    'brightness_min': float(out['brightness'] * 0.88),
    'brightness_max': float(out['brightness'] * 1.12),
    'edge_density_min': float(out['edge_density'] * 0.60),
    'color_var_min': float(out['color_var'] * 0.70),
    'warmth_min': float(out['warmth'] * 0.50),
    'sat_min': float(out['sat'] * 0.55),
}
with open('/tmp/render_thresholds.json', 'w') as f:
    json.dump(thresholds, f, indent=2)
print(f"\nThresholds saved to /tmp/render_thresholds.json")
print(json.dumps(thresholds, indent=2))
