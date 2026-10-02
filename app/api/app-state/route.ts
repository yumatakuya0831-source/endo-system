import { NextResponse } from "next/server";
import type { AppState } from "../../lib/domain";
import { isPostgresConfigured } from "../../lib/postgres";
import { deletePostgresRecord, loadAppStateFromPostgres, saveAppStateToPostgres } from "../../lib/postgres-data";
import { requireLogin } from "../../lib/auth-server";

export const dynamic = "force-dynamic";

function requirePostgres() {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 });
  }
  return undefined;
}

export async function GET(request: Request) {
  const configError = requirePostgres();
  if (configError) return configError;

  const auth = await requireLogin(request);
  if ("error" in auth) return auth.error;

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
  const configError = requirePostgres();
  if (configError) return configError;

  const auth = await requireLogin(request);
  if ("error" in auth) return auth.error;

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

export async function DELETE(request: Request) {
  const configError = requirePostgres();
  if (configError) return configError;

  const auth = await requireLogin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  if (!kind || !id) {
    return NextResponse.json({ error: "Delete kind and id are required." }, { status: 400 });
  }

  try {
    await deletePostgresRecord(kind, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete record." },
      { status: 400 },
    );
  }
}
