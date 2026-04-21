import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZodError } from "zod";
import {
  detectPreservationSpec,
  encodeSam2ForCache,
  getDepthMap,
  PerceptionError,
  PerceptionTimeoutError,
  PreservationSpecSchema,
} from "@/lib/ai/perception-client";

const VALID_SPEC = {
  schema_version: "1.0",
  image_url: "https://example.com/room.jpg",
  image_hash: "abc123",
  image_width: 1024,
  image_height: 768,
  keep_class_detections: [
    {
      prompt: "mirror",
      mask_url: "https://example.com/mask.png",
      score: 0.91,
      bbox: { x: 10, y: 20, w: 100, h: 150 },
    },
  ],
  face_in_frame_flags: [],
  wall_text_flags: [],
  partial_failures: ["paddleocr:OSError: boom"],
  generated_at_iso: "2026-04-20T00:00:00Z",
  latency_ms: 4321,
};

const VALID_SAM2 = {
  image_hash: "abc123",
  embedding_bytes_b64: "AAAA",
  embedding_size_bytes: 2097152,
  embedding_shape: [1, 256, 64, 64],
  supabase_row_id: "00000000-0000-0000-0000-000000000001",
  generated_at_iso: "2026-04-20T00:00:00Z",
  latency_ms: 1200,
};

const VALID_DEPTH = {
  depth_url: "https://example.com/depth.png",
  provider: "fal-ai/imageutils/depth",
  latency_ms: 900,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.COVA_PERCEPTION_URL = "https://perception.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("detectPreservationSpec", () => {
  it("happy path returns parsed PreservationSpec", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_SPEC));
    const result = await detectPreservationSpec(
      "https://example.com/room.jpg",
    );
    expect(result.image_hash).toBe("abc123");
    expect(result.keep_class_detections[0].prompt).toBe("mirror");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://perception.test/v1/detect_preservation_spec",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("propagates partial_failures field", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_SPEC));
    const result = await detectPreservationSpec(
      "https://example.com/room.jpg",
    );
    expect(result.partial_failures).toEqual(["paddleocr:OSError: boom"]);
  });

  it("throws on schema mismatch (invalid response)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ schema_version: "1.0", bogus: true }),
    );
    await expect(
      detectPreservationSpec("https://example.com/room.jpg"),
    ).rejects.toThrow(PerceptionError);
  });

  it("retries once on 5xx and succeeds on retry", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse(VALID_SPEC));
    const p = detectPreservationSpec("https://example.com/room.jpg");
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await p;
    expect(result.image_hash).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after persistent 5xx (two failures)", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 502));
    const p = detectPreservationSpec(
      "https://example.com/room.jpg",
    ).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    const err = await p;
    expect(err).toMatchObject({ name: "PerceptionError", status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "bad input" }, 400),
    );
    await expect(
      detectPreservationSpec("https://example.com/room.jpg"),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws PerceptionTimeoutError when request aborts", async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.useFakeTimers();
    const p = detectPreservationSpec(
      "https://example.com/room.jpg",
    ).catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_001);
    const err = await p;
    expect(err).toBeInstanceOf(PerceptionTimeoutError);
  });
});

describe("encodeSam2ForCache", () => {
  it("happy path with user_id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_SAM2));
    const result = await encodeSam2ForCache(
      "https://example.com/room.jpg",
      "user-1",
    );
    expect(result.embedding_size_bytes).toBe(2097152);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.user_id).toBe("user-1");
  });

  it("throws before network call when user_id is empty", async () => {
    await expect(
      encodeSam2ForCache("https://example.com/room.jpg", ""),
    ).rejects.toThrow(PerceptionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getDepthMap", () => {
  it("happy path", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_DEPTH));
    const result = await getDepthMap("https://example.com/room.jpg");
    expect(result.depth_url).toBe("https://example.com/depth.png");
    expect(result.provider).toBe("fal-ai/imageutils/depth");
  });
});

describe("schema direct parse", () => {
  it("PreservationSpecSchema rejects malformed payload", () => {
    expect(() =>
      PreservationSpecSchema.parse({ schema_version: "2.0" }),
    ).toThrow(ZodError);
  });
});

describe.skip("@integration live Modal endpoint", () => {
  it("detectPreservationSpec against live endpoint validates schema", async () => {
    delete process.env.COVA_PERCEPTION_URL;
    vi.unstubAllGlobals();
    const room01 =
      "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/bench-phase-1/room-01.jpg";
    const result = await detectPreservationSpec(room01);
    expect(result.schema_version).toBe("1.0");
    expect(result.image_width).toBeGreaterThan(0);
  }, 60_000);
});
