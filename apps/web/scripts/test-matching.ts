#!/usr/bin/env tsx
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// ─── Arg parsing ─────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

// ─── Required args ────────────────────────────────────────────
const item = getArg("--item");
const image = getArg("--image");
const budgetMinStr = getArg("--budget-min");
const budgetMaxStr = getArg("--budget-max");
const room = getArg("--room");

if (!item || !image || !budgetMinStr || !budgetMaxStr || !room) {
  console.error(
    "❌ Required: --item <label> --image <url> --budget-min <n> --budget-max <n> --room <type>",
  );
  process.exit(1);
}

const budgetMin = parseFloat(budgetMinStr);
const budgetMax = parseFloat(budgetMaxStr);

if (isNaN(budgetMin) || isNaN(budgetMax)) {
  console.error("❌ --budget-min and --budget-max must be valid numbers");
  process.exit(1);
}

// ─── Test ─────────────────────────────────────────────────────
async function main() {
  console.log(`\nTesting product matching...`);
  console.log(`Item: ${item}`);
  console.log(`Budget: $${budgetMin} - $${budgetMax}`);
  console.log(`Room: ${room}\n`);

  const payload = {
    render_url: image,
    item_id: `test-${Date.now()}`,
    item_label: item,
    item_bbox: [0.3, 0.3, 0.4, 0.4] as [number, number, number, number],
    item_keep: null,
    fingerprint_vector: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    budget_range: [budgetMin, budgetMax] as [number, number],
    room_type: room,
    room_id: `test-room-${Date.now()}`,
  };

  let response: Response;
  try {
    response = await fetch("http://localhost:3001/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("❌ FAIL — Network error:", err);
    console.error("(Is dev server running on port 3001?)");
    process.exit(1);
  }

  if (response.status === 401) {
    console.error("❌ FAIL — Unauthorized (401)");
    console.error("(Must be authenticated. Login first or run: npm run dev)");
    process.exit(1);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ FAIL — HTTP ${response.status}`);
    console.error(`Response: ${text}`);
    process.exit(1);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.error("❌ FAIL — Invalid JSON response");
    process.exit(1);
  }

  const matchData = data as { products?: unknown[] };
  const products = matchData.products ?? [];

  // ─── Validate ───────────────────────────────────────────────
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // Check product count (3-5)
  checks.push({
    name: "Product count",
    pass: products.length >= 3 && products.length <= 5,
    detail: `Got ${products.length} products (expected 3-5)`,
  });

  // Check product schema
  let allProductsValid = true;
  for (const p of products) {
    const prod = p as Record<string, unknown>;
    if (
      typeof prod.name !== "string" ||
      typeof prod.retailer !== "string" ||
      typeof prod.price !== "number" ||
      typeof prod.affiliate_url !== "string" ||
      typeof prod.image_url !== "string"
    ) {
      allProductsValid = false;
      break;
    }
    if (prod.price <= 0) {
      allProductsValid = false;
      break;
    }
  }

  checks.push({
    name: "Product schema",
    pass: allProductsValid,
    detail:
      "Each product has name, retailer, price (>0), affiliate_url, image_url",
  });

  // Check all prices within budget
  let allInBudget = true;
  for (const p of products) {
    const prod = p as Record<string, unknown>;
    const price = prod.price as number;
    if (price < budgetMin || price > budgetMax) {
      allInBudget = false;
      break;
    }
  }

  checks.push({
    name: "Budget compliance",
    pass: allInBudget,
    detail: `All prices within $${budgetMin} - $${budgetMax}`,
  });

  // Check at least 1 product with similarity > 0.5
  let hasHighSimilarity = false;
  for (const p of products) {
    const prod = p as Record<string, unknown>;
    const score = prod.match_score as number | undefined;
    if (score && score > 0.5) {
      hasHighSimilarity = true;
      break;
    }
  }

  checks.push({
    name: "Match quality",
    pass: hasHighSimilarity || products.length === 0,
    detail:
      hasHighSimilarity || products.length === 0
        ? "Found product(s) with similarity > 0.5"
        : "No high-similarity matches",
  });

  // ─── Report ─────────────────────────────────────────────────
  let allPassed = true;
  for (const check of checks) {
    const icon = check.pass ? "✅" : "❌";
    console.log(`${icon} ${check.name}: ${check.detail}`);
    if (!check.pass) allPassed = false;
  }

  if (products.length > 0) {
    console.log("\nProducts found:");
    for (let i = 0; i < Math.min(5, products.length); i++) {
      const p = products[i] as Record<string, unknown>;
      const name = p.name as string;
      const price = p.price as number;
      const retailer = p.retailer as string;
      const score = (p.match_score as number | undefined) ?? 0;
      console.log(
        `  ${i + 1}. ${name} — $${price} — ${retailer} — score: ${score.toFixed(2)}`,
      );
    }
  } else {
    console.log("\nNo products returned");
  }

  console.log(`\n${allPassed ? "✅ PASS" : "❌ FAIL"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
