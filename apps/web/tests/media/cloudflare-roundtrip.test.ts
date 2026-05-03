import { describe, it, expect } from "vitest";
import { r2PutObject, r2SignedGetUrl } from "@/lib/media/cloudflare";
import { readFileSync, existsSync } from "node:fs";

const RUN = process.env.CF_R2_TEST_LIVE === "true";
const FIXTURE_PATH = "tests/fixtures/exif-with-gps.jpg";

describe.runIf(RUN)("Cloudflare R2 roundtrip", () => {
  it("uploads a fixture and reads it back via signed URL", async () => {
    if (!existsSync(FIXTURE_PATH)) {
      throw new Error(`Fixture missing: ${FIXTURE_PATH} (run exif test first to generate it)`);
    }
    const buf = readFileSync(FIXTURE_PATH);
    const key = `tests/${Date.now()}.jpg`;
    await r2PutObject(key, buf, "image/jpeg");
    const url = await r2SignedGetUrl(key, 60);
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    const blob = await res.arrayBuffer();
    expect(blob.byteLength).toBe(buf.byteLength);
  });
});
