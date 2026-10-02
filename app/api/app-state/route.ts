import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { AppState } from "../../lib/domain";
import { loadAppStateFromPostgres, saveAppStateToPostgres } from "../../lib/postgres-data";
import { isPostgresConfigured } from "../../lib/postgres";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function requireLogin(request: Request) {
  if (!supabaseUrl || !supabasePublishableKey) {
    return NextResponse.json({ error: "Supabase Auth environment variables are not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Login is required." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey);
  const { error } = await supabase.auth.getUser(token);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return undefined;
}

export async function GET(request: Request) {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 });
  }

  const authError = await requireLogin(request);
  if (authError) return authError;

  try {
    const state = await loadAppStateFromPostgres();
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load app state." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 });
  }

  const authError = await requireLogin(request);
  if (authError) return authError;

  try {
    const state = await request.json() as AppState;
    await saveAppStateToPostgres(state);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save app state." },
      { status: 500 },
    );
  }
}
