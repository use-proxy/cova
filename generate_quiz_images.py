#!/usr/bin/env python3
"""
Cova Quiz Image Generation Script
Generates 774 images via Replicate FLUX Pro and uploads directly to Supabase Storage.

Setup:
  pip install replicate supabase requests

Environment variables required (copy from apps/web/.env.local):
  REPLICATE_API_TOKEN
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  python generate_quiz_images.py --phase a           # 54 Phase A images only
  python generate_quiz_images.py --phase b           # 720 Phase B images only
  python generate_quiz_images.py --phase all         # all 774 images
  python generate_quiz_images.py --phase a --dry-run # print prompts, no API calls
  python generate_quiz_images.py --csv-only          # write CSV only, no generation
"""

import os
import sys
import time
import argparse
import requests
import replicate
from supabase import create_client

# ── Config ───────────────────────────────────────────────────────────────────

REPLICATE_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
SUPABASE_URL    = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

FLUX_MODEL      = "black-forest-labs/flux-pro"
IMAGE_WIDTH     = 1200
IMAGE_HEIGHT    = 800
STORAGE_BUCKET  = "quiz-images"

QUALITY_SUFFIX = (
    "Photorealistic interior photography, professionally staged, "
    "shot on medium format camera, natural light, no people, no text, "
    "ultra detailed, aspirational, magazine quality, 8K."
)

# ── Phase A: Style descriptors per style per room ─────────────────────────────

PHASE_A_PROMPTS = {
    "warm-japandi": {
        "living-room":  "Warm japandi living room. Low platform sofa in undyed linen, light oak coffee table with single ceramic vase, washi paper pendant lamp casting warm glow, pampas grass in matte clay pot, shoji-inspired room divider, warm white limewash walls, sisal rug, late afternoon golden light.",
        "bedroom":      "Warm japandi bedroom. Low platform bed in solid light oak with natural linen duvet, single wooden nightstand with ceramic lamp, one dried branch in tall vase, warm white textured walls, linen curtains, soft morning diffused light.",
        "dining-room":  "Warm japandi dining room. Solid oak plank dining table, four linen upholstered chairs with wood legs, single washi paper pendant over table, minimal ceramic tableware in warm white, single ikebana branch centerpiece, warm limewash walls.",
        "kitchen":      "Warm japandi kitchen. Light oak flat-front cabinetry, matte warm white countertops, open shelving with three ceramic vessels, single hanging plant, under-cabinet warm lighting, smooth plaster walls, minimal and serene.",
        "home-office":  "Warm japandi home office. Light oak floating desk, natural linen task chair, single low shelf with three books and one plant, washi paper desk lamp, warm white walls, sisal rug, morning window light.",
        "bathroom":     "Warm japandi bathroom. Hinoki wood bath stool beside freestanding soaking tub, matte white stone basin, single bamboo shoot in bud vase, warm limestone floor tiles, smooth plaster walls, diffused natural light through frosted window.",
    },
    "dark-moody-glam": {
        "living-room":  "Dark moody glam living room. Deep forest green velvet curved sofa, antique brass and smoked glass coffee table, walls in deep charcoal with subtle sheen, pair of brass wall sconces with amber glow, sapphire and emerald throw cushions, dark stained oak floors, velvet drapes pooling on floor, evening atmosphere.",
        "bedroom":      "Dark moody glam bedroom. Floor-to-ceiling upholstered headboard in midnight navy velvet, layered luxury bedding in ivory and deep burgundy, pair of brass articulated bedside lamps, dark walls with subtle metallic wallpaper, jewel-toned throw at foot of bed, dramatic low lighting.",
        "dining-room":  "Dark moody glam dining room. Dark lacquered oval dining table, six upholstered chairs in deep emerald velvet, cascading brass chandelier, walls in deep plum with subtle texture, mirrored sideboard with glassware, candlelight ambiance.",
        "kitchen":      "Dark moody glam kitchen. Deep charcoal slab-front cabinetry, unlacquered brass hardware, black and gold marble waterfall island, integrated brass pendant lights, open shelving with dark glassware, moody and sophisticated.",
        "home-office":  "Dark moody glam home office. Dark walnut desk with leather inlay, deep green tufted leather chair, antique brass desk lamp, built-in dark shelving floor to ceiling, walls in deep navy, Persian rug in jewel tones, serious and refined.",
        "bathroom":     "Dark moody glam bathroom. Floor-to-ceiling dark slate tiles, unlacquered brass fittings, freestanding tub in matte black, vanity mirror with brass bulb surround, deep jewel-toned towels, dramatic and luxurious.",
    },
    "coastal-bright": {
        "living-room":  "Coastal bright living room. White slipcovered sofa, natural rattan armchair, weathered whitewash oak floors, sheer white linen curtains billowing gently, seagrass area rug, driftwood and glass coffee table, white walls, afternoon ocean light flooding the room.",
        "bedroom":      "Coastal bright bedroom. White linen duvet on low bed frame, natural rattan headboard, weathered white wood floors, sheer curtains moving in breeze, single fiddle-leaf fig, soft blue-grey cotton throw, bright airy seaside morning.",
        "dining-room":  "Coastal bright dining room. White painted farm table, mix of white-painted and rattan chairs, white walls, large windows with expansive light, simple ceramic dinnerware, fresh eucalyptus centerpiece, airy and open.",
        "kitchen":      "Coastal bright kitchen. White shaker cabinetry, white Carrara marble countertops, open shelving with simple white ceramics, large window over sink with natural light, whitewashed wood floors, fresh herbs on windowsill.",
        "home-office":  "Coastal bright home office. White painted desk, natural rattan chair, white walls, large window with abundant natural light, single shelf with books, potted white orchid, calm and airy.",
        "bathroom":     "Coastal bright bathroom. White subway tile floor to ceiling, white pedestal sink, chrome fixtures, large frosted window with bright light, weathered driftwood mirror, white fluffy towels, single succulent.",
    },
    "industrial-loft": {
        "living-room":  "Industrial loft living room. Exposed brick feature wall, polished concrete floors, black steel and reclaimed wood shelving unit, dark charcoal linen sofa, cluster of Edison bulb pendants, steel-frame glass coffee table, urban raw atmosphere.",
        "bedroom":      "Industrial loft bedroom. Exposed brick accent wall, raw concrete ceiling with visible ductwork, low platform bed in dark slate linen, black powder-coated steel bedside tables, cage-style Edison lamp, steel-frame window, raw and honest.",
        "dining-room":  "Industrial loft dining room. Reclaimed timber plank table on black steel hairpin legs, mix of metal frame and vintage wooden chairs, exposed brick wall, cluster of cage pendant lights, polished concrete floor.",
        "kitchen":      "Industrial loft kitchen. Dark open steel shelving, poured concrete countertops, stainless steel professional appliances, exposed brick, black subway tile backsplash, pendant cage lights, raw and purposeful.",
        "home-office":  "Industrial loft home office. Reclaimed wood plank desk on black steel trestle legs, black metal open shelving, exposed brick wall, single cage Edison desk lamp, concrete floor, city window light.",
        "bathroom":     "Industrial loft bathroom. Exposed concrete walls and ceiling, black iron pipe shower fixtures, vessel sink on reclaimed wood slab vanity, Edison bulb mirror, dark grout, steel mesh basket accessories.",
    },
    "maximalist-eclectic": {
        "living-room":  "Maximalist eclectic living room. Richly layered antique Persian rug over natural sisal, large gallery wall of mixed-media art in varied frames, deep jewel-toned velvet sofa, mix of colorful throw cushions, overflowing brass-trimmed bookshelves, ceramic table lamps, tropical plants, joyful and abundant.",
        "bedroom":      "Maximalist eclectic bedroom. Bold block-print duvet, gallery wall above upholstered headboard, layered vintage rugs, mix of wooden and painted furniture, hanging macrame, plants on every surface, collected and personal.",
        "dining-room":  "Maximalist eclectic dining room. Mismatched upholstered chairs around painted vintage table, bold patterned wallpaper, gallery wall, layered table setting with mix of patterns, statement pendant light, colorful and celebratory.",
        "kitchen":      "Maximalist eclectic kitchen. Open shelving densely packed with colorful ceramics and hanging plants, hand-painted patterned tile backsplash, mix of brass and ceramic hardware, colorful vintage canisters, abundant and personal.",
        "home-office":  "Maximalist eclectic home office. Overflowing floor-to-ceiling bookshelves, large gallery wall, colorful vintage desk, mix of chairs, plants climbing shelves, layers of rugs, creative and alive.",
        "bathroom":     "Maximalist eclectic bathroom. Bold geometric patterned floor tiles, gallery wall of botanical prints, painted vintage vanity, mix of ceramic and brass accessories, colorful towels, trailing potted plants, bold and personal.",
    },
    "heritage-traditional": {
        "living-room":  "Heritage traditional living room. Cognac Chesterfield sofa and armchair, antique Persian rug, dark mahogany side tables, brass table lamps with ivory pleated shades, crown molding, marble fireplace with carved mantel, wainscoting, formal and timeless.",
        "bedroom":      "Heritage traditional bedroom. Dark mahogany four-poster bed, crisp white monogrammed bedding, bench upholstered in toile fabric, antique Persian rug, matching nightstands with brass lamps, formal drapes, refined and stately.",
        "dining-room":  "Heritage traditional dining room. Dark mahogany extension table with carved legs, eight upholstered dining chairs in striped silk, crystal chandelier, Persian runner, antique china cabinet, wainscoting, formal silver candlesticks.",
        "kitchen":      "Heritage traditional kitchen. Cream inset shaker cabinetry with antique brass hardware, thick marble countertops and backsplash, farmhouse apron sink, dark wood herringbone floors, open shelving with formal china display.",
        "home-office":  "Heritage traditional home office. Dark mahogany partners desk, tufted cognac leather chair, floor-to-ceiling dark wood bookshelves, brass desk lamp, Persian rug, portraits in gilded frames, stately and authoritative.",
        "bathroom":     "Heritage traditional bathroom. White marble floor with dark inlay border, pedestal tub on claw feet, polished nickel fixtures, antique vanity mirror in gilt frame, white wainscoting, monogrammed towels, refined.",
    },
    "pure-minimal-white": {
        "living-room":  "Pure minimal white living room. Single white low-profile sofa, white oak floor, no rug, one white ceramic vase with single stem, white walls and ceiling, single recessed light, floor-to-ceiling white curtains, maximum negative space, serene and quiet.",
        "bedroom":      "Pure minimal white bedroom. White platform bed, white linen duvet, white walls, white ceiling, white oak floor, single small white bedside table, white ceramic lamp, one window with white sheer, utterly restrained.",
        "dining-room":  "Pure minimal white dining room. White lacquer dining table, white molded chairs, white walls, white ceiling, single white pendant, one white ceramic centerpiece, white oak floor, pure and quiet.",
        "kitchen":      "Pure minimal white kitchen. All-white flat-front handleless cabinetry, white quartz countertops, white subway tile backsplash, integrated white appliances, white walls, minimal open shelf with single white vessel, pristine.",
        "home-office":  "Pure minimal white home office. White floating desk, white shell chair, white walls, white ceiling, single window, white ceramic pen holder, one small plant, nothing else, complete restraint.",
        "bathroom":     "Pure minimal white bathroom. All-white large format tiles floor to ceiling, wall-hung white fixtures, frameless glass shower, single white towel, white ceramic soap dish, no accessories, pure and serene.",
    },
    "biophilic-jungle": {
        "living-room":  "Biophilic jungle living room. Floor-to-ceiling tropical plants including monstera, fiddle-leaf fig, and trailing pothos, natural rattan sofa with organic cotton cushions, jute rug, living moss wall panel, bamboo side tables, dappled green natural light, alive and breathing.",
        "bedroom":      "Biophilic jungle bedroom. Large fiddle-leaf fig beside bed, trailing pothos across headboard shelf, natural linen bedding, rattan bed frame, woven seagrass rug, botanical prints on walls, hanging ferns from ceiling, green and restorative.",
        "dining-room":  "Biophilic jungle dining room. Dining table surrounded by large tropical plants, rattan dining chairs, woven placemat table setting, hanging plant cascade from ceiling, natural wood table, green botanical wallpaper on one wall.",
        "kitchen":      "Biophilic jungle kitchen. Open shelving dense with potted herbs and trailing plants, natural wood countertops, rattan pendant lights, plants on every surface and hanging from ceiling, living wall of herbs, abundant and green.",
        "home-office":  "Biophilic jungle home office. Desk surrounded on three sides by large tropical plants, living moss wall behind monitor, natural wood desk, rattan chair, hanging ferns, dappled green light, focused yet alive.",
        "bathroom":     "Biophilic jungle bathroom. Large tropical plants beside freestanding tub, hanging ferns at ceiling, natural stone tiles, wood bath accessories, living green wall, abundant botanicals, spa-like and restorative.",
    },
    "retro-mid-century": {
        "living-room":  "Retro mid-century modern living room. Iconic low-profile walnut sofa with mustard bouclé cushions, Eames-style lounge chair in cognac leather, walnut credenza, Sputnik chandelier, sunburst clock on wall, avocado and mustard color palette, warm teak floors.",
        "bedroom":      "Retro mid-century modern bedroom. Low walnut platform bed with angled legs, mustard and burnt orange bedding, walnut nightstands with cylindrical lamps, sunburst mirror, warm teak floors, bold geometric rug.",
        "dining-room":  "Retro mid-century modern dining room. Round tulip-style table, molded plastic chairs in warm colors, walnut sideboard, Sputnik pendant light, abstract geometric art, warm teak floor.",
        "kitchen":      "Retro mid-century modern kitchen. Two-tone cabinetry in cream and walnut, chrome hardware, linoleum checkerboard floor in warm tones, vintage-style appliances, open shelving with atomic-age ceramics.",
        "home-office":  "Retro mid-century modern home office. Walnut desk on angled hairpin legs, molded plywood chair, sunburst wall clock, bold geometric rug, walnut shelving with atomic-age objects, warm and optimistic.",
        "bathroom":     "Retro mid-century modern bathroom. Avocado green and white tile combination, chrome fixtures, pedestal sink with hairpin legs, geometric mirror, terrazzo floor in warm tones, retro and cheerful.",
    },
}

# ── Phase B: 5 round prompts per pole per room for each dimension ─────────────

DIMENSION_POLES = {
    "colorTemperature": {
        "low": {
            "living-room":  ["Cool-toned living room in blue-white light, grey linen sofa, slate coffee table, chrome fixtures, cool white walls, silver accessories, crisp and calm, overcast northern light.",
                             "Living room in dove grey palette, pale grey velvet sofa, white oak floors, chrome lamp, blue-grey cushions, minimal white shelving, cool and composed, soft diffused light.",
                             "Living room bathed in cool daylight, pale grey sectional, concrete side table, steel-frame shelving, cool white walls, grey ceramics, serene and cool.",
                             "Living room in cool northern exposure, white and grey palette, glass and steel coffee table, pale blue-grey linen curtains, white walls, restrained and cool.",
                             "Living room with floor-to-ceiling cool slate wall, grey upholstered sofa, white lacquer shelving, chrome lamps, icy blue-white ambient light."],
            "bedroom":      ["Cool bedroom bathed in blue-white morning light, grey linen bedding, slate upholstered headboard, chrome bedside lamps, white walls, pale blue-grey accents, crisp and calm.",
                             "Bedroom in dove grey palette, pale grey duvet, white oak bed frame, brushed silver bedside table, cool white curtains, minimal and serene, diffused light.",
                             "Cool-toned bedroom, pale grey upholstered headboard, white bedding with blue-grey throw, chrome fixtures, white walls, northern exposure light.",
                             "Bedroom in cool ice-blue palette, white and ice-blue bedding, grey platform bed, frosted glass pendant, pale walls, restrained and cool.",
                             "Bedroom with cool slate feature wall, white linen bedding, chrome articulated lamp, pale grey rug, cool blue-white ambient light."],
            "dining-room":  ["Cool dining room in blue-white light, grey lacquer table, white molded chairs, steel pendant, cool white walls, minimal grey ceramic centerpiece.",
                             "Dining room in cool palette, slate dining table, white upholstered chairs, chrome chandelier, pale walls, simple grey ceramic tableware, calm.",
                             "Cool-toned dining room, pale grey concrete table, white chairs, industrial steel pendant, cool white walls, overcast diffused light.",
                             "Dining room in grey and white, round white table, grey linen chairs, brushed steel pendant, pale grey walls, calm and cool.",
                             "Dining room with cool stone floor, white dining table, slate upholstered chairs, chrome fixtures, minimal grey table setting."],
            "kitchen":      ["Cool kitchen in grey and white palette, grey flat-front cabinetry, white quartz countertops, chrome hardware, cool white subway tile backsplash, steel appliances.",
                             "Kitchen bathed in cool blue-white light, all-white cabinetry, slate grey island, chrome fixtures, white marble countertops, crisp and clean.",
                             "Cool-toned kitchen, pale grey shaker cabinets, white countertops, brushed steel hardware, white subway tile, minimal and composed.",
                             "Kitchen with cool concrete countertops, white cabinetry, chrome pendant lights, grey grout, pale cool palette, calm and functional.",
                             "White and cool grey kitchen, handleless cabinetry, white quartz, steel appliances, cool ambient light, minimal open shelving."],
            "home-office":  ["Cool home office bathed in blue-white light, white desk, grey linen chair, chrome lamp, white walls, pale grey accessories, crisp and focused.",
                             "Home office in cool grey palette, grey concrete desk, white shelving, brushed steel lamp, cool white walls, minimal and calm.",
                             "Cool-toned home office, white floating desk, dove grey chair, chrome accessories, pale walls, northern light.",
                             "Home office in grey and white, white lacquer desk, grey upholstered chair, chrome task lamp, white walls, composed.",
                             "Home office with cool slate accent wall, white desk, grey chair, steel lamp, minimal accessories, cool and focused."],
            "bathroom":     ["Cool bathroom in blue-white light, white large-format tiles, grey grout, chrome fixtures, white vessel sink, pale grey towels, crisp and serene.",
                             "Bathroom in cool grey palette, slate tiles, white fixtures, chrome fittings, cool white ambient light, minimal and clean.",
                             "Cool-toned bathroom, pale grey stone tiles, white floating vanity, brushed chrome fixtures, minimal and serene.",
                             "Bathroom in grey and white, white subway tiles, grey floor tiles, chrome fixtures, white towels, calm and cool.",
                             "Bathroom with cool concrete walls, white freestanding tub, chrome fixtures, pale grey accessories, serene."],
        },
        "high": {
            "living-room":  ["Warm amber-toned living room in late afternoon golden light, honey oak floors, cognac leather sofa, terracotta throw cushions, brass floor lamp casting warm glow, warm white walls, richly warm.",
                             "Living room bathed in warm candlelight, caramel leather armchair, burnt sienna rug, warm walnut side tables, amber glass pendants, warm walls, cozy and rich.",
                             "Warm living room at golden hour, mustard velvet sofa, copper and brass accessories, warm oak floors, terracotta clay pots, amber-toned light flooding the room.",
                             "Living room in warm firelight tones, ochre linen sofa, warm walnut coffee table, brass candlesticks, burnt orange cushions, warm and inviting.",
                             "Living room with warm travertine feature wall, camel linen sofa, unlacquered brass lamp, warm honey floors, terracotta accents, golden afternoon light."],
            "bedroom":      ["Warm amber bedroom at golden hour, honey linen bedding, warm walnut platform bed, brass bedside lamp with warm glow, terracotta walls, warm and enveloping.",
                             "Bedroom with warm candlelight atmosphere, caramel upholstered headboard, ivory and rust bedding, brass pendant lamp, warm walls, rich and cozy.",
                             "Warm bedroom at sunset, mustard and ivory layered bedding, warm oak bed frame, copper lamp, terracotta throw, golden light flooding in.",
                             "Bedroom in warm amber palette, ochre linen duvet, warm walnut nightstand, amber glass lamp, burnt sienna accent wall, rich.",
                             "Bedroom bathed in warm firelight tones, honey linen bedding, brass wall sconces, warm wood floors, camel throw, richly warm."],
            "dining-room":  ["Warm amber dining room with candlelight, honey walnut table, caramel upholstered chairs, brass chandelier, warm terracotta walls, rich and inviting.",
                             "Dining room in golden hour light, warm oak table, cognac leather chairs, antique brass pendant, warm amber walls, amber glassware on table.",
                             "Warm dining room at dusk, mustard velvet chairs, walnut dining table, copper pendant, terracotta walls, warm candlelight atmosphere.",
                             "Dining room bathed in warm amber light, honey wood table, ochre linen chairs, brass chandelier, warm clay walls, rich and welcoming.",
                             "Dining room in warm firelight, caramel leather chairs, dark walnut table, antique brass chandelier, terracotta accent wall."],
            "kitchen":      ["Warm amber kitchen bathed in golden light, honey oak cabinetry, warm terracotta handmade tile backsplash, unlacquered brass hardware, warm pendant lighting, rich and inviting.",
                             "Kitchen in golden afternoon light, warm walnut cabinetry, butcher block countertops, antique brass fixtures, warm plaster walls, cozy and rich.",
                             "Warm kitchen at golden hour, caramel shaker cabinets, terracotta tile backsplash, brass pendant light, warm wood floors, amber light everywhere.",
                             "Kitchen with warm honey oak cabinetry, terracotta tile, unlacquered brass hardware, warm pendant lighting, rich and earthy atmosphere.",
                             "Warm amber kitchen, dark walnut cabinetry, copper fixtures, warm stone countertops, amber pendant lights, rich and enveloping."],
            "home-office":  ["Warm amber home office in afternoon golden light, walnut desk, cognac leather chair, brass desk lamp, terracotta walls, warm and focused.",
                             "Home office at golden hour, honey oak desk, caramel leather chair, antique brass lamp, warm plaster walls, rich and productive.",
                             "Warm home office in firelight tones, dark walnut desk, cognac leather chair, brass lamp, terracotta accent wall, warm and inviting.",
                             "Home office in warm amber palette, walnut floating desk, warm leather chair, brass fixture, ochre walls, enveloping and focused.",
                             "Home office bathed in warm light, caramel desk, cognac leather chair, unlacquered brass lamp, warm terracotta accent wall."],
            "bathroom":     ["Warm amber bathroom, honey travertine tiles, unlacquered brass fixtures, warm white freestanding tub, amber pendant, terracotta accents, spa-like warmth.",
                             "Bathroom in warm golden light, warm stone tiles, unlacquered brass fittings, wooden bath tray, warm linen towels, rich and relaxing.",
                             "Warm bathroom by candlelight, terracotta clay tiles, brass fixtures, warm wood accessories, amber candlelight, deeply inviting.",
                             "Bathroom with warm honey travertine stone, brass fixtures, warm linen towels, amber sconce, rich and enveloping.",
                             "Warm travertine bathroom, unlacquered brass fittings, honey wood bath mat, warm amber ambient light, deeply relaxing."],
        },
    },
    "colorSaturation": {
        "low": {
            "living-room":  ["Desaturated living room in greige tones, oatmeal linen sofa, pale greige walls, natural undyed wool rug, driftwood coffee table, muted and quiet, hushed palette.",
                             "Living room in near-monochrome greige palette, pale putty sofa, off-white walls, stone floor, undyed linen curtains, bleached wood, deeply quiet.",
                             "Muted living room, greige sectional, pale grey walls, natural sisal rug, white oak shelving, zero saturated color, serene restraint.",
                             "Living room in washed-out greige palette, pale linen furniture, white walls, bone ceramic accessories, natural fiber rug, serene.",
                             "Desaturated living room, all tones within greige to white, undyed natural textures, no color saturation anywhere, whisper quiet."],
            "bedroom":      ["Desaturated bedroom in greige palette, undyed linen bedding, pale putty walls, natural wool blanket, bleached wood floor, muted and restful.",
                             "Bedroom in near-monochrome greige, oatmeal duvet, off-white walls, pale grey headboard, zero saturated color, deeply restful.",
                             "Muted bedroom, greige and white palette, undyed linen bedding, pale walls, natural fiber rug, bleached wood, serene.",
                             "Bedroom in washed greige palette, pale linen bedding, white walls, stone ceramic accessories, natural textures, quiet and calm.",
                             "Desaturated bedroom, all greige to white tones, undyed natural materials everywhere, hushed and deeply restful."],
            "dining-room":  ["Desaturated dining room, greige linen chairs, pale putty dining table, off-white walls, natural fiber rug, undyed ceramic tableware, muted and quiet.",
                             "Dining room in near-monochrome greige, pale grey table, oatmeal chairs, white walls, natural stone tableware, hushed atmosphere.",
                             "Muted dining room, greige and white palette, undyed linen napkins, pale walls, bleached wood floor, serene.",
                             "Dining room in washed greige palette, pale furniture, white walls, natural ceramics, zero saturated color, calm restraint.",
                             "Desaturated dining room, all tones greige to white, undyed natural textures throughout, deeply quiet."],
            "kitchen":      ["Desaturated kitchen, greige flat-front cabinetry, pale putty walls, undyed stone countertops, matte fixtures, muted and calm.",
                             "Kitchen in near-monochrome greige, oatmeal cabinetry, off-white countertops, pale grey walls, natural stone, hushed atmosphere.",
                             "Muted kitchen, greige and white palette throughout, undyed stone countertops, pale cabinetry, zero color, serene restraint.",
                             "Kitchen in washed greige palette, pale greige cabinetry, white countertops, natural stone, muted fixtures, calm.",
                             "Desaturated kitchen, all greige to white tones, undyed natural materials, deeply quiet and muted."],
            "home-office":  ["Desaturated home office, greige desk surface, oatmeal linen chair, pale putty walls, undyed accessories, muted and focused.",
                             "Home office in near-monochrome greige, pale grey desk, off-white walls, natural wool rug, zero saturated color, hushed.",
                             "Muted home office, greige and white palette, undyed linen chair, pale walls, bleached wood desk, serene.",
                             "Home office in washed greige palette, pale furniture, white walls, natural textures only, quiet and calm.",
                             "Desaturated home office, all greige to white tones, undyed natural materials, deeply restrained."],
            "bathroom":     ["Desaturated bathroom, greige stone tiles, pale putty walls, undyed linen towels, matte fixtures, muted and calm.",
                             "Bathroom in near-monochrome greige, oatmeal stone tiles, off-white fixtures, pale grey grout, hushed and serene.",
                             "Muted bathroom, greige and white palette throughout, undyed stone, zero saturated color, serene restraint.",
                             "Bathroom in washed greige palette, pale natural stone, white fixtures, undyed towels, muted accessories, calm.",
                             "Desaturated bathroom, all greige to white tones, undyed natural stone, deeply quiet and hushed."],
        },
        "high": {
            "living-room":  ["Richly saturated living room, deep jewel-toned sapphire velvet sofa, emerald green walls, ruby and gold throw cushions, brass chandelier, rich Persian rug, bold and vibrant.",
                             "Living room in bold saturated jewel palette, cobalt blue velvet sofa, deep terracotta walls, emerald cushions, brass fixtures, vibrant and alive.",
                             "Saturated living room, deep plum velvet armchairs, rich jade green walls, gold accessories, bold geometric rug, vivid and confident.",
                             "Living room in richly saturated tones, sapphire velvet sofa, burnt orange walls, emerald plants, antique gold brass, bold and joyful.",
                             "Deeply saturated living room, rich jewel tones throughout, cobalt, emerald, ruby, gold, vibrant and expressive."],
            "bedroom":      ["Richly saturated bedroom, deep sapphire velvet upholstered headboard, emerald green walls, ruby and gold bedding, brass fixtures, bold and luxurious.",
                             "Bedroom in bold saturated jewel palette, cobalt blue upholstered walls, rich patterned duvet, gold accessories, vibrant.",
                             "Saturated bedroom, deep plum walls, rich jewel-toned bedding, antique gold brass fixtures, bold and expressive.",
                             "Bedroom in richly saturated palette, sapphire and emerald, gold accents throughout, deeply saturated, confident.",
                             "Deeply saturated bedroom, jewel tones throughout, cobalt, emerald, gold, vivid and luxurious."],
            "dining-room":  ["Richly saturated dining room, deep emerald green walls, gold chandelier, cobalt blue velvet chairs, ruby accent pieces, vibrant and celebratory.",
                             "Dining room in bold saturated palette, sapphire velvet chairs, deep terracotta walls, antique gold fixtures, vivid and festive.",
                             "Saturated dining room, deep plum walls, jewel-toned upholstered chairs, gold chandelier, rich and bold.",
                             "Dining room in richly saturated tones, emerald walls and gold fixtures, cobalt velvet chairs, deeply vibrant.",
                             "Deeply saturated dining room, jewel tones on walls and upholstery, gold chandelier, vivid and celebratory."],
            "kitchen":      ["Richly saturated kitchen, deep cobalt blue cabinetry, antique gold hardware, emerald handmade tile backsplash, vibrant and bold.",
                             "Kitchen in bold saturated palette, deep terracotta cabinetry, brass fixtures, rich jewel-toned handmade tiles, vibrant.",
                             "Saturated kitchen, deep plum cabinetry, antique gold hardware, rich pattern encaustic tile, bold and expressive.",
                             "Kitchen in richly saturated palette, emerald cabinetry, brass fixtures, jewel-toned backsplash, deeply vibrant.",
                             "Deeply saturated kitchen, jewel-toned cabinetry throughout, antique gold hardware, richly vibrant."],
            "home-office":  ["Richly saturated home office, deep cobalt blue walls, emerald velvet chair, antique gold desk lamp, jewel tones, bold and inspiring.",
                             "Home office in bold saturated palette, deep terracotta walls, sapphire velvet chair, brass fixtures, vivid and confident.",
                             "Saturated home office, deep plum walls, jewel-toned accessories, antique gold lamp, bold and expressive.",
                             "Home office in richly saturated palette, emerald walls and gold fixtures, cobalt accents, deeply saturated, inspiring.",
                             "Deeply saturated home office, jewel tones throughout, antique gold fixtures, vivid and bold."],
            "bathroom":     ["Richly saturated bathroom, deep cobalt blue handmade tiles, antique gold fixtures, emerald towels, jewel tones, bold and luxurious.",
                             "Bathroom in bold saturated palette, deep terracotta handmade tiles, brass fixtures, rich jewel-toned accessories, vibrant.",
                             "Saturated bathroom, deep plum encaustic tiles, gold fixtures, jewel-toned towels, bold and expressive.",
                             "Bathroom in richly saturated palette, emerald tiles and gold fixtures, cobalt accents, deeply vibrant.",
                             "Deeply saturated bathroom, jewel-toned handmade tiles throughout, antique gold fixtures, vivid and luxurious."],
        },
    },
    "density": {
        "low": {
            "living-room":  ["Radically minimal living room, single low sofa centered on bare polished floor, one ceramic vase with single stem on coffee table, nothing else, maximum negative space, serene emptiness.",
                             "Minimal living room, one armchair, one side table only, white walls, bare floor, single tall plant, purposeful emptiness, deeply calm.",
                             "Spare living room, sofa and one coffee table only, bare walls, empty floor, single window with sheer, complete visual restraint.",
                             "Living room with only essential furniture, sofa and floor lamp, no accessories whatsoever, bare walls, empty floor, meditative.",
                             "Extremely sparse living room, single sofa, single coffee table, bare walls, empty surfaces, quiet emptiness, monastic calm."],
            "bedroom":      ["Radically minimal bedroom, low bed on bare floor and nothing else, bare walls, single sheer curtain, meditative emptiness, serene.",
                             "Minimal bedroom, bed and one small nightstand only, white walls, bare floor, single plant, purposeful restraint, deeply calm.",
                             "Spare bedroom, bed only with minimal white bedding, no artwork, no accessories, bare floor, complete visual calm.",
                             "Bedroom with only essential elements, bed and lamp, bare surfaces, white walls, meditative and serene.",
                             "Extremely sparse bedroom, single bed, bare polished floor, bare walls, minimal white bedding, quiet emptiness."],
            "dining-room":  ["Radically minimal dining room, single table and two chairs only, bare white walls, bare floor, nothing else, serene emptiness.",
                             "Minimal dining room, table and chairs only, no centerpiece, white walls, bare floor, purposeful restraint.",
                             "Spare dining room, table with minimal place setting, no accessories, bare walls, complete visual calm.",
                             "Dining room with only essential furniture, bare surfaces, white walls, single pendant light, meditative.",
                             "Extremely sparse dining room, table and four chairs, nothing on surfaces, bare white walls."],
            "kitchen":      ["Radically minimal kitchen, completely clear countertops, no accessories, handleless white cabinetry, bare walls, serene emptiness.",
                             "Minimal kitchen, empty countertops, no small appliances visible, white cabinetry, white walls, purposeful restraint.",
                             "Spare kitchen, completely clear surfaces, no accessories visible, minimal handleless cabinetry, complete calm.",
                             "Kitchen with bare countertops, nothing visible except recessed fixtures, white walls, meditative.",
                             "Extremely sparse kitchen, empty surfaces, no accessories, bare white walls, quiet emptiness."],
            "home-office":  ["Radically minimal home office, single desk and chair, completely bare surface, bare white walls, meditative emptiness.",
                             "Minimal home office, desk and lamp only, no accessories, white walls, bare floor, purposeful restraint.",
                             "Spare home office, desk with only laptop, no decor whatsoever, bare walls, complete visual calm.",
                             "Home office with bare surfaces, nothing on desk, white walls, single lamp, meditative restraint.",
                             "Extremely sparse home office, desk and chair only, nothing else anywhere, bare white walls."],
            "bathroom":     ["Radically minimal bathroom, single freestanding tub, bare walls, no accessories, serene emptiness, meditative.",
                             "Minimal bathroom, tub and one white towel, bare walls, no accessories, purposeful restraint.",
                             "Spare bathroom, completely empty surfaces, no decor, white walls, single fixture, complete calm.",
                             "Bathroom with bare countertops, single soap dish, nothing else visible, white walls, meditative.",
                             "Extremely sparse bathroom, fixtures only, no accessories, bare white walls, quiet emptiness."],
        },
        "high": {
            "living-room":  ["Maximally dense living room, overflowing bookshelves floor to ceiling, layered Persian and kilim rugs, gallery wall densely hung with varied art, plants on every surface, stacked books, ceramics, objects everywhere, richly layered.",
                             "Densely layered living room, every surface covered, bookshelves overflowing with books and objects, gallery wall packed, multiple rugs layered, plants overflowing every corner, abundant and joyful.",
                             "Full maximalist living room, dense collection of objects and art, layered textiles, packed shelving, trailing plants, richly abundant and personal.",
                             "Living room packed with collections, every shelf full, every surface occupied, layered rugs, gallery walls packed, abundant greenery.",
                             "Extremely dense living room, maximum objects and furniture, overflowing collections, dense greenery, richly layered and wonderfully abundant."],
            "bedroom":      ["Maximally dense bedroom, gallery wall above bed packed with art in varied frames, layered bedding with multiple cushions and throws, shelves overflowing with objects, plants on every surface, richly layered.",
                             "Dense bedroom, every surface covered, packed bookshelves beside bed, gallery wall, multiple textile layers, plants everywhere, abundant and personal.",
                             "Full maximalist bedroom, dense collection of objects, layered bedding, packed shelving, plants overflowing every surface.",
                             "Bedroom packed with collections, every shelf full, gallery walls, layered textiles and cushions, abundant and joyful.",
                             "Extremely dense bedroom, maximum objects on every surface, overflowing shelves, gallery walls, richly layered."],
            "dining-room":  ["Maximally dense dining room, table densely set with layered tableware, gallery wall packed with art, sideboard overflowing with objects and plants, abundant.",
                             "Dense dining room, every surface covered, packed sideboard, gallery wall, layered table setting with mixed patterns, abundant and celebratory.",
                             "Full maximalist dining room, dense table setting, packed furniture and accessories, gallery walls, plants everywhere.",
                             "Dining room packed with collections, every surface full, layered table setting with varied ceramics, gallery walls, abundant.",
                             "Extremely dense dining room, maximum objects, overflowing sideboard, densely set table, richly layered."],
            "kitchen":      ["Maximally dense kitchen, countertops covered with ceramics and vessels, open shelving packed with plants and ceramics, hanging pots, herbs overflowing every surface.",
                             "Dense kitchen, every surface and shelf packed, hanging utensils and dried herbs, plants overflowing, ceramics stacked, abundant and alive.",
                             "Full maximalist kitchen, dense collection on every surface, packed open shelving, hanging pots and herbs, plants everywhere.",
                             "Kitchen packed with collections, every shelf full, countertops covered with ceramics, hanging items, abundant.",
                             "Extremely dense kitchen, maximum objects on every surface, overflowing shelves, richly layered and abundant."],
            "home-office":  ["Maximally dense home office, floor-to-ceiling bookshelves overflowing, desk covered with books and objects, gallery wall packed, plants on every surface.",
                             "Dense home office, every surface covered, overflowing bookshelves, gallery wall, layered rugs, plants everywhere, abundant and creative.",
                             "Full maximalist home office, dense collection of books and objects, packed shelving, gallery walls, plants everywhere.",
                             "Home office packed with collections, every shelf full, desk covered with books, gallery walls, abundant and inspiring.",
                             "Extremely dense home office, maximum books and objects everywhere, overflowing shelves, richly layered."],
            "bathroom":     ["Maximally dense bathroom, every surface covered with plants and ceramics, packed shelving with bottles and vessels, layered textiles, abundant.",
                             "Dense bathroom, shelves overflowing with ceramics and plants, layered towels, abundant accessories on every surface.",
                             "Full maximalist bathroom, dense collection of objects and plants, packed shelving, richly abundant.",
                             "Bathroom packed with collections, every shelf full, surfaces covered with ceramics, plants on every surface.",
                             "Extremely dense bathroom, maximum objects on every surface, overflowing shelves, richly layered."],
        },
    },
    "formality": {
        "low": {
            "living-room":  ["Casual relaxed living room, slouchy oversized linen sofa with mismatched throw cushions, blanket casually draped, bare wood floor, books stacked haphazardly, lived-in and relaxed.",
                             "Relaxed informal living room, oversized floor cushions mixed with casual linen furniture, books and mugs on coffee table, plants in mismatched pots, easy and unpretentious.",
                             "Informal living room, mix of mismatched furniture in different styles, casual throws everywhere, books casually stacked, relaxed and comfortable.",
                             "Casual lived-in living room, linen slipcovers, mismatched cushions, casual arrangement, relaxed and warm.",
                             "Relaxed informal living room, casual furniture arrangement, throws and cushions tossed, easy and comfortable, homey."],
            "bedroom":      ["Casual relaxed bedroom, duvet half-pulled back, pillows casually arranged, books on nightstand with reading glasses, lived-in warmth.",
                             "Relaxed bedroom, casual linen bedding, mix of cushions loosely arranged, bedside books and mug, informal and comfortable.",
                             "Informal bedroom, mismatched bedside lamps, casual throw draped over foot of bed, books stacked, plants in mismatched pots.",
                             "Casual bedroom, linen bedding casually made, pillows tossed, easy and relaxed, homey.",
                             "Relaxed informal bedroom, casual furniture arrangement, throws and cushions, lived-in and warm."],
            "dining-room":  ["Casual relaxed dining room, mismatched chairs around painted wood table, informal table setting with candles in bottles, casual and warm.",
                             "Relaxed dining room, mix of different chair styles, casual ceramic tableware, cloth napkins tied loosely, informal and inviting.",
                             "Informal dining room, mismatched tableware, casual flowers in jam jar, relaxed and unpretentious.",
                             "Casual dining room, different chair styles around table, informal table setting, easy and comfortable.",
                             "Relaxed informal dining room, mismatched chairs, casual setting with varied ceramics, lived-in warmth."],
            "kitchen":      ["Casual relaxed kitchen, dishes air-drying on rack, herbs in mismatched pots, cookbooks open on counter, informal and lived-in.",
                             "Relaxed kitchen, casual open shelving with mismatched ceramics, herbs in jars, informal and warm.",
                             "Informal kitchen, cookbooks stacked casually, mismatched mugs on open shelf, casual and comfortable.",
                             "Casual kitchen, lived-in countertops with herbs and jars, mismatched accessories, relaxed.",
                             "Relaxed informal kitchen, casual arrangement, mismatched items, lived-in and warm."],
            "home-office":  ["Casual relaxed home office, desk covered in papers and books, casual chair with cushion added, coffee mug, informal and productive.",
                             "Relaxed home office, books stacked casually everywhere, informal arrangement, creative and comfortable.",
                             "Informal home office, mismatched furniture, papers and books visible, casual and comfortable.",
                             "Casual home office, lived-in desk with books and notes, easy and relaxed.",
                             "Relaxed informal home office, casual arrangement, books everywhere, warm and creative."],
            "bathroom":     ["Casual relaxed bathroom, mismatched towels in different colors, personal items on counter, plants in mismatched pots, informal and warm.",
                             "Relaxed bathroom, casual accessories, bottles visible on counter, informal and comfortable.",
                             "Informal bathroom, mismatched items, casual arrangement, lived-in and warm.",
                             "Casual bathroom, personal items visible, relaxed informal arrangement, warm.",
                             "Relaxed informal bathroom, casual accessories, mismatched items, lived-in."],
        },
        "high": {
            "living-room":  ["Formally arranged living room, perfect bilateral symmetry, matching pair of sofas facing each other, identical end tables with matching lamps, perfectly centered rug, everything precisely aligned, formal and composed.",
                             "Formal living room, strict symmetrical arrangement, matching furniture pairs, perfectly placed accessories, deliberate and structured, nothing out of place.",
                             "Highly formal living room, perfect symmetry on both axes, matching pairs of everything, structured arrangement, composed and intentional.",
                             "Formal living room, strict bilateral symmetry, matching furniture and lamps, perfectly aligned, deliberate and stately.",
                             "Formally composed living room, perfect symmetry, matching pairs, structured and deeply intentional, nothing casual."],
            "bedroom":      ["Formally arranged bedroom, perfectly symmetrical bedside tables and matching lamps on both sides, perfectly made bed with hotel-quality hospital corners, deliberate and composed.",
                             "Formal bedroom, perfect bilateral symmetry on both sides of bed, matching lamps and tables, structured arrangement, composed.",
                             "Highly formal bedroom, perfect bilateral symmetry, matching pairs, precisely made bed, deliberate and intentional.",
                             "Formal bedroom, strict symmetry, matching furniture on both sides, perfectly aligned, stately.",
                             "Formally composed bedroom, perfect symmetry, matching everything, structured and deeply intentional."],
            "dining-room":  ["Formally arranged dining room, symmetrical table setting with matching chairs precisely spaced, formal floral centerpiece, deliberately composed.",
                             "Formal dining room, perfect symmetry, matching chairs precisely placed around table, formal table setting, structured and composed.",
                             "Highly formal dining room, perfect arrangement, matching chairs with precise spacing, deliberate and formal.",
                             "Formal dining room, strict symmetry, matching tableware arranged formally, perfectly placed, stately.",
                             "Formally composed dining room, perfect arrangement, matching everything, structured and intentional."],
            "kitchen":      ["Formally arranged kitchen, perfectly organized countertops, matching canisters in precise row, symmetrical arrangement, deliberate and composed.",
                             "Formal kitchen, perfect organization, matching accessories in precise symmetrical arrangement, structured.",
                             "Highly formal kitchen, perfect symmetry in all arrangements, matching items, deliberate and composed.",
                             "Formal kitchen, strict organization, perfectly arranged accessories, matching everything, composed.",
                             "Formally composed kitchen, perfect arrangement, symmetrical organization, deeply intentional."],
            "home-office":  ["Formally arranged home office, perfectly organized desk, matching accessories in symmetrical arrangement, deliberate and composed.",
                             "Formal home office, perfect organization, matching desk accessories precisely placed, structured.",
                             "Highly formal home office, perfect symmetry, matching items on desk, deliberate and composed.",
                             "Formal home office, strict organization, perfectly arranged desk, matching accessories.",
                             "Formally composed home office, perfect arrangement, symmetrical organization, deeply intentional."],
            "bathroom":     ["Formally arranged bathroom, perfectly symmetrical matching towels, matching accessories in precise placement, deliberate and composed.",
                             "Formal bathroom, perfect symmetry, matching accessories precisely placed on both sides, structured.",
                             "Highly formal bathroom, perfect arrangement, matching items symmetrically placed, deliberate.",
                             "Formal bathroom, strict symmetry, perfectly matched and folded towels and accessories.",
                             "Formally composed bathroom, perfect arrangement, symmetrical organization, nothing out of place."],
        },
    },
    "era": {
        "low": {
            "living-room":  ["Ultra-contemporary 2024 living room, low-profile modular sofa in performance fabric, floating media console, architectural floor lamp, large abstract art, clean geometry, forward-looking design.",
                             "Contemporary 2024 living room, current design vocabulary, clean-lined furniture, modern abstract art, architectural lighting, now.",
                             "2020s contemporary living room, current minimalist aesthetic, modular furniture, architectural shapes, contemporary large-scale art.",
                             "Contemporary living room 2024, current design trends, performance fabric seating, modular arrangement, clean geometry.",
                             "Ultra-modern 2024 living room, latest design vocabulary, architectural furniture, abstract contemporary art, forward-looking."],
            "bedroom":      ["Ultra-contemporary 2024 bedroom, low platform bed with integrated storage, floating nightstands, architectural pendant, abstract art, clean lines, forward-looking.",
                             "Contemporary bedroom 2024, current design, floating furniture, modern abstract art, architectural lighting.",
                             "2020s contemporary bedroom, current minimalist aesthetic, clean-lined platform bed, contemporary art.",
                             "Contemporary bedroom 2024, current trends, floating nightstands, clean geometry, modern.",
                             "Ultra-modern 2024 bedroom, latest design vocabulary, architectural furniture, contemporary art."],
            "dining-room":  ["Ultra-contemporary 2024 dining room, sculptural architectural table, molded designer chairs, architectural pendant, abstract art, current design.",
                             "Contemporary dining room 2024, current design vocabulary, sculptural furniture, modern abstract art.",
                             "2020s contemporary dining room, current aesthetic, architectural dining table, modern designer chairs.",
                             "Contemporary dining room 2024, current trends, sculptural furniture, clean geometry.",
                             "Ultra-modern 2024 dining room, latest design, sculptural table and designer chairs."],
            "kitchen":      ["Ultra-contemporary 2024 kitchen, handleless integrated cabinetry, hidden appliances, architectural island, current design.",
                             "Contemporary kitchen 2024, current design, integrated everything, architectural details, forward-looking.",
                             "2020s contemporary kitchen, current aesthetic, handleless cabinetry, modern fixtures, current.",
                             "Contemporary kitchen 2024, current trends, integrated appliances, clean geometry.",
                             "Ultra-modern 2024 kitchen, latest design vocabulary, architectural details, forward-looking."],
            "home-office":  ["Ultra-contemporary 2024 home office, floating desk, architectural designer chair, modern lamp, clean lines, forward-looking.",
                             "Contemporary home office 2024, current design, floating furniture, architectural lighting.",
                             "2020s contemporary home office, current aesthetic, clean-lined desk, modern accessories.",
                             "Contemporary home office 2024, current trends, floating desk, architectural lamp.",
                             "Ultra-modern 2024 home office, latest design vocabulary, architectural furniture."],
            "bathroom":     ["Ultra-contemporary 2024 bathroom, floating vanity, wall-hung fixtures, architectural mirror, current design.",
                             "Contemporary bathroom 2024, current design, floating fixtures, architectural details.",
                             "2020s contemporary bathroom, current aesthetic, wall-hung everything, modern fixtures.",
                             "Contemporary bathroom 2024, current trends, floating vanity, architectural mirror.",
                             "Ultra-modern 2024 bathroom, latest design vocabulary, architectural fixtures, forward-looking."],
        },
        "high": {
            "living-room":  ["Authentic 1960s living room, Eames lounge chair in cognac leather and ottoman, tulip side table, Danish teak credenza, Sputnik chandelier, sunburst clock, period-correct accessories, nostalgic.",
                             "Authentic 1950s living room, period atomic-age furniture, boomerang coffee table, vinyl floor, period lamps, authentic vintage aesthetic.",
                             "Authentic Victorian living room, ornate carved mahogany furniture, velvet upholstery, period wallpaper, formal antique aesthetic, dark and rich.",
                             "Authentic 1970s living room, macrame wall hanging, rattan furniture, shag rug, earthy tones, period-correct vintage.",
                             "Authentic 1940s living room, traditional period furniture, velvet armchairs, dark wood, period floor lamps, nostalgic and warm."],
            "bedroom":      ["Authentic 1960s bedroom, teak platform bed with angled legs, period nightstands, sunburst mirror, vintage cylindrical lamp, period-correct, nostalgic.",
                             "Authentic 1950s bedroom, period furniture, atomic-age accessories, vintage lamp, pastel palette, authentic.",
                             "Authentic Victorian bedroom, ornate carved four-poster bed, velvet bedding, period wallpaper, antique aesthetic.",
                             "Authentic 1970s bedroom, macrame headboard, earthen tones, vintage wicker lamp, period-correct.",
                             "Authentic 1940s bedroom, traditional furniture, velvet headboard, dark wood, period lamps, nostalgic."],
            "dining-room":  ["Authentic 1960s dining room, teak dining table with tapered legs, tulip chairs, period chandelier, vintage accessories, nostalgic.",
                             "Authentic 1950s dining room, period furniture, atomic-age chandelier, vintage tableware, authentic.",
                             "Authentic Victorian dining room, ornate carved dark wood table, velvet chairs, crystal chandelier, antique.",
                             "Authentic 1970s dining room, rattan chairs, earthy tones, vintage chandelier, period-correct.",
                             "Authentic 1940s dining room, traditional furniture, dark wood table, period lamp, nostalgic."],
            "kitchen":      ["Authentic 1960s kitchen, period appliances in avocado green, linoleum floor, vintage wood cabinetry, retro and nostalgic.",
                             "Authentic 1950s kitchen, vintage period appliances, period cabinetry, checkerboard floor, pastel palette, authentic.",
                             "Authentic Victorian kitchen, traditional cabinetry, period cast-iron range, dark wood, antique aesthetic.",
                             "Authentic 1970s kitchen, earthy harvest gold tile, vintage appliances, period cabinetry, authentic.",
                             "Authentic 1940s kitchen, traditional cabinetry, period appliances, vintage aesthetic, dark wood."],
            "home-office":  ["Authentic 1960s home office, teak desk with hairpin legs, period molded chair, vintage lamp, retro accessories, nostalgic.",
                             "Authentic 1950s home office, period desk, vintage lamp, atomic-age accessories, authentic.",
                             "Authentic Victorian home office, ornate dark mahogany desk, leather chair, period lamp, antique.",
                             "Authentic 1970s home office, rattan chair, earthy tones, vintage lamp, period accessories, authentic.",
                             "Authentic 1940s home office, traditional dark wood desk, leather chair, period lamp, nostalgic."],
            "bathroom":     ["Authentic 1960s bathroom, avocado green fixtures and tiles, period accessories, vintage mirror, retro and nostalgic.",
                             "Authentic 1950s bathroom, pink and black tiles, period fixtures, vintage mirror, authentic.",
                             "Authentic Victorian bathroom, clawfoot pedestal tub, period nickel fixtures, ornate mirror, antique.",
                             "Authentic 1970s bathroom, earthy harvest gold tiles, period fixtures, vintage mirror, authentic.",
                             "Authentic 1940s bathroom, traditional fixtures, period tiles, vintage aesthetic, dark and rich."],
        },
    },
    "material": {
        "low": {
            "living-room":  ["Synthetic materials living room, high-gloss lacquered surfaces, chrome and glass coffee table, polyester performance fabric sofa, acrylic side table, resin accessories, sleek and modern.",
                             "Living room with synthetic palette, high-gloss lacquer furniture, polished chrome, glass surfaces, synthetic fabrics throughout, sleek.",
                             "Modern synthetic living room, resin and acrylic furniture pieces, chrome fixtures, polyester upholstery, glass surfaces, engineered.",
                             "Living room in synthetic materials, lacquered surfaces, polished metal, glass, synthetic textiles, sleek and modern.",
                             "Synthetic material living room, high-gloss finishes throughout, chrome and glass, acrylic, engineered surfaces."],
            "bedroom":      ["Synthetic materials bedroom, high-gloss lacquered headboard, chrome bedside fixtures, polyester satin bedding, acrylic accessories, sleek.",
                             "Bedroom with synthetic palette, high-gloss furniture, polished chrome, glass surfaces, synthetic fabrics.",
                             "Modern synthetic bedroom, lacquered surfaces, chrome fixtures, polyester upholstery, glass accessories.",
                             "Bedroom in synthetic materials, lacquered headboard, polished metal, glass, synthetic textiles.",
                             "Synthetic material bedroom, high-gloss finishes, chrome and glass, acrylic accessories."],
            "dining-room":  ["Synthetic materials dining room, high-gloss lacquered table, chrome frame chairs, glass tableware, polished metal, sleek.",
                             "Dining room with synthetic palette, high-gloss furniture, polished chrome, glass tableware.",
                             "Modern synthetic dining room, lacquered surfaces, chrome fixtures, glass, engineered materials.",
                             "Dining room in synthetic materials, lacquered table, polished metal chairs, glass.",
                             "Synthetic material dining room, high-gloss finishes, chrome and glass, acrylic."],
            "kitchen":      ["Synthetic materials kitchen, high-gloss lacquer cabinetry, polished chrome hardware, engineered quartz countertops, glass backsplash, sleek.",
                             "Kitchen with synthetic palette, high-gloss cabinetry, polished chrome, engineered surfaces.",
                             "Modern synthetic kitchen, lacquered cabinetry, chrome fixtures, glass, engineered quartz.",
                             "Kitchen in synthetic materials, lacquered surfaces, polished metal, glass backsplash.",
                             "Synthetic material kitchen, high-gloss finishes, chrome hardware, engineered quartz countertops."],
            "home-office":  ["Synthetic materials home office, high-gloss lacquered desk, chrome chair base, acrylic accessories, glass surfaces, sleek.",
                             "Home office with synthetic palette, high-gloss furniture, polished chrome, glass, acrylic.",
                             "Modern synthetic home office, lacquered desk, chrome fixtures, acrylic accessories.",
                             "Home office in synthetic materials, lacquered surfaces, polished metal, glass.",
                             "Synthetic material home office, high-gloss finishes, chrome and glass, acrylic accessories."],
            "bathroom":     ["Synthetic materials bathroom, high-gloss lacquered vanity, polished chrome fixtures, engineered stone countertop, glass shower, sleek.",
                             "Bathroom with synthetic palette, high-gloss surfaces, polished chrome, engineered stone.",
                             "Modern synthetic bathroom, lacquered vanity, chrome fixtures, glass, engineered materials.",
                             "Bathroom in synthetic materials, lacquered surfaces, polished metal, glass shower.",
                             "Synthetic material bathroom, high-gloss finishes, chrome fixtures, engineered stone."],
        },
        "high": {
            "living-room":  ["Natural materials living room, raw undyed linen sofa, live-edge walnut coffee table, clay plaster walls, jute rug, rattan chair, raw stone side table, wool throw, deeply natural.",
                             "Living room in natural materials, raw wood, undyed linen, clay plaster, jute, rattan, stone, organic and earthen throughout.",
                             "Natural material living room, live-edge wood coffee table, raw linen upholstery, clay plaster walls, stone, jute, deeply organic.",
                             "Living room with natural material palette, raw wood and linen, clay walls, natural stone, jute rug, rattan chair, organic.",
                             "Deeply natural living room, unfinished live-edge wood, raw linen, clay plaster, stone, jute, organic materials throughout."],
            "bedroom":      ["Natural materials bedroom, raw undyed linen bedding, solid walnut bed frame, clay plaster walls, jute rug, wool blanket, deeply natural.",
                             "Bedroom in natural materials, undyed linen, raw wood, clay plaster, jute rug, organic and earthen.",
                             "Natural material bedroom, live-edge wood headboard, raw linen bedding, clay plaster walls, natural stone, deeply organic.",
                             "Bedroom with natural palette, raw wood and linen, clay walls, jute rug, wool throw, organic.",
                             "Deeply natural bedroom, unfinished wood, raw linen, clay plaster, wool, organic materials throughout."],
            "dining-room":  ["Natural materials dining room, live-edge wood dining table, rattan chairs, clay plaster walls, jute rug, linen napkins, natural ceramics.",
                             "Dining room in natural materials, raw wood, rattan, clay plaster, jute, organic and earthen.",
                             "Natural material dining room, live-edge wood table, raw linen, clay plaster, natural handmade ceramics.",
                             "Dining room with natural palette, raw wood and rattan, clay walls, jute rug, organic.",
                             "Deeply natural dining room, unfinished live-edge wood, rattan, clay plaster, organic materials."],
            "kitchen":      ["Natural materials kitchen, raw wood cabinetry, rough stone countertops, clay handmade tile backsplash, rattan accessories, organic and earthen.",
                             "Kitchen in natural materials, raw wood, rough stone, clay tile, rattan, organic and deeply natural.",
                             "Natural material kitchen, live-edge wood cabinetry, rough stone countertops, clay tiles, rattan, deeply organic.",
                             "Kitchen with natural palette, raw wood cabinetry, rough stone countertops, clay tile, rattan accessories.",
                             "Deeply natural kitchen, unfinished raw wood, rough stone, clay handmade tile, organic materials throughout."],
            "home-office":  ["Natural materials home office, solid walnut desk, raw undyed linen chair, clay plaster walls, jute rug, stone accessories, deeply natural.",
                             "Home office in natural materials, raw wood, undyed linen, clay plaster, jute, organic.",
                             "Natural material home office, live-edge wood desk, raw linen chair, clay plaster walls, deeply organic.",
                             "Home office with natural palette, raw wood and linen, clay walls, jute rug, organic accessories.",
                             "Deeply natural home office, unfinished wood, raw linen, clay plaster, organic materials throughout."],
            "bathroom":     ["Natural materials bathroom, raw stone tiles, wood bath accessories, clay vessel sink, jute bath mat, deeply natural.",
                             "Bathroom in natural materials, rough stone, raw wood, clay vessel, jute mat, organic and earthen.",
                             "Natural material bathroom, rough stone tiles, raw wood vanity, clay basin, jute mat, deeply organic.",
                             "Bathroom with natural palette, rough stone, raw wood, clay vessel sink, jute mat, organic.",
                             "Deeply natural bathroom, unfinished rough stone, raw wood, clay, organic materials throughout."],
        },
    },
    "texture": {
        "low": {
            "living-room":  ["Smooth surfaces living room, polished lacquer furniture, silk upholstery, polished glass coffee table, smooth plaster walls, satin drapes, sleek and refined.",
                             "Living room with smooth palette, polished surfaces everywhere, silk cushions, glass, satin curtains, sleek.",
                             "Smooth texture living room, lacquered surfaces, polished metal, glass, silk upholstery, refined.",
                             "Living room with smooth polished finishes, lacquered lacquer, silk, glass surfaces, satin drapes.",
                             "Smooth surface living room, lacquered furniture, polished metal, glass, silk upholstery, sleek."],
            "bedroom":      ["Smooth surfaces bedroom, silk bedding, high-gloss lacquered headboard, polished surfaces, satin drapes, sleek and refined.",
                             "Bedroom with smooth palette, silk duvet, polished lacquer headboard, glass, satin curtains, refined.",
                             "Smooth texture bedroom, silk bedding, lacquered furniture, polished metal, glass accessories.",
                             "Bedroom with smooth finishes, silk bedding, polished lacquer, glass surfaces, satin curtains.",
                             "Smooth surface bedroom, silk bedding, lacquered headboard, polished accessories, satin."],
            "dining-room":  ["Smooth surfaces dining room, polished lacquer table, silk upholstered chairs, glass tableware, satin napkins, sleek.",
                             "Dining room with smooth palette, polished surfaces, silk upholstered chairs, glass tableware, refined.",
                             "Smooth texture dining room, lacquered table, polished chair legs, glass tableware.",
                             "Dining room with smooth polished finishes, lacquered table, silk chairs, glass surfaces.",
                             "Smooth surface dining room, lacquered table, polished metal, glass, silk upholstery."],
            "kitchen":      ["Smooth surfaces kitchen, high-gloss lacquer cabinetry, polished quartz countertops, glass backsplash, stainless steel, sleek.",
                             "Kitchen with smooth palette, polished surfaces, high-gloss cabinetry, glass, refined.",
                             "Smooth texture kitchen, lacquered cabinetry, polished quartz countertops, glass backsplash.",
                             "Kitchen with smooth polished finishes, high-gloss lacquer, glass surfaces, stainless steel.",
                             "Smooth surface kitchen, high-gloss cabinetry, polished quartz, glass backsplash, sleek."],
            "home-office":  ["Smooth surfaces home office, lacquered desk, polished metal chair, glass accessories, silk curtains, sleek and refined.",
                             "Home office with smooth palette, polished surfaces, lacquered desk, glass, refined.",
                             "Smooth texture home office, lacquered furniture, polished metal, glass accessories.",
                             "Home office with smooth polished finishes, lacquered desk, glass, silk curtains.",
                             "Smooth surface home office, lacquered desk, polished metal, glass accessories, sleek."],
            "bathroom":     ["Smooth surfaces bathroom, polished marble tiles, high-gloss lacquer vanity, glass shower, chrome fixtures, sleek.",
                             "Bathroom with smooth palette, polished marble, high-gloss vanity, glass, chrome, refined.",
                             "Smooth texture bathroom, polished marble, lacquered vanity, glass shower.",
                             "Bathroom with smooth polished finishes, polished marble, glass shower, chrome fixtures.",
                             "Smooth surface bathroom, polished marble, high-gloss vanity, glass, chrome, sleek."],
        },
        "high": {
            "living-room":  ["Richly textured living room, chunky bouclé sofa, rough hand-troweled plaster walls, rattan armchair, shaggy wool area rug, woven wall hanging, raw wood, layered textures everywhere, deeply tactile.",
                             "Textured living room, bouclé upholstery, rough plaster walls, rattan chair, sisal rug, woven textiles, deeply tactile.",
                             "Highly textured living room, rough plaster walls, chunky knit throw, rattan furniture, woven area rug, tactile and warm.",
                             "Living room with rich texture, bouclé sofa, rough plaster walls, rattan, shaggy rug, woven wall art.",
                             "Deeply textured living room, chunky bouclé, rough hand-troweled plaster, rattan, shaggy wool, woven textiles throughout."],
            "bedroom":      ["Richly textured bedroom, bouclé upholstered headboard, chunky knit blanket, rough plaster walls, woven area rug, rattan lamp, deeply tactile.",
                             "Textured bedroom, bouclé headboard, rough plaster walls, rattan lamp, chunky knit, woven textiles, tactile.",
                             "Highly textured bedroom, rough plaster walls, chunky knit blanket, rattan lamp, woven rug, tactile and warm.",
                             "Bedroom with rich texture, bouclé headboard, rough plaster, rattan, chunky knit throw.",
                             "Deeply textured bedroom, chunky bouclé headboard, rough plaster, rattan, woven textiles throughout."],
            "dining-room":  ["Richly textured dining room, woven rattan dining chairs, rough plaster walls, woven placemats, handmade textured ceramics, tactile.",
                             "Textured dining room, rattan chairs, rough plaster walls, woven textiles, handmade ceramics, tactile.",
                             "Highly textured dining room, rough plaster walls, rattan chairs, woven table setting, tactile and warm.",
                             "Dining room with rich texture, rattan chairs, rough plaster, woven textiles, handmade ceramics.",
                             "Deeply textured dining room, rattan, rough hand-troweled plaster, woven placemats, tactile ceramics."],
            "kitchen":      ["Richly textured kitchen, handmade clay tile backsplash, rough plaster walls, rattan accessories, textured stone countertops, tactile.",
                             "Textured kitchen, handmade clay tiles, rough plaster walls, rattan, textured stone, tactile and warm.",
                             "Highly textured kitchen, handmade clay tiles, rough plaster, rattan accessories, stone countertops, tactile.",
                             "Kitchen with rich texture, handmade clay tile backsplash, rough plaster, rattan, textured stone.",
                             "Deeply textured kitchen, handmade clay tiles, rough hand-troweled plaster, rattan, textured stone."],
            "home-office":  ["Richly textured home office, bouclé chair, rough plaster walls, rattan lamp, woven area rug, chunky knit throw, deeply tactile.",
                             "Textured home office, bouclé upholstery, rough plaster walls, rattan lamp, woven rug, tactile.",
                             "Highly textured home office, rough plaster walls, bouclé chair, rattan, woven rug, tactile and warm.",
                             "Home office with rich texture, bouclé chair, rough plaster, rattan lamp, woven textiles.",
                             "Deeply textured home office, chunky bouclé, rough plaster, rattan lamp, woven textiles throughout."],
            "bathroom":     ["Richly textured bathroom, handmade clay tiles on walls, rough plaster ceiling, woven bath mat, rattan accessories, deeply tactile.",
                             "Textured bathroom, handmade clay tiles, rough plaster walls, woven bath mat, rattan, tactile and warm.",
                             "Highly textured bathroom, handmade clay tiles, rough plaster, rattan accessories, woven mat, tactile.",
                             "Bathroom with rich texture, handmade clay tile walls, rough plaster, rattan accessories, woven bath mat.",
                             "Deeply textured bathroom, handmade clay tiles, rough hand-troweled plaster, rattan, woven bath mat."],
        },
    },
    "pattern": {
        "low": {
            "living-room":  ["Solid color living room with zero pattern, all surfaces in solid tones only, no prints, no graphics, no patterns anywhere, solid colors only, calm.",
                             "Living room with zero pattern, solid color palette throughout, no prints, no patterns, purely solid tones, restrained.",
                             "Pattern-free living room, solid colors only on every surface and textile, no pattern of any kind anywhere.",
                             "Living room in pure solid colors, no pattern on any surface, fabric, or wall, completely plain.",
                             "Solid color living room, no pattern of any kind anywhere, pure solid colors throughout, completely plain."],
            "bedroom":      ["Solid color bedroom with zero pattern, all surfaces in solid tones, no patterns, no prints, solid colors only, calm.",
                             "Bedroom with zero pattern, solid color palette throughout, no prints, purely solid tones, restrained.",
                             "Pattern-free bedroom, solid colors only on every surface and textile, no pattern of any kind.",
                             "Bedroom in pure solid colors, no pattern on any surface or fabric, completely plain.",
                             "Solid color bedroom, no pattern of any kind anywhere, pure solid colors throughout."],
            "dining-room":  ["Solid color dining room with zero pattern, all surfaces in solid tones, no patterns, solid colors only, calm.",
                             "Dining room with zero pattern, solid color palette, no prints, purely solid tones.",
                             "Pattern-free dining room, solid colors only, no pattern anywhere, restrained.",
                             "Dining room in pure solid colors, no pattern on any surface, completely plain.",
                             "Solid color dining room, no pattern of any kind, pure solid colors throughout."],
            "kitchen":      ["Solid color kitchen with zero pattern, solid tile backsplash in one color, solid cabinetry, no pattern anywhere, calm.",
                             "Kitchen with zero pattern, solid color palette, no prints, purely solid tones, restrained.",
                             "Pattern-free kitchen, solid colors only on every surface, no pattern of any kind.",
                             "Kitchen in pure solid colors, no pattern on any surface, completely plain.",
                             "Solid color kitchen, no pattern of any kind, pure solid colors throughout."],
            "home-office":  ["Solid color home office with zero pattern, solid desk, solid walls, no patterns anywhere, solid colors only.",
                             "Home office with zero pattern, solid color palette, no prints, purely solid tones.",
                             "Pattern-free home office, solid colors only on every surface, no pattern of any kind.",
                             "Home office in pure solid colors, no pattern anywhere, completely plain.",
                             "Solid color home office, no pattern of any kind, pure solid colors throughout."],
            "bathroom":     ["Solid color bathroom with zero pattern, solid tiles in one color, solid accessories, no pattern anywhere.",
                             "Bathroom with zero pattern, solid color palette, no prints, purely solid tones.",
                             "Pattern-free bathroom, solid colors only on every surface, no pattern of any kind.",
                             "Bathroom in pure solid colors, no pattern on any surface, completely plain.",
                             "Solid color bathroom, no pattern of any kind, pure solid colors throughout."],
        },
        "high": {
            "living-room":  ["Boldly patterned living room, large-scale geometric rug, ikat throw cushions, bold patterned wallpaper, printed curtains, mix of patterns layered, rich and graphic.",
                             "Pattern-rich living room, bold large geometric rug, patterned wallpaper, printed cushions, graphic and vibrant.",
                             "Highly patterned living room, bold print wallpaper, patterned rug, mix of varied patterns, graphic.",
                             "Living room with bold patterns, large geometric rug, printed patterned wallpaper, pattern on every surface.",
                             "Pattern-filled living room, bold graphics on walls, rug, cushions, curtains, richly patterned throughout."],
            "bedroom":      ["Boldly patterned bedroom, large-scale floral wallpaper, patterned duvet, geometric rug, printed cushions, richly graphic.",
                             "Pattern-rich bedroom, bold print wallpaper, patterned bedding, geometric rug, graphic and vibrant.",
                             "Highly patterned bedroom, bold floral wallpaper, patterned duvet cover, mix of patterns.",
                             "Bedroom with bold patterns, large-scale wallpaper, patterned bedding, pattern on every surface.",
                             "Pattern-filled bedroom, bold graphics on walls and bedding, richly patterned throughout."],
            "dining-room":  ["Boldly patterned dining room, patterned wallpaper, geometric rug, printed chair upholstery, patterned tableware, richly graphic.",
                             "Pattern-rich dining room, bold print wallpaper, patterned chair upholstery, geometric rug, graphic.",
                             "Highly patterned dining room, bold wallpaper, patterned upholstery, mix of patterns.",
                             "Dining room with bold patterns, patterned wallpaper, patterned chairs and rug, pattern everywhere.",
                             "Pattern-filled dining room, bold graphics on walls and upholstery, richly patterned throughout."],
            "kitchen":      ["Boldly patterned kitchen, hand-painted patterned encaustic tile backsplash, patterned floor tiles, printed textiles, richly graphic.",
                             "Pattern-rich kitchen, bold patterned encaustic tile backsplash, patterned floor, graphic and vibrant.",
                             "Highly patterned kitchen, bold tile patterns on walls and floor, mix of patterns.",
                             "Kitchen with bold patterns, patterned backsplash and floor tiles, pattern everywhere.",
                             "Pattern-filled kitchen, bold encaustic tiles, patterned floor tiles, richly patterned throughout."],
            "home-office":  ["Boldly patterned home office, patterned wallpaper, geometric rug, printed chair upholstery, patterned accessories, richly graphic.",
                             "Pattern-rich home office, bold print wallpaper, patterned rug and chair upholstery, graphic.",
                             "Highly patterned home office, bold wallpaper, patterned rug, mix of patterns.",
                             "Home office with bold patterns, patterned wallpaper and rug, pattern everywhere.",
                             "Pattern-filled home office, bold graphics on walls and rug, richly patterned throughout."],
            "bathroom":     ["Boldly patterned bathroom, encaustic patterned floor tiles, patterned wallpaper, printed textiles, richly graphic.",
                             "Pattern-rich bathroom, bold patterned floor tiles, patterned wallpaper, graphic and vibrant.",
                             "Highly patterned bathroom, bold encaustic tile and wallpaper patterns, mix of patterns.",
                             "Bathroom with bold patterns, patterned floor tiles and wallpaper, pattern everywhere.",
                             "Pattern-filled bathroom, bold encaustic tiles, patterned wallpaper, richly patterned throughout."],
        },
    },
    "lineQuality": {
        "low": {
            "living-room":  ["Soft curved living room, rounded curved sofa in bouclé, organic kidney-shaped coffee table, curved barrel armchair, arch doorway, no sharp edges anywhere, soft and organic.",
                             "Living room with curved organic forms, rounded furniture, organic shapes, arch windows, soft and flowing.",
                             "Organic curved living room, curved sofa, rounded coffee table, arch architectural details, no sharp edges.",
                             "Living room in soft curves, rounded everything, organic shapes, arch doorway, flowing and gentle.",
                             "Deeply curved living room, rounded bouclé sofa, organic coffee table, arch architectural details, soft forms throughout."],
            "bedroom":      ["Soft curved bedroom, rounded upholstered headboard, oval mirror, curved armchair, arch window, no sharp edges, soft and organic.",
                             "Bedroom with curved forms, rounded upholstered headboard, organic shapes, arch architectural details, soft.",
                             "Organic curved bedroom, rounded headboard, oval mirror, arch window, no sharp edges.",
                             "Bedroom in soft curves, rounded everything, organic shapes, flowing and gentle.",
                             "Deeply curved bedroom, rounded upholstered headboard, oval mirror, arch details, soft forms."],
            "dining-room":  ["Soft curved dining room, oval dining table, curved upholstered chairs, rounded sideboard, arch doorway, no sharp edges, soft.",
                             "Dining room with curved forms, oval table, rounded upholstered chairs, arch architectural details, soft.",
                             "Organic curved dining room, oval table, curved upholstered chairs, arch doorway, no sharp edges.",
                             "Dining room in soft curves, oval table, rounded everything, organic shapes, gentle.",
                             "Deeply curved dining room, oval table, rounded upholstered chairs, arch details, soft forms."],
            "kitchen":      ["Soft curved kitchen, curved cabinetry with rounded corners, rounded island, organic forms, arch architectural details, soft.",
                             "Kitchen with curved forms, rounded cabinetry corners, curved island, organic shapes, arch details, soft.",
                             "Organic curved kitchen, rounded cabinetry, curved island, no sharp edges, arch architectural details.",
                             "Kitchen in soft curves, rounded cabinetry, curved island, organic shapes, flowing.",
                             "Deeply curved kitchen, rounded cabinetry, curved island, arch architectural details, soft forms."],
            "home-office":  ["Soft curved home office, rounded desk, curved chair, oval mirror, arch window, no sharp edges, soft and organic.",
                             "Home office with curved forms, rounded desk, curved chair, arch architectural details, soft.",
                             "Organic curved home office, rounded desk, curved chair, no sharp edges.",
                             "Home office in soft curves, rounded desk, organic shapes, arch window, gentle.",
                             "Deeply curved home office, rounded desk, curved chair, arch architectural details, soft forms."],
            "bathroom":     ["Soft curved bathroom, oval freestanding tub, curved vanity, rounded mirror, arch architectural details, no sharp edges, soft.",
                             "Bathroom with curved forms, oval freestanding tub, rounded vanity, arch details, soft and organic.",
                             "Organic curved bathroom, oval tub, rounded vanity, arch window, no sharp edges.",
                             "Bathroom in soft curves, oval tub, rounded everything, organic shapes, gentle.",
                             "Deeply curved bathroom, oval freestanding tub, rounded vanity, arch details, soft forms."],
        },
        "high": {
            "living-room":  ["Sharp angular living room, geometric modular sofa with hard right-angle edges, rectangular glass coffee table, angular shelving unit, hard 90-degree lines throughout, precise and architectural.",
                             "Living room with angular forms, hard geometric furniture, sharp edges, rectangular shapes, precise and architectural.",
                             "Angular geometric living room, hard-edge modular sofa, rectangular coffee table, sharp architectural details throughout.",
                             "Living room in sharp lines, angular everything, hard geometric shapes, precisely architectural.",
                             "Deeply angular living room, hard-edge furniture, sharp geometric shapes, precise architectural lines throughout."],
            "bedroom":      ["Sharp angular bedroom, rectangular headboard with hard edges, geometric matching nightstands, angular architectural lamp, precise details.",
                             "Bedroom with angular forms, hard geometric furniture, sharp edges, rectangular shapes, precise.",
                             "Angular geometric bedroom, hard-edge headboard, rectangular nightstands, sharp architectural details.",
                             "Bedroom in sharp lines, angular everything, hard geometric shapes, precisely architectural.",
                             "Deeply angular bedroom, hard-edge furniture, sharp geometric shapes, precise architectural lines."],
            "dining-room":  ["Sharp angular dining room, rectangular table with hard right-angle edges, angular frame chairs, geometric architectural pendant, precise.",
                             "Dining room with angular forms, hard geometric furniture, sharp edges, rectangular shapes, precise.",
                             "Angular geometric dining room, hard-edge rectangular table, angular chairs, sharp geometric pendant.",
                             "Dining room in sharp lines, angular everything, hard geometric shapes, precisely architectural.",
                             "Deeply angular dining room, hard-edge furniture, sharp geometric shapes, precise architectural lines."],
            "kitchen":      ["Sharp angular kitchen, hard geometric handleless cabinetry, rectangular island with sharp edges, angular architectural fixtures, precise.",
                             "Kitchen with angular forms, hard geometric cabinetry, sharp edges, rectangular shapes, precise.",
                             "Angular geometric kitchen, hard-edge cabinetry, rectangular island, sharp architectural fixtures.",
                             "Kitchen in sharp lines, angular everything, hard geometric cabinetry, precisely architectural.",
                             "Deeply angular kitchen, hard-edge cabinetry, sharp geometric shapes, precise architectural lines."],
            "home-office":  ["Sharp angular home office, rectangular desk with hard right-angle edges, angular chair, geometric shelving, precise architectural details.",
                             "Home office with angular forms, hard geometric furniture, sharp edges, rectangular shapes, precise.",
                             "Angular geometric home office, hard-edge rectangular desk, angular shelving, sharp architectural lamp.",
                             "Home office in sharp lines, angular everything, hard geometric shapes, precisely architectural.",
                             "Deeply angular home office, hard-edge furniture, sharp geometric shapes, precise architectural lines."],
            "bathroom":     ["Sharp angular bathroom, rectangular tub with hard right-angle edges, angular vanity, geometric mirror, precise architectural details.",
                             "Bathroom with angular forms, hard geometric fixtures, sharp edges, rectangular shapes, precise.",
                             "Angular geometric bathroom, hard-edge rectangular tub, angular vanity, sharp geometric mirror.",
                             "Bathroom in sharp lines, angular everything, hard geometric shapes, precisely architectural.",
                             "Deeply angular bathroom, hard-edge fixtures, sharp geometric shapes, precise architectural lines."],
        },
    },
    "lightPreference": {
        "low": {
            "living-room":  ["Dramatically moody living room, dim atmospheric lighting only, deep shadows, single warm pool of light from table lamp, dark walls, candles flickering, intimate and dramatic.",
                             "Dark moody living room, low lighting only, deep shadows everywhere, candles, dark atmospheric, intimate.",
                             "Moody living room, dramatic low atmospheric lighting, dark walls, single lamp pool of light, deep shadows.",
                             "Living room in near darkness, dim ambient candlelight, deep shadows, moody and dramatically atmospheric.",
                             "Deeply moody living room, near darkness with dramatic pools of light from candles only, intimate."],
            "bedroom":      ["Dramatically moody bedroom, dim atmospheric candlelight, dark walls, single lamp glow, deep shadows, intimate and romantic.",
                             "Dark moody bedroom, low lighting only, candles, dark atmosphere, intimate and dramatic.",
                             "Moody bedroom, dramatic low atmospheric lighting, dark walls, single lamp, deep shadows.",
                             "Bedroom in near darkness, dim candlelight, deep shadows, moody and dramatic.",
                             "Deeply moody bedroom, near darkness with dramatic pools of light from candles, intimate."],
            "dining-room":  ["Dramatically moody dining room, candlelit only, deep shadows, dim chandelier, dark walls, intimate and dramatic.",
                             "Dark moody dining room, low candlelight only, deep shadows, dark atmosphere, intimate.",
                             "Moody dining room, candlelit atmosphere, dark walls, deep shadows, dramatically atmospheric.",
                             "Dining room in near darkness, candles only, deep shadows, moody and dramatic.",
                             "Deeply moody dining room, near darkness, candlelit only, intimate atmosphere."],
            "kitchen":      ["Dramatically moody kitchen, under-cabinet accent lighting only, deep shadows, dark atmosphere, intimate and dramatic.",
                             "Dark moody kitchen, minimal accent lighting only, deep shadows, dark atmosphere.",
                             "Moody kitchen, dramatic low lighting, dark surfaces, deep shadows, atmospheric.",
                             "Kitchen in near darkness, minimal accent light only, deep shadows, moody.",
                             "Deeply moody kitchen, near darkness, minimal light pools only, intimate."],
            "home-office":  ["Dramatically moody home office, single desk lamp only, deep shadows everywhere, dark walls, intimate and focused.",
                             "Dark moody home office, single desk lamp, deep shadows, dark atmosphere.",
                             "Moody home office, dramatic single lamp lighting, dark walls, deep shadows.",
                             "Home office in near darkness, single lamp pool of light, deep shadows, moody.",
                             "Deeply moody home office, near darkness, single desk lamp pool of light, intimate."],
            "bathroom":     ["Dramatically moody bathroom, candles only, deep shadows, dark tiles, intimate and atmospheric.",
                             "Dark moody bathroom, candlelit only, deep shadows, dark atmosphere.",
                             "Moody bathroom, dramatic low candlelight, dark tiles, deep shadows, atmospheric.",
                             "Bathroom in near darkness, candles only, deep shadows, moody and dramatic.",
                             "Deeply moody bathroom, near darkness, candlelit only, intimate atmosphere."],
        },
        "high": {
            "living-room":  ["Brilliantly bright living room, floor-to-ceiling windows flooding with midday daylight, white walls, light oak floors, sheer curtains, abundant light everywhere, airy and radiant.",
                             "Bright light-filled living room, maximum natural daylight, white walls, large windows, radiant and airy.",
                             "Luminous living room, flooded with abundant daylight, white walls, sheer curtains, radiant.",
                             "Living room in brilliant daylight, floor-to-ceiling windows, white walls, flooded with natural light.",
                             "Radiant bright living room, maximum natural daylight, white walls, flooded with sunshine everywhere."],
            "bedroom":      ["Brilliantly bright bedroom, large windows flooding with morning light, white walls, sheer curtains, radiant and airy.",
                             "Bright light-filled bedroom, maximum natural morning light, white walls, large windows, radiant.",
                             "Luminous bedroom, flooded with abundant morning light, white walls, sheer curtains, radiant.",
                             "Bedroom in brilliant morning light, floor-to-ceiling windows, white walls, flooded with daylight.",
                             "Radiant bright bedroom, maximum natural morning light, white walls, flooded with sunshine."],
            "dining-room":  ["Brilliantly bright dining room, floor-to-ceiling windows, flooded with abundant midday light, white walls, radiant.",
                             "Bright light-filled dining room, maximum natural daylight, white walls, large windows, radiant.",
                             "Luminous dining room, flooded with abundant daylight, white walls, sheer curtains, radiant.",
                             "Dining room in brilliant daylight, floor-to-ceiling windows, white walls, daylight flooding in.",
                             "Radiant bright dining room, maximum natural daylight, white walls, flooded with sunshine."],
            "kitchen":      ["Brilliantly bright kitchen, large windows flooding with abundant daylight, white cabinetry, radiant and airy.",
                             "Bright light-filled kitchen, maximum natural daylight, white cabinetry, large windows, radiant.",
                             "Luminous kitchen, flooded with abundant daylight, white surfaces, sheer curtains, radiant.",
                             "Kitchen in brilliant daylight, large windows, white cabinetry, flooded with natural light.",
                             "Radiant bright kitchen, maximum natural daylight, white surfaces, flooded with sunshine."],
            "home-office":  ["Brilliantly bright home office, large windows flooding with abundant daylight, white walls, radiant and airy.",
                             "Bright light-filled home office, maximum natural daylight, white walls, large windows, radiant.",
                             "Luminous home office, flooded with abundant daylight, white walls, sheer curtains, radiant.",
                             "Home office in brilliant daylight, large windows, white walls, flooded with natural light.",
                             "Radiant bright home office, maximum natural daylight, white walls, flooded with sunshine."],
            "bathroom":     ["Brilliantly bright bathroom, skylights flooding with abundant daylight, white tiles, large window, radiant.",
                             "Bright light-filled bathroom, maximum natural daylight, white tiles, skylight, radiant.",
                             "Luminous bathroom, flooded with abundant daylight, white surfaces, skylight, radiant.",
                             "Bathroom in brilliant daylight, skylight and large window, white tiles, flooded with natural light.",
                             "Radiant bright bathroom, maximum natural daylight, white surfaces, flooded with sunshine."],
        },
    },
    "nature": {
        "low": {
            "living-room":  ["Urban living room with zero nature, no plants, no organic elements, pure urban aesthetic, steel glass concrete, no greenery of any kind.",
                             "Living room with absolutely no nature, no plants, purely man-made synthetic materials, urban and artificial.",
                             "Nature-free living room, no plants or organic elements anywhere, pure synthetic urban aesthetic.",
                             "Living room without any nature, no greenery, no wood, purely urban synthetic materials throughout.",
                             "Urban living room, zero plants, zero organic elements, purely city aesthetic, no nature."],
            "bedroom":      ["Urban bedroom with zero nature, no plants, pure urban aesthetic, steel glass, no greenery of any kind.",
                             "Bedroom with absolutely no nature, no plants, purely man-made materials, urban.",
                             "Nature-free bedroom, no plants or organic elements anywhere, pure synthetic urban.",
                             "Bedroom without any nature, no greenery, no wood, purely urban synthetic.",
                             "Urban bedroom, zero plants, zero organic elements, purely city aesthetic, no nature."],
            "dining-room":  ["Urban dining room with zero nature, no plants, pure urban aesthetic, no greenery of any kind.",
                             "Dining room with absolutely no nature, no plants, purely man-made, urban.",
                             "Nature-free dining room, no plants or organic elements anywhere, pure urban.",
                             "Dining room without any nature, no greenery, purely urban synthetic.",
                             "Urban dining room, zero plants, zero organic elements, city aesthetic, no nature."],
            "kitchen":      ["Urban kitchen with zero nature, no plants or herbs, pure urban aesthetic, no greenery of any kind.",
                             "Kitchen with absolutely no nature, no plants, purely man-made, urban.",
                             "Nature-free kitchen, no plants or organic elements anywhere, pure urban.",
                             "Kitchen without any nature, no greenery, no herbs, purely urban.",
                             "Urban kitchen, zero plants, zero organic elements, city aesthetic, no nature."],
            "home-office":  ["Urban home office with zero nature, no plants, pure urban aesthetic, no greenery of any kind.",
                             "Home office with absolutely no nature, no plants, purely man-made, urban.",
                             "Nature-free home office, no plants or organic elements anywhere, pure urban.",
                             "Home office without any nature, no greenery, purely urban synthetic.",
                             "Urban home office, zero plants, zero organic elements, city aesthetic, no nature."],
            "bathroom":     ["Urban bathroom with zero nature, no plants, pure urban aesthetic, no greenery of any kind.",
                             "Bathroom with absolutely no nature, no plants, purely man-made, urban.",
                             "Nature-free bathroom, no plants or organic elements anywhere, pure urban.",
                             "Bathroom without any nature, no greenery, purely urban synthetic.",
                             "Urban bathroom, zero plants, zero organic elements, city aesthetic, no nature."],
        },
        "high": {
            "living-room":  ["Living room overflowing with nature, floor-to-ceiling tropical plants, trailing vines, large indoor trees, living moss wall panel, natural light dappling through leaves, deeply alive and breathing.",
                             "Nature-filled living room, plants everywhere, large indoor trees, trailing vines, living moss wall, abundant greenery.",
                             "Living room with maximum nature, every surface has plants, large indoor trees, trailing vines, alive.",
                             "Jungle living room, overflowing tropical plants, large indoor trees, living moss wall, trailing vines, abundant.",
                             "Deeply nature-filled living room, maximum plants, large indoor trees, moss wall, trailing vines, fully alive."],
            "bedroom":      ["Bedroom overflowing with nature, large indoor tree beside bed, trailing plants, hanging ferns, plants on every surface, deeply alive.",
                             "Nature-filled bedroom, plants everywhere, large indoor tree, trailing vines, hanging ferns, abundant.",
                             "Bedroom with maximum nature, every surface has plants, large indoor tree, trailing vines, alive.",
                             "Jungle bedroom, overflowing tropical plants, large indoor tree, hanging ferns, trailing vines, abundant.",
                             "Deeply nature-filled bedroom, maximum plants, large indoor tree, hanging ferns, fully alive."],
            "dining-room":  ["Dining room overflowing with nature, plants surrounding table, trailing vines, large indoor tree, nature-immersive.",
                             "Nature-filled dining room, plants everywhere, large indoor trees, trailing vines, abundant.",
                             "Dining room with maximum nature, every surface has plants, large indoor tree, trailing vines, alive.",
                             "Jungle dining room, overflowing tropical plants, large indoor trees, trailing vines, nature-immersive.",
                             "Deeply nature-filled dining room, maximum plants, large indoor trees, trailing vines, fully alive."],
            "kitchen":      ["Kitchen overflowing with nature, herbs covering every surface, trailing plants, hanging plants, living herb wall, abundant greenery.",
                             "Nature-filled kitchen, plants everywhere, overflowing herbs, trailing vines, living herb wall, abundant.",
                             "Kitchen with maximum nature, every surface has herbs and plants, trailing vines, living wall.",
                             "Jungle kitchen, overflowing herbs and tropical plants, living wall, trailing vines, abundant.",
                             "Deeply nature-filled kitchen, maximum plants and herbs, living wall, trailing vines, fully alive."],
            "home-office":  ["Home office overflowing with nature, plants on every surface, large indoor tree, trailing vines, living moss wall, deeply alive.",
                             "Nature-filled home office, plants everywhere, large indoor tree, trailing vines, living moss wall, abundant.",
                             "Home office with maximum nature, every surface has plants, large indoor tree, trailing vines, alive.",
                             "Jungle home office, overflowing tropical plants, large indoor tree, living moss wall, trailing vines, abundant.",
                             "Deeply nature-filled home office, maximum plants, large indoor tree, moss wall, trailing vines, fully alive."],
            "bathroom":     ["Bathroom overflowing with nature, plants on every surface, hanging ferns, large indoor plants beside tub, deeply alive.",
                             "Nature-filled bathroom, plants everywhere, hanging ferns, trailing plants, abundant.",
                             "Bathroom with maximum nature, every surface has plants, hanging ferns, trailing vines, alive.",
                             "Jungle bathroom, overflowing tropical plants, hanging ferns, trailing vines, nature-immersive.",
                             "Deeply nature-filled bathroom, maximum plants, hanging ferns, trailing vines, fully alive."],
        },
    },
    "culturalInfluence": {
        "low": {
            "living-room":  ["Pure Scandinavian living room, pale birch wood, white walls, simple functional furniture, hygge aesthetic, Nordic restraint, no cultural decoration.",
                             "American minimalist living room, clean lines, functional furniture, white walls, simple, no cultural decoration whatsoever.",
                             "Pure Nordic living room, pale oak, white, simple functional pieces, Scandinavian restraint, no cultural decoration.",
                             "Western minimal living room, white walls, pale wood, simple furniture, no cultural elements of any kind.",
                             "Scandinavian living room, pure Nordic aesthetic, pale birch, white, functional simplicity, no cultural decoration."],
            "bedroom":      ["Pure Scandinavian bedroom, pale birch wood, white walls, simple functional furniture, Nordic restraint, no cultural decoration.",
                             "American minimalist bedroom, clean lines, functional furniture, white walls, simple, no cultural decoration.",
                             "Pure Nordic bedroom, pale oak, white, simple functional pieces, Scandinavian restraint.",
                             "Western minimal bedroom, white walls, pale wood, simple furniture, no cultural elements.",
                             "Scandinavian bedroom, pure Nordic aesthetic, pale birch, white, functional simplicity."],
            "dining-room":  ["Pure Scandinavian dining room, pale birch table, white chairs, Nordic restraint, simple, no cultural decoration.",
                             "American minimalist dining room, clean lines, functional furniture, white walls, simple.",
                             "Pure Nordic dining room, pale oak, white, simple functional pieces, restraint.",
                             "Western minimal dining room, white walls, pale wood, simple furniture, no cultural elements.",
                             "Scandinavian dining room, pure Nordic aesthetic, pale birch, white, simplicity."],
            "kitchen":      ["Pure Scandinavian kitchen, pale birch cabinetry, white walls, simple functional design, Nordic, no cultural decoration.",
                             "American minimalist kitchen, clean lines, functional cabinetry, white walls, simple.",
                             "Pure Nordic kitchen, pale oak cabinetry, white, simple functional design, restraint.",
                             "Western minimal kitchen, white walls, pale wood, simple cabinetry, no cultural elements.",
                             "Scandinavian kitchen, pure Nordic aesthetic, pale birch, white, functional simplicity."],
            "home-office":  ["Pure Scandinavian home office, pale birch desk, white walls, simple functional furniture, Nordic, no cultural decoration.",
                             "American minimalist home office, clean lines, functional desk, white walls, simple.",
                             "Pure Nordic home office, pale oak, white, simple functional pieces, restraint.",
                             "Western minimal home office, white walls, pale wood, simple furniture, no cultural elements.",
                             "Scandinavian home office, pure Nordic aesthetic, pale birch, white, functional simplicity."],
            "bathroom":     ["Pure Scandinavian bathroom, pale birch accessories, white tiles, simple functional fixtures, Nordic, no cultural decoration.",
                             "American minimalist bathroom, clean lines, white tiles, functional fixtures, simple.",
                             "Pure Nordic bathroom, pale oak accessories, white, simple functional design.",
                             "Western minimal bathroom, white walls, pale wood, simple fixtures, no cultural elements.",
                             "Scandinavian bathroom, pure Nordic aesthetic, pale birch, white, functional simplicity."],
        },
        "high": {
            "living-room":  ["Richly global living room, Moroccan brass lanterns, antique Persian rugs, Indian hand-embroidered cushions, Japanese ceramics, mix of global cultures, richly multicultural.",
                             "Global living room, Japanese shoji screen meets Moroccan zellige tile meets Indian block-print textiles, richly multicultural.",
                             "Culturally rich living room, Moroccan geometric patterns, Indian hand-embroidery, Japanese ceramics, global and expressive.",
                             "Global cultural living room, antique Persian rugs, Moroccan brass lanterns, Indian hand-embroidered textiles, richly eclectic.",
                             "Deeply global living room, Japanese, Moroccan, Indian cultural elements combined, richly multicultural."],
            "bedroom":      ["Richly global bedroom, Moroccan brass lantern, Indian hand-embroidered bedding, Japanese ceramics, global cultural mix, expressive.",
                             "Global bedroom, Japanese meets Indian textiles meets Moroccan brass detail, richly multicultural.",
                             "Culturally rich bedroom, Moroccan patterns, Indian hand-embroidery, Japanese ceramics, global.",
                             "Global cultural bedroom, antique Persian rug, Moroccan lantern, Indian bedding, richly eclectic.",
                             "Deeply global bedroom, Japanese, Moroccan, Indian cultural elements combined, richly multicultural."],
            "dining-room":  ["Richly global dining room, Moroccan brass lanterns, Indian hand-embroidered table runner, global ceramics, richly multicultural.",
                             "Global dining room, Japanese ceramics, Moroccan brass lanterns, Indian textiles, multicultural.",
                             "Culturally rich dining room, Moroccan patterns, Indian textiles, Japanese ceramics, global.",
                             "Global cultural dining room, Moroccan lanterns, Indian runner, global ceramic mix, eclectic.",
                             "Deeply global dining room, Japanese, Moroccan, Indian cultural elements combined."],
            "kitchen":      ["Richly global kitchen, Moroccan zellige tile backsplash, Indian ceramic spice jars, Japanese vessels, richly multicultural.",
                             "Global kitchen, Japanese ceramics, Moroccan zellige tiles, Indian textiles, multicultural.",
                             "Culturally rich kitchen, Moroccan zellige tile, Indian ceramics, Japanese vessels, global.",
                             "Global cultural kitchen, Moroccan backsplash tiles, Indian ceramic jars, global mix, eclectic.",
                             "Deeply global kitchen, Japanese, Moroccan, Indian cultural elements combined."],
            "home-office":  ["Richly global home office, Moroccan brass lantern, Indian textile wall hanging, Japanese ceramics, global cultural mix.",
                             "Global home office, Japanese meets Indian textiles meets Moroccan brass detail, multicultural.",
                             "Culturally rich home office, Moroccan lantern, Indian textiles, Japanese ceramics, global.",
                             "Global cultural home office, Moroccan lantern, Indian wall hanging, global mix, eclectic.",
                             "Deeply global home office, Japanese, Moroccan, Indian cultural elements combined."],
            "bathroom":     ["Richly global bathroom, Moroccan zellige tiles, Indian brass vessels, Japanese hinoki wooden bath accessories, richly multicultural.",
                             "Global bathroom, Japanese hinoki wood, Moroccan zellige tiles, Indian brass vessels, multicultural.",
                             "Culturally rich bathroom, Moroccan tiles, Indian brass vessels, Japanese wood accessories, global.",
                             "Global cultural bathroom, Moroccan zellige tiles, Indian brass, Japanese wood, eclectic.",
                             "Deeply global bathroom, Japanese, Moroccan, Indian cultural elements combined, richly multicultural."],
        },
    },
}

ROOMS = ["living-room", "bedroom", "dining-room", "kitchen", "home-office", "bathroom"]
STYLES_LIST = list(PHASE_A_PROMPTS.keys())
DIMS = list(DIMENSION_POLES.keys())
POLES = {"low": "0.15", "high": "0.85"}


def build_phase_a_records():
    import csv as csv_module
    records = []
    for style in STYLES_LIST:
        for room in ROOMS:
            filename = f"phase-a-{style}-{room}.webp"
            path = f"anchors/room-specific/{filename}"
            prompt = PHASE_A_PROMPTS[style][room] + " " + QUALITY_SUFFIX
            records.append({
                "phase": "A",
                "filename": filename,
                "storage_path": path,
                "style": style,
                "room": room,
                "dimension": "",
                "pole": "",
                "round": "",
                "prompt": prompt,
            })
    return records


def build_phase_b_records():
    records = []
    for dim in DIMS:
        for pole_key, pole_val in POLES.items():
            prompts = DIMENSION_POLES[dim][pole_key]
            for room in ROOMS:
                room_prompts = prompts[room]
                for i, rnd_prompt in enumerate(room_prompts, start=1):
                    filename = f"{dim}-{pole_key}-{room}-r{i}.webp"
                    path = f"comparisons/{dim}/{filename}"
                    full_prompt = rnd_prompt + " " + QUALITY_SUFFIX
                    records.append({
                        "phase": "B",
                        "filename": filename,
                        "storage_path": path,
                        "style": "",
                        "room": room,
                        "dimension": dim,
                        "pole": pole_val,
                        "round": i,
                        "prompt": full_prompt,
                    })
    return records


def write_csv(records, path):
    import csv as csv_module
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv_module.DictWriter(f, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)
    print(f"Wrote {len(records)} rows to {path}")


def generate_and_upload(record, supabase_client, dry_run=False):
    prompt = record["prompt"]
    path = record["storage_path"]

    if dry_run:
        print(f"[DRY RUN] {path}")
        print(f"  PROMPT: {prompt[:120]}...")
        return True

    try:
        output = replicate.run(
            FLUX_MODEL,
            input={
                "prompt": prompt,
                "width": IMAGE_WIDTH,
                "height": IMAGE_HEIGHT,
                "output_format": "webp",
                "output_quality": 90,
                "safety_tolerance": 2,
            }
        )
        image_url = str(output[0]) if isinstance(output, list) else str(output)
        img_bytes = requests.get(image_url, timeout=60).content

        supabase_client.storage.from_(STORAGE_BUCKET).upload(
            path=path,
            file=img_bytes,
            file_options={"content-type": "image/webp", "upsert": "true"},
        )
        print(f"  ✓ {path}")
        return True

    except Exception as e:
        print(f"  ✗ {path} — {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["a", "b", "all"], default="all")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--csv-only", action="store_true")
    args = parser.parse_args()

    phase_a = build_phase_a_records()
    phase_b = build_phase_b_records()
    all_records = phase_a + phase_b

    write_csv(all_records, "quiz_image_prompts.csv")
    print(f"Total: {len(phase_a)} Phase A + {len(phase_b)} Phase B = {len(all_records)} images")

    if args.csv_only:
        print("CSV written. Exiting (--csv-only).")
        return

    if not args.dry_run:
        if not REPLICATE_TOKEN:
            print("ERROR: REPLICATE_API_TOKEN not set")
            sys.exit(1)
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
            sys.exit(1)

    supabase = None if args.dry_run else create_client(SUPABASE_URL, SUPABASE_KEY)

    if args.phase in ("a", "all"):
        print(f"\n── Phase A: {len(phase_a)} images ──")
        for i, rec in enumerate(phase_a, 1):
            print(f"[{i}/{len(phase_a)}]", end=" ")
            generate_and_upload(rec, supabase, args.dry_run)
            if not args.dry_run:
                time.sleep(0.5)

    if args.phase in ("b", "all"):
        print(f"\n── Phase B: {len(phase_b)} images ──")
        for i, rec in enumerate(phase_b, 1):
            print(f"[{i}/{len(phase_b)}]", end=" ")
            generate_and_upload(rec, supabase, args.dry_run)
            if not args.dry_run:
                time.sleep(0.5)

    print("\nDone.")


if __name__ == "__main__":
    main()
