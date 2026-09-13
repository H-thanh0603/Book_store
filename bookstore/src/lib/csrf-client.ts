"use client";

// Client side of the per-session CSRF contract (see lib/csrf.ts).
// Fetches the token once per page load from GET /api/auth (which returns
// { csrfToken } for staff sessions, nothing for anonymous users) and merges
// it into mutation headers. Anonymous callers get {} — the proxy only
// enforces the token when a staff session cookie is present.

let cached: string | null | undefined;

async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const r = await fetch("/api/auth");
    const d = (await r.json().catch(() => null)) as { csrfToken?: string } | null;
    cached = typeof d?.csrfToken === "string" ? d.csrfToken : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Spread into fetch headers: `headers: { "Content-Type": "application/json", ...(await csrfHeaders()) }`. */
export async function csrfHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { "x-csrf-check": token } : {};
}
