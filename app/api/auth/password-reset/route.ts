import { NextResponse } from "next/server";
import { createPasswordResetToken } from "../../../lib/auth-server";
import { isMailConfigured, sendPasswordResetEmail } from "../../../lib/mail-server";
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

  if (!isMailConfigured()) {
    return NextResponse.json({
      message: "メール送信設定が未完了です。SMTP_HOST と SMTP_FROM を設定すると再設定メールを送信できます。",
    });
  }

  const token = await createPasswordResetToken(email);
  if (token) {
    const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
    const resetUrl = `${origin}/?password_recovery=1&token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(email.trim().toLowerCase(), resetUrl);
  }

  return NextResponse.json({
    message: "登録済みメールアドレスの場合、パスワード再設定メールを送信しました。",
  });
}
