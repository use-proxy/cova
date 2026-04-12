/**
 * POST /api/dev-log
 *
 * Development-only endpoint that relays browser-side log entries to the
 * server-side NDJSON file. In production this route returns 404 immediately.
 *
 * The client-side logger queues entries and flushes here every 500ms.
 * navigator.sendBeacon is used on page unload for a best-effort final flush.
 *
 * This route intentionally does NOT use the logger to avoid infinite loops.
 */

import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// In production: hard 404 — no log file I/O, no overhead
if (process.env.NODE_ENV !== "development") {
  // Module-level check — exports below will still be evaluated but handler
  // will short-circuit at runtime for any stray calls in production builds.
}

const LOG_DIR = path.join(process.cwd(), ".dev-logs");

function ensureDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const entries = (await req.json()) as unknown[];
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ ok: true, written: 0 });
    }

    ensureDir();

    // Determine the log file path from the first entry's timestamp + sessionId
    const first = entries[0] as { timestamp?: string; sessionId?: string };
    const date = (first.timestamp ?? new Date().toISOString()).slice(0, 10);
    const sid = (first.sessionId ?? "unknown").slice(0, 8);
    const filePath = path.join(LOG_DIR, `cova-${date}-${sid}.ndjson`);

    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.appendFileSync(filePath, lines, "utf8");

    return NextResponse.json({ ok: true, written: entries.length });
  } catch (err) {
    // Never surface log I/O errors to the client app
    console.error("[dev-log] relay failed:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
