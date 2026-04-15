/**
 * Curated high-quality Unsplash reference images per style.
 * These are permanent fallbacks — used when live Unsplash fetch
 * returns fewer than 3 results.
 * All images manually verified: editorial quality, correct style,
 * width > 2000px.
 *
 * To update: find images on unsplash.com, click Download,
 * copy the full-size URL from the browser.
 */

export const CURATED_STYLE_REFERENCES: Record<string, string[]> = {
  "cvwmn": [
    "https://images.unsplash.com/photo-1540518614846-7eded433c457",
    "https://images.unsplash.com/photo-1586105251261-72a756497a11",
    "https://images.unsplash.com/photo-1567016432779-094069958ea5",
    "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6",
    "https://images.unsplash.com/photo-1616594039964-ae9021a400a0",
  ],
  "cvmax": [
    "https://images.unsplash.com/photo-1615529182904-14819c35db37",
    "https://images.unsplash.com/photo-1562113530-57ba467cea38",
    "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf",
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136",
    "https://images.unsplash.com/photo-1631679706909-1844bbd07221",
  ],
  "cvscn": [
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc",
    "https://images.unsplash.com/photo-1586023492125-27b2c045efd7",
    "https://images.unsplash.com/photo-1588854337221-4cf9fa96059c",
    "https://images.unsplash.com/photo-1616137466211-f939a420be84",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c",
  ],
  "cvmcm": [
    "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6",
    "https://images.unsplash.com/photo-1598928506311-c55ded91a20c",
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511",
    "https://images.unsplash.com/photo-1600210492493-0946911123ea",
    "https://images.unsplash.com/photo-1524758631624-e2822e304c36",
  ],
  "cvind": [
    "https://images.unsplash.com/photo-1497366216548-37526070297c",
    "https://images.unsplash.com/photo-1497366754035-f200968a6e72",
    "https://images.unsplash.com/photo-1604328698692-f76ea9498e76",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64",
  ],
  "cvlux": [
    "https://images.unsplash.com/photo-1631049307264-da0ec9d70304",
    "https://images.unsplash.com/photo-1560448204-603b3fc33ddc",
    "https://images.unsplash.com/photo-1616047006789-b7af5afb8c20",
    "https://images.unsplash.com/photo-1615529328331-f8917597711f",
    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af",
  ],
  "cvcst": [
    "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2",
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
    "https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc",
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1",
  ],
  "cvboh": [
    "https://images.unsplash.com/photo-1617806118233-18e1de247200",
    "https://images.unsplash.com/photo-1522444195799-478538b28823",
    "https://images.unsplash.com/photo-1504199367641-aba8151af406",
    "https://images.unsplash.com/photo-1485955900006-10f4d324d411",
    "https://images.unsplash.com/photo-1540539234-c14a20fb7c7b",
  ],
  "cvdco": [
    "https://images.unsplash.com/photo-1618221469555-7f3ad97540d6",
    "https://images.unsplash.com/photo-1600121848594-d8644e57abab",
    "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92",
    "https://images.unsplash.com/photo-1600566752355-35792bedcfea",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb",
  ],
};

// Mood-specific references for dark/moody rooms
export const CURATED_MOOD_REFERENCES: Record<string, string[]> = {
  dark_warm: [
    "https://images.unsplash.com/photo-1540518614846-7eded433c457",
    "https://images.unsplash.com/photo-1616594039964-ae9021a400a0",
  ],
  bright_airy: [
    "https://images.unsplash.com/photo-1588854337221-4cf9fa96059c",
    "https://images.unsplash.com/photo-1616137466211-f939a420be84",
  ],
  warm_natural: [
    "https://images.unsplash.com/photo-1567016432779-094069958ea5",
    "https://images.unsplash.com/photo-1586105251261-72a756497a11",
  ],
};

export function getCuratedReferences(
  loraTrigger: string,
  moodKey?: string
): string[] {
  const styleRefs = CURATED_STYLE_REFERENCES[loraTrigger] ??
                    CURATED_STYLE_REFERENCES["cvwmn"]!;
  const moodRefs = moodKey ?
                   (CURATED_MOOD_REFERENCES[moodKey] ?? []) : [];
  // Mood first, then style, max 5 total
  return [...moodRefs, ...styleRefs].slice(0, 5);
}
