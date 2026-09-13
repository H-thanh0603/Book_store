// Fencing for untrusted text entering an LLM context (adapted from
// anthropics/commerce-agents commerce_common/fencing.py).
//
// Catalog fields (product names, descriptions, author names) are staff- or
// integration-writable. A supplier feed or a rogue catalog editor can plant
// "IGNORE PREVIOUS INSTRUCTIONS" in a product name — without fencing that
// string reaches the model as bare context. sanitize strips the carriers
// (control chars, fake transcript/turn markers, tool-call tags, fence
// markers); fence wraps what's left in a labeled block the prompt tells the
// model is data, never instructions.
//
// Sanitize before every write to the model context; nothing here is a
// guarantee — it shrinks the injection surface to text the model must
// actively misread.

const FENCE_LABEL = "UNTRUSTED_DATA";
const MAX_FENCED_CHARS = 2000;

// Invisible/control characters + zero-width chars that smuggle payload
// splits past naive length checks.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\uFEFF]/g;

/** Strip injection carriers from untrusted text. Never throws. */
export function sanitizeUntrusted(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(CONTROL_CHARS, " ")
    // Forged transcript/turn markers — fake a system turn inside data.
    .replace(/^\s*(system|assistant|user|tool)\s*:\s*/gim, " ")
    // Tool-call / fence tags that could close our own wrapper.
    .replace(/<\/?(?:tool_call|function_call|UNTRUSTED_DATA)[^>]*>/gi, " ")
    // Collapse runs of newlines that mimic message boundaries.
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_FENCED_CHARS);
}

/** Wrap sanitized text in a labeled fence the prompt declares as data. */
export function fenceUntrusted(input: unknown): string {
  const text = sanitizeUntrusted(input);
  if (!text) return "";
  return `<${FENCE_LABEL}>\n${text}\n</${FENCE_LABEL}>`;
}

/** Fence every string field of a tool-result object (numbers pass through). */
export function fenceToolResult<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" ? fenceUntrusted(v) : v;
  }
  return out as T;
}
