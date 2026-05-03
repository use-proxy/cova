#!/usr/bin/env tsx
// scripts/agents/schema-reviewer.ts
// Invoked by .github/workflows/schema-review.yml on PRs touching supabase/migrations/**.
// Reads the migration files from the PR diff, calls Anthropic Sonnet with
// cova-plan/subagents/schema-reviewer.md as the system prompt, posts a PR
// comment via the gh CLI.

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const PR_NUMBER = process.env.PR_NUMBER;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!PR_NUMBER) {
  console.error("PR_NUMBER not set");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const systemPrompt = readFileSync(
  "cova-plan/subagents/schema-reviewer.md",
  "utf8",
);

const changedFiles = execSync(
  `gh pr diff ${PR_NUMBER} --name-only`,
  { encoding: "utf8" },
)
  .split("\n")
  .map((s) => s.trim())
  .filter((p) => p.startsWith("supabase/migrations/") && p.endsWith(".sql"));

if (changedFiles.length === 0) {
  console.log("No migration files in PR; skipping.");
  process.exit(0);
}

const fileBlobs = changedFiles
  .map((p) => {
    const exists = existsSync(p);
    if (!exists) return `## ${p}\n\n(deleted)\n`;
    const body = readFileSync(p, "utf8");
    return `## ${p}\n\n\`\`\`sql\n${body}\n\`\`\`\n`;
  })
  .join("\n---\n");

const userPrompt = `Review the following migration file(s) per your checklist.
Report findings in markdown table form for a GitHub PR comment. Be concise but
specific (file:line for any issue). Conclude with overall verdict (PASS /
PARTIAL / FAIL).

${fileBlobs}`;

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const resp = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 4000,
  temperature: 0,
  system: systemPrompt,
  messages: [{ role: "user", content: userPrompt }],
});

const reportText = resp.content
  .filter((b) => b.type === "text")
  .map((b: any) => b.text)
  .join("\n");

const verdict = /Overall:\s*(PASS|PARTIAL|FAIL)/i.exec(reportText)?.[1] ?? "PARTIAL";
const failing = verdict.toUpperCase() !== "PASS";

execSync(
  `gh pr comment ${PR_NUMBER} --body ${JSON.stringify(reportText)}`,
  { stdio: "inherit" },
);

if (failing) process.exit(1);
process.exit(0);
