// Per-session CSRF tokens (audit CSRF-001).
//
// The old contract accepted a static `x-csrf-check: 1` header — every staff
// client sent the same value, so any same-site/subdomain attacker (or an
// origin-check miss) could forge mutations. Tokens are now bound to the
// caller's session cookie: token = HMAC(secret, sessionCookieValue).
//
// Stateless by design: proxy.ts verifies with WebCrypto (no DB, works at the
// edge), issuance happens in GET /api/auth which already reads the cookie.
// Secret: CSRF_SECRET, else INTEGRATION_ENCRYPTION_KEY, else a dev-only
// fallback that loudly warns in production.

function csrfSecret(): string {
  const s =
    process.env.CSRF_SECRET ??
    process.env.INTEGRATION_ENCRYPTION_KEY ??
    "dev-only-csrf-secret";
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.CSRF_SECRET &&
    !process.env.INTEGRATION_ENCRYPTION_KEY
  ) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "csrf_secret_fallback",
        message: "Set CSRF_SECRET in production — CSRF tokens use a dev fallback.",
      })
    );
  }
  return s;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Buffer.from(sig).toString("hex");
}

/** Mint a token for the raw session cookie value. Empty cookie → empty token. */
export async function issueCsrfToken(sessionCookieValue: string): Promise<string> {
  if (!sessionCookieValue) return "";
  return hmacHex(csrfSecret(), `csrf:${sessionCookieValue}`);
}

/** Verify the request header against the session cookie. Fail closed. */
export async function verifyCsrfToken(
  sessionCookieValue: string | undefined,
  headerValue: string | null
): Promise<boolean> {
  if (!sessionCookieValue || !headerValue) return false;
  const expected = await issueCsrfToken(sessionCookieValue);
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // timingSafeEqual would throw on length mismatch — compare lengths first.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
