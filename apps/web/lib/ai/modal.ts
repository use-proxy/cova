interface ModalJobPayload {
  photo_url: string;
  depth_map_url: string;
  prompt: string;
  negative_prompt: string;
  style_strength: number;
  room_id: string;
  render_session_id: string;
}

interface ModalJobStatus {
  status: "pending" | "running" | "complete" | "failed";
  render_url?: string;
  error?: string;
}

const MODAL_TIMEOUT_MS = 90_000;
const MODAL_POLL_INTERVAL_MS = 3_000;

export async function submitRenderJob(
  payload: ModalJobPayload,
): Promise<string> {
  const modalEndpoint = process.env.MODAL_WEBHOOK_URL;

  if (!modalEndpoint) {
    throw new Error("MODAL_WEBHOOK_URL not configured in environment");
  }

  const response = await fetch(modalEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Modal job submission failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { job_id: string };
  return data.job_id;
}

export async function pollRenderJob(jobId: string): Promise<ModalJobStatus> {
  const modalStatusEndpoint = process.env.MODAL_WEBHOOK_URL;

  if (!modalStatusEndpoint) {
    throw new Error(
      "MODAL_WEBHOOK_URL not configured in environment — needed for status polling",
    );
  }

  const response = await fetch(`${modalStatusEndpoint}?job_id=${jobId}`);

  if (!response.ok) {
    throw new Error(`Modal status check failed: ${response.status}`);
  }

  return response.json() as Promise<ModalJobStatus>;
}

export async function waitForRenderJob(jobId: string): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < MODAL_TIMEOUT_MS) {
    const status = await pollRenderJob(jobId);

    if (status.status === "complete" && status.render_url) {
      return status.render_url;
    }

    if (status.status === "failed") {
      throw new Error(`Render job failed: ${status.error ?? "unknown error"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, MODAL_POLL_INTERVAL_MS));
  }

  throw new Error(`Render job timed out after ${MODAL_TIMEOUT_MS / 1000}s`);
}
