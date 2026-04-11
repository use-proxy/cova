/**
 * Extract structured data from a single design-chat exchange.
 *
 * Called by /api/design-chat after every Claude response. Returns:
 *   - extractedData: merged onto the currently accumulated tab state
 *   - tabComplete:    true if the AI emitted [TAB_COMPLETE]
 *   - shouldGenerateArt + artPrompt: set if the AI emitted [GENERATE_ART: …]
 *
 * The extraction itself is a lightweight Claude call — we trust the
 * conversation for semantics but return only strict JSON. On any
 * failure we return the previous state unchanged so the chat never
 * stalls.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TabId } from "@/lib/types/area2";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type LooseTabExtracted = Record<string, unknown>;

export interface ExtractionResult {
  extractedData: LooseTabExtracted;
  tabComplete: boolean;
  shouldGenerateArt: boolean;
  artPrompt: string | null;
}

const TAB_SCHEMAS: Record<TabId, string> = {
  all: `{ requestedProducts?: Array<{ id: string, sourceType: "url"|"description"|"image-upload", originalInput: string, fluxDescription: string, placementIntent: "ai-decides"|"specific", placementHint?: string, confirmedByUser: boolean }>, hasTV?: boolean, tvSizeInches?: number, audioSetup?: string, smartLighting?: boolean, hasWorkFromHome?: boolean, hasGamingSetup?: boolean, hasArtDirection?: boolean, visualDirection?: string, colorPalette?: string[], mood?: string, abstractionLevel?: string, subjectMatter?: string, throwCushionDensity?: 1|2|3|4|5, plantPresence?: string, hasCandles?: boolean, hasRug?: boolean, overallDensity?: string, moodTarget?: string, moodKeywords?: string[], personalityTags?: string[], culturalReference?: string }`,
  budget: `{ rangeMin?: number, rangeMax?: number, strategy?: "hero-piece"|"even-quality"|"category-split", hardCeiling?: boolean, splurgeCategory?: string }`,
  products: `{ requestedProducts?: Array<{ id: string, sourceType: "url"|"description"|"image-upload", originalInput: string, fluxDescription: string, placementIntent: "ai-decides"|"specific", placementHint?: string, confirmedByUser: boolean }> }`,
  art: `{ hasArtDirection?: boolean, sourceType?: string, visualDirection?: string, colorPalette?: string[], mood?: string, abstractionLevel?: "photographic"|"illustrative"|"semi-abstract"|"fully-abstract", subjectMatter?: string, frameStyle?: string, placement?: string, galleryWall?: boolean, includesPersonalPhotos?: boolean, hasBookCollection?: boolean, hasVinylCollection?: boolean, copyrightSafe?: boolean }`,
  tech: `{ hasTV?: boolean, tvSizeInches?: number, tvMountType?: string, tvPlacementWall?: string, audioSetup?: string, smartLighting?: boolean, lightingType?: string, hasWorkFromHome?: boolean, wfhSetup?: string, hasGamingSetup?: boolean, gamingSetup?: string, otherTech?: string }`,
  sensory: `{ throwCushionDensity?: 1|2|3|4|5, throwStyle?: string, plantPresence?: string, plantSpecies?: string[], hasCandles?: boolean, candleStyle?: string, hasRug?: boolean, rugSize?: string, rugStyle?: string, rugColor?: string, windowTreatments?: string, windowTreatmentColor?: string, hasDiffuser?: boolean, overallDensity?: "minimal"|"balanced"|"maximalist" }`,
  identity: `{ culturalReference?: string, culturalReferenceIntensity?: "subtle"|"moderate"|"prominent", fandoms?: string[], fandomTreatment?: string, interests?: string[], moodTarget?: string, moodKeywords?: string[], personalityTags?: string[] }`,
};

function parseArtPrompt(reply: string): string | null {
  const match = reply.match(/\[GENERATE_ART:\s*([^\]]+)\]/i);
  return match ? match[1]!.trim() : null;
}

function stripSentinels(text: string): string {
  return text
    .replace(/\[TAB_COMPLETE\]/gi, "")
    .replace(/\[GENERATE_ART:[^\]]+\]/gi, "")
    .trim();
}

export async function extractStructuredData(
  tab: TabId,
  aiReply: string,
  userMessage: string,
  currentExtracted: LooseTabExtracted,
  _urlInput?: string,
): Promise<ExtractionResult> {
  const tabComplete = /\[TAB_COMPLETE\]/i.test(aiReply);
  const artPrompt = parseArtPrompt(aiReply);
  const shouldGenerateArt = artPrompt !== null;

  // Only extract on completion — saves ~60 Claude calls per session
  if (!tabComplete) {
    return {
      extractedData: currentExtracted,
      tabComplete: false,
      shouldGenerateArt,
      artPrompt,
    };
  }

  const schema = TAB_SCHEMAS[tab];
  const extractionPrompt = `You are a silent data-extraction worker. Read the conversation exchange and return ONLY a JSON object matching this schema for the "${tab}" tab:

${schema}

Only include fields whose values were explicitly communicated in THIS exchange. Do not invent data. If nothing new was communicated, return {}. Return ONLY the JSON object. No prose, no markdown fences.

CONVERSATION:
User: ${userMessage || "(opening)"}
Assistant: ${stripSentinels(aiReply)}

CURRENTLY ACCUMULATED:
${JSON.stringify(currentExtracted)}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: extractionPrompt }],
    });
    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as LooseTabExtracted;
    return {
      extractedData: { ...currentExtracted, ...parsed },
      tabComplete,
      shouldGenerateArt,
      artPrompt,
    };
  } catch {
    return {
      extractedData: currentExtracted,
      tabComplete,
      shouldGenerateArt,
      artPrompt,
    };
  }
}
