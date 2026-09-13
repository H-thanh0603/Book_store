// Agent cart handoff: the shopping agent renders the cart (prepare_checkout),
// the host completes it. The card carries items as a base64url JSON payload in
// the `agent_cart` query param; CartProvider merges it into localStorage and
// strips the param. Pure encode/parse shared by server (card) and tests.

import { createHmac, timingSafeEqual } from "crypto";

export type AgentCartLine = {
  variantId: string;
  quantity: number;
  /** Display-only hints rendered by the server card. The quote/checkout
   * engines re-price by variantId — the host never trusts these amounts. */
  name?: string;
  price?: number;
};

const MAX_LINES = 50;

function base64UrlEncode(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

function base64UrlDecode(payload: string): string {
  return Buffer.from(payload, "base64url").toString("utf8");
}

export function encodeAgentCart(lines: AgentCartLine[]): string {
  const clean = lines
    .filter((l) => typeof l.variantId === "string" && l.variantId.length > 0 && l.variantId.length <= 64)
    .map((l) => ({
      variantId: l.variantId.slice(0, 64),
      quantity: Math.min(Math.max(Math.floor(l.quantity) || 1, 1), 99),
      ...(typeof l.name === "string" && l.name ? { name: l.name.slice(0, 120) } : {}),
      ...(typeof l.price === "number" && Number.isFinite(l.price) && l.price >= 0
        ? { price: Math.floor(l.price) }
        : {}),
    }))
    .slice(0, MAX_LINES);
  return base64UrlEncode(JSON.stringify(clean));
}

/** Parse an `agent_cart` param. Invalid payloads merge nothing — never crash.
 *  v2 (signed): payload carries a HMAC-SHA256 tag; unsigned or tampered
 *  payloads are rejected so a third party cannot forge /shop?agent_cart=
 *  links that merge attacker-chosen lines into a victim's cart. */
export function parseAgentCartParam(param: string | null): AgentCartLine[] {
  if (!param || param.length > 8192) return [];
  try {
    if (!verifyAgentCartSignature(param)) return [];
    // Signature verified: the payload is the part before the tag.
    const dot = param.lastIndexOf(".");
    const decoded = JSON.parse(base64UrlDecode(param.slice(0, dot))) as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded
      .filter(
        (l): l is AgentCartLine =>
          typeof l === "object" &&
          l !== null &&
          typeof (l as AgentCartLine).variantId === "string" &&
          (l as AgentCartLine).variantId.length > 0 &&
          (l as AgentCartLine).variantId.length <= 64 &&
          typeof (l as AgentCartLine).quantity === "number",
      )
      .map((l) => ({
        variantId: l.variantId,
        quantity: Math.min(Math.max(Math.floor(l.quantity) || 1, 1), 99),
        ...(typeof l.name === "string" && l.name
          ? { name: l.name.slice(0, 120) }
          : {}),
        ...(typeof l.price === "number" && Number.isFinite(l.price) && l.price >= 0
          ? { price: Math.floor(l.price) }
          : {}),
      }))
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

// ── HMAC signing (v2) ─────────────────────────────────────────────────────
// Format: base64url(JSON lines) + "." + base64url(HMAC-SHA256(lines-part)).
// Secret: AGENT_CART_SECRET env. Unset → encodeAgentCartSigned returns ""
// (card degrades to no link) and verify fails closed. No silent unsigned
// mode: a deployment without the secret notices immediately instead of
// shipping forgeable links.

function agentCartSecret(): Buffer | null {
  const s = process.env.AGENT_CART_SECRET;
  return s && s.length >= 16 ? Buffer.from(s, "utf8") : null;
}

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Encode + sign. Returns "" when the secret is unset (caller must then
 *  skip the checkoutUrl, not emit an unsigned param). */
export function encodeAgentCartSigned(lines: AgentCartLine[]): string {
  const secret = agentCartSecret();
  if (!secret) return "";
  const payload = encodeAgentCart(lines);
  return `${payload}.${sign(payload, secret)}`;
}

function verifyAgentCartSignature(param: string): boolean {
  const secret = agentCartSecret();
  if (!secret) return false;
  const dot = param.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = param.slice(0, dot);
  const tag = param.slice(dot + 1);
  if (!payload || !tag) return false;
  const expected = sign(payload, secret);
  const a = Buffer.from(tag);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
