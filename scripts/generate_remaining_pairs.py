import os, json, time, urllib.request, tempfile
from pathlib import Path

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

DIMENSIONS = [
    {"index": 0, "name": "colorTemperature", "a_score": 0.20, "b_score": 0.80},
    {"index": 1, "name": "colorSaturation",  "a_score": 0.20, "b_score": 0.80},
    {"index": 2, "name": "material",          "a_score": 0.20, "b_score": 0.80},
    {"index": 3, "name": "density",           "a_score": 0.20, "b_score": 0.80},
    {"index": 4, "name": "formality",         "a_score": 0.20, "b_score": 0.80},
    {"index": 5, "name": "lineQuality",       "a_score": 0.20, "b_score": 0.80},
]

# New pairs needed per room type
# pair_index starts at 5 for new rooms (0-4 already exist for bedroom/living_room)
ROOM_CONFIGS = [
    # Complete bedroom to 5 pairs (currently has 0,1,2 = indices 0-2, need 3,4)
    {"room_type": "bedroom",     "pair_indices": [3, 4]},
    # Complete living room to 5 pairs (currently has 3,4 = indices 3-4, need 0,1,2)
    {"room_type": "living_room", "pair_indices": [0, 1, 2]},
    # All new room types — all 5 pairs
    {"room_type": "kitchen",     "pair_indices": [0, 1, 2, 3, 4]},
    {"room_type": "bathroom",    "pair_indices": [0, 1, 2, 3, 4]},
    {"room_type": "dining_room", "pair_indices": [0, 1, 2, 3, 4]},
    {"room_type": "home_office", "pair_indices": [0, 1, 2, 3, 4]},
]

# Prompts for each room type and dimension
ROOM_PROMPTS = {
    "bedroom": {
        0: {
            "a": "photorealistic interior bedroom, cool grey palette, slate blue-grey walls, silver steel bed frame, white linen, cool white LED, no warm tones, contemporary minimal, architectural photography",
            "b": "photorealistic interior bedroom, warm amber palette, honey oak headboard, terracotta linen, brass lamp, warm candlelight, natural wood nightstand, architectural photography",
        },
        1: {
            "a": "photorealistic interior bedroom, single platform bed, bare white walls, empty floor, one lamp, nothing else, extreme minimalism, architectural photography",
            "b": "photorealistic interior bedroom, richly layered, gallery wall 8 frames, patterned duvet, stacked pillows, plants on shelves, books on nightstand, layered rugs, architectural photography",
        },
        2: {
            "a": "photorealistic interior bedroom, steel bed frame, concrete floor, glass nightstand, no plants, no wood, zero organic elements, industrial, architectural photography",
            "b": "photorealistic interior bedroom, live edge wood headboard, linen bedding, hanging plants, woven rattan pendant, jute rug, clay vessel, driftwood shelf, abundant greenery, architectural photography",
        },
        3: {
            "a": "photorealistic interior bedroom, one bed in large empty room, vast empty floor, bare walls, one small lamp, extreme negative space, architectural photography",
            "b": "photorealistic interior bedroom, fully furnished, bed plus wardrobe plus two nightstands plus bench plus rug plus multiple lamps plus art, every space used, architectural photography",
        },
        4: {
            "a": "photorealistic interior bedroom, ultra contemporary, floating bed no headboard, invisible hardware, flat panel wardrobe, recessed lighting, zero molding, architectural photography",
            "b": "photorealistic interior bedroom, traditional English, four poster bed, carved wood headboard, crown molding, wainscoting, tufted bench, antique brass fixtures, architectural photography",
        },
        5: {
            "a": "photorealistic interior bedroom, anonymous hotel room, generic art print, no personal objects, beige walls, neutral everything, characterless, architectural photography",
            "b": "photorealistic interior bedroom, deeply personal, gallery of photographs, book collection, travel souvenirs, personal artwork, record collection, unique meaningful objects, architectural photography",
        },
    },
    "living_room": {
        0: {
            "a": "photorealistic interior living room, cool tones, slate grey sofa, white walls, chrome legs, cool daylight, no warm colors, Scandinavian minimal, architectural photography",
            "b": "photorealistic interior living room, warm amber, cognac leather sofa, warm white walls, brass floor lamp, honey oak shelving, terracotta throw, warm tungsten lighting, architectural photography",
        },
        1: {
            "a": "photorealistic interior living room, one sofa one coffee table, empty walls, bare floor, zero objects, radical minimalism, architectural photography",
            "b": "photorealistic interior living room, maximalist, gallery wall mixed frames, layered rugs, throw blankets, stacked books, plants, sculptures, candles, vases, full shelving, architectural photography",
        },
        2: {
            "a": "photorealistic interior living room, concrete walls, steel frame sofa, glass coffee table, metal shelving, no plants, no natural materials, industrial, architectural photography",
            "b": "photorealistic interior living room, linen sofa, reclaimed wood coffee table, woven jute rug, potted fig tree, hanging plants, terracotta pots, organic abundance, architectural photography",
        },
        3: {
            "a": "photorealistic interior living room, one sofa, one coffee table, enormous empty floor, two thirds empty, sparse minimal, architectural photography",
            "b": "photorealistic interior living room, densely furnished, large sofa plus two armchairs, two coffee tables, side tables, bookshelf, rug, plants, multiple lamps, architectural photography",
        },
        4: {
            "a": "photorealistic interior living room, contemporary 2025, low profile modular sofa, floating shelves, no moldings, invisible contemporary, architectural photography",
            "b": "photorealistic interior living room, classic traditional, Chesterfield sofa, coffered ceiling, crown molding, fireplace ornate mantel, Persian rug, wingback chair, antique tables, architectural photography",
        },
        5: {
            "a": "photorealistic interior living room, model home staging, generic art, no books, no personal objects, anonymous, architectural photography",
            "b": "photorealistic interior living room, deeply personal, gallery wall original art and photos, overflowing bookshelves, collected objects from travel, handmade pottery, architectural photography",
        },
    },
    "kitchen": {
        0: {
            "a": "photorealistic interior kitchen, cool grey palette, slate grey cabinets, stainless steel appliances, white marble cool tones, cool LED lighting, no warm tones, contemporary minimal, architectural photography",
            "b": "photorealistic interior kitchen, warm amber palette, honey oak cabinets, warm white walls, brass fixtures, warm tungsten lighting, terracotta backsplash tiles, natural wood shelves, architectural photography",
        },
        1: {
            "a": "photorealistic interior kitchen, extreme minimalism, handleless white cabinets, bare countertops, nothing on surfaces, no decoration, pure architectural restraint, architectural photography",
            "b": "photorealistic interior kitchen, richly layered, open shelves covered in ceramics, hanging pots and pans, herb garden on counter, fruit bowls, layered textiles, abundant objects, architectural photography",
        },
        2: {
            "a": "photorealistic interior kitchen, industrial materials, concrete countertops, steel cabinets, exposed pipes, metro tiles, no plants, no wood, hard surfaces only, architectural photography",
            "b": "photorealistic interior kitchen, organic natural, butcher block countertop, natural wood cabinets, terracotta floor tiles, hanging dried herbs, plants on windowsill, woven basket storage, architectural photography",
        },
        3: {
            "a": "photorealistic interior kitchen, minimal sparse, two cabinets, empty island, clear countertops, nothing extra, vast negative space, architectural photography",
            "b": "photorealistic interior kitchen, fully equipped, cabinets floor to ceiling, full open shelving, appliances, spice racks, pot racks, every inch utilized, architectural photography",
        },
        4: {
            "a": "photorealistic interior kitchen, ultra contemporary, handleless flat panel cabinets, integrated appliances, seamless surfaces, zero ornamentation, 2025 contemporary, architectural photography",
            "b": "photorealistic interior kitchen, traditional heritage, shaker cabinets with brass knobs, exposed beams, farmhouse sink, traditional tile backsplash, heritage fixtures, architectural photography",
        },
        5: {
            "a": "photorealistic interior kitchen, generic rental kitchen, standard cabinets, no personal touches, anonymous, could be any apartment, architectural photography",
            "b": "photorealistic interior kitchen, deeply personal, handmade ceramic collection on display, family recipe cards, personal art, collected vintage kitchenware, meaningful objects everywhere, architectural photography",
        },
    },
    "bathroom": {
        0: {
            "a": "photorealistic interior bathroom, cool grey palette, grey stone tiles, chrome fixtures, white surfaces, cool daylight, no warm tones, contemporary minimal, architectural photography",
            "b": "photorealistic interior bathroom, warm amber palette, warm terracotta tiles, aged brass fixtures, warm white surfaces, amber lighting, natural stone warm tones, architectural photography",
        },
        1: {
            "a": "photorealistic interior bathroom, minimal, single basin, bare walls, no decoration, empty surfaces, radical simplicity, architectural photography",
            "b": "photorealistic interior bathroom, layered, multiple candles, stacked towels, plant collection, art on walls, decorative objects, vanity tray with products, richly appointed, architectural photography",
        },
        2: {
            "a": "photorealistic interior bathroom, industrial, concrete walls, steel fixtures, exposed pipes, no plants, hard surfaces, factory aesthetic, architectural photography",
            "b": "photorealistic interior bathroom, organic, natural stone, wood vanity, trailing plants, linen towels, natural materials throughout, biophilic warmth, architectural photography",
        },
        3: {
            "a": "photorealistic interior bathroom, empty minimal, freestanding tub, one plant, bare floor, nothing extra, spa-like emptiness, architectural photography",
            "b": "photorealistic interior bathroom, fully appointed, double vanity covered in products, shelves with towels and plants, multiple candles, bath tray with books and wine, architectural photography",
        },
        4: {
            "a": "photorealistic interior bathroom, ultra contemporary, floating vanity, frameless mirror, invisible hardware, seamless tiles, no ornamentation, architectural photography",
            "b": "photorealistic interior bathroom, traditional heritage, clawfoot tub, pedestal sink, wainscoting, vintage fixtures, traditional tile floor, heritage architectural details, architectural photography",
        },
        5: {
            "a": "photorealistic interior bathroom, generic hotel bathroom, standard white everything, no personal items, anonymous, could be anywhere, architectural photography",
            "b": "photorealistic interior bathroom, personal sanctuary, curated candle collection, personal art on walls, meaningful objects, specific products chosen with care, deeply individual, architectural photography",
        },
    },
    "dining_room": {
        0: {
            "a": "photorealistic interior dining room, cool tones, grey dining table, white chairs, chrome pendant, cool natural light, no warm colors, contemporary minimal, architectural photography",
            "b": "photorealistic interior dining room, warm tones, warm oak dining table, linen chairs, brass pendant, amber candlelight, warm white walls, terracotta accents, architectural photography",
        },
        1: {
            "a": "photorealistic interior dining room, minimal, single table six chairs, bare walls, no centerpiece, nothing else, radical simplicity, architectural photography",
            "b": "photorealistic interior dining room, elaborate, gallery wall, layered table setting, candelabra centerpiece, sideboard covered in objects, plants, art everywhere, richly layered, architectural photography",
        },
        2: {
            "a": "photorealistic interior dining room, industrial, concrete table, steel chairs, exposed brick, pendant bulbs, no soft materials, no plants, hard surfaces, architectural photography",
            "b": "photorealistic interior dining room, organic natural, live edge wood table, rattan chairs, woven placemats, potted plants, natural linen runner, organic materials throughout, architectural photography",
        },
        3: {
            "a": "photorealistic interior dining room, one table four chairs, large empty room, vast floor space, minimal sparse, breathing room dominant, architectural photography",
            "b": "photorealistic interior dining room, densely furnished, large table ten chairs, sideboard, bar cart, display cabinet, plants, art, fully furnished, architectural photography",
        },
        4: {
            "a": "photorealistic interior dining room, contemporary, minimal slab table, ghost chairs, no moldings, seamless, ultra modern 2025, architectural photography",
            "b": "photorealistic interior dining room, traditional formal, mahogany table, upholstered chairs, crown molding, chandelier, traditional rug, formal heritage dining room, architectural photography",
        },
        5: {
            "a": "photorealistic interior dining room, generic staging, standard furniture, no personal touches, anonymous, model home, architectural photography",
            "b": "photorealistic interior dining room, deeply personal, collected art on walls, family heirloom table, meaningful objects on sideboard, personal photographs, individual character, architectural photography",
        },
    },
    "home_office": {
        0: {
            "a": "photorealistic interior home office, cool grey palette, grey desk, chrome lamp, white walls, cool daylight, no warm tones, contemporary minimal, architectural photography",
            "b": "photorealistic interior home office, warm amber palette, warm oak desk, brass lamp, warm white walls, amber lighting, natural wood shelves, terracotta accents, architectural photography",
        },
        1: {
            "a": "photorealistic interior home office, extreme minimal, one desk one chair, bare walls, nothing on desk, empty shelves, radical simplicity, architectural photography",
            "b": "photorealistic interior home office, richly layered, books covering every wall, objects on desk, plants, art, awards, stacked papers, curated chaos, abundant, architectural photography",
        },
        2: {
            "a": "photorealistic interior home office, industrial, steel desk, concrete floor, exposed brick, metal shelving, no plants, no soft materials, architectural photography",
            "b": "photorealistic interior home office, organic, wooden desk, linen curtains, trailing plants everywhere, natural materials, woven storage baskets, biophilic warmth, architectural photography",
        },
        3: {
            "a": "photorealistic interior home office, minimal, desk chair monitor, vast empty space, nothing extra, contemplative sparse, architectural photography",
            "b": "photorealistic interior home office, densely furnished, large desk plus credenza plus bookshelf plus side table plus plants plus multiple lamps plus art, fully occupied, architectural photography",
        },
        4: {
            "a": "photorealistic interior home office, ultra contemporary, floating desk, invisible cable management, handleless storage, seamless minimal, 2025 contemporary, architectural photography",
            "b": "photorealistic interior home office, traditional study, leather-topped mahogany desk, tufted chair, built-in bookshelves, globe, heritage traditional study, architectural photography",
        },
        5: {
            "a": "photorealistic interior home office, generic corporate, standard desk chair monitor, no personal items, anonymous, could be any office, architectural photography",
            "b": "photorealistic interior home office, deeply personal, personal photos and art covering walls, meaningful objects on desk, book collection curated over years, individual character, architectural photography",
        },
    },
}

def make_vector(dim_index, score):
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

def replicate_generate(prompt, retries=3):
    for attempt in range(retries):
        try:
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
            prediction_id = result.get("id")
            status = result.get("status")
            output = result.get("output")
            polls = 0
            while status not in ("succeeded","failed","canceled") and polls < 60:
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
            if status == "succeeded" and output:
                return output[0] if isinstance(output, list) else output
            raise RuntimeError(f"Prediction {status}")
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < retries-1:
                time.sleep(8)
    raise RuntimeError(f"Failed after {retries} attempts")

def upload_to_supabase(image_url, storage_path):
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

def insert_pair(dim, pair_num, room_type, url_a, url_b, prompt_a, prompt_b):
    supabase.table("quiz_comparison_pairs").delete().eq(
        "dimension", dim["name"]
    ).eq("dimension_index", dim["index"]).eq(
        "pair_index", pair_num
    ).eq("room_type", room_type).execute()

    supabase.table("quiz_comparison_pairs").insert({
        "dimension": dim["name"],
        "dimension_index": dim["index"],
        "pair_index": pair_num,
        "room_type": room_type,
        "image_a_url": url_a,
        "image_a_storage_path": f"new-pairs/{room_type}/dim-{dim['index']}/{pair_num}-a.png",
        "image_a_stop": 2,
        "image_b_url": url_b,
        "image_b_storage_path": f"new-pairs/{room_type}/dim-{dim['index']}/{pair_num}-b.png",
        "image_b_stop": 4,
        "image_a_vector": make_vector(dim["index"], dim["a_score"]),
        "image_b_vector": make_vector(dim["index"], dim["b_score"]),
        "flux_prompt_a": prompt_a,
        "flux_prompt_b": prompt_b,
        "is_validated": True,
    }).execute()

def main():
    # Count total pairs to generate
    total = sum(
        len(rc["pair_indices"]) * len(DIMENSIONS)
        for rc in ROOM_CONFIGS
    )
    print(f"Generating {total} pairs ({total*2} images)")
    print("=" * 60)

    completed = 0
    failed = []

    for room_config in ROOM_CONFIGS:
        room_type = room_config["room_type"]
        print(f"\n--- {room_type.upper()} ---")

        room_prompts = ROOM_PROMPTS.get(room_type, {})

        for dim in DIMENSIONS:
            dim_prompts = room_prompts.get(dim["index"], {})
            prompt_a = dim_prompts.get("a", f"photorealistic interior {room_type.replace('_', ' ')}, minimal cool sparse, architectural photography")
            prompt_b = dim_prompts.get("b", f"photorealistic interior {room_type.replace('_', ' ')}, warm layered organic rich, architectural photography")

            for pair_num in room_config["pair_indices"]:
                pair_key = f"{room_type} dim-{dim['index']} pair-{pair_num}"
                print(f"\n[{completed+1}/{total}] {pair_key}")
                try:
                    print(f"  Generating A...")
                    url_a_raw = replicate_generate(prompt_a)
                    path_a = f"new-pairs/{room_type}/dim-{dim['index']}/{pair_num}-a.png"
                    url_a = upload_to_supabase(url_a_raw, path_a)
                    print(f"  ✓ A uploaded")
                    time.sleep(2)

                    print(f"  Generating B...")
                    url_b_raw = replicate_generate(prompt_b)
                    path_b = f"new-pairs/{room_type}/dim-{dim['index']}/{pair_num}-b.png"
                    url_b = upload_to_supabase(url_b_raw, path_b)
                    print(f"  ✓ B uploaded")

                    insert_pair(dim, pair_num, room_type, url_a, url_b, prompt_a, prompt_b)
                    print(f"  ✓ DB inserted")
                    completed += 1
                except Exception as e:
                    print(f"  ✗ FAILED: {e}")
                    failed.append((pair_key, str(e)))
                time.sleep(3)

    print("\n" + "=" * 60)
    print(f"DONE: {completed}/{total} pairs succeeded")
    if failed:
        print("FAILED:")
        for (k, err) in failed:
            print(f"  {k}: {err}")

if __name__ == "__main__":
    main()
