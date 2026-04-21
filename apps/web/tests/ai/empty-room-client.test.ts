import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZodError } from "zod";
import {
  generateEmptyRoom,
  EmptyRoomError,
  EmptyRoomCoverageTooHighError,
  EmptyRoomTimeoutError,
  EmptyRoomResponseSchema,
} from "@/lib/ai/empty-room-client";

const VALID_RESPONSE = {
  schema_version: "1.0",
  empty_room_url: "https://example.com/empty.webp",
  image_hash: "abc123",
  image_width: 1536,
  image_height: 1024,
  mask_coverage_raw_pct: 18.2,
  mask_coverage_dilated_pct: 27.4,
  inpainter_used: "lama",
  router_threshold_pct: 35.0,
  architectural_patch_ssim: 0.984,
  patch_coordinates: { x: 123, y: 42, size: 200 },
  patch_clean: true,
  partial_failures: [],
  latency_ms: 28_430,
  cost_usd: 0.19,
  generated_at_iso: "2026-04-20T00:00:00Z",
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
  process.env.COVA_EMPTY_ROOM_URL = "https://empty-room.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("generateEmptyRoom", () => {
  it("happy path returns parsed EmptyRoomResponse", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    const result = await generateEmptyRoom("https://example.com/room.jpg");
    expect(result.empty_room_url).toBe("https://example.com/empty.webp");
    expect(result.inpainter_used).toBe("lama");
    expect(result.architectural_patch_ssim).toBe(0.984);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://empty-room.test/v1/generate_empty_room",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends image_hash, user_id, force_inpainter when provided", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    await generateEmptyRoom("https://example.com/room.jpg", {
      imageHash: "hashhere",
      userId: "user-1",
      forceInpainter: "bria",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.image_hash).toBe("hashhere");
    expect(body.user_id).toBe("user-1");
    expect(body.force_inpainter).toBe("bria");
  });

  it("returns short_circuit inpainter value verbatim", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...VALID_RESPONSE,
        inpainter_used: "short_circuit",
        mask_coverage_raw_pct: 0.2,
        partial_failures: ["short_circuit:no_furniture_detected"],
      }),
    );
    const result = await generateEmptyRoom("https://example.com/empty.jpg");
    expect(result.inpainter_used).toBe("short_circuit");
    expect(result.partial_failures).toContain(
      "short_circuit:no_furniture_detected",
    );
  });

  it("throws on schema mismatch (bogus payload)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ schema_version: "1.0", bogus: true }),
    );
    await expect(
      generateEmptyRoom("https://example.com/room.jpg"),
    ).rejects.toThrow(EmptyRoomError);
  });

  it("throws on rejected enum value for inpainter_used", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...VALID_RESPONSE, inpainter_used: "flux-fill" }),
    );
    await expect(
      generateEmptyRoom("https://example.com/room.jpg"),
    ).rejects.toThrow(EmptyRoomError);
  });

  it("retries once on 5xx and succeeds on retry", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    const p = generateEmptyRoom("https://example.com/room.jpg");
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await p;
    expect(result.image_hash).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after persistent 5xx", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 502));
    const p = generateEmptyRoom("https://example.com/room.jpg").catch(
      (e) => e,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    const err = await p;
    expect(err).toBeInstanceOf(EmptyRoomError);
    expect(err).toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "bad input" }, 400),
    );
    await expect(
      generateEmptyRoom("https://example.com/room.jpg"),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps HTTP 413 to EmptyRoomCoverageTooHighError with coverage pct", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: {
            error: "coverage_too_high",
            message: "room too cluttered",
            mask_coverage_dilated_pct: 92.4,
            reject_threshold_pct: 90.0,
            partial_failures: [],
            cost_usd: 0.1,
          },
        },
        413,
      ),
    );
    const err = await generateEmptyRoom(
      "https://example.com/room.jpg",
    ).catch((e) => e);
    expect(err).toBeInstanceOf(EmptyRoomCoverageTooHighError);
    expect((err as EmptyRoomCoverageTooHighError).coveragePct).toBeCloseTo(
      92.4,
    );
    expect((err as EmptyRoomError).status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 413", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: { error: "coverage_too_high" } }, 413),
    );
    await generateEmptyRoom("https://example.com/room.jpg").catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws EmptyRoomTimeoutError when request aborts", async () => {
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
    const p = generateEmptyRoom("https://example.com/room.jpg").catch(
      (e) => e,
    );
    await vi.advanceTimersByTimeAsync(60_001);
    const err = await p;
    expect(err).toBeInstanceOf(EmptyRoomTimeoutError);
  });

  it("honors custom timeoutMs option", async () => {
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
    const p = generateEmptyRoom("https://example.com/room.jpg", {
      timeoutMs: 5_000,
    }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_001);
    const err = await p;
    expect(err).toBeInstanceOf(EmptyRoomTimeoutError);
  });
});

describe("schema direct parse", () => {
  it("EmptyRoomResponseSchema rejects malformed payload", () => {
    expect(() =>
      EmptyRoomResponseSchema.parse({ schema_version: "2.0" }),
    ).toThrow(ZodError);
  });

  it("EmptyRoomResponseSchema accepts short_circuit inpainter", () => {
    const parsed = EmptyRoomResponseSchema.parse({
      ...VALID_RESPONSE,
      inpainter_used: "short_circuit",
    });
    expect(parsed.inpainter_used).toBe("short_circuit");
  });
});

describe.skip("@integration live Modal endpoint", () => {
  it("generateEmptyRoom against live endpoint validates schema", async () => {
    delete process.env.COVA_EMPTY_ROOM_URL;
    vi.unstubAllGlobals();
    const room01 =
      "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/bench-phase-1/room-01.jpg";
    const result = await generateEmptyRoom(room01);
    expect(result.schema_version).toBe("1.0");
    expect(result.image_width).toBeGreaterThan(0);
    expect(["lama", "bria", "short_circuit"]).toContain(result.inpainter_used);
  }, 90_000);
});
