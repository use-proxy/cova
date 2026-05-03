// Dotted-namespace failure_category. Each phase owns its prefix.
// P01a owns: cost.*, infra.*, subagent.*, capture.* (preprocess only — full
// capture stage names land in Phase 3).

export type CostFailure =
  | "cost.log.write_fail"
  | "cost.monitor.cron_fail"
  | "cost.monitor.threshold_breach"
  | "cost.paidcall.fetch_fail"
  | "cost.paidcall.parse_fail";

export type InfraFailure =
  | "infra.cloudflare.images_unreachable"
  | "infra.cloudflare.r2_write_fail"
  | "infra.sentry.init_fail"
  | "infra.posthog.capture_fail"
  | "infra.feature_flag.read_fail";

export type SubagentFailure =
  | "subagent.verifier.run_fail"
  | "subagent.schema_reviewer.api_fail"
  | "subagent.cost_monitor.api_fail"
  | "subagent.sync.diff_detected";

export type CaptureFailurePreprocess =
  | "capture.exif.strip_fail"
  | "capture.exif.read_fail"
  | "capture.image.too_large"
  | "capture.image.invalid_format";

export type AuthFailure =
  | "auth.signup.email_taken"
  | "auth.signup.password_weak"
  | "auth.signup.turnstile_fail"
  | "auth.signup.rate_limit"
  | "auth.signup.resend_send_fail"
  | "auth.signin.invalid_credentials"
  | "auth.signin.account_locked"
  | "auth.oauth.provider_error"
  | "auth.oauth.email_mismatch"
  | "auth.forgot.send_fail"
  | "auth.reset.token_expired"
  | "auth.reset.token_used"
  | "auth.reset.password_weak"
  | "auth.verify.token_expired"
  | "auth.verify.token_used"
  | "auth.delete.confirm_mismatch"
  | "auth.delete.cascade_fail"
  | "auth.export.zip_fail"
  | "auth.session.expired"
  | "auth.signin.silent_lockout"
  | "auth.oauth.email_exists";

export type FailureCategory =
  | CostFailure
  | InfraFailure
  | SubagentFailure
  | CaptureFailurePreprocess
  | AuthFailure;
// Phase 2 will extend with QuizFailure; etc.
