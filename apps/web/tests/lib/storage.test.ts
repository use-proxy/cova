import { describe, it, expect, beforeEach } from "vitest";
import {
  getPublicUrl,
  parseStorageUrl,
  buildStoragePath,
  STORAGE_BUCKETS,
} from "@/lib/supabase/storage";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://xdeacbmkdwqrwxonqaqh.supabase.co";
});

describe("STORAGE_BUCKETS", () => {
  it("exports expected bucket names", () => {
    expect(STORAGE_BUCKETS.ROOM_VIDEOS).toBe("room-videos");
    expect(STORAGE_BUCKETS.RENDERS).toBe("renders");
    expect(STORAGE_BUCKETS.DEPTH_MAPS).toBe("depth-maps");
  });
});

describe("getPublicUrl", () => {
  it("builds correct public URL", () => {
    const url = getPublicUrl("renders", "user-1/room-1/render.jpg");
    expect(url).toContain("/storage/v1/object/public/renders/");
    expect(url).toContain("user-1/room-1/render.jpg");
  });

  it("returns empty string when SUPABASE_URL not set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    const url = getPublicUrl("renders", "test.jpg");
    expect(url).toBe("");
  });
});

describe("parseStorageUrl", () => {
  it("parses public URL correctly", () => {
    const url =
      "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/renders/user-1/room-1/render.jpg";
    const result = parseStorageUrl(url);
    expect(result).not.toBeNull();
    expect(result?.bucket).toBe("renders");
    expect(result?.path).toBe("user-1/room-1/render.jpg");
  });

  it("returns null for invalid URL", () => {
    expect(parseStorageUrl("https://example.com/other")).toBeNull();
    expect(parseStorageUrl("")).toBeNull();
  });
});

describe("buildStoragePath", () => {
  it("builds structured path", () => {
    const path = buildStoragePath("user-123", "room-456", "render", "v1.jpg");
    expect(path).toBe("user-123/room-456/render/v1.jpg");
  });

  it("handles all asset types", () => {
    const types = ["photo", "video", "render", "depth"] as const;
    types.forEach((t) => {
      const path = buildStoragePath("u", "r", t, "file.jpg");
      expect(path).toContain(t);
    });
  });
});
