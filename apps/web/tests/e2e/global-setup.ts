/**
 * Playwright global setup — waits for the production server to be ready.
 *
 * Uses `next start` (production mode) so all JS chunks are pre-compiled.
 * No lazy compilation delays, no MIME-type errors, React hydrates reliably.
 *
 * Before running tests:
 *   npm run build
 *   npm run start -- -p 3001   (or let playwright start it via webServer config)
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env so BASE_URL uses the right port
config({ path: resolve(__dirname, "../../.env.local"), override: true });

async function globalSetup() {
  const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
  const maxAttempts = 60;

  console.log(`[global-setup] Waiting for server at ${BASE_URL}...`);

  // Poll /api/quiz/fingerprint until the server responds
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/quiz/fingerprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: [],
          entry_path: "pairs",
          room_type: "living-room",
        }),
      });
      if (res.status === 400 || res.status === 200 || res.status === 401) {
        console.log(`[global-setup] Server ready (status: ${res.status})`);
        return;
      }
      console.log(
        `[global-setup] Attempt ${i + 1}/${maxAttempts}: status ${res.status}, waiting...`,
      );
    } catch {
      console.log(
        `[global-setup] Attempt ${i + 1}/${maxAttempts}: connection refused, waiting...`,
      );
    }
    if (i === maxAttempts - 1) {
      throw new Error(`[global-setup] Server not ready after ${maxAttempts}s`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export default globalSetup;
