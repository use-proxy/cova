import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Use 'node' globally to avoid jsdom's ESM/CJS conflict with
    // @asamuzakjp/css-color (top-level await breaks require()).
    // Only use jsdom for component tests that truly need DOM.
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "__tests__/**/*.test.ts",
      "__tests__/**/*.test.tsx",
    ],
    // tests/api/ holds Playwright API contract tests that hit a real running
    // server — they intentionally do not run under Vitest. tests/e2e/ is
    // Playwright too.
    exclude: [
      "node_modules",
      ".next",
      "lib/**",
      "tests/e2e/**",
      "tests/api/**",
    ],
    server: {
      deps: {
        inline: ["@asamuzakjp/css-color", "jsdom"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        ".next/",
        "tailwind.config.ts",
        "next.config.mjs",
        "postcss.config.mjs",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
