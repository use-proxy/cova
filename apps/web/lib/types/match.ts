/**
 * Shared types for the product-match pipeline.
 * Both /api/match and downstream routes (/api/match/room-budget,
 * /api/match/complete-room) return payloads containing MatchedProduct.
 */

export type MatchLabel = "Perfect Match" | "Very Similar" | "Inspired By";

export interface MatchedProduct {
  id: string;
  name: string;
  retailer: string;
  price: number;
  affiliate_url: string;
  image_url: string;
  match_score: number;
  match_label: MatchLabel;
  fit_label?: string;
  fit_reason?: string;
  is_sale?: boolean;
  rating?: number | null;
  rating_count?: number | null;
}
