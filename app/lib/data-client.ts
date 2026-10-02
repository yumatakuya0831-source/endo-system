import type { AppState } from "./domain";

export const dataBackend = "postgres";
export const isRemoteDataConfigured = true;

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? fallbackMessage);
  }
  return result as T;
}

export async function loadRemoteAppState(): Promise<AppState> {
  const response = await fetch("/api/app-state", {
    cache: "no-store",
    credentials: "include",
  });
  return readJson<AppState>(response, "PostgreSQLからデータを読み込めませんでした。");
}

export async function saveRemoteAppState(state: AppState): Promise<void> {
  const response = await fetch("/api/app-state", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  await readJson<{ ok: boolean }>(response, "PostgreSQLへデータを保存できませんでした。");
}

export async function deleteRemoteRecord(kind: string, id: string): Promise<void> {
  const params = new URLSearchParams({ kind, id });
  const response = await fetch(`/api/app-state?${params.toString()}`, {
    method: "DELETE",
    credentials: "include",
  });
  await readJson<{ ok: boolean }>(response, "PostgreSQLからデータを削除できませんでした。");
}
