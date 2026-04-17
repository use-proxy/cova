/**
 * generate-missing-anchors.ts — Generate room-specific anchor images for
 * the 4 styles used on step-2 that don't have existing images:
 *   COVASCANDINAV  → "scandinavian-light"
 *   COVABOHEMIAN   → "bohemian-layered"
 *   COVAFARMHOUSE  → "farmhouse-rustic"
 *   COVAARTDECO    → "art-deco-glam"
 *
 * Generates 4 styles × 6 rooms = 24 images via fal.ai FLUX Pro,
 * uploads to Supabase storage quiz-images bucket.
 *
 * Run: cd apps/web && npx tsx scripts/generate-missing-anchors.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, "..", ".env.local") });
config({ path: path.join(__dirname, "..", "..", "..", ".env.local") });

const FAL_KEY = process.env.FAL_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FAL_KEY) throw new Error("FAL_KEY not set");
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const QUALITY =
  "ultra realistic, professional interior photography, shot on Hasselblad medium format, perfect composition, shallow depth of field, Architectural Digest editorial, hyperdetailed, 8K resolution, cinematic lighting";

const ROOMS = [
  "living-room",
  "bedroom",
  "dining-room",
  "kitchen",
  "bathroom",
  "home-office",
] as const;

type RoomSlug = (typeof ROOMS)[number];

interface StyleSpec {
  slug: string;
  prompts: Record<RoomSlug, string>;
}

const STYLES: StyleSpec[] = [
  {
    slug: "scandinavian-light",
    prompts: {
      "living-room": `Scandinavian living room, pale ash wood floors, clean white walls, low-profile light gray linen sofa with simple silhouette, single wool throw blanket in cream, slender black metal floor lamp, natural light flooding through large uncovered windows, single ceramic vase with single branch, sheepskin on Wishbone chair, airy open minimalism with warmth, ${QUALITY}`,
      bedroom: `Scandinavian bedroom, light birch platform bed with simple white linen bedding, pale wood nightstand with single ceramic lamp, large window with sheer white curtains, white oak floors, single knitted throw in oatmeal, small potted succulent, white walls with one simple framed botanical print, serene and airy nordic calm, ${QUALITY}`,
      "dining-room": `Scandinavian dining room, round light ash dining table, four Wishbone-style chairs in natural oak, single white paper pendant lantern overhead, pale wood floors, white walls, simple white ceramic tableware, single glass vase with eucalyptus stems, large window with bright natural light, quiet nordic elegance, ${QUALITY}`,
      kitchen: `Scandinavian kitchen, white flat-front cabinets with light ash open shelving, white marble countertops, simple white ceramic dishware on display, brushed nickel fixtures, single pendant light with white shade, light oak floors, small herb pot on windowsill, abundantly bright clean atmosphere, ${QUALITY}`,
      bathroom: `Scandinavian bathroom, white subway tile walls, light oak vanity with white ceramic basin, round mirror with thin black frame, white concrete floor, single potted fern on shelf, glass shower with rainfall head, simple white towels on wooden rack, bright natural light, serene nordic spa, ${QUALITY}`,
      "home-office": `Scandinavian home office, simple white oak desk with clean lines, light gray upholstered desk chair, single desk lamp in matte white, white walls with one framed abstract print, pale wood shelving with few books and ceramic objects, large window with natural light, sheepskin on floor, calm focused nordic workspace, ${QUALITY}`,
    },
  },
  {
    slug: "bohemian-layered",
    prompts: {
      "living-room": `Bohemian living room, low floor seating with colorful kilim cushions and poufs, macrame wall hanging, layered vintage rugs in warm earth tones, rattan peacock chair, trailing pothos and string of pearls from hanging planters, warm brass Moroccan lantern, embroidered throw pillows, woven baskets, eclectic art and tapestries on walls, warm golden sunset light, ${QUALITY}`,
      bedroom: `Bohemian bedroom, low bed with colorful patterned bedding in terracotta and indigo, draped sheer canopy fabric, macrame wall hanging above headboard, vintage Persian rug, rattan nightstand with stacked books and candles, trailing pothos from shelf, warm string lights, embroidered pillows, collected treasures on surfaces, warm intimate glow, ${QUALITY}`,
      "dining-room": `Bohemian dining room, reclaimed wood table with mismatched vintage chairs each different, colorful woven table runner, hanging macrame planter with trailing ivy, Moroccan pendant lantern in brass, layered kilim and jute rugs, gallery wall of eclectic art and mirrors, ceramic plates and candles on table, warm bohemian gathering space, ${QUALITY}`,
      kitchen: `Bohemian kitchen, open wooden shelving filled with colorful mismatched ceramics and spice jars, hand-painted Moroccan tile backsplash in blue and white, butcher block countertops, hanging dried herbs and copper pots, woven baskets on top of cabinets, macrame plant hanger with trailing pothos, warm wood tones with pops of color, ${QUALITY}`,
      bathroom: `Bohemian bathroom, vintage clawfoot tub, hand-painted zellige tile in terracotta and blue, macrame wall hanging, woven basket with rolled towels, brass fixtures with patina, trailing pothos on shelf, vintage mirror with ornate frame, candles and natural soaps, warm amber light, collected eclectic sanctuary, ${QUALITY}`,
      "home-office": `Bohemian home office, vintage wooden desk with carved details, colorful kilim rug, rattan chair with embroidered cushion, macrame wall hanging, shelving with books stacked horizontally and vertically with crystals and candles between, trailing plants from high shelf, warm brass desk lamp, eclectic art prints, warm golden light, ${QUALITY}`,
    },
  },
  {
    slug: "farmhouse-rustic",
    prompts: {
      "living-room": `Modern farmhouse living room, reclaimed barn wood accent wall, deep comfortable linen sofa in natural cream, chunky knit throw blanket, shiplap walls painted white, wrought iron chandelier with candle bulbs, stone fireplace with thick wooden mantel, vintage wooden coffee table, woven jute rug, fresh wildflowers in mason jar, warm rustic comfort, ${QUALITY}`,
      bedroom: `Modern farmhouse bedroom, white shiplap walls, antique iron bed frame with white cotton bedding, reclaimed wood beam across ceiling, vintage wooden nightstand with ceramic lamp, woven cotton rug, linen curtains in natural oat, wildflowers in stoneware pitcher, distressed white dresser, warm morning light through large window, ${QUALITY}`,
      "dining-room": `Modern farmhouse dining room, long reclaimed wood trestle table, white painted Windsor chairs, wrought iron chandelier with Edison bulbs, white shiplap walls, built-in open shelving with stoneware and earthenware, fresh herb pots on windowsill, linen table runner, wildflowers in mason jar centerpiece, warm rustic hospitality, ${QUALITY}`,
      kitchen: `Modern farmhouse kitchen, white shaker cabinets with black iron hardware, farmhouse apron sink in white porcelain, open reclaimed wood shelving with stoneware and glass jars, subway tile backsplash, butcher block island with turned legs, wrought iron pendant lights, fresh herbs in terracotta pots, vintage cutting boards, warm country kitchen, ${QUALITY}`,
      bathroom: `Modern farmhouse bathroom, white beadboard walls, reclaimed wood vanity with vessel sink in white porcelain, black iron fixtures, oval mirror with distressed wood frame, white subway tile shower, vintage wire basket with rolled white towels, eucalyptus branch in stoneware vase, warm wood and white palette, ${QUALITY}`,
      "home-office": `Modern farmhouse home office, reclaimed wood desk with iron trestle legs, white shiplap wall behind, vintage wooden ladder as bookshelf with stacked books, linen curtains, black iron desk lamp, woven jute rug, stoneware mug with pencils, vintage clock on wall, large window with pastoral view, warm focused workspace, ${QUALITY}`,
    },
  },
  {
    slug: "art-deco-glam",
    prompts: {
      "living-room": `Art Deco glamour living room, deep emerald velvet curved sofa with gold trim, geometric gold and black patterned wallpaper, polished brass sunburst mirror, marble and gold coffee table, black lacquer sideboard, crystal chandelier with geometric shapes, chevron marble floor, velvet accent chairs in midnight blue, dramatically luxurious 1920s glamour, ${QUALITY}`,
      bedroom: `Art Deco glamour bedroom, upholstered velvet headboard in midnight blue with gold nailhead trim, geometric gold wallpaper accent wall, mirrored nightstands with crystal lamps, luxurious silk bedding in champagne and gold, black lacquer dresser with gold hardware, sunburst gold wall sconces, plush ivory sheepskin rug, opulent 1920s luxury, ${QUALITY}`,
      "dining-room": `Art Deco glamour dining room, round black lacquer dining table with gold inlay, velvet dining chairs in emerald and navy, dramatic geometric crystal chandelier, gold-framed beveled mirror wall, chevron marble floor, gold and glass bar cart, dramatic floor-to-ceiling curtains in deep velvet, opulent Great Gatsby elegance, ${QUALITY}`,
      kitchen: `Art Deco glamour kitchen, deep emerald green lacquer cabinets with polished brass hardware, white marble countertops with dramatic veining, geometric brass backsplash tile, crystal pendant lights, black and white chevron floor, gold faucet and fixtures, mirrored cabinet panels, sleek geometrically luxurious, ${QUALITY}`,
      bathroom: `Art Deco glamour bathroom, dramatic black and white marble chevron floor, emerald green vanity with polished brass legs, large gold-framed mirror with geometric pattern, crystal wall sconces, freestanding brass and white tub, gold fixtures throughout, geometric black and white tile shower, opulent Hollywood Regency glamour, ${QUALITY}`,
      "home-office": `Art Deco glamour home office, black lacquer desk with gold trim and tapered legs, emerald velvet desk chair, geometric gold wallpaper accent wall, polished brass desk lamp with frosted glass shade, mirrored bookshelf with gold frames, crystal paperweight, black and white marble floor, sunburst clock, dramatic 1920s sophistication, ${QUALITY}`,
    },
  },
];

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function generateImage(prompt: string): Promise<Uint8Array> {
  console.log(`[${ts()}] Calling fal.ai FLUX Pro (subscribe)...`);

  // Use the @fal-ai/client subscribe pattern for reliable queue handling
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: FAL_KEY! });

  const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
    input: {
      prompt,
      image_size: "landscape_16_9",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      safety_tolerance: "5",
    },
    logs: false,
    pollInterval: 3000,
  });

  // fal.subscribe returns { data: { images: [...] }, requestId }
  const data = (result as Record<string, unknown>).data as
    | { images?: { url: string }[] }
    | undefined;
  const imageUrl = data?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error(
      `No image URL in fal.ai response. Keys: ${Object.keys(result as object)}`,
    );
  }

  const imageResponse = await fetch(imageUrl);
  return new Uint8Array(await imageResponse.arrayBuffer());
}

async function uploadToBucket(
  bytes: Uint8Array,
  storagePath: string,
): Promise<string> {
  const { error } = await admin.storage
    .from("quiz-images")
    .upload(storagePath, bytes, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`Upload ${storagePath}: ${error.message}`);
  const { data } = admin.storage.from("quiz-images").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function main() {
  let generated = 0;
  let failed = 0;

  for (const style of STYLES) {
    for (const room of ROOMS) {
      const storagePath = `anchors/room-specific/phase-a-${style.slug}-${room}.webp`;

      // Check if already exists
      const { data: publicUrlData } = admin.storage
        .from("quiz-images")
        .getPublicUrl(storagePath);
      try {
        const headRes = await fetch(publicUrlData.publicUrl, { method: "HEAD" });
        if (headRes.ok) {
          console.log(`[${ts()}] SKIP ${storagePath} — already exists`);
          continue;
        }
      } catch {
        // doesn't exist, generate it
      }

      const prompt = style.prompts[room];
      console.log(`[${ts()}] Generating ${style.slug} / ${room}...`);
      console.log(`  Prompt: ${prompt.slice(0, 80)}...`);

      try {
        const bytes = await generateImage(prompt);
        const url = await uploadToBucket(bytes, storagePath);
        console.log(`[${ts()}] DONE ${storagePath} → ${url.slice(-60)}`);
        generated++;
      } catch (e) {
        console.error(`[${ts()}] FAIL ${storagePath}:`, e);
        failed++;
      }

      // Small delay between calls
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Generated: ${generated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${STYLES.length * ROOMS.length - generated - failed}`);
}

main().catch(console.error);
