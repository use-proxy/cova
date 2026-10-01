/**
 * GET /api/render/status — the whole route, two polls of one finished render.
 *
 * Replicate, Supabase and the upscaler are faked; global fetch is spied so we
 * can count the internal calls the route fires at /api/detect/render and (20 s
 * later) /api/pipeline/furniture-match. The admin client applies each
 * UPDATE atomically and only to rows that still match its filters, like
 * Postgres.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
const db: { rooms: Row[]; render_sessions: Row[] } = {
  rooms: [],
  render_sessions: [],
};

function parseOr(expr: string): Filter {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...rest] = p.split(".");
    const val = rest.join(".");
    if (op === "eq") return (r: Row) => String(r[col]) === val;
    if (op === "is" && val === "null") return (r: Row) => r[col] == null;
    throw new Error(`fake db: unsupported filter ${p}`);
  });
  return (r) => parts.some((f) => f(r));
}

function table(name: "rooms" | "render_sessions") {
  const rows = db[name];
  const filters: Filter[] = [];
  let op: "select" | "update" | "insert" = "select";
  let values: Row = {};
  let returning = false;
  const run = async (): Promise<{ data: Row[] | null; error: null }> => {
    await Promise.resolve(); // yield, so concurrent polls interleave
    if (op === "insert") {
      const row = { id: `${name}-${rows.length + 1}`, ...values };
      rows.push(row);
      return { data: [row], error: null };
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      for (const r of hit) Object.assign(r, values);
      return { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
    }
    return { data: hit, error: null };
  };
  const b = {
    select() {
      if (op === "select") op = "select";
      else returning = true;
      return b;
    },
    update(v: Row) {
      op = "update";
      values = v;
      return b;
    },
    insert(v: Row) {
      op = "insert";
      values = v;
      return b;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return b;
    },
    or(expr: string) {
      filters.push(parseOr(expr));
      return b;
    },
    async single() {
      const { data } = await run();
      return { data: data?.[0] ?? null, error: null };
    },
    async maybeSingle() {
      const { data } = await run();
      return { data: data?.[0] ?? null, error: null };
    },
    then<T>(ok: (v: { data: Row[] | null; error: null }) => T, fail?: (e: unknown) => T) {
      return run().then(ok, fail);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (name: "rooms" | "render_sessions") => table(name),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  }),
}));
vi.mock("replicate", () => ({
  default: class {
    predictions = {
      get: async () => ({
        status: "succeeded",
        output: ["https://replicate.delivery/render.png"],
        input: { prompt: "warm japandi living room" },
      }),
    };
  },
}));
vi.mock("@/lib/ai/flux", () => ({
  runUpscale: async (url: string) => url,
  submitArchitectureCorrection: async () => "pass2",
}));
vi.mock("@/lib/ai/upscaler", () => ({ upscaleRender: async (u: string) => u }));
vi.mock("@/lib/ai/grounding", () => ({ detectFurniture: async () => [] }));

const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));

function calls(path: string) {
  return fetchSpy.mock.calls.filter((c) => String(c[0]).endsWith(path)).length;
}

function poll() {
  return GET(
    new NextRequest(
      "http://localhost:3000/api/render/status?prediction_id=pred-1&room_id=room-1",
    ),
  );
}

let GET: (req: NextRequest) => Promise<Response>;

describe("GET /api/render/status — two polls of one finished render", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockClear();
    db.rooms.length = 0;
    db.render_sessions.length = 0;
    db.rooms.push({
      id: "room-1",
      user_id: "user-1",
      redesign_status: "pending",
      pipeline_cost_log: null,
    });
    ({ GET } = await import("@/app/api/render/status/route"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires /api/detect/render and /api/pipeline/furniture-match once, not once per poll", async () => {
    const [a, b] = await Promise.all([poll(), poll()]);
    expect((await a.json()).status).toBe("complete");
    expect((await b.json()).status).toBe("complete");
    await vi.advanceTimersByTimeAsync(20_000);

    expect({
      detectRender: calls("/api/detect/render"),
      furnitureMatch: calls("/api/pipeline/furniture-match"),
    }).toEqual({ detectRender: 1, furnitureMatch: 1 });
  });
});
