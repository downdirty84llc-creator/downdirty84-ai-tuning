const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/** Always send cookies so magic-link session works */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  return res.json() as Promise<T>;
}
