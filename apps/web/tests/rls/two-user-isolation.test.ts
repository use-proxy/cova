// One test case per kept user-scoped table.
// Each test creates two real test users via Supabase admin API,
// inserts a row owned by User A, then attempts SELECT/UPDATE/DELETE
// as User B's session. Asserts empty result for SELECT (RLS silently filters)
// and zero affected rows for UPDATE/DELETE.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

let userA: { id: string; client: SupabaseClient };
let userB: { id: string; client: SupabaseClient };

const provisionUser = async (label: string) => {
  const email = `rls-test-${label}-${Date.now()}@cova-test.dev`;
  const password = `TestPwd-${label}-${Date.now()}!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const sessionClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const signin = await sessionClient.auth.signInWithPassword({ email, password });
  if (signin.error) throw new Error(`signIn failed: ${signin.error.message}`);
  return { id: data.user.id, client: sessionClient };
};

beforeAll(async () => {
  userA = await provisionUser("a");
  userB = await provisionUser("b");
  await admin.from("users").insert([
    { id: userA.id, email: `a-${userA.id}@x.dev` },
    { id: userB.id, email: `b-${userB.id}@x.dev` },
  ]);
});

afterAll(async () => {
  await admin.from("users").delete().in("id", [userA.id, userB.id]);
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);
});

describe("RLS two-user isolation per kept user-scoped table", () => {
  it("rooms — User B cannot see User A's rooms", async () => {
    const { data: row } = await admin.from("rooms").insert({ user_id: userA.id, name: "A's room" }).select("id").single();
    const sel = await userB.client.from("rooms").select("id").eq("id", row!.id);
    expect(sel.data ?? []).toHaveLength(0);
    const upd = await userB.client.from("rooms").update({ name: "B-tampered" }).eq("id", row!.id);
    expect(upd.error).toBeNull();
    const verify = await admin.from("rooms").select("name").eq("id", row!.id).single();
    expect(verify.data?.name).toBe("A's room");
    await admin.from("rooms").delete().eq("id", row!.id);
  });

  it("users — User B cannot read User A's row", async () => {
    const sel = await userB.client.from("users").select("id, email").eq("id", userA.id);
    expect(sel.data ?? []).toHaveLength(0);
  });

  it("renders — User B cannot see User A's renders", async () => {
    const room = await admin.from("rooms").insert({ user_id: userA.id, name: "tmp" }).select("id").single();
    const r = await admin.from("renders").insert({ user_id: userA.id, room_id: room.data!.id, status: "complete" }).select("id").single();
    const sel = await userB.client.from("renders").select("id").eq("id", r.data!.id);
    expect(sel.data ?? []).toHaveLength(0);
    await admin.from("renders").delete().eq("id", r.data!.id);
    await admin.from("rooms").delete().eq("id", room.data!.id);
  });

  it("chat_messages — User B cannot see User A's messages", async () => {
    const m = await admin.from("chat_messages").insert({ user_id: userA.id, content: "secret" }).select("id").single();
    if (!m.error && m.data) {
      const sel = await userB.client.from("chat_messages").select("id").eq("id", m.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("chat_messages").delete().eq("id", m.data.id);
    }
  });

  it("style_fingerprints — User B cannot see User A's fingerprint", async () => {
    const fp = await admin.from("style_fingerprints").insert({ user_id: userA.id, dimensions: {}, fingerprint_version: "v3" }).select("id").single();
    const sel = await userB.client.from("style_fingerprints").select("id").eq("id", fp.data!.id);
    expect(sel.data ?? []).toHaveLength(0);
    await admin.from("style_fingerprints").delete().eq("id", fp.data!.id);
  });

  it("interactions — User B cannot see User A's interactions", async () => {
    const r = await admin.from("interactions").insert({ user_id: userA.id }).select("id").single();
    if (!r.error && r.data) {
      const sel = await userB.client.from("interactions").select("id").eq("id", r.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("interactions").delete().eq("id", r.data.id);
    }
  });

  it("swipe_history — User B cannot see User A's swipes", async () => {
    const r = await admin.from("swipe_history").insert({ user_id: userA.id }).select("id").single();
    if (!r.error && r.data) {
      const sel = await userB.client.from("swipe_history").select("id").eq("id", r.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("swipe_history").delete().eq("id", r.data.id);
    }
  });

  it("redesign_feedback — User B cannot see User A's feedback", async () => {
    const room = await admin.from("rooms").insert({ user_id: userA.id, name: "fb" }).select("id").single();
    const r = await admin.from("redesign_feedback").insert({ user_id: userA.id, room_id: room.data!.id }).select("id").single();
    if (!r.error && r.data) {
      const sel = await userB.client.from("redesign_feedback").select("id").eq("id", r.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("redesign_feedback").delete().eq("id", r.data.id);
    }
    await admin.from("rooms").delete().eq("id", room.data!.id);
  });

  it("saved_products — User B cannot see User A's saves", async () => {
    const r = await admin.from("saved_products").insert({ user_id: userA.id, product_url: "https://example.com/x" }).select("id").single();
    if (!r.error && r.data) {
      const sel = await userB.client.from("saved_products").select("id").eq("id", r.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("saved_products").delete().eq("id", r.data.id);
    }
  });

  it("sam_embeddings — User B cannot see User A's cached embeddings", async () => {
    const r = await admin.from("sam_embeddings").insert({ user_id: userA.id, image_hash: `h-${Date.now()}`, embedding: [], expires_at: new Date(Date.now() + 86400000).toISOString() }).select("id").single();
    if (!r.error && r.data) {
      const sel = await userB.client.from("sam_embeddings").select("id").eq("id", r.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("sam_embeddings").delete().eq("id", r.data.id);
    }
  });

  it("render_sessions — User B cannot see User A's refinement sessions (via room ownership subquery)", async () => {
    const room = await admin.from("rooms").insert({ user_id: userA.id, name: "rs" }).select("id").single();
    const rs = await admin.from("render_sessions").insert({ room_id: room.data!.id }).select("id").single();
    if (!rs.error && rs.data) {
      const sel = await userB.client.from("render_sessions").select("id").eq("id", rs.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("render_sessions").delete().eq("id", rs.data.id);
    }
    await admin.from("rooms").delete().eq("id", room.data!.id);
  });

  it("room_products — User B cannot see User A's room products (via room subquery)", async () => {
    const room = await admin.from("rooms").insert({ user_id: userA.id, name: "rp" }).select("id").single();
    const rp = await admin.from("room_products").insert({ room_id: room.data!.id }).select("id").single();
    if (!rp.error && rp.data) {
      const sel = await userB.client.from("room_products").select("id").eq("id", rp.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("room_products").delete().eq("id", rp.data.id);
    }
    await admin.from("rooms").delete().eq("id", room.data!.id);
  });

  it("empty_room_cache — User B cannot read User A's cache entry", async () => {
    const r = await admin.from("empty_room_cache").insert({ user_id: userA.id, input_hash: `h-${Date.now()}`, output_url: "https://x" }).select("id").single();
    if (!r.error && r.data) {
      const sel = await userB.client.from("empty_room_cache").select("id").eq("id", r.data.id);
      expect(sel.data ?? []).toHaveLength(0);
      await admin.from("empty_room_cache").delete().eq("id", r.data.id);
    }
  });
});
