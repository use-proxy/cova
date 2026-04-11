import { SignJWT } from "jose";
import { NextResponse } from "next/server";

// Public endpoint — no auth required. Step-5 (capture) is open to all users.
// The signed JWT itself is the security boundary: it must be validated by
// /api/capture/validate-token before any upload is accepted (Hard Rule 10).
export async function POST(request: Request) {
  const body = (await request.json()) as { roomId?: string; room_id?: string };
  // Accept both snake_case (new) and camelCase (legacy)
  const roomId = body.room_id ?? body.roomId;

  if (!roomId) {
    return NextResponse.json({ error: "room_id is required" }, { status: 400 });
  }

  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
  const token = await new SignJWT({ roomId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${appUrl}/capture/mobile/${token}`;

  return NextResponse.json({ token, url });
}
