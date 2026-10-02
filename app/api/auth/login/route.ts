import { NextResponse } from "next/server";
import { authenticateUser, createSession, publicUser, setSessionCookie } from "../../../lib/auth-server";
import { isPostgresConfigured } from "../../../lib/postgres";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 });
  }

  const { email, password } = await request.json();
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    return NextResponse.json({ error: "メールアドレスまたはパスワードが違います。" }, { status: 401 });
  }

  const token = await createSession(user.id);
  const response = NextResponse.json({ session: { user: publicUser(user) } });
  setSessionCookie(response, token);
  return response;
}
