// SSRF guard for outbound webhook URLs (audit 2026-08-30 SEC-006 + hardening).
//
// Two layers + DNS pinning:
//  - webhookUrlBlockReason(url): cheap synchronous check at every URL-mutation
//    site (create/update). Rejects non-http(s), literal IPs in loopback/private/
//    CGNAT/link-local/metadata/ULA/multicast/reserved ranges (including full,
//    compressed, hex, and IPv4-mapped/IPv4-compatible IPv6), and local hostnames.
//  - assertSafeWebhookTarget(url): async DNS-resolution check that validates
//    EVERY resolved IP and returns the pinned { address, family } so the caller
//    connects directly to the verified IP (prevents DNS rebinding TOCTOU).
//  - pinnedWebhookPost(url, pinned, opts): performs HTTP(S) POST pinned to the
//    validated IP with TLS SNI preserved and redirects strictly rejected.

import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";

const ALLOWED = (process.env.WEBHOOK_ALLOW_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const allowlistHas = (host: string): boolean => ALLOWED.includes(host.toLowerCase());

export type PinnedAddress = { address: string; family: 4 | 6 };

/** Parse dotted-quad IPv4 into a 32-bit unsigned int, or null if not IPv4 literal. */
function parseIpv4(host: string): { ok: true; octets: [number, number, number, number] } | { ok: false; malformed?: true } {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return { ok: false };
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
  if (octets.some((o) => o > 255)) return { ok: false, malformed: true };
  return { ok: true, octets };
}

/** Expand any valid IPv6 literal (compressed, full hex, or mixed v4 tail) to 128-bit BigInt. */
function parseIpv6ToBigInt(raw: string): bigint | null {
  const h = raw.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!h.includes(":")) return null;

  // Handle mixed IPv4 tail e.g. ::ffff:127.0.0.1 or 0:0:0:0:0:ffff:10.0.0.1
  let normalized = h;
  const lastColon = h.lastIndexOf(":");
  const tail = h.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4.ok) return null;
    const [a, b, c, d] = v4.octets;
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    normalized = `${h.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - (left.length + right.length) : 0;
  if (halves.length === 1 && left.length !== 8) return null;
  if (missing < 0) return null;

  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    value = (value << 16n) | BigInt(parseInt(g, 16));
  }
  return value;
}

function uint32ToIpv4(n: bigint): string {
  return `${(n >> 24n) & 0xffn}.${(n >> 16n) & 0xffn}.${(n >> 8n) & 0xffn}.${n & 0xffn}`;
}

/** Sync check: null = safe, string = block reason. Cheap, no DNS. */
export function webhookUrlBlockReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "url is not parseable";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "url must be http(s)";
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    if (!allowlistHas(host)) return `host ${host} is not routable from the server`;
  }
  const ipReason = blockedIpReason(host);
  if (ipReason && !allowlistHas(host)) return ipReason;
  return null;
}

/**
 * Async check: resolves the hostname, validates EVERY resolved IP, and returns
 * a pinned { address, family } for DNS-rebinding-safe delivery.
 * Returns null when the host is explicitly allowlisted via WEBHOOK_ALLOW_HOSTS.
 */
export async function assertSafeWebhookTarget(url: string): Promise<PinnedAddress | undefined> {
  const sync = webhookUrlBlockReason(url);
  if (sync) throw new Error(sync);
  const { hostname } = new URL(url);
  const cleanHost = hostname.replace(/^\[|\]$/g, "");
  if (allowlistHas(hostname) || allowlistHas(cleanHost)) return undefined;
  const res = await lookup(cleanHost, { all: true });
  if (!res || res.length === 0) throw new Error("DNS resolution returned no addresses");
  for (const { address } of res) {
    const reason = blockedIpReason(address);
    if (reason) throw new Error(reason);
  }
  const first = res[0];
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

/**
 * Is this host/IP one the server itself must never be used to reach?
 * Accepts IPv4/IPv6 literals (including compressed, full hex, IPv4-mapped,
 * IPv4-compatible, and NAT64) and plain hostnames (which return null).
 */
export function blockedIpReason(host: string): string | null {
  const stripped = host.replace(/^\[|\]$/g, "").trim().toLowerCase();

  // IPv4 literal check
  const v4 = parseIpv4(stripped);
  if (v4.ok) {
    const [a, b] = v4.octets;
    if (a === 127) return "loopback address is blocked";
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
      return "private address is blocked";
    if (a === 100 && b >= 64 && b <= 127) return "CGNAT address is blocked";
    if (a === 169 && b === 254) return "link-local address is blocked";
    if (a === 198 && (b === 18 || b === 19)) return "benchmark address is blocked";
    if (a === 0 || a >= 224) return "non-unicast address is blocked";
    return null;
  }
  if (v4.malformed) return "malformed IPv4";

  // IPv6 literal check (full 128-bit parse)
  if (stripped.includes(":")) {
    const addr = parseIpv6ToBigInt(stripped);
    if (addr === null) return "malformed IPv6";
    if (addr === 0n || addr === 1n) return "loopback address is blocked";

    const top96 = addr >> 32n;
    const low32 = addr & 0xffffffffn;
    // IPv4-mapped (::ffff:0:0/96) — handles both ::ffff:127.0.0.1 and ::ffff:7f00:1 and 0:0:0:0:0:ffff:...
    if (top96 === 0xffffn) return blockedIpReason(uint32ToIpv4(low32));
    // IPv4-compatible (::/96, deprecated RFC 4291) — e.g. ::127.0.0.1 or ::7f00:1
    if (top96 === 0n) return blockedIpReason(uint32ToIpv4(low32));
    // NAT64 well-known prefix (64:ff9b::/96)
    if (top96 === 0x0064ff9b0000000000000000n) return blockedIpReason(uint32ToIpv4(low32));

    const top16 = Number(addr >> 112n);
    // ULA fc00::/7
    if ((top16 & 0xfe00) === 0xfc00) return "ULA address is blocked";
    // Link-local fe80::/10
    if ((top16 & 0xffc0) === 0xfe80) return "link-local address is blocked";
    // Site-local fec0::/10 (deprecated)
    if ((top16 & 0xffc0) === 0xfec0) return "site-local address is blocked";
    // Multicast ff00::/8
    if ((top16 & 0xff00) === 0xff00) return "multicast address is blocked";
    return null;
  }

  return null; // plain hostname — resolved at delivery time
}

/**
 * Send an outbound webhook POST request pinned to the already-validated IP
 * address (no second DNS lookup -> no DNS rebinding TOCTOU) and with HTTP
 * redirects strictly rejected (no 302/307 SSRF redirect bypass).
 */
export async function pinnedWebhookPost(
  url: string,
  pinned: PinnedAddress | null | undefined,
  opts: { headers: Record<string, string>; body: string; timeoutMs: number }
): Promise<{ status: number; ok: boolean }> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      parsed,
      {
        method: "POST",
        headers: {
          ...opts.headers,
          "content-length": Buffer.byteLength(opts.body).toString(),
        },
        timeout: opts.timeoutMs,
        ...(pinned
          ? {
              lookup: (_host, _options, cb) => {
                cb(null, pinned.address, pinned.family);
              },
            }
          : {}),
        ...(isHttps ? { servername: parsed.hostname } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // Drain response body so sockets are released cleanly
        res.resume();
        if (status >= 300 && status < 400) {
          reject(new Error(`Redirect (${status}) is blocked for outbound webhooks`));
          return;
        }
        resolve({ status, ok: status >= 200 && status < 300 });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Webhook request timed out after ${opts.timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(opts.body);
    req.end();
  });
}
