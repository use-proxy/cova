import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/feature-flags", () => ({ isFlagEnabledForUser: vi.fn() }));
vi.mock("@/lib/cost/log", () => ({ logCost: vi.fn() }));

import {
  chooseRedesignJobs,
  runRedesignJobs,
  defaultRunners,
  NB_PRO_DEFAULT_FLAG,
  TWO_VARIANTS_FLAG,
  type RedesignInput,
  type RedesignRunners,
} from "@/lib/ai/redesign-provider";

// Fake feature_flags: the rows the migration seeds, overridable per test.
function flags(rows: Record<string, boolean>) {
  return async (key: string) => rows[key] ?? false;
}
const SEEDED = { [NB_PRO_DEFAULT_FLAG]: true, [TWO_VARIANTS_FLAG]: false };

const INPUT: RedesignInput = {
  emptyRoomUrl: "https://example.com/empty.jpg",
  prompt: "cvwmn japandi living room, oak, linen",
  seed: 42,
  v3WebhookUrl: "https://modal.example/v1/generate_redesign",
  v3Body: { room_id: "room-1", seed: 42 },
};

function fakeRunners(overrides: Partial<RedesignRunners> = {}): RedesignRunners {
  return {
    "nano-banana-pro": vi.fn(async () => ({ provider: "nano-banana-pro" as const, renderUrl: "https://fal/nb.jpg" })),
    "flux-depth-controlnet": vi.fn(async () => ({ provider: "flux-depth-controlnet" as const, renderUrl: "https://fal/cn.jpg" })),
    v3: vi.fn(async () => ({ provider: "v3" as const, renderUrl: "https://modal/v3.jpg" })),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("chooseRedesignJobs", () => {
  it("defaults to nano-banana-pro with the seeded flags", async () => {
    expect(await chooseRedesignJobs("user-1", flags(SEEDED))).toEqual(["nano-banana-pro"]);
  });

  it("falls back to V3 when redesign_nb_pro_default is off", async () => {
    expect(await chooseRedesignJobs("user-1", flags({ ...SEEDED, [NB_PRO_DEFAULT_FLAG]: false }))).toEqual(["v3"]);
  });

  it("requests two variants when render_two_variants is on", async () => {
    expect(await chooseRedesignJobs("user-1", flags({ ...SEEDED, [TWO_VARIANTS_FLAG]: true }))).toEqual([
      "nano-banana-pro",
      "flux-depth-controlnet",
    ]);
  });

  it("kill switch wins over two variants", async () => {
    expect(await chooseRedesignJobs("user-1", flags({ [NB_PRO_DEFAULT_FLAG]: false, [TWO_VARIANTS_FLAG]: true }))).toEqual(["v3"]);
  });
});

describe("runRedesignJobs", () => {
  it("uses nano-banana-pro and never calls V3 when it succeeds", async () => {
    const runners = fakeRunners();
    const out = await runRedesignJobs(["nano-banana-pro"], INPUT, runners);
    expect(out.primary.provider).toBe("nano-banana-pro");
    expect(out.fallbackReason).toBeNull();
    expect(runners.v3).not.toHaveBeenCalled();
  });

  it("falls back to V3 when nano-banana-pro fails", async () => {
    const runners = fakeRunners({ "nano-banana-pro": vi.fn(async () => { throw new Error("fal 503"); }) });
    const out = await runRedesignJobs(["nano-banana-pro"], INPUT, runners);
    expect(out.primary).toEqual({ provider: "v3", renderUrl: "https://modal/v3.jpg" });
    expect(out.fallbackReason).toContain("nano-banana-pro: fal 503");
  });

  it("returns both variants in two-variant mode, NB-Pro first", async () => {
    const runners = fakeRunners();
    const out = await runRedesignJobs(["nano-banana-pro", "flux-depth-controlnet"], INPUT, runners);
    expect(out.variants.map((v) => v.provider)).toEqual(["nano-banana-pro", "flux-depth-controlnet"]);
    expect(out.primary.provider).toBe("nano-banana-pro");
    expect(runners.v3).not.toHaveBeenCalled();
  });

  it("keeps the surviving variant when one of the two fails", async () => {
    const runners = fakeRunners({ "flux-depth-controlnet": vi.fn(async () => { throw new Error("depth failed"); }) });
    const out = await runRedesignJobs(["nano-banana-pro", "flux-depth-controlnet"], INPUT, runners);
    expect(out.variants.map((v) => v.provider)).toEqual(["nano-banana-pro"]);
    expect(runners.v3).not.toHaveBeenCalled();
  });

  it("runs only V3 when the plan is V3", async () => {
    const runners = fakeRunners();
    const out = await runRedesignJobs(["v3"], INPUT, runners);
    expect(out.primary.provider).toBe("v3");
    expect(runners["nano-banana-pro"]).not.toHaveBeenCalled();
  });
});

describe("default runners (fetch faked, no network)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("FAL_KEY", "test-key");
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("calls fal-ai/nano-banana-pro/edit with the prompt and the empty room", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal/nb.jpg" }] }));
    const out = await runRedesignJobs(["nano-banana-pro"], INPUT, defaultRunners);
    expect(out.primary.renderUrl).toBe("https://fal/nb.jpg");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fal.run/fal-ai/nano-banana-pro/edit");
    expect(JSON.parse(init.body)).toEqual({ prompt: INPUT.prompt, image_urls: [INPUT.emptyRoomUrl] });
  });

  it("posts the unchanged V3 body to the Modal webhook when NB-Pro errors", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("upstream", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ status: "complete", render_url: "https://modal/v3.jpg" }));
    const out = await runRedesignJobs(["nano-banana-pro"], INPUT, defaultRunners);
    expect(out.primary.provider).toBe("v3");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(INPUT.v3WebhookUrl);
    expect(JSON.parse(init.body)).toEqual(INPUT.v3Body);
  });

  it("sends the depth map to flux-general as a depth ControlNet", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ image: { url: "https://fal/depth.png" } }))
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal/cn.jpg" }] }));
    const out = await runRedesignJobs(["flux-depth-controlnet"], INPUT, defaultRunners);
    expect(out.primary).toEqual({ provider: "flux-depth-controlnet", renderUrl: "https://fal/cn.jpg" });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fetchMock.mock.calls[1][0]).toBe("https://fal.run/fal-ai/flux-general/image-to-image");
    expect(body.controlnet_unions[0].controls[0]).toMatchObject({ control_image_url: "https://fal/depth.png", control_mode: "depth" });
  });
});
