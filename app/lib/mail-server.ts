import "server-only";
import nodemailer from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  secure: boolean;
};

function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
    from,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
  };
}

export function isMailConfigured() {
  return Boolean(getMailConfig());
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const config = getMailConfig();
  if (!config) {
    throw new Error("SMTP settings are not configured.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: "積算ノート パスワード再設定",
    text: [
      "パスワード再設定のリクエストを受け付けました。",
      "",
      "以下のリンクから新しいパスワードを設定してください。",
      resetUrl,
      "",
      "このメールに心当たりがない場合は、破棄してください。",
    ].join("\n"),
    html: `
      <p>パスワード再設定のリクエストを受け付けました。</p>
      <p><a href="${resetUrl}">新しいパスワードを設定する</a></p>
      <p>このメールに心当たりがない場合は、破棄してください。</p>
    `,
  });
}
