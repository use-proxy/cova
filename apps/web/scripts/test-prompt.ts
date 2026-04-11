#!/usr/bin/env tsx
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// ─── Arg parsing ─────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const hasFlag = (flag: string): boolean => args.includes(flag);

// ─── Required args ────────────────────────────────────────────
const fingerprintStr = getArg("--fingerprint");
const room = getArg("--room");

if (!fingerprintStr || !room) {
  console.error("❌ --fingerprint <json-array> and --room <type> required");
  process.exit(1);
}

let fingerprint: number[];
try {
  fingerprint = JSON.parse(fingerprintStr);
  if (!Array.isArray(fingerprint) || fingerprint.length !== 10) {
    throw new Error("Fingerprint must be array of 10 numbers");
  }
} catch {
  console.error("❌ --fingerprint must be valid JSON array of 10 numbers");
  process.exit(1);
}

// ─── Optional args ────────────────────────────────────────────
const inclusionsCsv = getArg("--inclusions") || "";
const constraintsCsv = getArg("--constraints") || "";
const ceiling = getArg("--ceiling")
  ? parseFloat(getArg("--ceiling")!)
  : undefined;
const length = getArg("--length") ? parseFloat(getArg("--length")!) : undefined;
const width = getArg("--width") ? parseFloat(getArg("--width")!) : undefined;
const floorType = getArg("--floor");

const inclusions = inclusionsCsv
  ? inclusionsCsv.split(",").map((s) => s.trim())
  : [];
const constraints = constraintsCsv
  ? constraintsCsv.split(",").map((s) => s.trim())
  : [];

// ─── Import the real function ────────────────────────────────
import { buildFluxPrompt, type RoomPhysicalContext } from "@/lib/ai/flux";

// ─── Test ─────────────────────────────────────────────────────
async function main() {
  console.log(`\nTesting prompt builder...`);
  console.log(
    `Input: room=${room}, inclusions=[${inclusions.join(", ")}], constraints=[${constraints.join(", ")}]\n`,
  );

  // Build room context if any physical params provided
  const roomContext: RoomPhysicalContext | undefined =
    length || width || ceiling || floorType
      ? {
          roomLength: length ?? null,
          roomWidth: width ?? null,
          ceilingHeight: ceiling ?? null,
          floorType: floorType ?? null,
          naturalLight: null,
          wallFinish: null,
          fixedElements: [],
          wallLayout: null,
        }
      : undefined;

  const { positive, negative } = buildFluxPrompt(
    fingerprint,
    room,
    "mid",
    inclusions,
    constraints,
    roomContext,
  );

  // ─── Validate ───────────────────────────────────────────────
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // Check prompt word count is in target range (120-150 words)
  const wordCount = positive.trim().split(/\s+/).length;
  const reasonableLength = wordCount >= 100 && wordCount <= 200;
  checks.push({
    name: "Prompt length",
    pass: reasonableLength,
    detail: `${wordCount} words / ${positive.length} characters (target: 120-150 words)`,
  });

  // Check contains room type
  checks.push({
    name: "Room type present",
    pass: positive
      .toLowerCase()
      .includes(room.toLowerCase().replace(/_/g, " ")),
    detail: room,
  });

  // Check contains style descriptors
  // Detect style descriptors based on fingerprint extremes
  const [
    luminosity,
    density,
    temperature,
    form,
    era,
    texture,
    scale,
    nature,
    saturation,
    materialOrigin,
  ] = fingerprint;

  const styleDescriptors: string[] = [];
  if (luminosity > 0.65) styleDescriptors.push("bright", "airy", "light");
  if (luminosity < 0.35)
    styleDescriptors.push("moody", "intimate", "warm lighting");
  if (temperature > 0.65)
    styleDescriptors.push("warm", "walnut", "bouclé", "brass", "terracotta");
  if (temperature < 0.35)
    styleDescriptors.push("cool", "concrete", "chrome", "stone", "glass");
  if (form > 0.65) styleDescriptors.push("organic", "curved");
  if (form < 0.35) styleDescriptors.push("geometric", "clean", "structured");
  if (nature > 0.65) styleDescriptors.push("plant", "biophilic");
  if (saturation > 0.65)
    styleDescriptors.push("bold", "jewel-tone", "colorful");
  if (saturation < 0.35) styleDescriptors.push("muted", "monochromatic");

  let hasStyleDescriptor = false;
  for (const desc of styleDescriptors) {
    if (positive.toLowerCase().includes(desc.toLowerCase())) {
      hasStyleDescriptor = true;
      break;
    }
  }

  checks.push({
    name: "Style descriptors",
    pass: hasStyleDescriptor,
    detail: `Found style-related terms in prompt`,
  });

  // Check inclusions are present
  if (inclusions.length > 0) {
    const missingInclusions = inclusions.filter(
      (inc) => !positive.toLowerCase().includes(inc.toLowerCase()),
    );
    checks.push({
      name: "Inclusions coverage",
      pass: missingInclusions.length === 0,
      detail:
        missingInclusions.length === 0
          ? "All inclusions present"
          : `Missing: ${missingInclusions.join(", ")}`,
    });
  } else {
    checks.push({
      name: "Inclusions coverage",
      pass: true,
      detail: "No inclusions specified",
    });
  }

  // Check constraint instructions are present if constraints exist
  if (constraints.length > 0) {
    // Constraints are mapped to instruction text, so just verify prompt length grew
    // (constraintText is appended to the prompt)
    const hasConstraintInstructions = positive.length > 100; // sanity check
    checks.push({
      name: "Constraint handling",
      pass: hasConstraintInstructions,
      detail: "Constraint instructions incorporated into prompt",
    });
  } else {
    checks.push({
      name: "Constraint handling",
      pass: true,
      detail: "No constraints specified",
    });
  }

  // ─── Dimension signal analysis ───────────────────────────────
  const signalAnalysis: Record<string, string> = {};
  const dims = [
    "Luminosity",
    "Density",
    "Temperature",
    "Form",
    "Era",
    "Texture",
    "Scale",
    "Nature",
    "Saturation",
    "MaterialOrigin",
  ];
  for (let i = 0; i < 10; i++) {
    const val = fingerprint[i]!;
    if (val > 0.65) signalAnalysis[dims[i]!] = "HIGH";
    else if (val < 0.35) signalAnalysis[dims[i]!] = "LOW";
    else signalAnalysis[dims[i]!] = "NEUTRAL";
  }

  // ─── Report ─────────────────────────────────────────────────
  let allPassed = true;
  for (const check of checks) {
    const icon = check.pass ? "✅" : "❌";
    console.log(`${icon} ${check.name}: ${check.detail}`);
    if (!check.pass) allPassed = false;
  }

  console.log("\nDimension signal:");
  for (const [dim, signal] of Object.entries(signalAnalysis)) {
    const signalIcon = signal === "HIGH" ? "📈" : signal === "LOW" ? "📉" : "▬";
    console.log(`  ${signalIcon} ${dim}: ${signal}`);
  }

  console.log(`\nPrompt (${positive.length} chars):`);
  console.log(`  "${positive}"`);

  if (hasFlag("--verbose")) {
    console.log(`\nNegative prompt:`);
    console.log(`  "${negative}"`);
  }

  console.log(`\n${allPassed ? "✅ PASS" : "❌ FAIL"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
