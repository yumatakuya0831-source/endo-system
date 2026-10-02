import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSession } from "../../../lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await deleteSession(request);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
