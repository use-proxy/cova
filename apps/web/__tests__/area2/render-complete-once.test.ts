/**
 * /api/render/status — post-render work must fire once per render.
 *
 * Every success branch of the status route goes through markRenderComplete,
 * which flips rooms.redesign_status to "complete" and then fires detection +
 * furniture matching. The client polls the route, so the same finished
 * prediction can be seen by more than one request (two tabs, a retry, a
 * refresh). Matching must still be triggered exactly once.
 *
 * The admin client below is a fake that behaves like Postgres for a
 * conditional UPDATE: each statement is applied atomically, and only rows
 * that still match the filter at that moment are changed (and returned when
 * .select() is chained).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stands in for Upstash Redis (shared across server instances) in case the
// helper takes a lock there. Lives on globalThis so separate module
// instances see the same store, like separate servers talking to one Redis.
type Shared = { redis: Map<string, string> };
const shared = globalThis as unknown as { __fakeRedis?: Shared };
shared.__fakeRedis = { redis: new Map() };
vi.mock("@/lib/rate-limit/upstash", () => ({
  redis: {
    async set(
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number },
    ) {
      await new Promise((r) => setTimeout(r, 1));
      const store = (globalThis as unknown as { __fakeRedis: Shared })
        .__fakeRedis.redis;
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
  },
}));

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

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

function createFakeDb(rooms: Row[]) {
  const updates: { matched: number }[] = [];
  const client = {
    from(table: string) {
      if (table !== "rooms") throw new Error(`fake db: no table ${table}`);
      return {
        update(values: Row) {
          const filters: Filter[] = [];
          let returning = false;
          const run = async () => {
            // network latency to Postgres, so concurrent polls interleave
            await new Promise((r) => setTimeout(r, 1));
            // one statement = atomic (row lock); filters see current state
            const hit = rooms.filter((row) => filters.every((f) => f(row)));
            for (const row of hit) Object.assign(row, values);
            updates.push({ matched: hit.length });
            return {
              data: returning ? hit.map((row) => ({ id: row.id })) : null,
              error: null,
            };
          };
          const builder = {
            eq(col: string, val: unknown) {
              filters.push((r) => r[col] === val);
              return builder;
            },
            or(expr: string) {
              filters.push(parseOr(expr));
              return builder;
            },
            select() {
              returning = true;
              return builder;
            },
            then<T>(
              ok: (v: { data: Row[] | null; error: null }) => T,
              fail?: (e: unknown) => T,
            ) {
              return run().then(ok, fail);
            },
          };
          return builder;
        },
      };
    },
  };
  return { admin: client as unknown as SupabaseClient, rooms, updates };
}

const ROOM = "room-1";
const USER = "user-1";

async function loadHelper() {
  const mod = await import("@/lib/render/mark-render-complete");
  return mod.markRenderComplete;
}

describe("markRenderComplete — post-render work fires once per render", () => {
  beforeEach(() => {
    vi.resetModules();
    shared.__fakeRedis!.redis.clear();
  });

  it("two concurrent status polls on a finished render trigger matching exactly once", async () => {
    const markRenderComplete = await loadHelper();
    const { admin, rooms } = createFakeDb([
      { id: ROOM, user_id: USER, redesign_status: "pending" },
    ]);
    const triggerMatching = vi.fn();

    await Promise.all([
      markRenderComplete(admin, ROOM, USER, triggerMatching),
      markRenderComplete(admin, ROOM, USER, triggerMatching),
    ]);

    expect(rooms[0].redesign_status).toBe("complete");
    expect(triggerMatching).toHaveBeenCalledTimes(1);
  });

  it("a poll after the render is already complete (refresh / retry) does not re-trigger matching", async () => {
    const markRenderComplete = await loadHelper();
    const { admin } = createFakeDb([
      { id: ROOM, user_id: USER, redesign_status: "pending" },
    ]);
    const triggerMatching = vi.fn();

    await markRenderComplete(admin, ROOM, USER, triggerMatching);
    await markRenderComplete(admin, ROOM, USER, triggerMatching);

    expect(triggerMatching).toHaveBeenCalledTimes(1);
  });

  it("two server instances (separate module instances) polling concurrently trigger matching exactly once", async () => {
    const instanceA = await loadHelper();
    vi.resetModules();
    const instanceB = await loadHelper();
    expect(instanceA).not.toBe(instanceB);

    const { admin } = createFakeDb([
      { id: ROOM, user_id: USER, redesign_status: "pending" },
    ]);
    const triggerMatching = vi.fn();

    await Promise.all([
      instanceA(admin, ROOM, USER, triggerMatching),
      instanceB(admin, ROOM, USER, triggerMatching),
    ]);

    expect(triggerMatching).toHaveBeenCalledTimes(1);
  });

  it("the first poll of a fresh render still triggers matching", async () => {
    const markRenderComplete = await loadHelper();
    const { admin, rooms } = createFakeDb([
      { id: ROOM, user_id: USER, redesign_status: null },
    ]);
    const triggerMatching = vi.fn();

    await markRenderComplete(admin, ROOM, USER, triggerMatching);

    expect(rooms[0].redesign_status).toBe("complete");
    expect(triggerMatching).toHaveBeenCalledTimes(1);
  });
});
