/**
 * Redesign provider selection.
 *
 * Default: Nano Banana Pro edit (fal-ai/nano-banana-pro/edit) on the empty
 * room — $0.04/render, keeps the room's geometry (docs/pipeline-fix/CLOSEOUT.md).
 * Kill switch: `redesign_nb_pro_default` off → the V3 Modal pipeline
 * (COVA_REDESIGN_URL), unchanged. Any NB-Pro failure also falls back to V3.
 * Optional: `render_two_variants` on → NB-Pro and FLUX depth-ControlNet run in
 * parallel on the same empty room and the user picks.
 */
import { isFlagEnabledForUser } from "@/lib/feature-flags";
import { paidCall } from "@/lib/paid/call";
import { TIMEOUTS } from "@/lib/config/timeouts";
import { RedesignError } from "@/lib/ai/redesign-client";

export const NB_PRO_DEFAULT_FLAG = "redesign_nb_pro_default";
export const TWO_VARIANTS_FLAG = "render_two_variants";

export type RedesignJob = "nano-banana-pro" | "flux-depth-controlnet" | "v3";

export interface RedesignInput {
  emptyRoomUrl: string | null;
  prompt: string | null;
  seed: number;
  v3WebhookUrl: string;
  v3Body: Record<string, unknown>;
}

export interface RedesignVariant {
  provider: RedesignJob;
  renderUrl: string;
  perspectiveRenderUrl?: string | null;
  dominantStyles?: string[];
}

export interface RedesignOutcome {
  primary: RedesignVariant;
  variants: RedesignVariant[];
  fallbackReason: string | null;
}

export type RedesignRunners = Record<RedesignJob, (input: RedesignInput) => Promise<RedesignVariant>>;

// --------------------------------------------------------------------------
// Plan — which providers this user's render runs on
// --------------------------------------------------------------------------

export async function chooseRedesignJobs(
  userId: string | null,
  isEnabled: typeof isFlagEnabledForUser = isFlagEnabledForUser,
): Promise<RedesignJob[]> {
  const [nbPro, twoVariants] = await Promise.all([
    isEnabled(NB_PRO_DEFAULT_FLAG, userId),
    isEnabled(TWO_VARIANTS_FLAG, userId),
  ]);
  if (!nbPro) return ["v3"];
  return twoVariants ? ["nano-banana-pro", "flux-depth-controlnet"] : ["nano-banana-pro"];
}

// --------------------------------------------------------------------------
// Run — new providers first, V3 if none of them produced an image
// --------------------------------------------------------------------------

export async function runRedesignJobs(
  jobs: RedesignJob[],
  input: RedesignInput,
  runners: RedesignRunners = defaultRunners,
): Promise<RedesignOutcome> {
  let fallbackReason: string | null = null;
  const fast = jobs.filter((j) => j !== "v3");
  if (fast.length > 0) {
    const settled = await Promise.allSettled(fast.map((j) => runners[j](input)));
    const variants = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    if (variants.length > 0) return { primary: variants[0], variants, fallbackReason: null };
    fallbackReason = settled
      .map((s, i) => `${fast[i]}: ${s.status === "rejected" ? String((s.reason as Error)?.message ?? s.reason) : "ok"}`)
      .join("; ");
    console.warn("[redesign] falling back to V3 —", fallbackReason);
  }
  const v3 = await runners.v3(input);
  return { primary: v3, variants: [v3], fallbackReason };
}

// --------------------------------------------------------------------------
// Providers
// --------------------------------------------------------------------------

function falHeaders(): Record<string, string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new RedesignError("FAL_KEY missing");
  return { Authorization: `Key ${falKey}`, "Content-Type": "application/json" };
}

function requireInputs(input: RedesignInput): { emptyRoomUrl: string; prompt: string } {
  if (!input.emptyRoomUrl || !input.prompt) {
    throw new RedesignError("no empty room or prompt for redesign");
  }
  return { emptyRoomUrl: input.emptyRoomUrl, prompt: input.prompt };
}

async function runNbPro(input: RedesignInput): Promise<RedesignVariant> {
  const { emptyRoomUrl, prompt } = requireInputs(input);
  const result = await paidCall<{ images?: Array<{ url?: string }> }>({
    provider: "fal",
    url: "https://fal.run/fal-ai/nano-banana-pro/edit",
    init: {
      method: "POST",
      headers: falHeaders(),
      body: JSON.stringify({ prompt, image_urls: [emptyRoomUrl] }),
      signal: AbortSignal.timeout(TIMEOUTS.REDESIGN_NB_PRO),
    },
    costEstimate: { category: "render", stage: "redesign_nb_pro", costUsd: 0.15, model: "fal-ai/nano-banana-pro/edit" },
  });
  const url = result?.images?.[0]?.url;
  if (!url) throw new RedesignError("nano-banana-pro returned no image");
  return { provider: "nano-banana-pro", renderUrl: url };
}

// Render-upgrade config (commit 67a00c9): strength 0.55, guidance 3.8, depth
// ControlNet. No LoRAs — flux-general can't run LoRAs + controlnet_unions
// together (modal_pipeline/redesign.py, Phase 2.0c.1).
async function runDepthControlNet(input: RedesignInput): Promise<RedesignVariant> {
  const { emptyRoomUrl, prompt } = requireInputs(input);
  const depth = await paidCall<{ image?: { url?: string } }>({
    provider: "fal",
    url: "https://fal.run/fal-ai/imageutils/depth",
    init: {
      method: "POST",
      headers: falHeaders(),
      body: JSON.stringify({ image_url: emptyRoomUrl }),
      signal: AbortSignal.timeout(TIMEOUTS.ANTHROPIC_VISION),
    },
    costEstimate: { category: "render", stage: "redesign_depth", costUsd: 0.005, model: "fal-ai/imageutils/depth" },
  });
  const depthUrl = depth?.image?.url;
  if (!depthUrl) throw new RedesignError("depth map returned no image");

  const result = await paidCall<{ images?: Array<{ url?: string }> }>({
    provider: "fal",
    url: "https://fal.run/fal-ai/flux-general/image-to-image",
    init: {
      method: "POST",
      headers: falHeaders(),
      body: JSON.stringify({
        image_url: emptyRoomUrl,
        prompt,
        strength: 0.55,
        guidance_scale: 3.8,
        num_inference_steps: 28,
        seed: input.seed,
        output_format: "jpeg",
        controlnet_unions: [
          {
            path: "InstantX/FLUX.1-dev-Controlnet-Union",
            controls: [
              {
                control_image_url: depthUrl,
                control_mode: "depth",
                conditioning_scale: 0.8,
                start_percentage: 0,
                end_percentage: 0.85,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUTS.REDESIGN_NB_PRO),
    },
    costEstimate: { category: "render", stage: "redesign_depth_controlnet", costUsd: 0.075, model: "fal-ai/flux-general" },
  });
  const url = result?.images?.[0]?.url;
  if (!url) throw new RedesignError("flux-general returned no image");
  return { provider: "flux-depth-controlnet", renderUrl: url };
}

// V3 3-pass Modal pipeline — the pre-existing path, now the fallback.
async function runV3(input: RedesignInput): Promise<RedesignVariant> {
  const response = await fetch(input.v3WebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.v3Body),
    // Modal V3 pipeline: ~3-5 min realistic runtime (see TIMEOUTS.REDESIGN_MODAL).
    signal: AbortSignal.timeout(TIMEOUTS.REDESIGN_MODAL),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new RedesignError("Redesign pipeline failed", 502, text);
  }
  const result = (await response.json()) as {
    status?: string;
    render_url?: string;             // V3 (cova-redesign-v3) returns this
    redesigned_pano_url?: string;    // legacy paths return this
    perspective_render_url?: string | null;
    dominant_styles?: string[];
    error?: string;
  };
  if (result.status === "error") {
    throw new RedesignError(result.error ?? "Redesign pipeline failed", 500);
  }
  const renderUrl = result.render_url ?? result.redesigned_pano_url;
  if (!renderUrl) throw new RedesignError("Modal pipeline returned no render_url", 502, result);
  return {
    provider: "v3",
    renderUrl,
    perspectiveRenderUrl: result.perspective_render_url ?? null,
    dominantStyles: result.dominant_styles ?? [],
  };
}

export const defaultRunners: RedesignRunners = {
  "nano-banana-pro": runNbPro,
  "flux-depth-controlnet": runDepthControlNet,
  v3: runV3,
};
