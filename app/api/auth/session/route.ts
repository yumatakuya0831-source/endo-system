import { NextResponse } from "next/server";
import { getUserFromRequest, publicUser } from "../../../lib/auth-server";
import { isPostgresConfigured } from "../../../lib/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ session: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const user = await getUserFromRequest(request);
  return NextResponse.json({
    session: user ? { user: publicUser(user) } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
