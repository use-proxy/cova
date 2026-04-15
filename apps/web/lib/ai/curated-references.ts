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
    "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6",
    "https://images.unsplash.com/photo-1631049307264-da0ec9d70304",
    "https://images.unsplash.com/photo-1560448204-603b3fc33ddc",
    "https://images.unsplash.com/photo-1616047006789-b7af5afb8c20",
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
