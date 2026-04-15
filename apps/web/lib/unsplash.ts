const UNSPLASH_API_BASE = "https://api.unsplash.com";

interface StagingJson {
  dominant_material?: string;
  room_type: string;
  color_palette?: Record<string, unknown>;
  lighting?: Record<string, unknown>;
}

interface UnsplashPhoto {
  id: string;
  urls: {
    regular: string; // ~1080px — optimal for IP-Adapter encoding at 1024px
    full: string;
  };
  width: number;
  height: number;
  likes: number;
  description: string | null;
  alt_description: string | null;
  tags?: Array<{ title: string }>;
}

// Style to quality keywords — used to score reference relevance for IP-Adapter conditioning.
// IP-Adapter extracts mood, color temperature, and material palette (NOT room layout).
const STYLE_IP_ADAPTER_KEYWORDS: Record<string, string[]> = {
  "Warm & Grounded":  ["warm", "natural", "wood", "linen", "earth", "terracotta", "amber"],
  "Bold & Eclectic":  ["colorful", "pattern", "layered", "vibrant", "eclectic", "mixed"],
  "Bright & Airy":    ["bright", "white", "light", "airy", "fresh", "coastal", "open"],
  "Pure & Calm":      ["white", "minimal", "clean", "neutral", "serene", "simple"],
  "Vintage Modern":   ["walnut", "teak", "retro", "mid-century", "warm", "vintage"],
  Industrial:         ["brick", "concrete", "steel", "dark", "urban", "raw", "loft"],
  "Modern Luxe":      ["marble", "brass", "velvet", "luxury", "rich", "dark", "dramatic"],
  Scandinavian:       ["nordic", "pale", "birch", "white", "hygge", "soft", "muted"],
  "Art Deco":         ["gold", "geometric", "glamour", "velvet", "dramatic", "art deco"],
};

function scorePhotoAsIPAdapterReference(
  photo: UnsplashPhoto,
  styleAnchor: string,
): number {
  let score = 0;
  const desc = [
    photo.description ?? "",
    photo.alt_description ?? "",
    ...(photo.tags?.map((t) => t.title) ?? []),
  ].join(" ").toLowerCase();

  // Landscape orientation — rooms are landscape; portrait refs = wrong composition
  const ratio = photo.width / Math.max(photo.height, 1);
  if (ratio >= 1.2 && ratio <= 2.3) score += 25;
  else if (ratio < 0.95) return -999; // Exclude portrait entirely

  // Resolution — 1024px is optimal for IP-Adapter; higher source = cleaner resize
  if (photo.width >= 2000) score += 20;
  else if (photo.width >= 1200) score += 14;
  else if (photo.width < 800) return -999; // Too small

  // Engagement — proxy for photographic quality
  if (photo.likes >= 500) score += 20;
  else if (photo.likes >= 100) score += 14;
  else if (photo.likes >= 30) score += 8;

  // Style keyword match — reference should exhibit target mood and palette
  const keywords = STYLE_IP_ADAPTER_KEYWORDS[styleAnchor] ?? [];
  const hits = keywords.filter((kw) => desc.includes(kw)).length;
  score += Math.min(35, hits * 8);

  return score;
}

/**
 * Fetch, score, and return the best Unsplash references for IP-Adapter conditioning.
 *
 * Fetches up to 45 photos across 3 queries, scores each on orientation, resolution,
 * engagement, and style keyword match, then returns the top `count` by score.
 *
 * Returns URLs in order of relevance score (index 0 = best).
 * The two-pass generation uses only [0] at scale 0.40.
 * All 3 are stored in rooms.unsplash_references for debugging.
 */
export async function fetchScoredStyleReferences(
  styleAnchor: string,
  count: number = 3,
): Promise<string[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    console.warn("[unsplash] UNSPLASH_ACCESS_KEY not set — skipping scored fetch");
    return [];
  }

  const queries = STYLE_QUERIES[styleAnchor] ?? ["interior design styled room"];
  const allPhotos: UnsplashPhoto[] = [];

  for (const query of queries.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        query,
        per_page: "15",
        orientation: "landscape",
        content_filter: "high",
      });
      const res = await fetch(
        `${UNSPLASH_API_BASE}/search/photos?${params.toString()}`,
        {
          headers: { Authorization: `Client-ID ${accessKey}` },
          next: { revalidate: 86400 },
        },
      );
      if (!res.ok) {
        console.error(`[unsplash] Scored query failed for "${query}": ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { results: UnsplashPhoto[] };
      allPhotos.push(...(data.results ?? []));
    } catch (e) {
      console.error(`[unsplash] Scored query error for "${query}":`, e);
    }
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  const unique = allPhotos.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Score and sort
  const scored = unique
    .map((photo) => ({ photo, score: scorePhotoAsIPAdapterReference(photo, styleAnchor) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  console.log(
    `[unsplash] ${allPhotos.length} fetched → ${unique.length} unique → ${scored.length} qualified`,
  );
  if (scored.length > 0) {
    const worstIdx = Math.min(count - 1, scored.length - 1);
    console.log(
      `[unsplash] Best score: ${scored[0].score}, worst of top ${count}: ${scored[worstIdx]?.score ?? 0}`,
    );
  }

  // Return regular-size URLs (optimal for 1024px IP-Adapter encoding)
  return scored.slice(0, count).map(({ photo }) => photo.urls.regular);
}

const STYLE_QUERIES: Record<string, string[]> = {
  "Warm & Grounded": [
    "japandi bedroom styled decor",
    "japandi living room natural wood",
  ],
  "Bold & Eclectic": [
    "maximalist living room decor layered",
    "eclectic colorful interior bold",
  ],
  "Bright & Airy": [
    "coastal bright living room styled",
    "light airy interior white natural",
  ],
  "Pure & Calm": [
    "minimalist bedroom white clean",
    "minimalist interior simple serene",
  ],
  "Vintage Modern": [
    "mid century modern room decor",
    "retro modern interior warm",
  ],
  Industrial: [
    "industrial loft apartment styled",
    "urban industrial interior exposed brick",
  ],
  "Modern Luxe": [
    "luxury contemporary interior styled",
    "modern luxury living room elegant",
  ],
  Scandinavian: [
    "scandinavian interior styled hygge",
    "nordic interior cozy natural",
  ],
  "Art Deco": [
    "art deco interior glamorous",
    "art deco living room gold geometric",
  ],
};

// Fingerprint dimension keys that sharpen the query
const HIGH_DIMENSION_MODIFIERS: Record<string, string> = {
  naturalism: "natural plants organic",
  warmth: "warm tones amber cozy",
  density: "layered objects rich",
  pattern_complexity: "textured patterned layered",
  light_quality: "bright natural light window",
  spatial_openness: "open airy spacious",
};

function buildQuery(
  styleAnchor: string,
  fingerprint: Record<string, number>,
): string[] {
  const baseQueries = STYLE_QUERIES[styleAnchor] ?? [
    "interior design styled room",
  ];

  // Find highest-scoring fingerprint dimension and append a modifier
  let topDim = "";
  let topScore = 0;
  for (const [dim, score] of Object.entries(fingerprint)) {
    if (score > topScore && HIGH_DIMENSION_MODIFIERS[dim]) {
      topScore = score;
      topDim = dim;
    }
  }

  if (topDim && topScore > 0.7 && HIGH_DIMENSION_MODIFIERS[topDim]) {
    return [
      `${baseQueries[0]} ${HIGH_DIMENSION_MODIFIERS[topDim]}`,
      baseQueries[1] ?? baseQueries[0],
    ];
  }

  return baseQueries;
}

async function unsplashFetch(
  query: string,
  count: number = 3,
): Promise<string[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(count),
    orientation: "landscape",
    content_filter: "high",
  });

  const res = await fetch(
    `${UNSPLASH_API_BASE}/search/photos?${params.toString()}`,
    {
      headers: { Authorization: `Client-ID ${key}` },
      next: { revalidate: 86400 }, // cache for 24h
    },
  );

  if (!res.ok) {
    console.error(
      `[unsplash] Search failed for "${query}": ${res.status} ${res.statusText}`,
    );
    return [];
  }

  const data = (await res.json()) as {
    results: Array<{ urls: { full: string; regular: string }; width: number; likes: number }>;
  };

  return data.results
    .filter((photo) => photo.width >= 1200 && photo.likes >= 20)
    .map((photo) => photo.urls.regular);
}

/**
 * Fetches 3-5 style-matched reference images from Unsplash.
 *
 * Called at step-3 (after quiz completes) in the background, not at render time.
 * Results are stored in rooms.unsplash_references.
 *
 * When stagingJson is provided with dominant_material and room_type fields,
 * builds a material-matched query instead of using STYLE_QUERY_MAP.
 *
 * Returns an empty array on failure — never blocks the render pipeline.
 */
export async function fetchStyleReferences(
  styleAnchor: string,
  fingerprint: Record<string, number>,
  stagingJson?: StagingJson | null,
): Promise<string[]> {
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    console.warn("[unsplash] UNSPLASH_ACCESS_KEY not set — skipping fetch");
    return [];
  }

  try {
    let queries: string[];

    if (stagingJson?.dominant_material && stagingJson?.room_type) {
      const mat = stagingJson.dominant_material.split(" ").slice(0, 2).join(" ");
      const room = stagingJson.room_type.replace(/_/g, " ");
      const anchor = styleAnchor.toLowerCase();
      const materialQuery = `${mat} ${room} ${anchor} interior`;
      console.log(`[unsplash] Material-matched query: "${materialQuery}"`);
      queries = [materialQuery];
    } else {
      queries = buildQuery(styleAnchor, fingerprint);
    }

    // Fetch from first query (3 photos), optionally supplement from second (2 photos)
    const [primary, secondary] = await Promise.all([
      unsplashFetch(queries[0]!, 3),
      queries[1] ? unsplashFetch(queries[1], 2) : Promise.resolve([]),
    ]);

    const combined = [...primary, ...secondary].slice(0, 5);
    console.log(
      `[unsplash] Fetched ${combined.length} references for "${styleAnchor}"`,
    );
    return combined;
  } catch (err) {
    console.error("[unsplash] fetchStyleReferences failed:", err);
    return [];
  }
}

/**
 * Fetches 2 material-matched reference images from Unsplash using the staging JSON.
 *
 * Query: "warm {dominant_material first 2 words} interior photography"
 * Returns an empty array on any failure — never throws.
 */
export async function fetchMaterialReferences(
  stagingJson: StagingJson | null | undefined,
): Promise<string[]> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return [];
  if (!stagingJson?.dominant_material) return [];

  try {
    const mat = stagingJson.dominant_material.split(" ").slice(0, 2).join(" ");
    const query = `warm ${mat} interior photography`;
    console.log(`[unsplash] Material reference query: "${query}"`);
    return await unsplashFetch(query, 2);
  } catch (err) {
    console.error("[unsplash] fetchMaterialReferences failed:", err);
    return [];
  }
}

/**
 * Fetches 2 mood-matched reference images from Unsplash derived from the
 * staging JSON's palette dominant color and lighting color temperature.
 *
 * Mood categories: dark+warm → dramatic, dark+cool → editorial,
 * light+warm → soft natural, light+cool → bright airy.
 *
 * Returns an empty array on any failure — never throws.
 */
export async function fetchMoodReferences(stagingJson: StagingJson): Promise<string[]> {
  try {
    const palette = stagingJson.color_palette as { dominant: string } | undefined;
    const lighting = stagingJson.lighting as { colorTemp: string } | undefined;
    const roomType = stagingJson.room_type.replace(/_/g, " ");

    const dominantLower = (palette?.dominant ?? "").toLowerCase();
    const isDark =
      dominantLower.includes("dark") ||
      dominantLower.includes("charcoal") ||
      dominantLower.includes("black") ||
      dominantLower.includes("navy") ||
      dominantLower.includes("slate") ||
      dominantLower.includes("deep");

    const colorTemp = lighting?.colorTemp ?? "";
    const isWarm =
      colorTemp.includes("2700") ||
      colorTemp.includes("3000");

    let moodQuery: string;
    if (isDark && isWarm) {
      moodQuery = `moody dark ${roomType} dramatic warm lighting interior photography`;
    } else if (isDark) {
      moodQuery = `dark ${roomType} editorial interior photography`;
    } else if (isWarm) {
      moodQuery = `warm light ${roomType} soft natural interior photography`;
    } else {
      moodQuery = `bright airy ${roomType} natural light interior photography`;
    }

    console.log(`[unsplash] Mood reference query: "${moodQuery}"`);
    return await unsplashFetch(moodQuery, 2);
  } catch {
    return [];
  }
}

/**
 * Fetches up to 5 reference images in parallel from all three sources —
 * mood (lighting/atmosphere), style, and material — with mood refs prioritized
 * first as they carry the strongest IP-Adapter signal.
 *
 * Returns an empty array on any failure — never throws.
 */
export async function fetchAllReferences(
  styleAnchor: string,
  fingerprint: Record<string, number>,
  stagingJson: StagingJson,
): Promise<string[]> {
  const [styleRefs, materialRefs, moodRefs] = await Promise.all([
    fetchStyleReferences(styleAnchor, fingerprint, stagingJson),
    fetchMaterialReferences(stagingJson),
    fetchMoodReferences(stagingJson),
  ]);

  // Mood refs first — strongest IP-Adapter signal for lighting and atmosphere
  // Style refs second, material refs last
  return [...moodRefs, ...styleRefs, ...materialRefs].slice(0, 5);
}
