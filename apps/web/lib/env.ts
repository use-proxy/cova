/**
 * Environment variable validation.
 * Call validateEnvironment() once at app startup to catch missing config early.
 * Missing optional vars log warnings; missing required vars throw in production.
 */

interface EnvVar {
  name: string;
  required: boolean;
  serverOnly?: boolean;
}

const ENV_VARS: EnvVar[] = [
  // Supabase — required
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, serverOnly: true },
  // AI APIs — required for core features
  { name: "REPLICATE_API_TOKEN", required: true, serverOnly: true },
  { name: "ANTHROPIC_API_KEY", required: true, serverOnly: true },
  // Analytics — optional (app works without them)
  { name: "NEXT_PUBLIC_POSTHOG_KEY", required: false },
  { name: "SENTRY_DSN", required: false, serverOnly: true },
  // Affiliates — optional (affiliate URLs degrade gracefully)
  { name: "AMAZON_AFFILIATE_TAG", required: false, serverOnly: true },
  // Search — optional (used for product enrichment)
  { name: "SERPER_API_KEY", required: false, serverOnly: true },
];

interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnvironment(): ValidationResult {
  const isServer = typeof window === "undefined";
  const isProd = process.env.NODE_ENV === "production";

  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    if (envVar.serverOnly && !isServer) continue;

    const value = process.env[envVar.name];
    if (!value || value.trim() === "") {
      if (envVar.required) {
        missing.push(envVar.name);
      } else {
        warnings.push(envVar.name);
      }
    }
  }

  if (warnings.length > 0 && !isProd) {
    console.warn("[env] Optional vars not set:", warnings.join(", "));
  }

  if (missing.length > 0) {
    const msg = `[env] Required env vars missing: ${missing.join(", ")}`;
    if (isProd) {
      throw new Error(msg);
    } else {
      console.error(msg);
    }
  }

  return { valid: missing.length === 0, missing, warnings };
}
