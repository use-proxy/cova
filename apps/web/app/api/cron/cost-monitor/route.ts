import { NextRequest, NextResponse } from "next/server";
import { runCostMonitor } from "../../../../../../scripts/agents/cost-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json(
      { ok: false, failure_category: "cost.monitor.cron_fail", user_message: "unauthorized", detail: "auth-mismatch" },
      { status: 401 },
    );
  }

  try {
    const r = await runCostMonitor();
    return NextResponse.json({ ok: r.ok, tripped: r.tripped, total: r.total, ceiling: r.ceiling });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, failure_category: "cost.monitor.cron_fail", user_message: "internal", detail: e?.message },
      { status: 500 },
    );
  }
}
