// P01b — GET /api/cron/purge-deletion-audit
// Mirrors the cost-monitor cron auth pattern. Runs daily at 03:00 UTC via
// Vercel cron (vercel.json schedule). Bearer CRON_SECRET required.
// Failure categories emitted: auth.delete.cascade_fail.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json(
      {
        ok: false,
        failure_category: "auth.delete.cascade_fail",
        user_message: "unauthorized",
        detail: "cron-secret-missing-or-mismatch",
      },
      { status: 401 },
    );
  }

  try {
    const admin = createAdminSupabaseClient();

    const { data: rows, error: selectError } = await admin
      .from("account_deletions")
      .select("id, deleted_at, audit_retention_days");
    if (selectError) {
      return NextResponse.json(
        {
          ok: false,
          failure_category: "auth.delete.cascade_fail",
          user_message: "internal",
          detail: selectError.message,
        },
        { status: 500 },
      );
    }

    const now = Date.now();
    const expired = (rows ?? []).filter((r) => {
      const deletedAt = new Date(r.deleted_at as string).getTime();
      const retentionMs = (r.audit_retention_days as number) * 24 * 60 * 60 * 1000;
      return deletedAt + retentionMs < now;
    });

    if (expired.length === 0) {
      return NextResponse.json({ ok: true, purged: 0 });
    }

    const ids = expired.map((r) => r.id as string);
    const { error: deleteError } = await admin
      .from("account_deletions")
      .delete()
      .in("id", ids);
    if (deleteError) {
      return NextResponse.json(
        {
          ok: false,
          failure_category: "auth.delete.cascade_fail",
          user_message: "internal",
          detail: deleteError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, purged: ids.length });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      {
        ok: false,
        failure_category: "auth.delete.cascade_fail",
        user_message: "internal",
        detail,
      },
      { status: 500 },
    );
  }
}
