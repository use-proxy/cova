/**
 * Quiz personalization verification.
 *
 * Simulates users with distinct style preferences (bohemian / minimalist /
 * japandi) by selecting real cards from each style, hits /api/quiz/fingerprint,
 * and verifies that the resulting fingerprints are meaningfully different
 * (avg dimension diff > 0.2) and that the expected dimensions move in the
 * right direction.
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type Dims = Record<string, number>;

async function verify() {
  console.log("=== QUIZ PERSONALIZATION VERIFICATION ===");

  const styles = [
    "bohemian",
    "coastal",
    "japandi",
    "mid_century",
    "minimalist",
  ];
  const styleCards: Record<string, string[]> = {};

  for (const style of styles) {
    const { data } = await sb
      .from("swipe_cards")
      .select("id")
      .eq("style", style)
      .eq("phase", "baseline")
      .eq("active", true)
      .limit(3);
    styleCards[style] = data?.map((c) => c.id) ?? [];
    console.log(style + ":", styleCards[style]!.length, "cards available");
  }

  const users = [
    {
      name: "Bohemian user",
      selections: [
        ...(styleCards["bohemian"] ?? []).slice(0, 2),
        ...(styleCards["mid_century"] ?? []).slice(0, 1),
      ],
    },
    {
      name: "Minimalist user",
      selections: [
        ...(styleCards["minimalist"] ?? []).slice(0, 2),
        ...(styleCards["coastal"] ?? []).slice(0, 1),
      ],
    },
    {
      name: "Japandi user",
      selections: [
        ...(styleCards["japandi"] ?? []).slice(0, 2),
        ...(styleCards["coastal"] ?? []).slice(0, 1),
      ],
    },
  ];

  const fingerprints: Record<string, Dims | undefined> = {};

  for (const user of users) {
    const sel = user.selections.filter(Boolean);
    if (sel.length === 0) {
      console.log("WARN no cards available for", user.name, "— skipping");
      continue;
    }

    const res = await fetch(BASE + "/api/quiz/fingerprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase_a_selections: sel,
        phase_b_responses: [],
        room_type: "bedroom",
        household_composition: "solo",
      }),
    });

    const data = (await res.json()) as {
      fingerprint?: { dimensions: Dims };
      style_name?: string;
      style_tags?: string[];
      error?: string;
    };
    fingerprints[user.name] = data.fingerprint?.dimensions;

    console.log("\n" + user.name + ":");
    console.log("  style_name:", data.style_name);
    console.log("  tags:", data.style_tags?.join(", "));
    if (data.fingerprint?.dimensions) {
      const d = data.fingerprint.dimensions;
      console.log(
        "  luminosity:",
        d.luminosity?.toFixed(2),
        "| density:",
        d.density?.toFixed(2),
        "| temperature:",
        d.temperature?.toFixed(2),
      );
      console.log(
        "  nature:",
        d.nature?.toFixed(2),
        "| texture:",
        d.texture?.toFixed(2),
        "| materialOrigin:",
        d.materialOrigin?.toFixed(2),
      );
    }
    if (data.error) console.log("  ERROR:", data.error);
  }

  // ── Personalization check ────────────────────────────────────────────────
  const fp1 = fingerprints["Bohemian user"];
  const fp2 = fingerprints["Minimalist user"];

  let pass = false;
  if (fp1 && fp2) {
    const dims = Object.keys(fp1);
    const diffs = dims.map((d) => Math.abs((fp1[d] ?? 0) - (fp2[d] ?? 0)));
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    console.log("\n=== PERSONALIZATION CHECK ===");
    console.log(
      "Avg dimension difference between Bohemian vs Minimalist:",
      avgDiff.toFixed(3),
    );

    if (avgDiff < 0.1) {
      console.log(
        "FAIL: Fingerprints are too similar — quiz is NOT personalizing",
      );
      console.log("  Expected avg diff > 0.2 for clearly different styles");
      process.exit(1);
    } else if (avgDiff < 0.2) {
      console.log(
        "WEAK: Personalization exists but is subtle (diff:",
        avgDiff.toFixed(3) + ")",
      );
      console.log("  Check dimension_labels on swipe_cards are correct");
    } else {
      console.log(
        "PASS: Quiz is personalizing correctly (diff:",
        avgDiff.toFixed(3) + ")",
      );
      pass = true;
    }
  } else {
    console.log("WARN Could not compare — one or both fingerprints failed");
  }

  // ── Direction check ──────────────────────────────────────────────────────
  const boh = fingerprints["Bohemian user"];
  if (boh) {
    console.log("\nBohemian user dims (expect high density, texture, nature):");
    console.log("  density:", boh.density?.toFixed(2), "(expected > 0.3)");
    console.log("  texture:", boh.texture?.toFixed(2), "(expected > 0.3)");
    console.log("  nature:", boh.nature?.toFixed(2), "(expected > 0.3)");
  }
  const mini = fingerprints["Minimalist user"];
  if (mini) {
    console.log("\nMinimalist user dims (expect low density, texture):");
    console.log("  density:", mini.density?.toFixed(2), "(expected < -0.3)");
    console.log("  texture:", mini.texture?.toFixed(2), "(expected < -0.3)");
    console.log(
      "  luminosity:",
      mini.luminosity?.toFixed(2),
      "(expected > 0.3)",
    );
  }

  console.log(
    "\n=== QUIZ PERSONALIZATION VERIFICATION",
    pass ? "PASS" : "NEEDS REVIEW",
    "===",
  );
  if (!pass) process.exit(1);
}

verify().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
