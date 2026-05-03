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

export type FailureCategory =
  | CostFailure
  | InfraFailure
  | SubagentFailure
  | CaptureFailurePreprocess;
// Phase 1B will extend with AuthFailure; Phase 2 with QuizFailure; etc.
