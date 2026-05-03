import { describe, it, expect, beforeAll } from "vitest";
import { processCaptureImage } from "@/lib/capture/process";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = "tests/fixtures";
const FIXTURE_PATH = join(FIXTURE_DIR, "exif-with-gps.jpg");
const OUT_PATH = join(FIXTURE_DIR, "exif-stripped-output.jpg");

const HAS_EXIFTOOL = (() => {
  try {
    execSync("exiftool -ver", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  if (existsSync(FIXTURE_PATH)) return;
  // Generate a tiny JPEG with embedded GPS via Sharp + .withExif.
  // For a real fixture, place an actual phone-camera JPEG with GPS into tests/fixtures/exif-with-gps.jpg.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require("sharp");
  const buf = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .withExif({
      IFD0: { Software: "cova-test" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 22/1 30/1", GPSLongitudeRef: "W", GPSLongitude: "122/1 4/1 30/1" },
    })
    .toBuffer();
  writeFileSync(FIXTURE_PATH, buf);
});

describe.runIf(HAS_EXIFTOOL)("processCaptureImage strips EXIF (requires exiftool CLI)", () => {
  it("removes GPS tags from the output JPEG", async () => {
    const out = await processCaptureImage(FIXTURE_PATH);
    writeFileSync(OUT_PATH, out.buffer);
    const exifText = execSync(`exiftool -G -s ${OUT_PATH}`, { encoding: "utf8" });
    expect(exifText).not.toMatch(/GPS:/);
    expect(exifText).not.toMatch(/GPSLatitude/);
    expect(exifText).not.toMatch(/GPSLongitude/);
    expect(out.byteLength).toBeLessThan(2_000_000);
  });

  it("produces output ≤1536px on the longest edge", async () => {
    const out = await processCaptureImage(FIXTURE_PATH);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(1536);
  });
});
