/**
 * Cova structured logger — development-only observability layer.
 *
 * Architecture:
 *   - Server-side (API routes, middleware): writes NDJSON to .dev-logs/ + colored console
 *   - Client-side (browser pages): colored console + queues entries for /api/dev-log relay
 *   - Production: complete no-op (zero output, zero file I/O, zero network)
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   const log = logger.child({ stepId: 'step-7', roomId, userId })
 *   log.info('DETECTION', LogEvents.DETECTION_STEP7_LOAD, 'Step 7 mounted with roomId', { roomId })
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export type LogCategory =
  | "BOOT"
  | "AUTH"
  | "NAVIGATION"
  | "UI"
  | "QUIZ"
  | "BUDGET"
  | "UPLOAD"
  | "DETECTION"
  | "CONSTRAINTS"
  | "KEEP_REMOVE"
  | "CHAT"
  | "RENDER"
  | "REFINEMENT"
  | "SHOP"
  | "API"
  | "SUPABASE"
  | "MODAL"
  | "REPLICATE"
  | "STORE"
  | "PIPELINE"
  | "PERF"
  | "ERROR";

export interface CováLogEntry {
  // Identity
  _v: 1;
  sequence: number;
  sessionId: string;
  timestamp: string;

  // Classification
  level: LogLevel;
  category: LogCategory;
  event: string;

  // Context
  userId: string | null;
  roomId: string | null;
  stepId: string | null;
  renderJobId: string | null;
  sessionRenderCount: number;

  // Operation details
  message: string;
  durationMs: number | null;
  httpMethod: string | null;
  httpRoute: string | null;
  httpStatus: number | null;

  // Payload
  data: Record<string, unknown> | null;

  // Error
  error: {
    message: string;
    name: string;
    stack: string | null;
    code: string | null;
    httpStatus: number | null;
    retryCount: number | null;
  } | null;
}

type PartialEntry = Partial<
  Omit<CováLogEntry, "_v" | "sequence" | "sessionId" | "timestamp" | "level" | "category" | "event" | "message">
>;

// ─── Environment detection ───────────────────────────────────────────────────

const IS_SERVER = typeof window === "undefined";
const IS_DEV = process.env.NODE_ENV !== "production";

// ─── Session ID (stable per process / module load) ───────────────────────────

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Single session ID per process/module load
const SESSION_ID = generateUUID();
const SESSION_ID_SHORT = SESSION_ID.slice(0, 8);

// ─── Sequence counter (atomic within single-threaded JS) ─────────────────────

let _sequence = 0;
function nextSeq(): number {
  return ++_sequence;
}

// ─── Render counter ──────────────────────────────────────────────────────────

let _renderCount = 0;
export function incrementRenderCount(): void {
  _renderCount++;
}

// ─── ANSI color codes (server-side console) ──────────────────────────────────

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
} as const;

function levelColor(level: LogLevel): string {
  switch (level) {
    case "DEBUG": return ANSI.gray;
    case "INFO": return ANSI.green;
    case "WARN": return ANSI.yellow;
    case "ERROR": return ANSI.red;
    case "FATAL": return ANSI.red + ANSI.bold;
  }
}

// ─── Server-side file writer ─────────────────────────────────────────────────

let _logFilePath: string | null = null;
let _logFileReady = false;

function getLogFilePath(): string | null {
  if (!IS_SERVER || !IS_DEV) return null;
  if (_logFilePath) return _logFilePath;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dir = path.join(process.cwd(), ".dev-logs");
    _logFilePath = path.join(dir, `cova-${today}-${SESSION_ID_SHORT}.ndjson`);
    return _logFilePath;
  } catch {
    return null;
  }
}

function ensureLogDir(): void {
  if (_logFileReady) return;
  const filePath = getLogFilePath();
  if (!filePath) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    _logFileReady = true;
  } catch {
    // File I/O failure must never crash the app
  }
}

function appendToFile(line: string): void {
  if (!IS_SERVER || !IS_DEV) return;
  const filePath = getLogFilePath();
  if (!filePath) return;

  try {
    ensureLogDir();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    fs.appendFileSync(filePath, line + "\n", "utf8");
  } catch {
    // Silently swallow — log I/O must never affect app behavior
  }
}

// ─── Client-side relay queue ─────────────────────────────────────────────────

const _clientQueue: CováLogEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushing = false;

function scheduleClientFlush(): void {
  if (!IS_DEV || IS_SERVER) return;
  if (_flushTimer !== null) return;
  _flushTimer = setTimeout(flushClientQueue, 500);
}

async function flushClientQueue(): Promise<void> {
  _flushTimer = null;
  if (_flushing || _clientQueue.length === 0) return;
  _flushing = true;

  const batch = _clientQueue.splice(0, _clientQueue.length);
  try {
    await fetch("/api/dev-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      keepalive: true,
    });
  } catch {
    // Silently swallow relay errors — logging must never affect app behavior
  } finally {
    _flushing = false;
    if (_clientQueue.length > 0) scheduleClientFlush();
  }
}

// ─── Console output ──────────────────────────────────────────────────────────

function formatConsoleServer(entry: CováLogEntry): string {
  const ts = entry.timestamp.split("T")[1]?.replace("Z", "") ?? entry.timestamp;
  const color = levelColor(entry.level);
  const seqStr = String(entry.sequence).padStart(4, "0");
  const cat = entry.category.padEnd(12);

  let out =
    `${ANSI.gray}[${ts}]${ANSI.reset} ` +
    `${color}${entry.level.padEnd(5)}${ANSI.reset} ` +
    `${ANSI.cyan}${cat}${ANSI.reset} ` +
    `${ANSI.dim}#${seqStr}${ANSI.reset} ` +
    `${ANSI.bold}${entry.event}${ANSI.reset}\n` +
    `  ${ANSI.gray}Room:${ANSI.reset} ${entry.roomId?.slice(0, 8) ?? "-"}  ` +
    `${ANSI.gray}Step:${ANSI.reset} ${entry.stepId ?? "-"}  ` +
    `${ANSI.gray}User:${ANSI.reset} ${entry.userId?.slice(0, 8) ?? "-"}\n` +
    `  "${entry.message}"`;

  if (entry.data && Object.keys(entry.data).length > 0) {
    const dataStr = Object.entries(entry.data)
      .map(([k, v]) => {
        const val = typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : JSON.stringify(v);
        return `  ${ANSI.dim}${k}${ANSI.reset}: ${val}`;
      })
      .join("\n");
    out += `\n${dataStr}`;
  }

  if (entry.error) {
    out +=
      `\n  ${ANSI.red}ERROR: ${entry.error.message}${ANSI.reset}` +
      `\n  Code: ${entry.error.code ?? "-"}  HTTP: ${entry.error.httpStatus ?? "-"}`;
    if (entry.error.stack) {
      out += `\n  ${ANSI.gray}${entry.error.stack.split("\n").slice(0, 4).join("\n  ")}${ANSI.reset}`;
    }
  }

  if (entry.durationMs !== null) {
    out += `\n  ${ANSI.dim}⏱ ${entry.durationMs}ms${ANSI.reset}`;
  }

  return out;
}

function emitConsoleServer(entry: CováLogEntry): void {
  const formatted = formatConsoleServer(entry);
  /* eslint-disable no-console, cova-rules/no-unsafe-console */
  if (entry.level === "ERROR" || entry.level === "FATAL") {
    console.error(formatted);
  } else if (entry.level === "WARN") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
  /* eslint-enable no-console, cova-rules/no-unsafe-console */
}

function emitConsoleBrowser(entry: CováLogEntry): void {
  const ts = entry.timestamp.split("T")[1]?.replace("Z", "") ?? "";
  const seqStr = String(entry.sequence).padStart(4, "0");

  const levelColors: Record<LogLevel, string> = {
    DEBUG: "color: #888",
    INFO: "color: #4CAF50",
    WARN: "color: #FFA500; font-weight: bold",
    ERROR: "color: #F44336; font-weight: bold",
    FATAL: "color: #F44336; font-weight: bold; text-decoration: underline",
  };

  const prefix = `%c[${ts}] ${entry.level} ${entry.category} #${seqStr} ${entry.event}`;
  const style = levelColors[entry.level];

  /* eslint-disable no-console, cova-rules/no-unsafe-console */
  if (entry.level === "ERROR" || entry.level === "FATAL") {
    console.error(prefix, style, "\n", entry.message, entry.data ?? "", entry.error ?? "");
  } else if (entry.level === "WARN") {
    console.warn(prefix, style, "\n", entry.message, entry.data ?? "");
  } else {
    console.log(prefix, style, "\n", entry.message, entry.data ?? "");
  }
  /* eslint-enable no-console, cova-rules/no-unsafe-console */
}

// ─── Core emit ───────────────────────────────────────────────────────────────

function emit(entry: CováLogEntry): void {
  if (!IS_DEV) return;

  if (IS_SERVER) {
    emitConsoleServer(entry);
    appendToFile(JSON.stringify(entry));
  } else {
    emitConsoleBrowser(entry);
    _clientQueue.push(entry);
    scheduleClientFlush();
  }
}

// ─── Timer store ─────────────────────────────────────────────────────────────

const _timers = new Map<string, number>();

// ─── CovaLogger class ────────────────────────────────────────────────────────

export class CovaLogger {
  private _defaults: PartialEntry;

  constructor(defaults: PartialEntry = {}) {
    this._defaults = defaults;
  }

  private _build(
    level: LogLevel,
    category: LogCategory,
    event: string,
    message: string,
    fields: PartialEntry = {},
  ): CováLogEntry {
    const merged = { ...this._defaults, ...fields };
    return {
      _v: 1,
      sequence: nextSeq(),
      sessionId: SESSION_ID,
      timestamp: new Date().toISOString(),
      level,
      category,
      event,
      userId: merged.userId ?? null,
      roomId: merged.roomId ?? null,
      stepId: merged.stepId ?? null,
      renderJobId: merged.renderJobId ?? null,
      sessionRenderCount: merged.sessionRenderCount ?? _renderCount,
      message,
      durationMs: merged.durationMs ?? null,
      httpMethod: merged.httpMethod ?? null,
      httpRoute: merged.httpRoute ?? null,
      httpStatus: merged.httpStatus ?? null,
      data: merged.data ?? null,
      error: merged.error ?? null,
    };
  }

  debug(category: LogCategory, event: string, message: string, fields?: PartialEntry): void {
    emit(this._build("DEBUG", category, event, message, fields));
  }

  info(category: LogCategory, event: string, message: string, fields?: PartialEntry): void {
    emit(this._build("INFO", category, event, message, fields));
  }

  warn(category: LogCategory, event: string, message: string, fields?: PartialEntry): void {
    emit(this._build("WARN", category, event, message, fields));
  }

  error(category: LogCategory, event: string, message: string, fields?: PartialEntry): void {
    emit(this._build("ERROR", category, event, message, fields));
  }

  fatal(category: LogCategory, event: string, message: string, fields?: PartialEntry): void {
    emit(this._build("FATAL", category, event, message, fields));
  }

  /** Returns a child logger with the given defaults pre-filled. */
  child(defaults: PartialEntry): CovaLogger {
    return new CovaLogger({ ...this._defaults, ...defaults });
  }

  /**
   * Start a named timer. Returns a timerId to pass to endTimer.
   * Uses performance.now() on both server (Node) and browser.
   */
  startTimer(label: string): string {
    const id = `${label}_${nextSeq()}`;
    _timers.set(id, typeof performance !== "undefined" ? performance.now() : Date.now());
    return id;
  }

  /**
   * End a timer and emit the entry with durationMs populated.
   * The entry fields must include level, category, event, message.
   */
  endTimer(
    timerId: string,
    fields: PartialEntry & {
      level?: LogLevel;
      category: LogCategory;
      event: string;
      message: string;
    },
  ): void {
    const start = _timers.get(timerId);
    _timers.delete(timerId);
    const durationMs = start !== undefined
      ? Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start)
      : null;

    const { level = "INFO", category, event, message, ...rest } = fields;
    emit(this._build(level, category, event, message, { ...rest, durationMs }));
  }

  /**
   * Wraps an async function, automatically logging start + success/failure + duration.
   * The label is used to build INFO events: `{label}_START`, `{label}_SUCCESS`, `{label}_FAILURE`.
   */
  async timed<T>(
    label: string,
    fn: () => Promise<T>,
    fields?: PartialEntry & { category: LogCategory; startEvent?: string; successEvent?: string; failureEvent?: string },
  ): Promise<T> {
    const { category, startEvent, successEvent, failureEvent, ...rest } = fields ?? { category: "PERF" as LogCategory };
    const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (startEvent) {
      emit(this._build("INFO", category, startEvent, `Starting ${label}`, rest));
    }

    try {
      const result = await fn();
      const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startMs);
      if (successEvent) {
        emit(this._build("INFO", category, successEvent, `${label} completed in ${durationMs}ms`, { ...rest, durationMs }));
      }
      return result;
    } catch (err) {
      const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startMs);
      const error = err instanceof Error ? err : new Error(String(err));
      if (failureEvent) {
        emit(this._build("ERROR", category, failureEvent, `${label} failed after ${durationMs}ms: ${error.message}`, {
          ...rest,
          durationMs,
          error: {
            message: error.message,
            name: error.name,
            stack: error.stack ?? null,
            code: null,
            httpStatus: null,
            retryCount: null,
          },
        }));
      }
      throw err;
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const logger = new CovaLogger();

// ─── Pipeline context snapshot helper ────────────────────────────────────────

/**
 * Collects the current state of all Zustand stores and logs a PIPELINE_CONTEXT_SNAPSHOT.
 * Only works client-side (Zustand stores are browser-only).
 * Call at major milestones: CTA click, render complete, refinement complete, step-9 load.
 */
export function snapshotPipelineContext(
  trigger: string,
  overrides?: PartialEntry,
): void {
  if (!IS_DEV) return;
  if (IS_SERVER) return;

  try {
    // Lazy imports to avoid SSR issues with Zustand stores
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useRoomStore } = require("@/lib/store/room") as typeof import("@/lib/store/room");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useFingerprintStore } = require("@/lib/store/fingerprint") as typeof import("@/lib/store/fingerprint");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSessionStore } = require("@/lib/store/session") as typeof import("@/lib/store/session");

    const room = useRoomStore.getState();
    const fingerprint = useFingerprintStore.getState();
    const session = useSessionStore.getState();

    emit(logger["_build"]("INFO", "PIPELINE", "PIPELINE_CONTEXT_SNAPSHOT", `Pipeline context snapshot at: ${trigger}`, {
      ...overrides,
      roomId: room.roomId ?? overrides?.roomId ?? null,
      data: {
        trigger,
        room: {
          roomId: room.roomId,
          hasPhoto: !!room.originalPhotoUrl,
          hasRenderUrl: !!room.renderUrl,
          renderSessionCount: room.renderSessions.length,
          detectionCount: room.detections?.length ?? 0,
          keepMaskCount: room.keepMask?.length ?? 0,
        },
        fingerprint: {
          hasFingerprint: !!fingerprint.fingerprint,
          styleName: fingerprint.styleName,
          budgetTier: fingerprint.budgetTier,
          phaseACount: fingerprint.phaseASelections.length,
          phaseBCount: fingerprint.phaseBResponses.length,
        },
        session: {
          currentStep: session.currentStep,
          isLoading: session.isLoading,
          hasPendingCapture: !!(session.pendingPhotoUrl && session.pendingRoomId),
        },
      },
    }));
  } catch {
    // Store access can fail in SSR or test contexts — ignore
  }
}

// ─── Flush on page unload (browser) ─────────────────────────────────────────

if (!IS_SERVER && IS_DEV) {
  window.addEventListener("beforeunload", () => {
    if (_clientQueue.length > 0) {
      // Synchronous keepalive flush on unload
      const batch = _clientQueue.splice(0);
      try {
        navigator.sendBeacon("/api/dev-log", JSON.stringify(batch));
      } catch {
        // silently ignore
      }
    }
  });
}

export default logger;
