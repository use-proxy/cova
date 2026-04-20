/**
 * Cova Autonomous Self-Healing Browser QA Agent
 *
 * Uses Playwright for browser control and Claude Vision for analysis.
 * Discovers, tests, and fixes every screen in the main user flow.
 *
 * Run: cd apps/web && npx tsx tests/e2e/autonomous-healer.ts
 */

import { chromium, type Browser, type Page } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { config } from "dotenv";

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const WEB_ROOT = path.join(PROJECT_ROOT, "apps/web");

// Load env vars from .env.local (ANTHROPIC_API_KEY, test creds, etc.)
config({ path: path.resolve(WEB_ROOT, ".env.local"), override: true });
const SS_DIR = path.join(WEB_ROOT, "tests/e2e/screenshots");
const LOG_DIR = path.join(WEB_ROOT, "tests/e2e/logs");
const MAX_GLOBAL_ITERATIONS = 5;
const MAX_FIXES_PER_SCREEN = 3;
const BASE_URL = "http://localhost:3000";

// ── Frozen files — never modify these ──────────────────────────────────────
const FROZEN_FILES = [
  "apps/web/app/globals.css",
  "apps/web/app/layout.tsx",
  "apps/web/CLAUDE.md",
  "modal_pipeline/utils.py",
];

function isFrozenFile(filePath: string): boolean {
  const normalized = filePath.replace(/^\//, "").replace(/\\/g, "/");
  return (
    FROZEN_FILES.some((f) => normalized.endsWith(f)) ||
    normalized.includes("apps/mobile/")
  );
}

// ── Prioritized screen order ───────────────────────────────────────────────
const PRIORITY_SCREENS = [
  "step-2",   // Priority 1 — Anchor quiz
  "step-3",   // Priority 2 — Swipe quiz
  "step-3b",  // Priority 3 — Style confirmation
  "step-7c",  // Priority 4 — Keep/remove
  "step-8a",  // Priority 5 — Render result
] as const;

fs.mkdirSync(SS_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Shared state ────────────────────────────────────────────────────────────

let consoleLogs: string[] = [];
let pageErrors: string[] = [];
const fixHistory: Array<{ screen: string; fix: string; success: boolean }> = [];
const screenResults: Record<string, { passed: boolean; issues: string[] }> = {};

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(
  cmd: string,
  cwd = WEB_ROOT
): { ok: boolean; output: string } {
  const result = spawnSync(cmd, {
    shell: true,
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
  const output = (result.stdout || "") + (result.stderr || "");
  return { ok: result.status === 0, output };
}

// Track files modified before healer starts (pre-existing uncommitted changes)
let baselineModifiedFiles: Set<string> = new Set();

/** Snapshot the pre-existing modified files so we only track healer changes */
function snapshotBaseline(): void {
  const { output } = run("git diff --name-only", PROJECT_ROOT);
  baselineModifiedFiles = new Set(output.trim().split("\n").filter(Boolean));
  console.log(`  Baseline: ${baselineModifiedFiles.size} files already modified before healer`);
}

/** Count how many NEW files the healer has changed (beyond baseline) */
function getHealerModifiedFiles(): { count: number; files: string[] } {
  const { output } = run("git diff --name-only", PROJECT_ROOT);
  const allFiles = output.trim().split("\n").filter(Boolean);
  const healerFiles = allFiles.filter((f) => !baselineModifiedFiles.has(f));
  return { count: healerFiles.length, files: healerFiles };
}

/** Get ALL modified files (including baseline) for frozen file checks */
function getAllModifiedFiles(): string[] {
  const { output } = run("git diff --name-only", PROJECT_ROOT);
  return output.trim().split("\n").filter(Boolean);
}

/** Revert any frozen files that were accidentally modified */
function revertFrozenFiles(): void {
  const files = getAllModifiedFiles();
  for (const f of files) {
    if (isFrozenFile(f) && !baselineModifiedFiles.has(f)) {
      console.log(`  [SAFETY] Reverting frozen file: ${f}`);
      run(`git checkout HEAD -- ${f}`, PROJECT_ROOT);
    }
  }
}

/** Check if too many NEW files have been modified by the healer (>5) */
function checkModifiedFileLimit(): boolean {
  const { count, files } = getHealerModifiedFiles();
  if (count > 5) {
    console.warn(
      `\n  ⚠ WARNING: Healer modified ${count} files this session (limit 5):\n${files.map((f) => `    - ${f}`).join("\n")}`
    );
    return false;
  }
  return true;
}

async function screenshot(page: Page, name: string): Promise<string> {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const p = path.join(SS_DIR, `${Date.now()}_${sanitized}.png`);
  // Use viewport screenshot (not fullPage) to stay under Claude's 8000px limit
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "[file not found]";
  }
}

function loadAppMap(): Record<string, unknown> | null {
  const mapPath = path.join(WEB_ROOT, "tests/e2e/app-map.json");
  if (fs.existsSync(mapPath)) {
    return JSON.parse(fs.readFileSync(mapPath, "utf8"));
  }
  return null;
}

function getRelevantFiles(errorContext: string): string {
  const errorFiles = (
    errorContext.match(/apps\/web\/[^\s:'"]+\.(tsx?|css)/g) || []
  )
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);

  return errorFiles
    .map((f) => {
      const full = path.join(PROJECT_ROOT, f);
      const content = readFile(full);
      return `\n\n=== FILE: ${f} ===\n${content.substring(0, 3000)}`;
    })
    .join("");
}

// ── Claude Vision Analysis ──────────────────────────────────────────────────

interface AnalysisResult {
  passed: boolean;
  visual_description?: string;
  issues: Array<{
    severity: string;
    description: string;
    element?: string;
    root_cause?: string;
  }>;
  fixes: Array<{
    file: string;
    old_str: string;
    new_str: string;
    reason: string;
  }>;
  next_action: string;
}

async function analyzeScreen(params: {
  ssPath: string;
  screenName: string;
  expectedBehavior: string;
  logs: string[];
  errors: string[];
  url: string;
}): Promise<AnalysisResult> {
  const imageData = fs.readFileSync(params.ssPath).toString("base64");
  const relevantFiles = getRelevantFiles(params.errors.join("\n"));

  const prompt = `You are the autonomous QA agent for Cova, an AI interior design app.
This is a monorepo. All web files are under apps/web/. Page files are at apps/web/app/ROUTE/page.tsx.
IMPORTANT: All file paths in fixes MUST start with "apps/web/" (e.g. "apps/web/app/design/step-2/page.tsx").

CURRENT SCREEN: ${params.screenName}
CURRENT URL: ${params.url}
EXPECTED BEHAVIOR: ${params.expectedBehavior}

RECENT CONSOLE LOGS (last 20):
${params.logs.slice(-20).join("\n")}

PAGE ERRORS:
${params.errors.join("\n") || "none"}

${relevantFiles ? `RELEVANT SOURCE FILES:${relevantFiles}` : ""}

Analyze the screenshot. Answer:

1. VISUAL: What do you see? Describe every element.
2. CORRECTNESS: Is each element correct for this screen?
3. BROKEN: List every broken image, error message, missing element, wrong content, stuck loading state.
4. ROOT CAUSE: For each issue, what source code causes it?
5. FIXES: For each issue, provide exact str_replace edits. Use real code from source files.
6. VERDICT: PASS or FAIL?

CRITICAL RULES FOR FIXES:
- Only output str_replace edits for the SPECIFIC broken element
- Never output an edit that replaces more than 20 lines
- Never output an edit that contains 'export default'
- Never rewrite entire components or pages
- If the fix requires more than 20 lines, break it into multiple smaller edits
- If you cannot identify a small targeted fix, output fixes: [] and explain the issue in next_action instead
- Maximum ${MAX_FIXES_PER_SCREEN} fixes per response — prioritize by severity: critical first, then major, ignore minor
- NEVER modify these frozen files: ${FROZEN_FILES.join(", ")}, or anything in apps/mobile/

Output valid JSON only:
{
  "passed": boolean,
  "visual_description": "what you see",
  "issues": [{"severity": "critical|major|minor", "description": "...", "element": "...", "root_cause": "..."}],
  "fixes": [{"file": "relative/path", "old_str": "exact string to find", "new_str": "replacement", "reason": "why"}],
  "next_action": "what to do next"
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: imageData,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response — handle various Claude output formats
    const jsonMatch = text.match(/\{[\s\S]+\}/);
    if (jsonMatch) {
      const raw = jsonMatch[0].replace(/```json|```/g, "").trim();
      // Try parsing directly first
      try {
        return JSON.parse(raw);
      } catch {
        // Fix common JSON issues: unescaped newlines in strings, bad escapes
        try {
          const sanitized = raw
            .replace(/[\x00-\x1f]/g, (ch: string) =>
              ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : ""
            );
          return JSON.parse(sanitized);
        } catch (e2) {
          console.error(`  Claude API error: ${e2 instanceof Error ? e2.message : String(e2)}`);
          // Last resort — try to extract just passed status
          const passedMatch = raw.match(/"passed"\s*:\s*(true|false)/);
          return {
            passed: passedMatch?.[1] === "true",
            visual_description: text.substring(0, 200),
            issues: [{ severity: "major", description: "JSON parse failed, partial analysis" }],
            fixes: [],
            next_action: "continue",
          };
        }
      }
    }

    return {
      passed: false,
      issues: [
        {
          severity: "critical",
          description: "Could not parse Claude analysis response",
        },
      ],
      fixes: [],
      next_action: "retry",
    };
  } catch (err) {
    console.error("  Claude API error:", err);
    return {
      passed: false,
      issues: [
        {
          severity: "critical",
          description: `Claude API error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      fixes: [],
      next_action: "retry",
    };
  }
}

// ── Apply Fixes ─────────────────────────────────────────────────────────────

function applyFixes(
  fixes: AnalysisResult["fixes"],
  screenName: string
): boolean {
  if (fixes.length === 0) return false;

  // Safety: check modified file count before applying more fixes
  if (!checkModifiedFileLimit()) {
    console.log(`  [SAFETY] Too many files modified. Pausing fixes for ${screenName}.`);
    return false;
  }

  // Limit to MAX_FIXES_PER_SCREEN, prioritize by order (Claude sorts by severity)
  const cappedFixes = fixes.slice(0, MAX_FIXES_PER_SCREEN);
  if (fixes.length > MAX_FIXES_PER_SCREEN) {
    console.log(`  Capping fixes from ${fixes.length} to ${MAX_FIXES_PER_SCREEN} for ${screenName}`);
  }

  console.log(`\n  Applying ${cappedFixes.length} fixes for ${screenName}...`);
  let anyApplied = false;

  for (const fix of cappedFixes) {
    // Frozen file check
    if (isFrozenFile(fix.file)) {
      console.log(`  [FROZEN] Refusing to modify frozen file: ${fix.file}`);
      continue;
    }

    // Try multiple path resolutions — Claude often omits the apps/web/ prefix
    let fullPath = path.join(PROJECT_ROOT, fix.file);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.join(WEB_ROOT, fix.file);
    }
    if (!fs.existsSync(fullPath)) {
      // Try stripping leading src/ or adding apps/web/
      const stripped = fix.file.replace(/^src\//, "");
      fullPath = path.join(WEB_ROOT, stripped);
    }
    if (!fs.existsSync(fullPath)) {
      console.log(`  [skip] File not found: ${fix.file}`);
      continue;
    }

    // Safety: reject fixes that replace too much code (likely a full rewrite)
    if (fix.old_str.length > 2000 || fix.new_str.length > 2000) {
      console.log(`  [skip] Fix too large (${fix.old_str.length}→${fix.new_str.length} chars), likely a rewrite: ${fix.file}`);
      continue;
    }
    // Safety: reject fixes where old_str looks like the entire file
    if (fix.old_str.includes('"use client"') && fix.old_str.includes("export default")) {
      console.log(`  [skip] Fix appears to replace entire file: ${fix.file}`);
      continue;
    }
    // Safety: reject fixes with more than 20 lines in either old or new
    const oldLines = fix.old_str.split("\n").length;
    const newLines = fix.new_str.split("\n").length;
    if (oldLines > 20 || newLines > 20) {
      console.log(`  [skip] Fix exceeds 20-line limit (${oldLines}→${newLines} lines): ${fix.file}`);
      continue;
    }
    // Safety: reject fixes containing 'export default' (likely a full rewrite)
    if (fix.new_str.includes("export default")) {
      console.log(`  [skip] Fix contains 'export default', likely a rewrite: ${fix.file}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf8");

    if (!content.includes(fix.old_str)) {
      console.log(
        `  [skip] String not found in ${fix.file}: "${fix.old_str.substring(0, 60)}..."`
      );
      fixHistory.push({ screen: screenName, fix: `${fix.file}: ${fix.reason} (string not found)`, success: false });
      continue;
    }

    const newContent = content.replace(fix.old_str, fix.new_str);
    fs.writeFileSync(fullPath, newContent);
    console.log(`  [fixed] ${fix.file}: ${fix.reason}`);
    anyApplied = true;

    fixHistory.push({
      screen: screenName,
      fix: `${fix.file}: ${fix.reason}`,
      success: true,
    });
  }

  // After applying fixes, check for and revert any frozen files
  revertFrozenFiles();

  // Log which files changed after this fix batch (healer-only changes)
  const { files } = getHealerModifiedFiles();
  if (files.length > 0) {
    console.log(`  Files changed by healer: ${files.join(", ")}`);
  }

  return anyApplied;
}

// ── Screen Test Runner ──────────────────────────────────────────────────────

async function testScreen(
  page: Page,
  screenName: string,
  expectedBehavior: string,
  maxAttempts = 3
): Promise<boolean> {
  console.log(`\n  >> Testing: ${screenName}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      console.log(`  >> Retry ${attempt}/${maxAttempts} for ${screenName}`);
      // Reload after fix
      await page.reload({ waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    await page.waitForTimeout(2000);
    const ssPath = await screenshot(page, screenName);

    // Discover interactive elements
    const elements = await page.evaluate(() => {
      const els = document.querySelectorAll(
        "button, a, input, select, textarea, [role=button], [data-testid]"
      );
      return Array.from(els).map((el) => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText?.substring(0, 50) || "",
        type: (el as HTMLInputElement).type || "",
        visible: el.getBoundingClientRect().width > 0,
      }));
    });

    console.log(
      `  Found ${elements.filter((e) => e.visible).length} visible interactive elements`
    );

    const analysis = await analyzeScreen({
      ssPath,
      screenName,
      expectedBehavior,
      logs: consoleLogs.slice(-30),
      errors: [...pageErrors],
      url: page.url(),
    });

    console.log(
      `  ${analysis.passed ? "PASS" : "FAIL"} - ${analysis.visual_description?.substring(0, 100) || "no description"}`
    );

    if (analysis.issues?.length > 0) {
      for (const issue of analysis.issues) {
        console.log(
          `    [${issue.severity}] ${issue.description?.substring(0, 100)}`
        );
      }
    }

    // Save analysis log
    fs.writeFileSync(
      path.join(LOG_DIR, `${Date.now()}_${screenName}.json`),
      JSON.stringify(
        {
          screen: screenName,
          url: page.url(),
          passed: analysis.passed,
          attempt,
          elements: elements.filter((e) => e.visible).length,
          issues: analysis.issues,
          fixes: analysis.fixes,
          flowLogs: consoleLogs
            .filter((l) => l.includes("__COVA__"))
            .slice(-10),
        },
        null,
        2
      )
    );

    if (analysis.passed) {
      screenResults[screenName] = { passed: true, issues: [] };
      return true;
    }

    // Try to apply fixes
    if (analysis.fixes?.length > 0 && attempt < maxAttempts) {
      const fixed = applyFixes(analysis.fixes, screenName);
      if (!fixed) {
        // No fix could be applied — no point retrying
        break;
      }
    } else {
      break;
    }
  }

  screenResults[screenName] = {
    passed: false,
    issues:
      screenResults[screenName]?.issues ||
      ["Failed after max attempts"],
  };
  return false;
}

// ── Screen Definitions ──────────────────────────────────────────────────────

interface ScreenDef {
  name: string;
  url: string;
  expectedBehavior: string;
  setup?: (page: Page) => Promise<void>;
  interact?: (page: Page) => Promise<void>;
}

const SCREENS: ScreenDef[] = [
  {
    name: "landing",
    url: "/",
    expectedBehavior:
      "Marketing landing page. Hero image visible. Gold CTA button. 'Cova' branding. No broken images. No console errors. Smooth dark navy background (#091829).",
  },
  {
    name: "auth",
    url: "/auth",
    expectedBehavior:
      "Sign-in page. 'Cova' brand visible. Email input field. Password input field. 'Continue' submit button. 'Continue with Google' button. No error messages unless login failed. Dark themed.",
    interact: async (page: Page) => {
      // Fill test credentials if available
      const email = process.env.E2E_TEST_EMAIL || process.env.TEST_EMAIL;
      const password = process.env.E2E_TEST_PASSWORD || process.env.TEST_PASSWORD;
      if (email && password) {
        await page.fill('input[type="email"]', email).catch(() => {});
        await page.fill('input[type="password"]', password).catch(() => {});
        // Click submit
        const submitBtn = page.locator(
          'button[type="submit"], button:has-text("Continue"):not(:has-text("Google"))'
        ).first();
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
        }
      }
    },
  },
  {
    name: "step-1",
    url: "/design/step-1",
    expectedBehavior:
      "Welcome screen with gold particle animation on dark navy canvas. 'Cova' wordmark. Motivational text. CTA button to begin. No broken images. Particles animating.",
    interact: async (page: Page) => {
      // Click the CTA to advance
      const ctaSelectors = [
        'text="Begin"',
        'text="Get Started"',
        'text="Start"',
        'text="Continue"',
        'text="Next"',
        "button.cova-cta",
        ".step1-cta",
      ];
      for (const sel of ctaSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    },
  },
  {
    name: "step-2",
    url: "/design/step-2",
    expectedBehavior:
      "Room type selection phase: 6 room type buttons (Living Room, Bedroom, Dining Room, Home Office, Kitchen, Bathroom). After selecting room type, shows 2x2 grid of 4 style images for anchor question 1 of 3. Progress indicator. Gold accent styling. Images load from Supabase storage.",
    interact: async (page: Page) => {
      // Select a room type
      const roomTypes = [
        "Living Room",
        "Bedroom",
        "Dining Room",
        "Home Office",
      ];
      for (const rt of roomTypes) {
        const btn = page.locator(`text="${rt}"`).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(1500);
          break;
        }
      }

      // Answer 3 anchor questions by clicking first visible image each time
      for (let q = 0; q < 3; q++) {
        await page.waitForTimeout(1000);
        const images = await page.locator("img:visible").all();
        if (images.length >= 2) {
          await images[0].click().catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
    },
  },
  {
    name: "step-3",
    url: "/design/step-3",
    expectedBehavior:
      "Style quiz with comparison pairs. Two room images side by side for preference selection. Progress counter. Or non-visual questions with text options. Dark themed with gold accents.",
    interact: async (page: Page) => {
      // Answer non-visual questions and/or pairs
      for (let i = 0; i < 30; i++) {
        // Check for clickable options (images or buttons)
        const images = await page.locator("img:visible").all();
        if (images.length >= 2) {
          await images[i % 2].click().catch(() => {});
          await page.waitForTimeout(600);
        } else {
          // Try clicking any option button
          const options = await page
            .locator("button:visible, [role=button]:visible")
            .all();
          const clickable = [];
          for (const opt of options) {
            const text = await opt.innerText().catch(() => "");
            if (
              text &&
              !text.includes("Cova") &&
              !text.includes("Back") &&
              text.length < 50
            ) {
              clickable.push(opt);
            }
          }
          if (clickable.length > 0) {
            await clickable[0].click().catch(() => {});
            await page.waitForTimeout(600);
          } else {
            break;
          }
        }
        // Check if navigated away
        if (!page.url().includes("step-3") || page.url().includes("step-3b"))
          break;
      }
    },
  },
  {
    name: "step-3b",
    url: "/design/step-3b",
    expectedBehavior:
      "Style blend confirmation. Shows percentage bars for top styles (e.g. 65% Scandinavian, 35% Japandi). Style names visible as human-readable names (not COVA* keys). 'This feels right' or confirm button. Option to adjust sliders.",
    interact: async (page: Page) => {
      const confirmSelectors = [
        'text="This feels right"',
        'text="Confirm"',
        'text="Continue"',
        'text="Next"',
      ];
      for (const sel of confirmSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    },
  },
  {
    name: "step-4",
    url: "/design/step-4",
    expectedBehavior:
      "Fingerprint reveal. Radar chart with 6 dimensions (Warmth, Complexity, Organic, Layered, Heritage, Character). Color palette swatches. Style name displayed. Style tags. Tweak input field. Continue button.",
    interact: async (page: Page) => {
      const ctaSelectors = [
        'text="Continue"',
        'text="Next"',
        'text="Design My Room"',
      ];
      for (const sel of ctaSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    },
  },
  {
    name: "step-5",
    url: "/design/step-5",
    expectedBehavior:
      "Budget tier selection. 4-5 budget tier cards (Essential, Elevated, Refined, Prestige, Signature) with price ranges. Each card has description. Gold styling on selected. Continue button.",
    interact: async (page: Page) => {
      // Select a tier
      const tiers = ["Elevated", "Refined", "Essential"];
      for (const tier of tiers) {
        const btn = page.locator(`text="${tier}"`).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
      // Continue
      const cta = page.locator('text="Continue"').first();
      if (await cta.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cta.click();
        await page.waitForTimeout(2000);
      }
    },
  },
  {
    name: "step-6",
    url: "/design/step-6",
    expectedBehavior:
      "Room photo capture. Upload zone with file input for photos. QR code section for mobile capture. Dark themed. Camera icon. Upload tips. 'Upload a Photo' or file input visible.",
  },
  {
    name: "step-7c",
    url: "/design/step-7c",
    expectedBehavior:
      "Keep/Remove screen. Detected furniture items shown with orange overlay on room image. Each item has a toggle to keep or remove. Items come from pre_detection_result. Dark themed with gold accents. 'Continue' button.",
    interact: async (page: Page) => {
      // Toggle a few items and continue
      const toggles = await page.locator("button:visible, [role=switch]:visible").all();
      if (toggles.length > 0) {
        await toggles[0].click().catch(() => {});
        await page.waitForTimeout(500);
      }
      const cta = page.locator('text="Continue"').first();
      if (await cta.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cta.click();
        await page.waitForTimeout(2000);
      }
    },
  },
  {
    name: "step-8a",
    url: "/design/step-8a",
    expectedBehavior:
      "Render result screen. Shows the AI-redesigned room image. Before/after slider comparing original and redesigned room. Quality should be high (score >= 20/30). Loading state if render is still processing. Dark themed with gold accents.",
  },
  {
    name: "dashboard",
    url: "/dashboard",
    expectedBehavior:
      "Dashboard with room cards showing room thumbnails, tags, dates. Stats row. Style profile with radar chart. New Room CTA. Nav sidebar with icons. Gold accent colors. Dark navy background.",
  },
];

// ── Quiz Image Re-seeding ──────────────────────────────────────────────────

async function detectBrokenImages(page: Page): Promise<number> {
  return page.evaluate(() => {
    const imgs = document.querySelectorAll("img");
    let broken = 0;
    for (const img of imgs) {
      if (img.naturalWidth === 0 && img.getBoundingClientRect().width > 0) {
        broken++;
      }
    }
    return broken;
  });
}

async function reseedQuizImages(): Promise<boolean> {
  console.log("\n  [RESEED] Checking for expired quiz image URLs...");

  // Run the generate-missing-anchors script to re-seed broken images
  const result = run(
    "npx tsx scripts/generate-missing-anchors.ts",
    WEB_ROOT
  );

  if (result.ok) {
    console.log("  [RESEED] Re-seeding complete.");
    // Check if migrate-pair-images script exists and run it too
    const migrateScript = path.join(WEB_ROOT, "scripts/migrate-pair-images.ts");
    if (fs.existsSync(migrateScript)) {
      console.log("  [RESEED] Running pair image migration...");
      const migrateResult = run(
        "npx tsx scripts/migrate-pair-images.ts",
        WEB_ROOT
      );
      if (!migrateResult.ok) {
        console.log("  [RESEED] Pair migration had issues:", migrateResult.output.slice(-200));
      }
    }
    return true;
  } else {
    console.log("  [RESEED] Re-seeding failed:", result.output.slice(-300));
    return false;
  }
}

// ── Main Flow ───────────────────────────────────────────────────────────────

async function runAutonomousHealer() {
  console.log("=== COVA AUTONOMOUS HEALER (v2 — prioritized + safe) ===");
  console.log("=".repeat(60));
  console.log(`Max iterations: ${MAX_GLOBAL_ITERATIONS}`);
  console.log(`Max fixes per screen: ${MAX_FIXES_PER_SCREEN}`);
  console.log(`Frozen files: ${FROZEN_FILES.join(", ")}`);
  console.log(`Priority screens: ${PRIORITY_SCREENS.join(" → ")}`);

  // Snapshot baseline git state to only track healer's own changes
  snapshotBaseline();

  const appMap = loadAppMap();
  console.log(
    `App map loaded: ${appMap ? (appMap as { screens?: unknown[] }).screens?.length || 0 : 0} screens`
  );

  // Verify dev server
  const serverCheck = run(
    `curl -s -o /dev/null -w "%{http_code}" ${BASE_URL}`,
    WEB_ROOT
  );
  const httpCode = serverCheck.output.trim();
  const validCodes = ["200", "302", "307", "500"];
  if (!validCodes.some((c) => httpCode.includes(c))) {
    console.error(
      "Dev server not responding at " + BASE_URL + ". Start it with: cd apps/web && npm run dev"
    );
    console.log("Server response:", serverCheck.output);
    process.exit(1);
  }
  console.log("Dev server confirmed running at " + BASE_URL);

  // Build priority-ordered screen list: priority screens first, then the rest
  const priorityScreenDefs = PRIORITY_SCREENS.map((name) =>
    SCREENS.find((s) => s.name === name)
  ).filter((s): s is ScreenDef => s !== undefined);

  const remainingScreenDefs = SCREENS.filter(
    (s) => !PRIORITY_SCREENS.includes(s.name as typeof PRIORITY_SCREENS[number])
  );

  const orderedScreens = [...priorityScreenDefs, ...remainingScreenDefs];

  let globalIteration = 0;
  let allPriorityPassed = false;
  let quizReseeded = false;

  while (!allPriorityPassed && globalIteration < MAX_GLOBAL_ITERATIONS) {
    globalIteration++;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ITERATION ${globalIteration} / ${MAX_GLOBAL_ITERATIONS}`);
    console.log("=".repeat(60));

    // Safety: check modified file count at start of iteration
    if (!checkModifiedFileLimit()) {
      console.log("  Proceeding with caution — many files modified.");
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    // Reset collectors
    consoleLogs = [];
    pageErrors = [];

    // Authenticate before testing priority screens
    const email = process.env.E2E_TEST_EMAIL || process.env.TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD || process.env.TEST_PASSWORD;
    if (email && password) {
      console.log("\n--- Authenticating before priority screens ---");
      await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle", timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.fill('input[type="email"]', email).catch(() => {});
      await page.fill('input[type="password"]', password).catch(() => {});
      const submitBtn = page.locator(
        'button[type="submit"], button:has-text("Continue"):not(:has-text("Google"))'
      ).first();
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }
      console.log(`  Auth complete. Current URL: ${page.url()}`);
    } else {
      console.log("  WARNING: No test credentials found. Auth-gated pages will fail.");
    }

    page.on("console", (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('"__COVA__":true')) {
        try {
          const p = JSON.parse(text);
          console.log(
            `  [FLOW] ${p.event}`,
            p.data ? JSON.stringify(p.data).substring(0, 80) : ""
          );
        } catch {
          // ignore parse errors
        }
      }
    });

    page.on("pageerror", (e) => {
      pageErrors.push(e.message);
      console.error(`  [ERR] ${e.message.substring(0, 120)}`);
    });

    try {
      let fixesAppliedThisIteration = false;

      for (const screen of orderedScreens) {
        // If this is a priority screen and it already passed, skip
        if (
          PRIORITY_SCREENS.includes(screen.name as typeof PRIORITY_SCREENS[number]) &&
          screenResults[screen.name]?.passed
        ) {
          console.log(`\n--- Screen: ${screen.name} — already PASSED, skipping ---`);
          continue;
        }

        // Navigate to screen
        console.log(`\n--- Screen: ${screen.name} (${screen.url}) ---`);

        await page.goto(`${BASE_URL}${screen.url}`, {
          waitUntil: "networkidle",
          timeout: 30_000,
        }).catch(() => {
          // Some pages redirect — that's OK
        });

        await page.waitForTimeout(2000);

        // Quiz image re-seeding: detect broken images on step-2 or step-3
        if (
          !quizReseeded &&
          (screen.name === "step-2" || screen.name === "step-3")
        ) {
          const brokenCount = await detectBrokenImages(page);
          if (brokenCount > 0) {
            console.log(`  [DETECT] Found ${brokenCount} broken images on ${screen.name}`);
            quizReseeded = await reseedQuizImages();
            if (quizReseeded) {
              // Reload to verify
              await page.reload({ waitUntil: "networkidle" }).catch(() => {});
              await page.waitForTimeout(2000);
              const stillBroken = await detectBrokenImages(page);
              console.log(`  [VERIFY] After reseed: ${stillBroken} broken images remaining`);
            }
          }
        }

        // Run setup if defined
        if (screen.setup) {
          await screen.setup(page);
        }

        // Test the screen
        const passed = await testScreen(
          page,
          screen.name,
          screen.expectedBehavior
        );

        if (!passed) {
          fixesAppliedThisIteration = true;

          // For priority screens: don't proceed to next until this one passes
          if (
            PRIORITY_SCREENS.includes(screen.name as typeof PRIORITY_SCREENS[number])
          ) {
            console.log(
              `  [PRIORITY] ${screen.name} failed — will retry in next iteration before moving on`
            );
          }
        }

        // Run interactions if defined (to advance flow state)
        if (screen.interact) {
          try {
            await screen.interact(page);
          } catch (err) {
            console.log(
              `  [interact] Error on ${screen.name}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // Revert any frozen files after each screen
        revertFrozenFiles();
      }

      // Check if all 5 priority screens passed
      allPriorityPassed = PRIORITY_SCREENS.every(
        (name) => screenResults[name]?.passed === true
      );

      if (allPriorityPassed) {
        console.log("\n ALL 5 PRIORITY SCREENS PASSED!");
      } else if (!fixesAppliedThisIteration) {
        console.log(
          "\n No fixes could be applied this iteration. Stopping to prevent infinite loop."
        );
        break;
      }
    } catch (err) {
      console.error(`\nIteration crashed:`, err);
      await screenshot(page, "crash").catch(() => {});
    } finally {
      await browser.close();
    }

    if (!allPriorityPassed) {
      console.log(`\nIteration ${globalIteration} complete. Retrying...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // ── Final Report ────────────────────────────────────────────────────────

  console.log(`\n${"=".repeat(60)}`);
  console.log("AUTONOMOUS HEALER — FINAL REPORT");
  console.log("=".repeat(60));
  console.log(`Total iterations: ${globalIteration}`);
  console.log(
    `Result: ${allPriorityPassed ? "ALL PRIORITY SCREENS PASSED" : "SOME SCREENS FAILED"}`
  );

  console.log("\nPriority Screen Status:");
  const priorityLabels: Record<string, string> = {
    "step-2": "P1 — Anchor Quiz",
    "step-3": "P2 — Swipe Quiz",
    "step-3b": "P3 — Style Confirmation",
    "step-7c": "P4 — Keep/Remove",
    "step-8a": "P5 — Render Result",
  };
  for (const name of PRIORITY_SCREENS) {
    const result = screenResults[name];
    const label = priorityLabels[name] || name;
    console.log(
      `  ${result?.passed ? "PASS" : "FAIL"} ${label}`
    );
    if (result?.issues?.length) {
      for (const issue of result.issues) {
        console.log(`       - ${issue}`);
      }
    }
  }

  console.log("\nAll Screen Results:");
  for (const screen of SCREENS) {
    const result = screenResults[screen.name];
    console.log(
      `  ${result?.passed ? "PASS" : "FAIL"} ${screen.name} (${screen.url})`
    );
  }

  if (fixHistory.length > 0) {
    console.log("\nFixes Applied:");
    for (const f of fixHistory) {
      console.log(`  ${f.success ? "OK" : "FAIL"} [${f.screen}] ${f.fix}`);
    }
  }

  // Log final git diff state (healer-only changes)
  const { files } = getHealerModifiedFiles();
  console.log(`\nFiles modified by healer (${files.length}):`);
  for (const f of files) {
    console.log(`  ${isFrozenFile(f) ? "FROZEN! " : ""}${f}`);
  }

  console.log(`\nScreenshots: ${SS_DIR}`);
  console.log(`Logs: ${LOG_DIR}`);

  // Write summary report
  const report = {
    timestamp: new Date().toISOString(),
    iterations: globalIteration,
    allPriorityPassed,
    priorityResults: Object.fromEntries(
      PRIORITY_SCREENS.map((name) => [
        name,
        screenResults[name] || { passed: false, issues: ["not tested"] },
      ])
    ),
    screens: Object.fromEntries(
      SCREENS.map((s) => [
        s.name,
        screenResults[s.name] || { passed: false, issues: ["not tested"] },
      ])
    ),
    fixes: fixHistory,
    modifiedFiles: files,
    quizReseeded,
  };

  fs.writeFileSync(
    path.join(LOG_DIR, `report_${Date.now()}.json`),
    JSON.stringify(report, null, 2)
  );

  process.exit(allPriorityPassed ? 0 : 1);
}

runAutonomousHealer().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
