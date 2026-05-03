// D-022: render_cost_log.category is text at the DB layer.
// This TypeScript union is the app-layer source of truth.
// Phases extend this union without ALTER TYPE migrations.

export type CostCategory =
  | "render"
  | "refine"
  | "quiz_descriptor"
  | "hard_room_classify"
  | "art_composite"
  | "art_generate"
  | "smart_tech_recommend"
  | "lighting_recommend"
  | "lens_query"
  | "clip_rerank"
  | "verifier"
  | "verifier_light"
  | "moderation_nsfw"
  | "moderation_borderline"
  | "moderation_csam";

export const ALL_COST_CATEGORIES: ReadonlyArray<CostCategory> = [
  "render",
  "refine",
  "quiz_descriptor",
  "hard_room_classify",
  "art_composite",
  "art_generate",
  "smart_tech_recommend",
  "lighting_recommend",
  "lens_query",
  "clip_rerank",
  "verifier",
  "verifier_light",
  "moderation_nsfw",
  "moderation_borderline",
  "moderation_csam",
] as const;
