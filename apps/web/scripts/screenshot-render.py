"""
Take a screenshot of step-8a render and create side-by-side comparison.
"""
import json
import os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

state = json.load(open('/tmp/cova_test_state.json'))
test_room_id = state['testRoomId']
render_url = state['renderUrl']

print(f"[SCREENSHOT] Taking screenshot of step-8a for room {test_room_id}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})

    step8a_url = f"http://localhost:3000/design/step-8a?room_id={test_room_id}"

    try:
        page.goto(step8a_url, timeout=20000)
        page.wait_for_timeout(3000)
        page.screenshot(path='/tmp/cova_step8a_screenshot.png', full_page=False)
        print("[SCREENSHOT] Step-8a screenshot taken: /tmp/cova_step8a_screenshot.png")
    except Exception as e:
        print(f"[SCREENSHOT] Step-8a failed ({e}), taking screenshot of render URL directly")
        page.goto(render_url, timeout=15000)
        page.wait_for_timeout(2000)
        page.screenshot(path='/tmp/cova_step8a_screenshot.png')
        print("[SCREENSHOT] Direct render URL screenshot taken")

    browser.close()

# Side-by-side comparison image
ref_output = Image.open(os.path.join(ROOT, 'test-assets/reference-output.png')).convert('RGB')
our_render = Image.open('/tmp/cova_render_output.png').convert('RGB')

compare_height = 600
ref_w = int(ref_output.width * compare_height / ref_output.height)
our_w = int(our_render.width * compare_height / our_render.height)

ref_resized = ref_output.resize((ref_w, compare_height))
our_resized = our_render.resize((our_w, compare_height))

gap = 20
total_w = ref_w + our_w + gap
canvas = Image.new('RGB', (total_w, compare_height + 60), (240, 240, 240))

canvas.paste(ref_resized, (0, 60))
canvas.paste(our_resized, (ref_w + gap, 60))

draw = ImageDraw.Draw(canvas)
draw.rectangle([0, 0, ref_w, 55], fill=(50, 150, 50))
draw.rectangle([ref_w + gap, 0, total_w, 55], fill=(50, 50, 150))
draw.text((10, 15), "REFERENCE TARGET OUTPUT", fill='white')
draw.text((ref_w + gap + 10, 15), "OUR RENDER OUTPUT", fill='white')

side_by_side_path = '/tmp/cova_side_by_side.png'
canvas.save(side_by_side_path)
print(f"[SCREENSHOT] Side-by-side saved: {side_by_side_path}")
