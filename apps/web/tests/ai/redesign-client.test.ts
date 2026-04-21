import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZodError } from "zod";
import {
  generateRedesign,
  RedesignError,
  RedesignBadRequestError,
  RedesignUpstreamError,
  RedesignTimeoutError,
  RedesignResponseSchema,
  type RedesignResponse,
} from "@/lib/ai/redesign-client";

// Fixture mirroring cova-redesign schema_version "1.0".
const VALID_RESPONSE: RedesignResponse = {
  schema_version: "1.0",
  redesign_url: "https://example.com/redesign.jpg",
  archetype_resolved: "COVAJAPANDI",
  primary_trigger: "cvwmn",
  loras_used: [
    {
      path: "https://v3b.fal.media/files/b/abc/japandi.safetensors",
      scale: 0.88,
      trigger: "cvwmn",
      name: "COVAJAPANDI",
    },
    {
      path: "https://huggingface.co/.../add_details.safetensors",
      scale: 0.55,
      trigger: null,
      name: "add-details",
    },
    {
      path: "https://huggingface.co/.../realism.safetensors",
      scale: 0.25,
      trigger: null,
      name: "realism",
    },
  ],
  prompt_used: "cvwmn interior cvwmn interior cvwmn interior …",
  negative_prompt_used: "blurry, low quality, distorted …",
  provider: "flux-general",
  provider_fallback_reason: null,
  strength: 0.82,
  guidance_scale: 3.5,
  num_inference_steps: 28,
  seed: 42,
  image_width: 1024,
  image_height: 768,
  latency_ms: 18_200,
  cost_usd: 0.045,
  judge_score: null,
  generated_at_iso: "2026-04-21T02:11:00Z",
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
  process.env.COVA_REDESIGN_URL = "https://redesign.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("generateRedesign", () => {
  it("happy path with LoRA activation returns parsed response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    const result = await generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
      roomType: "bedroom",
    });
    expect(result.redesign_url).toBe("https://example.com/redesign.jpg");
    expect(result.archetype_resolved).toBe("COVAJAPANDI");
    expect(result.primary_trigger).toBe("cvwmn");
    expect(result.provider).toBe("flux-general");
    expect(result.loras_used).toHaveLength(3);
    expect(result.loras_used[0]!.trigger).toBe("cvwmn");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://redesign.test/v1/generate_redesign",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("passes style_blend, style_fingerprint, and budget through the request body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    const styleBlend = { COVAJAPANDI: 0.7, COVASCANDINAV: 0.3 };
    const styleFingerprint = { warmth: 0.6, formality: 0.5 };
    await generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
      styleBlend,
      styleFingerprint,
      budgetMax: 5000,
      roomType: "bedroom",
      lifestyleContext: "calm, minimal, small family",
      seed: 123,
      userId: "user-abc",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.empty_room_url).toBe("https://example.com/empty.png");
    expect(body.archetype_key).toBe("COVAJAPANDI");
    expect(body.style_blend).toEqual(styleBlend);
    expect(body.style_fingerprint).toEqual(styleFingerprint);
    expect(body.budget_max).toBe(5000);
    expect(body.room_type).toBe("bedroom");
    expect(body.lifestyle_context).toBe("calm, minimal, small family");
    expect(body.seed).toBe(123);
    expect(body.user_id).toBe("user-abc");
  });

  it("passes reflection-loop overrides through when set", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    await generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAINDUSTRIAL",
      strengthOverride: 0.7,
      guidanceOverride: 4.2,
      stepsOverride: 30,
      promptOverride: "cvind interior … strengthened …",
      loraScaleMultiplier: 1.12,
      primaryImageSize: "portrait",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.strength_override).toBe(0.7);
    expect(body.guidance_override).toBe(4.2);
    expect(body.steps_override).toBe(30);
    expect(body.prompt_override).toBe("cvind interior … strengthened …");
    expect(body.lora_scale_multiplier).toBe(1.12);
    expect(body.primary_image_size).toBe("portrait");
  });

  it("accepts nano-banana-pro as a provider value (fallback path)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...VALID_RESPONSE,
        provider: "nano-banana-pro",
        provider_fallback_reason: "flux-general:HTTPError:422",
      }),
    );
    const result = await generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
    });
    expect(result.provider).toBe("nano-banana-pro");
    expect(result.provider_fallback_reason).toBe(
      "flux-general:HTTPError:422",
    );
  });

  it("throws on schema mismatch (bogus payload)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ schema_version: "1.0", redesign_url: "not-a-url" }),
    );
    await expect(
      generateRedesign({
        emptyRoomUrl: "https://example.com/empty.png",
        archetypeKey: "COVAJAPANDI",
      }),
    ).rejects.toThrow(RedesignError);
  });

  it("throws on unrecognized provider enum", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...VALID_RESPONSE, provider: "marble" }),
    );
    await expect(
      generateRedesign({
        emptyRoomUrl: "https://example.com/empty.png",
        archetypeKey: "COVAJAPANDI",
      }),
    ).rejects.toThrow(RedesignError);
  });

  it("maps HTTP 400 to RedesignBadRequestError (no retry)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { detail: { error: "unknown_archetype", message: "bad" } },
        400,
      ),
    );
    const err = await generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "BOGUSKEY",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RedesignBadRequestError);
    expect((err as RedesignError).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps HTTP 502 to RedesignUpstreamError and retries once", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ detail: { error: "upstream_failure" } }, 502),
      )
      .mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    const p = generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
    });
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await p;
    expect(result.archetype_resolved).toBe("COVAJAPANDI");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on generic 5xx and succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    const p = generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
    });
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await p;
    expect(result.archetype_resolved).toBe("COVAJAPANDI");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "bad input" }, 422),
    );
    await expect(
      generateRedesign({
        emptyRoomUrl: "https://example.com/empty.png",
        archetypeKey: "COVAJAPANDI",
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws RedesignTimeoutError when request aborts", async () => {
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
    const p = generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
    }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(90_001);
    const err = await p;
    expect(err).toBeInstanceOf(RedesignTimeoutError);
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
    const p = generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
      timeoutMs: 10_000,
    }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_001);
    const err = await p;
    expect(err).toBeInstanceOf(RedesignTimeoutError);
  });

  it("preserves nullable judge_score on the response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...VALID_RESPONSE, judge_score: 8.4 }),
    );
    const result = await generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
    });
    expect(result.judge_score).toBeCloseTo(8.4);
  });

  it("force_nb_pro flag reaches the service payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_RESPONSE));
    await generateRedesign({
      emptyRoomUrl: "https://example.com/empty.png",
      archetypeKey: "COVAJAPANDI",
      forceNbPro: true,
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.force_nb_pro).toBe(true);
  });
});

describe("schema direct parse", () => {
  it("RedesignResponseSchema rejects malformed payload", () => {
    expect(() =>
      RedesignResponseSchema.parse({ schema_version: "2.0" }),
    ).toThrow(ZodError);
  });

  it("RedesignResponseSchema accepts optional provider_fallback_reason", () => {
    const parsed = RedesignResponseSchema.parse({
      ...VALID_RESPONSE,
      provider: "nano-banana-pro",
      provider_fallback_reason: "flux-general:timeout",
    });
    expect(parsed.provider).toBe("nano-banana-pro");
    expect(parsed.provider_fallback_reason).toBe("flux-general:timeout");
  });

  it("RedesignResponseSchema rejects unknown provider enum", () => {
    expect(() =>
      RedesignResponseSchema.parse({
        ...VALID_RESPONSE,
        provider: "stable-diffusion",
      }),
    ).toThrow(ZodError);
  });
});

describe.skip("@integration live Modal endpoint", () => {
  it("generateRedesign against live endpoint validates schema", async () => {
    delete process.env.COVA_REDESIGN_URL;
    vi.unstubAllGlobals();
    const emptyUrl =
      "https://v3b.fal.media/files/b/0a9714d3/ThMYvvNkrh7h7C5kh0iL9_f23d791f5f15480d8c7822ddf10dc99e.png";
    const result = await generateRedesign({
      emptyRoomUrl: emptyUrl,
      archetypeKey: "COVAJAPANDI",
      roomType: "bedroom",
      seed: 42,
      timeoutMs: 180_000,
    });
    expect(result.schema_version).toBe("1.0");
    expect(result.archetype_resolved).toBe("COVAJAPANDI");
    expect(result.provider).toBeDefined();
    expect(result.image_width).toBeGreaterThan(0);
  }, 240_000);
});
