import os
import sys
import time
import json
import tempfile
import urllib.request
import urllib.parse
from pathlib import Path

# Load env manually (no dotenv dependency)
env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
env_vars = {}
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            env_vars[key.strip()] = val.strip().strip('"').strip("'")

SUPABASE_URL = env_vars["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = env_vars["SUPABASE_SERVICE_ROLE_KEY"]
REPLICATE_TOKEN = env_vars["REPLICATE_API_TOKEN"]

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Dimension metadata ────────────────────────────────────────────────────────
DIMENSIONS = [
    {"index": 0, "name": "colorTemperature", "v2_name": "warmth",            "a_score": 0.20, "b_score": 0.80},
    {"index": 1, "name": "colorSaturation",  "v2_name": "visual_complexity", "a_score": 0.20, "b_score": 0.80},
    {"index": 2, "name": "material",          "v2_name": "organicness",       "a_score": 0.20, "b_score": 0.80},
    {"index": 3, "name": "density",           "v2_name": "density",           "a_score": 0.20, "b_score": 0.80},
    {"index": 4, "name": "formality",         "v2_name": "traditionalism",    "a_score": 0.20, "b_score": 0.80},
    {"index": 5, "name": "lineQuality",       "v2_name": "character",         "a_score": 0.20, "b_score": 0.80},
]

PROMPTS = [
    # DIM-0 WARMTH
    (0,0,"a","photorealistic interior bedroom, cool grey palette, slate blue-grey walls, silver steel bed frame, white linen bedding, cool white LED lighting, concrete nightstand, no warm tones anywhere, contemporary minimal, architectural photography, 8k"),
    (0,0,"b","photorealistic interior bedroom, warm amber palette, honey oak wood headboard, terracotta linen bedding, brass lamp, warm candlelight glow, natural wood nightstand, rich warm tones throughout, organic materials, architectural photography, 8k"),
    (0,1,"a","photorealistic interior living room, cool tones, slate grey sofa, white walls, chrome coffee table legs, cool daylight through sheer curtains, blue-grey accent pillows, no warm colors, Scandinavian minimal, architectural photography, 8k"),
    (0,1,"b","photorealistic interior living room, warm amber tones, cognac leather sofa, warm white walls, brass floor lamp, honey oak shelving, terracotta throw, warm tungsten lighting, natural wood coffee table, architectural photography, 8k"),
    (0,2,"a","photorealistic interior bedroom, icy white and pale grey, white lacquered furniture, silver metallic accents, cool white light, zero warmth, contemporary, precise architectural photography, 8k"),
    (0,2,"b","photorealistic interior bedroom, deep ochre and burnt sienna palette, walnut wood furniture, amber bedside lamp glow, warm plaster walls, rust linen duvet, warm rich tones, architectural photography, 8k"),
    (0,3,"a","photorealistic interior living room, monochrome cool grey, pale concrete floor, white sofa, steel grey curtains, no wood, no warm accents, cool industrial minimal, architectural photography, 8k"),
    (0,3,"b","photorealistic interior living room, warm earthy tones, cream bouclé sofa, warm oak floor, amber wall sconces, terracotta cushions, rattan side table, honey warm palette throughout, architectural photography, 8k"),
    (0,4,"a","photorealistic interior bedroom, cool blue-white, white walls, pale grey linen, chrome fixtures, blue accent, no warmth, contemporary hotel minimal, architectural photography, 8k"),
    (0,4,"b","photorealistic interior bedroom, warm sand and caramel, linen headboard warm beige, wooden beams, amber pendant light, warm white walls, organic warm textures, architectural photography, 8k"),
    # DIM-1 VISUAL COMPLEXITY
    (1,0,"a","photorealistic interior bedroom, extreme minimalism, one bed only, completely bare white walls, empty floor, single bedside table, nothing else, pure architectural restraint, vast negative space, architectural photography, 8k"),
    (1,0,"b","photorealistic interior bedroom, richly layered, gallery wall with 8 framed artworks, patterned duvet, decorative pillows stacked, plants on shelves, books on nightstand, layered rugs, multiple decorative objects on every surface, architectural photography, 8k"),
    (1,1,"a","photorealistic interior living room, one sofa facing one coffee table, completely empty walls, bare floor, zero decorative objects, radical minimalism, nothing extraneous, architectural photography, 8k"),
    (1,1,"b","photorealistic interior living room, maximalist layering, gallery wall with mixed frames, patterned area rug over plain rug, throw blankets, stacked books, plants, sculptures, candles, vases, full shelving unit covered in objects, architectural photography, 8k"),
    (1,2,"a","photorealistic interior bedroom, single platform bed, no headboard, one lamp, bare walls, empty surfaces, monastic simplicity, architectural photography, 8k"),
    (1,2,"b","photorealistic interior bedroom, elaborate decoration, canopy bed with draped fabric, wallpaper, framed mirrors, multiple lamps, decorative trays, plants, photo display, layered curtains, full dresser covered in objects, architectural photography, 8k"),
    (1,3,"a","photorealistic interior living room, floating sofa, one plant, bare walls, empty coffee table, clean surfaces, breathing space dominant, minimal Scandinavian, architectural photography, 8k"),
    (1,3,"b","photorealistic interior living room, every surface used, stacked vintage books, eclectic art collection on walls, patterned cushions, woven baskets, ceramic collection on shelves, layered patterns, curated maximalist, architectural photography, 8k"),
    (1,4,"a","photorealistic interior bedroom, white room, platform bed, one lamp, zero wall decor, empty nightstand, nothing on floor, pure restraint, architectural photography, 8k"),
    (1,4,"b","photorealistic interior bedroom, busy layered room, fabric headboard, wallpapered accent wall, gallery of small frames, patterned bedding with throw, multiple plants, stacked books, trinkets everywhere, architectural photography, 8k"),
    # DIM-2 ORGANICNESS
    (2,0,"a","photorealistic interior bedroom, pure industrial materials, poured concrete floor, steel bed frame, glass and chrome nightstand, exposed ductwork, zero plants, zero wood, zero soft textiles, raw urban industrial, architectural photography, 8k"),
    (2,0,"b","photorealistic interior bedroom, fully organic materials, live edge wood headboard, linen bedding, hanging plants, woven rattan pendant light, jute rug, natural clay vessel, driftwood shelf, abundant greenery, architectural photography, 8k"),
    (2,1,"a","photorealistic interior living room, concrete walls, steel frame sofa with thin leather cushion, glass coffee table, metal shelving, no plants, no natural materials, hard industrial surfaces only, architectural photography, 8k"),
    (2,1,"b","photorealistic interior living room, entirely natural materials, linen sofa, reclaimed wood coffee table, woven jute rug, potted fig tree, hanging trailing plants, terracotta pots, natural stone side table, organic abundance, architectural photography, 8k"),
    (2,2,"a","photorealistic interior bedroom, all synthetic and metal, lacquered white furniture, acrylic nightstand, aluminum lamp, polyester bedding, no organic elements whatsoever, contemporary high-gloss, architectural photography, 8k"),
    (2,2,"b","photorealistic interior bedroom, full biophilic design, wood plank ceiling, stone floor, linen curtains, multiple large indoor plants, woven wall hanging, natural fiber rug, ceramic lamp base, completely organic, architectural photography, 8k"),
    (2,3,"a","photorealistic interior living room, industrial loft, exposed brick wall, steel I-beam, concrete floor, leather and steel furniture, zero plants, hard surfaces throughout, architectural photography, 8k"),
    (2,3,"b","photorealistic interior living room, organic sanctuary, whitewashed walls, rattan sofa, macrame wall hanging, hanging plants from ceiling, terracotta floor tiles, woven baskets, trailing pothos everywhere, architectural photography, 8k"),
    (2,4,"a","photorealistic interior bedroom, tech minimal, gloss white surfaces, LED strip light, metal frame bed, synthetic materials only, no nature reference, architectural photography, 8k"),
    (2,4,"b","photorealistic interior bedroom, nature immersed, wooden headboard, linen duvet, large monstera plant, woven pendant, cotton rug, clay pots on windowsill, natural textures everywhere, architectural photography, 8k"),
    # DIM-3 DENSITY
    (3,0,"a","photorealistic interior bedroom, one bed centered in large empty room, vast empty floor space visible, bare walls, one small lamp, extreme negative space, room feels open and empty, architectural photography, 8k"),
    (3,0,"b","photorealistic interior bedroom, fully furnished bedroom, bed with full pillow arrangement, two nightstands with multiple objects, large wardrobe, bench at foot of bed, rug covering floor, multiple lamps, art above bed, every space used, architectural photography, 8k"),
    (3,1,"a","photorealistic interior living room, one sofa, one coffee table, enormous empty floor space, two thirds of room is empty floor, sparse minimal, breathing room dominant, architectural photography, 8k"),
    (3,1,"b","photorealistic interior living room, densely furnished, large sofa plus two armchairs, two coffee tables, side tables beside each seat, bookshelf on wall, rug, plants in corners, multiple lamps, fully occupied room, architectural photography, 8k"),
    (3,2,"a","photorealistic interior bedroom, platform bed only, no nightstand, no dresser, completely bare floor, nothing on walls, single window, pure minimal, architectural photography, 8k"),
    (3,2,"b","photorealistic interior bedroom, packed with furniture, bed two large nightstands dresser vanity desk chair in corner rug curtains multiple art pieces plants full room, architectural photography, 8k"),
    (3,3,"a","photorealistic interior living room, floating sofa against wall, coffee table, nothing else, most of room is empty, contemplative space, Zen minimal, architectural photography, 8k"),
    (3,3,"b","photorealistic interior living room, layered furniture arrangement, sofa plus loveseat, cocktail ottoman, two side tables, floor lamp, table lamp, bookshelf, plants, art, every corner furnished, architectural photography, 8k"),
    (3,4,"a","photorealistic interior bedroom, large room with just a bed, 60 percent of floor empty, two bedside lamps, nothing else, vast open space, minimal zen, architectural photography, 8k"),
    (3,4,"b","photorealistic interior bedroom, cozy full bedroom, bed plus full bedroom suite, nightstands covered in objects, dresser with mirror, window seat, multiple art pieces, plants, throw rugs, complete furnished bedroom, architectural photography, 8k"),
    # DIM-4 TRADITIONALISM
    (4,0,"a","photorealistic interior bedroom, ultra contemporary 2025, floating bed no headboard, invisible hardware, flat panel wardrobe, recessed lighting, zero molding zero ornamentation, pure architectural lines, architectural photography, 8k"),
    (4,0,"b","photorealistic interior bedroom, traditional English style, four poster bed, carved wood headboard, crown molding, wainscoting on walls, tufted bench, antique brass fixtures, heritage furniture, architectural photography, 8k"),
    (4,1,"a","photorealistic interior living room, contemporary 2025, low profile modular sofa, floating shelves, no visible hardware, concrete walls, no moldings, invisible contemporary, architectural photography, 8k"),
    (4,1,"b","photorealistic interior living room, classic traditional, Chesterfield sofa, coffered ceiling, crown molding, fireplace with ornate mantel, traditional Persian rug, wingback chair, antique wood side tables, architectural photography, 8k"),
    (4,2,"a","photorealistic interior bedroom, minimal contemporary, platform bed at floor level, handleless built-ins, no visible fixtures, white walls no molding, clean contemporary hotel aesthetic, architectural photography, 8k"),
    (4,2,"b","photorealistic interior bedroom, Victorian traditional, ornate iron bed frame, wallpapered walls, heavy drapes, antique wardrobe with mirror, traditional patterned rug, oil painting on wall, heritage traditional, architectural photography, 8k"),
    (4,3,"a","photorealistic interior living room, architectural contemporary, statement sofa in neutral, wall of glass, concrete ceiling, no decorative molding, pure architectural form, contemporary gallery aesthetic, architectural photography, 8k"),
    (4,3,"b","photorealistic interior living room, French traditional, Louis style chairs, parquet wood floor, ornate ceiling molding, silk curtains, gilded mirror, traditional console table, classic refined traditional, architectural photography, 8k"),
    (4,4,"a","photorealistic interior bedroom, Japanese contemporary, low platform bed, shoji screen, bare plaster walls, zero ornamentation, clean contemporary Zen, architectural photography, 8k"),
    (4,4,"b","photorealistic interior bedroom, American traditional, sleigh bed, matching wood bedroom suite, plaid pattern, window valance, traditional rug, heritage American traditional bedroom, architectural photography, 8k"),
    # DIM-5 CHARACTER
    (5,0,"a","photorealistic interior bedroom, anonymous hotel room, generic art print, no personal objects, beige walls, neutral everything, could belong to anyone, characterless generic, architectural photography, 8k"),
    (5,0,"b","photorealistic interior bedroom, deeply personal room, gallery of personal photographs on wall, book collection on shelves, travel souvenirs on dresser, personal artwork, record collection visible, unique meaningful objects, clearly belongs to a specific person, architectural photography, 8k"),
    (5,1,"a","photorealistic interior living room, model home staging, generic art above sofa, no books, no personal objects, clean neutral palette, anonymous, architectural photography, 8k"),
    (5,1,"b","photorealistic interior living room, deeply personal, gallery wall of original art and photos, overflowing bookshelves, collected objects from travel, plants cared for years, handmade pottery, personal and unique, architectural photography, 8k"),
    (5,2,"a","photorealistic interior bedroom, generic rental bedroom, standard furniture, no personal items visible, neutral art, anonymous space, nothing distinctive, architectural photography, 8k"),
    (5,2,"b","photorealistic interior bedroom, strong personal expression, band posters and art prints covering walls, personal photo collage, unique vintage lamp, books stacked on floor, personal collections visible, strong individual character, architectural photography, 8k"),
    (5,3,"a","photorealistic interior living room, furniture showroom aesthetic, everything perfectly placed, no books, no clutter, no personal objects, purely decorative nothing meaningful, architectural photography, 8k"),
    (5,3,"b","photorealistic interior living room, lived-in personal space, inherited antique alongside modern finds, meaningful art, books everywhere, cultural objects from family background, deeply individual, architectural photography, 8k"),
    (5,4,"a","photorealistic interior bedroom, business hotel suite, generic headboard, standard lamps, generic art, completely impersonal, no human trace, architectural photography, 8k"),
    (5,4,"b","photorealistic interior bedroom, artist bedroom, hand-painted mural wall, collected art, vintage finds, personal spiritual objects, handmade textile, strong unique personal vision, architectural photography, 8k"),
]

def make_vector(dim_index: int, score: float) -> dict:
    dim_to_old = {
        0: ["colorTemperature", "lightPreference"],
        1: ["colorSaturation", "pattern"],
        2: ["material", "texture", "nature"],
        3: ["density"],
        4: ["formality", "era"],
        5: ["lineQuality", "culturalInfluence"],
    }
    all_dims = ["colorTemperature","colorSaturation","density","formality",
                "era","material","texture","pattern","lineQuality",
                "lightPreference","nature","culturalInfluence"]
    target_dims = dim_to_old[dim_index]
    return {d: score if d in target_dims else 0.50 for d in all_dims}

def replicate_generate(prompt: str, retries: int = 3) -> str:
    """Call Replicate API directly via HTTP. Returns image URL."""
    for attempt in range(retries):
        try:
            # Create prediction
            create_data = json.dumps({
                "version": "black-forest-labs/flux-dev",
                "input": {
                    "prompt": prompt,
                    "width": 1024,
                    "height": 1024,
                    "num_inference_steps": 28,
                    "guidance": 3.5,
                    "output_format": "png",
                    "output_quality": 95,
                }
            }).encode()

            req = urllib.request.Request(
                "https://api.replicate.com/v1/predictions",
                data=create_data,
                headers={
                    "Authorization": f"Bearer {REPLICATE_TOKEN}",
                    "Content-Type": "application/json",
                    "Prefer": "wait=60",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read())

            # If not done yet, poll
            prediction_id = result.get("id")
            status = result.get("status")
            output = result.get("output")

            polls = 0
            while status not in ("succeeded", "failed", "canceled") and polls < 60:
                time.sleep(3)
                polls += 1
                poll_req = urllib.request.Request(
                    f"https://api.replicate.com/v1/predictions/{prediction_id}",
                    headers={"Authorization": f"Bearer {REPLICATE_TOKEN}"},
                )
                with urllib.request.urlopen(poll_req, timeout=30) as resp:
                    result = json.loads(resp.read())
                status = result.get("status")
                output = result.get("output")
                if polls % 5 == 0:
                    print(f"    polling... status={status}")

            if status == "succeeded" and output:
                if isinstance(output, list):
                    return output[0]
                return output
            else:
                raise RuntimeError(f"Prediction {status}: {result.get('error')}")

        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(8)
    raise RuntimeError(f"Failed after {retries} attempts")

def upload_to_supabase(image_url: str, storage_path: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        urllib.request.urlretrieve(image_url, tmp.name)
        with open(tmp.name, "rb") as f:
            image_bytes = f.read()
    supabase.storage.from_("quiz-images").upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": "image/png", "upsert": "true"}
    )
    return f"{SUPABASE_URL}/storage/v1/object/public/quiz-images/{storage_path}"

def insert_pair(dim: dict, pair_num: int, url_a: str, url_b: str):
    supabase.table("quiz_comparison_pairs").delete().eq(
        "dimension", dim["name"]
    ).eq("dimension_index", pair_num).execute()
    supabase.table("quiz_comparison_pairs").insert({
        "dimension": dim["name"],
        "dimension_index": pair_num,
        "image_a_url": url_a,
        "image_b_url": url_b,
        "image_a_vector": make_vector(dim["index"], dim["a_score"]),
        "image_b_vector": make_vector(dim["index"], dim["b_score"]),
        "is_validated": True,
    }).execute()

def main():
    # Group prompts by (dim_index, pair_num)
    pairs: dict = {}
    for (dim_idx, pair_num, side, prompt) in PROMPTS:
        key = (dim_idx, pair_num)
        if key not in pairs:
            pairs[key] = {}
        pairs[key][side] = prompt

    total = len(pairs)
    completed = 0
    failed = []

    print(f"Generating {total} pairs ({total*2} images total)")
    print("=" * 60)

    for (dim_idx, pair_num), sides in sorted(pairs.items()):
        dim = DIMENSIONS[dim_idx]
        print(f"\n[{completed+1}/{total}] dim-{dim_idx} ({dim['v2_name']}) pair {pair_num}")
        try:
            print(f"  Generating A...")
            url_a_raw = replicate_generate(sides["a"])
            url_a = upload_to_supabase(url_a_raw, f"new-pairs/dim-{dim_idx}/{pair_num}-a.png")
            print(f"  ✓ A uploaded")
            time.sleep(2)

            print(f"  Generating B...")
            url_b_raw = replicate_generate(sides["b"])
            url_b = upload_to_supabase(url_b_raw, f"new-pairs/dim-{dim_idx}/{pair_num}-b.png")
            print(f"  ✓ B uploaded")

            insert_pair(dim, pair_num, url_a, url_b)
            print(f"  ✓ DB row inserted")
            completed += 1
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            failed.append((dim_idx, pair_num, str(e)))
        time.sleep(3)

    print("\n" + "=" * 60)
    print(f"DONE: {completed}/{total} pairs succeeded")
    if failed:
        print("FAILED:")
        for (d, p, err) in failed:
            print(f"  dim-{d} pair {p}: {err}")

if __name__ == "__main__":
    main()
