import { NextResponse } from "next/server";
import { clearSessionCookie, resetPassword } from "../../../../lib/auth-server";
import { isPostgresConfigured } from "../../../../lib/postgres";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 });
  }

  const { token, password } = await request.json();
  if (typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Token and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const ok = await resetPassword(token, password);
  if (!ok) {
    return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
