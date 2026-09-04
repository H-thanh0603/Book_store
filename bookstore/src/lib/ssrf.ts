// SSRF guard for outbound webhook URLs (audit 2026-08-30 SEC-006).
//
// Two layers:
//  - webhookUrlBlockReason(url): cheap synchronous check at every
//    URL-mutation site (create/update). Parses the URL, rejects non-http(s)
//    protocols, literal IPs in loopback/private/link-local/metadata ranges,
//    and localhost-ish hostnames. This stops the lazy attacker.
//  - assertSafeWebhookTarget(url): async DNS-resolution check in
//    webhook-bus.deliverOne, right before the fetch. This stops DNS-rebinding
//    style tricks where a public hostname resolves to 169.254.169.254 or an
//    internal IP. Endpoints created before this guard existed get re-checked
//    on their next delivery attempt.
//
// ponytail: no allowlist of external domains, no connect-and-verify. If a
// tenant legitimately needs to reach an internal host, carve out an env var
// (WEBHOOK_ALLOW_HOSTS) then — nobody has asked for it yet.

import { lookup } from "node:dns/promises";

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
    return `host ${host} is not routable from the server`;
  }
  const ipReason = blockedIpReason(host);
  if (ipReason) return ipReason;
  return null;
}

/** Async check: resolves the hostname and rejects IPs we must never fetch. */
export async function assertSafeWebhookTarget(url: string): Promise<void> {
  const sync = webhookUrlBlockReason(url);
  if (sync) throw new Error(sync);
  const { hostname } = new URL(url);
  // dns.lookup already returns the first resolved address; no isIP needed.
  const res = await lookup(hostname, { all: true }).catch(() => null);
  if (!res) return; // DNS failure: let the fetch produce its own error
  for (const { address } of res) {
    const reason = blockedIpReason(address);
    if (reason) throw new Error(reason);
  }
}

/**
 * Is this host/IP one the server itself must never be used to reach?
 * Accepts IPv4/IPv6 literals (and any hostname string, which never matches).
 * ponytail: numeric range checks instead of a CIDR library; extend the
 * BigInt v6 prefixes if a new internal range ever matters.
 */
export function blockedIpReason(host: string): string | null {
  // v4: loopback / private / link-local (incl. cloud metadata 169.254.169.254)
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = host.split(".").map(Number);
    if (octets.some((o) => o > 255)) return "malformed IPv4";
    const [a, b] = octets;
    if (a === 127) return "loopback address is blocked";
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private address is blocked";
    if (a === 169 && b === 254) return "link-local address is blocked";
    if (a === 0 || a >= 224) return "non-unicast address is blocked";
    return null;
  }
  // v6: ::1, ::, v4-mapped ::ffff:a.b.c.d, ULA fc00::/7, link-local fe80::/10
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (h === "::1" || h === "::") return "loopback address is blocked";
    // v4-mapped first — ::ffff:10.0.0.1 must report the v4 reason, not ULA
    const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return blockedIpReason(mapped[1]);
    const first = h.replace(/^:*/, "").split(/:|%/)[0] || "0";
    if (/^[fF]/.test(first) && !/^fe[89ab]/.test(first)) return "ULA address is blocked";
    if (/^fe[89ab]/.test(first)) return "link-local address is blocked";
    return null;
  }
  return null; // plain hostname — resolved at delivery time
}
