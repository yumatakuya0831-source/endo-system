export type AppSession = {
  user: {
    id: string;
    email?: string;
    app_metadata?: {
      role?: "admin" | "user";
    };
  };
};

async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? "Request failed.");
  }
  return result as T;
}

export async function getCurrentSession() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "include",
  });
  return readJson<{ session: AppSession | null }>(response);
}

export async function loginWithPassword(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return readJson<{ session: AppSession }>(response);
}

export async function logout() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  return readJson<{ ok: boolean }>(response);
}

export async function requestPasswordReset(email: string) {
  const response = await fetch("/api/auth/password-reset", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return readJson<{ message: string }>(response);
}

export async function confirmPasswordReset(token: string, password: string) {
  const response = await fetch("/api/auth/password-reset/confirm", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  return readJson<{ ok: boolean }>(response);
}
