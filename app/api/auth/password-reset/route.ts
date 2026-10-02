import { NextResponse } from "next/server";
import { createPasswordResetToken } from "../../../lib/auth-server";
import { isPostgresConfigured } from "../../../lib/postgres";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 });
  }

  const { email } = await request.json();
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  await createPasswordResetToken(email);
  return NextResponse.json({
    message: "登録済みメールアドレスの場合、再設定リンクを発行しました。メール送信設定を追加するとリンクを送信できます。",
  });
}
