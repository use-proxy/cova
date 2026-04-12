"""
Compare a render output against the reference output image.
Produces a similarity score and PASS/FAIL for each visual dimension.
"""
import json
import sys
import os
import numpy as np
from PIL import Image, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def analyze_image(path):
    img = Image.open(path).convert('RGB')
    arr = np.array(img)
    gray = img.convert('L')

    brightness = arr.mean()
    edges = np.array(gray.filter(ImageFilter.FIND_EDGES))
    edge_density = (edges > 30).mean()
    r_mean, g_mean, b_mean = arr[:,:,0].mean(), arr[:,:,1].mean(), arr[:,:,2].mean()
    warmth = (r_mean - b_mean) / 255.0
    color_var = arr.std()
    max_c = arr.max(axis=2).astype(float)
    min_c = arr.min(axis=2).astype(float)
    sat = ((max_c - min_c) / (max_c + 1)).mean()
    contrast = ImageStat.Stat(gray).stddev[0]

    h = arr.shape[0]
    upper_edges = edges[:h//3, :]
    upper_decor_density = (upper_edges > 30).mean()

    return {
        'brightness': float(brightness),
        'edge_density': float(edge_density),
        'warmth': float(warmth),
        'color_var': float(color_var),
        'sat': float(sat),
        'contrast': float(contrast),
        'upper_decor_density': float(upper_decor_density),
        'r': float(r_mean), 'g': float(g_mean), 'b': float(b_mean)
    }


state = json.load(open('/tmp/cova_test_state.json'))
thresholds = state['thresholds']
flux_prompt = state.get('fluxPrompt', '')

ref_out = analyze_image(os.path.join(ROOT, 'test-assets/reference-output.png'))

try:
    our_render = analyze_image(state['renderPath'])
except Exception as e:
    print(f"ERROR: Could not load render image: {e}")
    sys.exit(1)

print("\n" + "="*70)
print("VISUAL COMPARISON: OUR RENDER vs REFERENCE OUTPUT")
print("="*70)

def pct_diff(a, b):
    if b == 0: return 0
    return abs(a - b) / b * 100

results = []

def check(name, our_val, ref_val, tolerance_pct, higher_is_better=None):
    diff = pct_diff(our_val, ref_val)

    if higher_is_better is not None:
        if higher_is_better:
            passed = our_val >= ref_val * (1 - tolerance_pct/100)
        else:
            passed = our_val <= ref_val * (1 + tolerance_pct/100)
    else:
        passed = diff <= tolerance_pct

    status = "PASS" if passed else "FAIL"
    print(f"  {status}  {name}")
    print(f"         Our: {our_val:.4f}  |  Target: {ref_val:.4f}  |  Diff: {diff:.1f}%  (tolerance: {tolerance_pct}%)")
    results.append({'name': name, 'passed': passed, 'our': our_val, 'ref': ref_val, 'diff': diff})
    return passed

print("\n-- BRIGHTNESS --")
check('Overall brightness', our_render['brightness'], ref_out['brightness'], 15)

print("\n-- DECOR COMPLEXITY (edge density) --")
check('Overall decor density', our_render['edge_density'], ref_out['edge_density'], 35, higher_is_better=True)
check('Upper wall decor density', our_render['upper_decor_density'], ref_out['upper_decor_density'], 40, higher_is_better=True)

print("\n-- COLOR AND TONE --")
check('Color richness (variance)', our_render['color_var'], ref_out['color_var'], 25, higher_is_better=True)
check('Color warmth', our_render['warmth'], ref_out['warmth'], 40)
check('Saturation level', our_render['sat'], ref_out['sat'], 35, higher_is_better=True)
check('Contrast', our_render['contrast'], ref_out['contrast'], 30, higher_is_better=True)

print("\n-- OVERALL TONE MATCH --")
our_tone = our_render['r'] / (our_render['g'] + 1)
ref_tone = ref_out['r'] / (ref_out['g'] + 1)
check('Warm-neutral tone ratio', our_tone, ref_tone, 20)

# Prompt quality check
print("\n-- FLUX PROMPT QUALITY --")
if flux_prompt:
    word_count = len(flux_prompt.split())
    has_anchor = 'anchor' in flux_prompt.lower() or 'fixed' in flux_prompt.lower()
    has_vacated = 'vacated' in flux_prompt.lower() or 'zone' in flux_prompt.lower()
    has_final = 'final constraint' in flux_prompt.lower()
    has_plants = any(w in flux_prompt.lower() for w in ['plant', 'fiddle', 'monstera', 'pothos', 'palm', 'fern'])
    in_range = 200 <= word_count <= 400

    p1 = "PASS" if has_anchor else "FAIL"
    p2 = "PASS" if has_vacated else "FAIL"
    p3 = "PASS" if has_final else "FAIL"
    p4 = "PASS" if in_range else "FAIL"
    p5 = "PASS" if has_plants else "WARN"

    print(f"  {p1}  Anchor/fixed framing present")
    print(f"  {p2}  Vacated zone framing present")
    print(f"  {p3}  Final constraint present")
    print(f"  {p4}  Word count in range: {word_count} words (200-400)")
    print(f"  {p5}  Plants mentioned (based on fingerprint)")
else:
    print("  WARN  No FLUX prompt found in logs -- cannot evaluate prompt quality")

# Summary
passed = [r for r in results if r['passed']]
failed = [r for r in results if not r['passed']]

print("\n" + "="*70)
print(f"SUMMARY: {len(passed)}/{len(results)} visual checks passed")
print("="*70)

similarity_score = len(passed) / len(results) * 100
print(f"Overall similarity: {similarity_score:.0f}%")

if similarity_score >= 85:
    print("VISUAL MATCH: EXCELLENT -- render matches reference quality")
elif similarity_score >= 65:
    print("VISUAL MATCH: PARTIAL -- needs improvement, key metrics off")
    print("\nFailing metrics:")
    for r in failed:
        print(f"  x {r['name']}: ours={r['our']:.4f}, target={r['ref']:.4f}, diff={r['diff']:.1f}%")
else:
    print("VISUAL MATCH: POOR -- significant differences from target")
    print("\nFailing metrics:")
    for r in failed:
        print(f"  x {r['name']}: ours={r['our']:.4f}, target={r['ref']:.4f}, diff={r['diff']:.1f}%")

output = {
    'similarity_score': similarity_score,
    'passed': len(passed),
    'total': len(results),
    'failed_metrics': [r['name'] for r in failed],
    'our_metrics': {r['name']: r['our'] for r in results},
    'ref_metrics': {r['name']: r['ref'] for r in results},
}
with open('/tmp/comparison_results.json', 'w') as f:
    json.dump(output, f, indent=2)
print(f"\nResults saved to /tmp/comparison_results.json")

sys.exit(0 if similarity_score >= 65 else 1)
