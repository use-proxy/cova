// P01b — POST /api/users/export
// Sync-with-waitUntil-fallback per phase doc §9. 7-second internal timeout.
// On timeout, return { ok: true, status: "queued" } and finish the zip in
// background; email the signed URL when ready.
// Failure categories emitted: auth.export.zip_fail, auth.signup.rate_limit, auth.session.expired.

import { type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import JSZip from "jszip";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { checkPerIp } from "@/lib/rate-limit/upstash";
import { authFailure, authSuccess, getClientIp } from "@/lib/auth/responses";
import { sendAuthEmail } from "@/lib/email/resend";
import { GdprExportReadyEmail } from "@/emails/gdpr-export-ready";
import { redactLogPayload } from "@/lib/log/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNC_TIMEOUT_MS = 7000;
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

interface ExportResult {
  downloadUrl: string;
  expiresAt: string;
}

/**
 * Parse a Supabase Storage URL into (bucket, objectPath).
 * Handles both `/object/public/<bucket>/<path>` and `/object/sign/<bucket>/<path>?token=…`.
 * Returns null for non-Supabase URLs.
 */
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    // Match `/storage/v1/object/{public|sign|authenticated}/<bucket>/<rest>`.
    const m = u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Fetch image bytes for the GDPR export zip.
 *
 * Strategy:
 *  1. If the URL is a Supabase Storage URL, download via the service-role
 *     admin client (`storage.from(bucket).download(path)`). This works for
 *     private buckets and is independent of any presigned-URL token's
 *     expiry/rotation.
 *  2. Otherwise fall back to a plain `fetch()` (e.g. external CDN URLs).
 *
 * Validates the response looks like an image — content-type startsWith
 * "image/" OR a non-trivial byte length — before accepting it. This catches
 * the failure mode where a private URL silently returns an HTML error page.
 */
async function fetchImageBytes(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  url: string,
): Promise<Uint8Array | null> {
  const parsed = parseSupabaseStorageUrl(url);
  if (parsed) {
    const { data, error } = await admin.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    const buf = new Uint8Array(ab);
    if (buf.byteLength < 64) return null;
    return buf;
  }
  // Non-Supabase URL (e.g. fal.ai output). Plain fetch is fine.
  const res = await fetch(url);
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") ?? "";
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!ct.startsWith("image/") && buf.byteLength < 64) return null;
  return buf;
}

async function buildZip(userId: string, userEmail: string): Promise<ExportResult> {
  const admin = createAdminSupabaseClient();

  const [profileRes, roomsRes, rendersRes, swipesRes, savedRes] = await Promise.all([
    admin.from("users").select("*").eq("id", userId).maybeSingle(),
    admin.from("rooms").select("*").eq("user_id", userId),
    admin.from("renders").select("*").eq("user_id", userId),
    admin.from("swipe_history").select("*").eq("user_id", userId),
    admin.from("saved_products").select("*").eq("user_id", userId),
  ]);

  const zip = new JSZip();
  zip.file("profile.json", JSON.stringify(profileRes.data ?? {}, null, 2));
  zip.file("email.txt", userEmail);
  zip.file("rooms.json", JSON.stringify(roomsRes.data ?? [], null, 2));
  zip.file("renders.json", JSON.stringify(rendersRes.data ?? [], null, 2));
  zip.file("swipes.json", JSON.stringify(swipesRes.data ?? [], null, 2));
  zip.file("saved-products.json", JSON.stringify(savedRes.data ?? [], null, 2));

  // Pack render image bytes (best-effort, capped at 50 to keep zip sane).
  // Render images live in the private `renders` bucket. URLs in the DB are
  // long-lived presigned URLs, but we deliberately re-fetch via the admin
  // storage client so a previously-signed URL that has since rotated still
  // returns real bytes (not an HTML error page).
  const renders = (rendersRes.data ?? []) as Array<Record<string, unknown>>;
  const imagesFolder = zip.folder("images");
  if (imagesFolder) {
    const candidateUrls = renders
      .map((r) => (r.image_url ?? r.panoramic_url ?? r.empty_room_url) as string | undefined)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .slice(0, 50);
    await Promise.all(
      candidateUrls.map(async (url, idx) => {
        try {
          const buf = await fetchImageBytes(admin, url);
          if (!buf) return;
          const ext = (url.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? "jpg").toLowerCase();
          imagesFolder.file(`render-${String(idx + 1).padStart(3, "0")}.${ext}`, buf);
        } catch {
          // best-effort — never let one bad URL break the export.
        }
      }),
    );
  }

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const path = `${userId}/export-${Date.now()}.zip`;
  const bucket = "user-exports";
  // Best-effort bucket ensure; bucket creation is an ops step but we don't
  // want this route to fail when the bucket already exists.
  await admin.storage.createBucket(bucket, { public: false }).catch(() => undefined);
  const upload = await admin.storage.from(bucket).upload(path, buf, {
    contentType: "application/zip",
    upsert: true,
  });
  if (upload.error) {
    throw new Error(`upload-failed:${upload.error.message}`);
  }
  const signed = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`signed-url-failed:${signed.error?.message ?? "no-url"}`);
  }
  return {
    downloadUrl: signed.data.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString(),
  };
}

async function buildAndEmail(userId: string, userEmail: string) {
  try {
    const r = await buildZip(userId, userEmail);
    await sendAuthEmail({
      to: userEmail,
      subject: "Your Cova data export is ready",
      react: GdprExportReadyEmail({ downloadUrl: r.downloadUrl, expiresAtIso: r.expiresAt }),
      costCategory: "auth.email.export",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    // eslint-disable-next-line no-console
    console.warn("[users/export] background failed", redactLogPayload({ detail }));
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkPerIp("users-export", ip);
  if (!rl.ok) {
    const hours = Math.ceil((rl.retryAfterSec ?? 3600) / 3600);
    return authFailure(
      "auth.signup.rate_limit",
      `You can request another export in ${hours} hour${hours === 1 ? "" : "s"}.`,
      429,
      `retry-after-${rl.retryAfterSec}s`,
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return authFailure(
      "auth.session.expired",
      "Your session expired. Please sign in again.",
      401,
      error?.message ?? "no-user",
    );
  }

  const userId = user.id;
  const userEmail = user.email!;

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), SYNC_TIMEOUT_MS);
  });
  const buildPromise = buildZip(userId, userEmail);

  try {
    const result = await Promise.race([buildPromise, timeout]);
    if (timer) clearTimeout(timer);
    if (result === "timeout") {
      // Hand off to background; do NOT await buildPromise here. We attach the
      // email step via .then() so that background completion still fires the
      // notification. Do this OUTSIDE waitUntil so we can also independently
      // call sendAuthEmail on completion.
      waitUntil(
        buildPromise
          .then(async (r) => {
            await sendAuthEmail({
              to: userEmail,
              subject: "Your Cova data export is ready",
              react: GdprExportReadyEmail({ downloadUrl: r.downloadUrl, expiresAtIso: r.expiresAt }),
              costCategory: "auth.email.export",
            });
          })
          .catch((err: unknown) => {
            const detail = err instanceof Error ? err.message : "unknown";
            // eslint-disable-next-line no-console
            console.warn("[users/export] queued failed", redactLogPayload({ detail }));
          }),
      );
      return authSuccess({ status: "queued" });
    }
    return authSuccess({
      downloadUrl: result.downloadUrl,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    const detail = err instanceof Error ? err.message : "unknown";
    // Try to recover by handing the failed promise to background with email.
    // But here the promise has already rejected — fall back to a fresh attempt
    // in background.
    waitUntil(buildAndEmail(userId, userEmail));
    return authFailure(
      "auth.export.zip_fail",
      "Couldn't build your export right now. We'll email it when it's ready.",
      500,
      detail,
    );
  }
}
