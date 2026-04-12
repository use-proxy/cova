"""
Derive a 12-dimensional style fingerprint from any room image.
Produces values that simulate what quiz responses would yield for a given style.
"""
import os
import numpy as np
from PIL import Image, ImageFilter
import json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def derive_style_fingerprint(image_path):
    """
    Derives a 12-dimensional style fingerprint from any room image.
    Values are 0.0-1.0 where the meaning is defined by the dimension name.
    """
    img = Image.open(image_path).convert('RGB')
    arr = np.array(img)

    # Brightness -> lightPreference
    brightness = arr.mean() / 255.0
    light_preference = min(brightness * 1.3, 1.0)

    # R-B warmth -> colorTemperature
    warmth = (arr[:,:,0].mean() - arr[:,:,2].mean()) / 128.0
    color_temperature = min(max((warmth + 0.5), 0), 1)

    # Saturation -> colorSaturation
    max_c = arr.max(axis=2).astype(float)
    min_c = arr.min(axis=2).astype(float)
    sat = ((max_c - min_c) / (max_c + 1)).mean()
    color_saturation = min(sat * 4.0, 1.0)

    # Edge density -> density (decor complexity)
    gray = img.convert('L')
    edges = np.array(gray.filter(ImageFilter.FIND_EDGES))
    edge_density = (edges > 30).mean()
    density = min(edge_density * 8.0, 1.0)

    # High frequency texture content -> texture
    edges_fine = np.array(gray.filter(ImageFilter.SMOOTH).filter(ImageFilter.FIND_EDGES))
    texture = min((edges_fine > 20).mean() * 10.0, 1.0)

    # Color variance -> pattern
    color_var = arr.std() / 128.0
    pattern = min(color_var * 1.5, 1.0)

    # Warm material tones (beige/brown/tan dominance) -> material
    brown_mask = (arr[:,:,0] > 120) & (arr[:,:,1] > 90) & (arr[:,:,2] < 130) & \
                 (arr[:,:,0] > arr[:,:,2]) & (arr[:,:,0] > arr[:,:,1] * 0.95)
    material = min(brown_mask.mean() * 6.0, 1.0)

    # Green channel prominence -> nature (plants)
    green_mask = (arr[:,:,1] > arr[:,:,0]) & (arr[:,:,1] > arr[:,:,2]) & (arr[:,:,1] > 80)
    nature = min(green_mask.mean() * 15.0, 1.0)

    # Mid-range defaults for dimensions that require human judgment
    era = 0.45
    formality = max(0.15, 1.0 - density * 0.8)
    line_quality = 0.45
    cultural_influence = min(pattern * 1.2, 1.0)

    fingerprint = {
        'lightPreference': round(light_preference, 3),
        'colorTemperature': round(color_temperature, 3),
        'colorSaturation': round(color_saturation, 3),
        'density': round(density, 3),
        'texture': round(texture, 3),
        'pattern': round(pattern, 3),
        'material': round(material, 3),
        'nature': round(nature, 3),
        'era': round(era, 3),
        'formality': round(formality, 3),
        'lineQuality': round(line_quality, 3),
        'culturalInfluence': round(cultural_influence, 3),
    }

    # Derive style name from dominant dimensions
    if fingerprint['density'] > 0.7 and fingerprint['material'] > 0.5:
        style_name = "Maximalist Eclectic"
    elif fingerprint['lightPreference'] > 0.8 and fingerprint['density'] < 0.4:
        style_name = "Coastal Light"
    elif fingerprint['material'] > 0.7 and fingerprint['density'] < 0.5:
        style_name = "Warm Japandi"
    elif fingerprint['density'] > 0.6 and fingerprint['nature'] > 0.4:
        style_name = "Biophilic Eclectic"
    elif fingerprint['lightPreference'] < 0.4:
        style_name = "Dark Moody Glam"
    else:
        style_name = "Eclectic Warm Neutral"

    style_blend = {
        'primaryStyle': style_name,
        'weights': {k: v for k, v in
                    sorted(fingerprint.items(), key=lambda x: -x[1])[:5]}
    }

    return fingerprint, style_blend


fingerprint, style_blend = derive_style_fingerprint(
    os.path.join(ROOT, 'test-assets/reference-output.png')
)

print("=== DERIVED STYLE FINGERPRINT ===")
for k, v in sorted(fingerprint.items(), key=lambda x: -x[1]):
    bar = "█" * int(v * 20)
    print(f"  {k:22s}: {v:.3f}  {bar}")

print(f"\n=== STYLE BLEND ===")
print(f"  Primary: {style_blend['primaryStyle']}")
print(f"  Top dims: {list(style_blend['weights'].keys())[:3]}")

with open('/tmp/derived_fingerprint.json', 'w') as f:
    json.dump({'fingerprint': fingerprint, 'style_blend': style_blend}, f, indent=2)
print(f"\nSaved to /tmp/derived_fingerprint.json")
