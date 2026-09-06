import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { initialState } from "../../lib/domain";

const STATE_KEY = "demo";

async function ensureTable() {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

export async function GET() {
  try {
    await ensureTable();
    const row = await env.DB.prepare(
      "SELECT payload, updated_at FROM app_state WHERE key = ?",
    ).bind(STATE_KEY).first<{ payload: string; updated_at: string }>();
    if (!row) return NextResponse.json({ state: initialState, updatedAt: null });
    return NextResponse.json({ state: JSON.parse(row.payload), updatedAt: row.updated_at });
  } catch (error) {
    console.error("Unable to load demo state", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "データを読み込めませんでした。" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return NextResponse.json({ error: "保存データが大きすぎます。" }, { status: 413 });
    const body = JSON.parse(raw) as { state?: unknown };
    if (!body.state || typeof body.state !== "object") return NextResponse.json({ error: "保存形式が正しくありません。" }, { status: 400 });
    const state = body.state as Record<string, unknown>;
    const required = ["companies", "customers", "workItems", "placeTemplates", "estimates", "invoices"];
    if (required.some((key) => !Array.isArray(state[key]))) return NextResponse.json({ error: "必要なデータ項目が不足しています。" }, { status: 400 });
    await ensureTable();
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_state (key, payload, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).bind(STATE_KEY, JSON.stringify(state), updatedAt).run();
    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    console.error("Unable to save demo state", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "データを保存できませんでした。" }, { status: 500 });
  }
}
