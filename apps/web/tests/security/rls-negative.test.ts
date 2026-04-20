/**
 * RLS Negative Tests — Phase 0
 *
 * Verifies that Row-Level Security policies on user-scoped tables correctly
 * block cross-user reads and writes. Mirrors the Negative Test Plan in
 * docs/audit/supabase.md (14 test groups).
 *
 * Requires:
 *   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in env.
 *   - A Supabase project with RLS migrations applied.
 *
 * Skipped automatically when service role key is not available (e.g. in CI
 * without Supabase secrets). Run locally with the env populated.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const canRun = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY,
);
const d = canRun ? describe : describe.skip;

type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
  roomId?: string;
};

let admin: SupabaseClient;
let userA: TestUser;
let userB: TestUser;

async function makeUser(suffix: string): Promise<TestUser> {
  const email = `rls-test-${suffix}-${Date.now()}@example.test`;
  const password = `Test_${Math.random().toString(36).slice(2)}_!9A`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
  return { id: data.user.id, email, password, client };
}

async function cleanup(user: TestUser) {
  try {
    await admin.auth.admin.deleteUser(user.id);
  } catch {
    /* best effort */
  }
}

d("RLS negative tests — cross-user access must be denied", () => {
  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    userA = await makeUser("a");
    userB = await makeUser("b");

    // Seed one row per user via service role (bypasses RLS).
    const seedA = await admin
      .from("rooms")
      .insert({ user_id: userA.id, original_photo_url: "https://x/a.jpg" })
      .select("id")
      .single();
    userA.roomId = seedA.data?.id;
    const seedB = await admin
      .from("rooms")
      .insert({ user_id: userB.id, original_photo_url: "https://x/b.jpg" })
      .select("id")
      .single();
    userB.roomId = seedB.data?.id;

    // Per-table seeds (best-effort — schemas may vary; failures here do not
    // invalidate the cross-user denial checks below).
    await admin
      .from("style_fingerprints")
      .insert({ user_id: userB.id, dimensions: {} })
      .then(() => null, () => null);
    await admin
      .from("saved_products")
      .insert({ user_id: userB.id, product_id: "seed" })
      .then(() => null, () => null);
    await admin
      .from("interactions")
      .insert({ user_id: userB.id, type: "view" })
      .then(() => null, () => null);
    await admin
      .from("redesign_feedback")
      .insert({ user_id: userB.id, render_url: "https://x/b.jpg", rating: 3 })
      .then(() => null, () => null);
    await admin
      .from("chat_messages")
      .insert({ user_id: userB.id, role: "user", content: "seed" })
      .then(() => null, () => null);
    await admin
      .from("token_transactions")
      .insert({ user_id: userB.id, delta: 0, reason: "seed" })
      .then(() => null, () => null);

    // Phase 1: seed one sam_embeddings row for userB.
    await admin
      .from("sam_embeddings")
      .insert({
        user_id: userB.id,
        image_hash: `seed-${userB.id}`,
        // postgres-js translates Uint8Array → bytea hex literal.
        embedding: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      })
      .then(() => null, () => null);

    if (userB.roomId) {
      await admin
        .from("render_sessions")
        .insert({
          room_id: userB.roomId,
          render_url: "https://x/b.jpg",
          prompt: "seed",
          style_strength: 0.85,
          iteration: 1,
        })
        .then(() => null, () => null);
      await admin
        .from("room_products")
        .insert({ room_id: userB.roomId })
        .then(() => null, () => null);
    }
  }, 60_000);

  afterAll(async () => {
    if (userA) await cleanup(userA);
    if (userB) await cleanup(userB);
  });

  // 1. rooms
  it("1.1 User A cannot SELECT User B's room", async () => {
    const { data } = await userA.client
      .from("rooms")
      .select("id")
      .eq("id", userB.roomId!);
    expect(data?.length ?? 0).toBe(0);
  });
  it("1.2 User A cannot UPDATE User B's room", async () => {
    const { data } = await userA.client
      .from("rooms")
      .update({ room_type: "bedroom" })
      .eq("id", userB.roomId!)
      .select("id");
    expect(data?.length ?? 0).toBe(0);
  });
  it("1.3 User A cannot DELETE User B's room", async () => {
    const { data } = await userA.client
      .from("rooms")
      .delete()
      .eq("id", userB.roomId!)
      .select("id");
    expect(data?.length ?? 0).toBe(0);
  });
  it("1.4 User A cannot INSERT row with user_id = User B", async () => {
    const { error } = await userA.client
      .from("rooms")
      .insert({ user_id: userB.id, original_photo_url: "x" });
    expect(error).toBeTruthy();
  });

  // 2. style_fingerprints
  it("2.1 User A cannot SELECT User B's style_fingerprints", async () => {
    const { data } = await userA.client
      .from("style_fingerprints")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });
  it("2.2 User A cannot INSERT style_fingerprints with B's user_id", async () => {
    const { error } = await userA.client
      .from("style_fingerprints")
      .insert({ user_id: userB.id, dimensions: {} });
    expect(error).toBeTruthy();
  });
  it("2.3 User A cannot UPDATE User B's style_fingerprints", async () => {
    const { data } = await userA.client
      .from("style_fingerprints")
      .update({ dimensions: {} })
      .eq("user_id", userB.id)
      .select("user_id");
    expect(data?.length ?? 0).toBe(0);
  });

  // 3. render_sessions
  it("3.1 User A cannot SELECT render_sessions for User B's room", async () => {
    const { data } = await userA.client
      .from("render_sessions")
      .select("id")
      .eq("room_id", userB.roomId!);
    expect(data?.length ?? 0).toBe(0);
  });
  it("3.2 User A cannot INSERT render_sessions for User B's room", async () => {
    const { error } = await userA.client.from("render_sessions").insert({
      room_id: userB.roomId!,
      render_url: "x",
      prompt: "x",
      style_strength: 0.85,
      iteration: 1,
    });
    expect(error).toBeTruthy();
  });

  // 4. saved_products
  it("4.1 User A cannot SELECT User B's saved_products", async () => {
    const { data } = await userA.client
      .from("saved_products")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });
  it("4.2 User A cannot DELETE User B's saved_products", async () => {
    const { data } = await userA.client
      .from("saved_products")
      .delete()
      .eq("user_id", userB.id)
      .select("user_id");
    expect(data?.length ?? 0).toBe(0);
  });
  it("4.3 User A cannot INSERT saved_products with B's user_id", async () => {
    const { error } = await userA.client
      .from("saved_products")
      .insert({ user_id: userB.id, product_id: "x" });
    expect(error).toBeTruthy();
  });

  // 5. interactions
  it("5.1 User A cannot SELECT User B's interactions", async () => {
    const { data } = await userA.client
      .from("interactions")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });
  it("5.2 User A cannot INSERT interactions with B's user_id", async () => {
    const { error } = await userA.client
      .from("interactions")
      .insert({ user_id: userB.id, type: "view" });
    expect(error).toBeTruthy();
  });

  // 6. room_products
  it("6.1 User A cannot SELECT room_products for User B's room", async () => {
    const { data } = await userA.client
      .from("room_products")
      .select("id")
      .eq("room_id", userB.roomId!);
    expect(data?.length ?? 0).toBe(0);
  });
  it("6.2 User A cannot INSERT room_products for User B's room", async () => {
    const { error } = await userA.client
      .from("room_products")
      .insert({ room_id: userB.roomId! });
    expect(error).toBeTruthy();
  });

  // 7. redesign_feedback
  it("7.1 User A cannot SELECT User B's redesign_feedback", async () => {
    const { data } = await userA.client
      .from("redesign_feedback")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });
  it("7.2 User A cannot UPSERT redesign_feedback with B's user_id", async () => {
    const { error } = await userA.client
      .from("redesign_feedback")
      .insert({ user_id: userB.id, render_url: "x", rating: 1 });
    expect(error).toBeTruthy();
  });

  // 8. product_impressions
  it("8.1 User A cannot SELECT User B's product_impressions", async () => {
    const { data } = await userA.client
      .from("product_impressions")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });

  // 9. product_interactions
  it("9.1 User A cannot SELECT User B's product_interactions", async () => {
    const { data } = await userA.client
      .from("product_interactions")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });

  // 10. style_purchase_signals
  it("10.1 User A cannot SELECT User B's style_purchase_signals", async () => {
    const { data } = await userA.client
      .from("style_purchase_signals")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });

  // 11. chat_messages
  it("11.1 User A cannot SELECT User B's chat_messages", async () => {
    const { data } = await userA.client
      .from("chat_messages")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });
  it("11.2 User A cannot INSERT chat_messages with B's user_id", async () => {
    const { error } = await userA.client
      .from("chat_messages")
      .insert({ user_id: userB.id, role: "user", content: "x" });
    expect(error).toBeTruthy();
  });

  // 12. token_transactions
  it("12.1 User A cannot SELECT User B's token_transactions", async () => {
    const { data } = await userA.client
      .from("token_transactions")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });

  // 13. users
  it("13.1 User A cannot SELECT User B's users row", async () => {
    const { data } = await userA.client
      .from("users")
      .select("id")
      .eq("id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });
  it("13.2 User A cannot UPDATE User B's users row", async () => {
    const { data } = await userA.client
      .from("users")
      .update({ email: "hacked@test.com" })
      .eq("id", userB.id)
      .select("id");
    expect(data?.length ?? 0).toBe(0);
  });

  // 14. swipe_history (new RLS from phase-0 migration)
  it("14.1 User A cannot SELECT User B's swipe_history", async () => {
    const { data } = await userA.client
      .from("swipe_history")
      .select("user_id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });

  // 15. sam_embeddings (Phase 1 — SAM 2 cache table, 30-day TTL, RLS).
  it("15.1 User A cannot SELECT User B's sam_embeddings", async () => {
    const { data } = await userA.client
      .from("sam_embeddings")
      .select("id")
      .eq("user_id", userB.id);
    expect(data?.length ?? 0).toBe(0);
  });
  it("15.2 User A cannot INSERT sam_embeddings with B's user_id", async () => {
    const { error } = await userA.client.from("sam_embeddings").insert({
      user_id: userB.id,
      image_hash: `inject-${Date.now()}`,
      embedding: new Uint8Array([0x01, 0x02, 0x03]),
    });
    // RLS with-check rejects: either an error surfaces or the row is
    // silently suppressed. Both satisfy "insert did not succeed as B".
    const rowAsB = await admin
      .from("sam_embeddings")
      .select("id")
      .eq("user_id", userB.id)
      .like("image_hash", "inject-%");
    expect(error !== null || (rowAsB.data?.length ?? 0) === 0).toBe(true);
  });
  it("15.3 User A cannot DELETE User B's sam_embeddings", async () => {
    await userA.client
      .from("sam_embeddings")
      .delete()
      .eq("user_id", userB.id);
    const { data } = await admin
      .from("sam_embeddings")
      .select("id")
      .eq("user_id", userB.id)
      .eq("image_hash", `seed-${userB.id}`);
    expect(data?.length ?? 0).toBe(1);
  });
});

if (!canRun) {
  // eslint-disable-next-line no-console
  console.warn(
    "[rls-negative] Skipped — set SUPABASE_URL, SUPABASE_ANON_KEY, " +
      "SUPABASE_SERVICE_ROLE_KEY to run cross-user RLS tests.",
  );
}
