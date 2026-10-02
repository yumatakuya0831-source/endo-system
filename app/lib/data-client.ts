import type { AppState } from "./domain";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase";
import { loadAppStateFromSupabase, saveAppStateToSupabase } from "./supabase-data";

export const dataBackend = process.env.NEXT_PUBLIC_DATA_BACKEND === "postgres" ? "postgres" : "supabase";
export const isRemoteDataConfigured = isSupabaseConfigured;

async function getAccessToken() {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token;
}

export async function loadRemoteAppState(): Promise<AppState> {
  if (dataBackend !== "postgres") {
    return loadAppStateFromSupabase();
  }

  const accessToken = await getAccessToken();
  const response = await fetch("/api/app-state", {
    cache: "no-store",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? "PostgreSQLからデータを読み込めませんでした。");
  }
  return result as AppState;
}

export async function saveRemoteAppState(state: AppState): Promise<void> {
  if (dataBackend !== "postgres") {
    await saveAppStateToSupabase(state);
    return;
  }

  const accessToken = await getAccessToken();
  const response = await fetch("/api/app-state", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(state),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? "PostgreSQLへデータを保存できませんでした。");
  }
}
