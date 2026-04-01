"""
Test script for M7 Session 2 — FLUX Kontext redesign.
Tests directly against the Session 1 pano_url.
Run: python modal_pipeline/test_redesign_session2.py
"""
import json
import sys
import time
from pathlib import Path

import requests

SESSION1_PANO_URL = (
    "https://cdn.marble.worldlabs.ai/"
    "99204f84-05d0-4276-acae-d48d7f2c509d/"
    "3694ba10-f31a-44b6-8bd8-f109a5720f0f_pano/rgb_0.png"
)

TEST_STYLE_BLEND = {
    "coastal": 0.0,
    "japandi": 0.7,
    "minimalist": 0.3,
    "bohemian": 0.0,
    "mid_century": 0.0,
}


def load_env():
    env = {}
    env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        if k and v:
            env[k.strip()] = v.strip()
    return env


def test_claude_prompt(env: dict) -> str:
    print("=== Testing Claude Prompt Generation ===")
    anthropic_key = env.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        print("SKIP: No ANTHROPIC_API_KEY, using fallback")
        return (
            "Redesign this dorm room in warm minimalist japandi style. "
            "Replace all furniture with: low solid oak platform bed, "
            "minimalist walnut coffee table with tapered legs, "
            "clean-lined linen sofa in warm grey, natural jute rug. "
            "Keep all walls, floors, windows, ceiling, doors exactly as "
            "they are. Photorealistic interior design photograph. "
            "Equirectangular panorama, 360 degree view."
        )

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 512,
            "system": (
                "You are an expert interior designer creating FLUX Kontext "
                "prompts for room redesign. Output ONLY the prompt text."
            ),
            "messages": [{
                "role": "user",
                "content": (
                    "Create a FLUX Kontext prompt to redesign a dorm room. "
                    "Style: 70% japandi, 30% minimalist. "
                    "Replace all furniture with japandi pieces: low solid oak "
                    "platform bed, minimalist walnut coffee table, clean-lined "
                    "linen sofa in warm grey, natural jute rug, simple oak "
                    "bookshelf, floating white shelves. "
                    "Materials: solid oak, walnut, natural linen, ceramic, glass. "
                    "Colors: warm white, natural wood tones, soft grey, muted sage. "
                    "Keep walls, floors, windows, ceiling exactly as they are. "
                    "Preserve room dimensions and existing lighting. "
                    "Photorealistic. Include 'equirectangular panorama, 360 degree view'."
                ),
            }],
        },
        timeout=30,
    )
    resp.raise_for_status()
    prompt = resp.json()["content"][0]["text"].strip()
    print(f"Generated prompt ({len(prompt)} chars):\n{prompt}\n")
    return prompt


def test_flux_kontext(pano_url: str, prompt: str, env: dict) -> str | None:
    print("=== Testing FLUX Kontext Pro ===")
    replicate_token = env.get("REPLICATE_API_TOKEN", "")
    if not replicate_token:
        print("ERROR: No REPLICATE_API_TOKEN")
        return None

    print(f"Input pano: {pano_url[:80]}...")
    print(f"Prompt: {prompt[:100]}...")

    create_resp = requests.post(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
        headers={
            "Authorization": f"Token {replicate_token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        },
        json={
            "input": {
                "input_image": pano_url,
                "prompt": prompt,
                "guidance": 2.5,
            }
        },
        timeout=90,
    )

    if not create_resp.ok:
        print(f"FAILED: {create_resp.status_code} {create_resp.text[:300]}")
        return None

    prediction = create_resp.json()
    prediction_id = prediction["id"]
    print(f"Prediction ID: {prediction_id}")

    if prediction.get("status") == "succeeded":
        output = prediction.get("output", [])
        url = output[0] if isinstance(output, list) else output
        print("Succeeded synchronously!")
        return url

    print("Polling...")
    start = time.time()
    while time.time() - start < 120:
        time.sleep(3)
        poll = requests.get(
            f"https://api.replicate.com/v1/predictions/{prediction_id}",
            headers={"Authorization": f"Token {replicate_token}"},
        )
        result = poll.json()
        status = result.get("status")
        elapsed = time.time() - start
        print(f"  Status: {status} ({elapsed:.0f}s)")

        if status == "succeeded":
            output = result.get("output", [])
            url = output[0] if isinstance(output, list) else output
            print(f"Complete! ({elapsed:.0f}s)")
            return url

        if status in ("failed", "canceled"):
            print(f"FAILED: {result.get('error', 'unknown')}")
            return None

    print("TIMED OUT")
    return None


if __name__ == "__main__":
    env = load_env()

    # Verify pano accessible
    pano_check = requests.head(SESSION1_PANO_URL, timeout=10)
    print(f"Pano accessible: {pano_check.status_code == 200}")
    if pano_check.status_code != 200:
        print("ERROR: Cannot access Session 1 pano URL")
        sys.exit(1)

    # Generate prompt (fallback if Claude API key invalid)
    try:
        prompt = test_claude_prompt(env)
    except Exception as e:
        print(f"Claude prompt failed: {e}")
        print("Using fallback prompt...")
        prompt = (
            "Redesign this dorm room in warm minimalist japandi style. "
            "Replace all existing furniture and soft furnishings with: "
            "a low solid oak platform bed with clean lines, a minimalist "
            "walnut coffee table with tapered legs, a clean-lined linen "
            "sofa in warm grey, a natural jute rug, simple oak bookshelf, "
            "and floating white shelves. Use materials: solid oak, walnut, "
            "natural linen, ceramic, glass. Color palette: warm white, "
            "natural wood tones, soft grey, muted sage. "
            "Keep all walls, floors, windows, ceiling, doors, and "
            "architectural features exactly as they are. Preserve all "
            "room dimensions, proportions, and existing lighting direction. "
            "The result must look like a photorealistic interior design "
            "photograph. Equirectangular panorama, 360 degree view."
        )

    # Run FLUX Kontext
    redesigned_url = test_flux_kontext(SESSION1_PANO_URL, prompt, env)

    if not redesigned_url:
        print("\nSession 2 FAIL: No redesigned image URL")
        sys.exit(1)

    # Verify result
    print(f"\n=== Verifying Redesigned Image ===")
    img_resp = requests.head(redesigned_url, timeout=10)
    content_length = int(img_resp.headers.get("content-length", 0))
    print(f"HTTP {img_resp.status_code}, size: {content_length / 1e6:.2f}MB")
    success = img_resp.status_code == 200 and content_length > 100000

    # Save results
    results = {
        "session1_pano_url": SESSION1_PANO_URL,
        "prompt": prompt,
        "redesigned_pano_url": redesigned_url,
        "style_blend": TEST_STYLE_BLEND,
        "image_size_bytes": content_length,
    }
    results_path = Path(__file__).parent / "test_session2_results.json"
    results_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults saved to: {results_path}")
    print(f"View redesigned image: {redesigned_url}")

    print(f"\n{'Session 2 PASS' if success else 'Session 2 FAIL'}")
    sys.exit(0 if success else 1)
