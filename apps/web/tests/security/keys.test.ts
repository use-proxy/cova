import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function scanDirectory(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (
        entry === "node_modules" ||
        entry === ".next" ||
        entry === ".git" ||
        entry === "coverage"
      )
        continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...scanDirectory(fullPath, extensions));
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory not accessible
  }
  return files;
}

describe("Security — No Exposed API Keys", () => {
  const rootDir = join(process.cwd());
  const codeFiles = scanDirectory(rootDir, [".ts", ".tsx", ".js", ".jsx"]);

  it("no files contain sk-ant- pattern (Anthropic keys)", () => {
    const violations: string[] = [];
    codeFiles.forEach((file) => {
      try {
        const content = readFileSync(file, "utf-8");
        if (content.includes("sk-ant-") && !file.includes(".test.")) {
          violations.push(file);
        }
      } catch {
        // File not readable
      }
    });
    expect(violations).toHaveLength(0);
  });

  it("no files contain hardcoded Supabase JWT tokens", () => {
    const violations: string[] = [];
    codeFiles.forEach((file) => {
      try {
        const content = readFileSync(file, "utf-8");
        const jwtPattern = /eyJ[A-Za-z0-9+/=]{50,}/g;
        if (
          jwtPattern.test(content) &&
          !file.includes("test") &&
          !file.includes(".env")
        ) {
          violations.push(file);
        }
      } catch {
        // File not readable
      }
    });
    expect(violations).toHaveLength(0);
  });

  it("no files contain REPLICATE_API_TOKEN= with value", () => {
    const violations: string[] = [];
    codeFiles.forEach((file) => {
      try {
        const content = readFileSync(file, "utf-8");
        if (/REPLICATE_API_TOKEN=r8_[A-Za-z0-9]+/.test(content)) {
          violations.push(file);
        }
      } catch {
        // File not readable
      }
    });
    expect(violations).toHaveLength(0);
  });

  it(".env.local is not tracked by git", () => {
    const gitignoreFiles = [
      join(rootDir, ".gitignore"),
      join(rootDir, "apps/web/.gitignore"),
    ];
    let envLocalIgnored = false;
    gitignoreFiles.forEach((file) => {
      try {
        const content = readFileSync(file, "utf-8");
        if (content.includes(".env.local") || content.includes(".env*")) {
          envLocalIgnored = true;
        }
      } catch {
        // File not found
      }
    });
    expect(envLocalIgnored).toBe(true);
  });

  it("SUPABASE_SERVICE_ROLE_KEY is not prefixed NEXT_PUBLIC_ in source files", () => {
    const violations: string[] = [];
    codeFiles.forEach((file) => {
      // Skip test files — they may reference this string in assertions
      if (file.includes(".test.") || file.includes("/tests/")) return;
      try {
        const content = readFileSync(file, "utf-8");
        if (content.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY")) {
          violations.push(file);
        }
      } catch {
        // File not readable
      }
    });
    expect(violations).toHaveLength(0);
  });
});
