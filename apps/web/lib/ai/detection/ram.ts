/**
 * RAM++ (Recognize Anything Model Plus) — open-vocabulary tag extractor.
 *
 * RAM++ has no working Replicate endpoint. Returns a hardcoded indoor
 * furniture vocabulary directly — no network call needed.
 */

// KNOWN GAP: This hardcoded vocabulary replaces RAM++ automatic tag generation.
// Objects not in this list will be detected by GroundingDINO only if they
// are semantically close to a listed term. Objects missed entirely will be
// redesigned without appearing in the Keep/Remove screen (step-7c).
//
// Upgrade path (post-V1): Replace with RAM++ → GroundingDINO pipeline.
// RAM++ generates tags automatically from the image with no text input needed,
// covering 6,400+ categories. See research doc Area 2 for full pipeline spec.
//
// If users report "it redesigned my X without asking", expand this list first
// as a short-term fix, then prioritize the RAM++ upgrade.
export async function runRAMPlusPlus(_imageUrl: string): Promise<string[]> {
  return [
    "sofa",
    "couch",
    "chair",
    "armchair",
    "coffee table",
    "side table",
    "dining table",
    "dining chair",
    "bookshelf",
    "bookcase",
    "floor lamp",
    "table lamp",
    "pendant light",
    "chandelier",
    "rug",
    "carpet",
    "television",
    "tv",
    "desk",
    "office chair",
    "bed",
    "nightstand",
    "dresser",
    "wardrobe",
    "plant",
    "potted plant",
    "curtain",
    "blinds",
    "mirror",
    "artwork",
    "painting",
    "cushion",
    "pillow",
    "throw blanket",
    "ottoman",
    "bench",
    "cabinet",
    "sideboard",
    "fireplace",
    "radiator",
    "shelving",
    "console table",
    "accent chair",
    "sectional",
    "loveseat",
    "bar stool",
    "pouf",
    "daybed",
    "chaise lounge",
    "entertainment unit",
    // Extended vocabulary — common living room / bedroom items GroundingDINO
    // handles well that were missing from the original list:
    "ceiling fan",
    "built-in shelving",
    "piano",
    "exercise equipment",
    "wall sconce",
    "floor rug",
    "window blind",
    "roman shade",
    "bar cabinet",
    "wine rack",
    "media console",
    "tv stand",
    "accent table",
    "tray table",
    "rocking chair",
    "swivel chair",
    "vanity",
    "vanity mirror",
    "shoe rack",
    "coat rack",
    "umbrella stand",
  ];
}
