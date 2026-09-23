// Shared LLM gateway for the commerce agents. Any OpenAI-compatible backend
// works; canonical vars are LLM_*, with the historical DEEPSEEK_* as fallback
// so existing deployments keep running unchanged:
//
//   LLM_BASE_URL || DEEPSEEK_BASE_URL || https://api.deepseek.com
//   LLM_API_KEY  || DEEPSEEK_API_KEY   (unset → agents run demo-mode 503)
//   LLM_MODEL    || DEEPSEEK_MODEL     || deepseek-chat
//
// OpenRouter: set LLM_BASE_URL=https://openrouter.ai/api/v1, LLM_API_KEY=sk-or-…,
// LLM_MODEL=<model id>. OPENROUTER_HTTP_REFERER / OPENROUTER_X_TITLE are
// forwarded when present (harmless for other gateways).

export type LlmConfig = {
  url: string;
  apiKey: string;
  model: string;
};

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

export function llmConfig(): LlmConfig {
  const base = (process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  return {
    url: `${base}/chat/completions`,
    apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || "",
    model: process.env.LLM_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  };
}

export function llmConfigured(): boolean {
  return llmConfig().apiKey.length > 0;
}

/** Current model id, for usage log lines (ops forensics: "which model
 *  answered back then" a year later needs this on every usage event). */
export function llmModelId(): string {
  return llmConfig().model;
}

// Optional provider headers (OpenRouter recommends HTTP-Referer + X-Title;
// harmless for DeepSeek and other OpenAI-compatible gateways).
export function providerHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (process.env.OPENROUTER_HTTP_REFERER) h["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
  if (process.env.OPENROUTER_X_TITLE) h["X-Title"] = process.env.OPENROUTER_X_TITLE;
  return h;
}

export type LlmTool = {
  type: "function";
  function: { name: string; description: string; parameters: object };
};

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

export type LlmUsage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

export type LlmReply = {
  message: LlmMessage;
  usage?: LlmUsage;
};

/**
 * Parse a chat-completions body. Some gateways append SSE trailers
 * (`data: [DONE]`) or concatenate objects — fall back to the leading JSON
 * object instead of failing the whole turn on wire noise.
 */
async function parseLlmBody(res: Response): Promise<{ choices: { message: LlmMessage }[]; usage?: LlmUsage }> {
  // Read the body once: a failed .json() still consumes it, so parse text
  // with a tolerant fallback instead of retrying on the same stream.
  const text = await res.text().catch(() => "");
  try {
    return JSON.parse(text) as { choices: { message: LlmMessage }[]; usage?: LlmUsage };
  } catch {
    const start = text.indexOf("{");
    if (start < 0) throw new Error("empty response");
    // Brace-match the first top-level object (respects strings/escapes).
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(text.slice(start, i + 1)) as {
            choices: { message: LlmMessage }[];
            usage?: LlmUsage;
          };
        }
      }
    }
    throw new Error("empty response");
  }
}

/**
 * One chat-completions round. Throws { status: 502 } on transport/upstream
 * failure so routes map it to UPSTREAM; callers log with their own event.
 */
export async function callLlm(
  messages: LlmMessage[],
  opts: { tools?: LlmTool[]; maxTokens: number; temperature: number; timeoutMs?: number },
): Promise<LlmReply> {
  const cfg = llmConfig();
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...providerHeaders(),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      tools: opts.tools && opts.tools.length > 0 ? opts.tools : undefined,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(JSON.stringify({
      level: "error", event: "llm_upstream", model: cfg.model,
      status: res.status, message: errText.slice(0, 300),
    }));
    throw Object.assign(new Error(`llm upstream ${res.status}`), { status: 502 });
  }
  const data = await parseLlmBody(res);
  const message = data.choices[0]?.message;
  if (!message) throw new Error("empty response");
  return { message, usage: data.usage };
}

/**
 * Streaming variant of one chat-completions round (SSE `stream: true`).
 * Yields content deltas as they arrive; returns the assembled text plus
 * usage when present. Tool calls are NOT supported here — streaming is
 * used for the final narration round only (tool rounds stay non-streaming).
 * Throws { status: 502 } like callLlm on transport/upstream failure.
 */
export async function* streamLlm(
  messages: LlmMessage[],
  opts: { maxTokens: number; temperature: number; timeoutMs?: number },
): AsyncGenerator<string, { text: string; usage?: LlmUsage }> {
  const cfg = llmConfig();
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...providerHeaders(),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      stream: true,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    console.error(JSON.stringify({
      level: "error", event: "llm_upstream", model: cfg.model,
      status: res.status, message: errText.slice(0, 300),
    }));
    throw Object.assign(new Error(`llm upstream ${res.status}`), { status: 502 });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: LlmUsage | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
          usage?: LlmUsage;
        };
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          text += delta;
          yield delta;
        }
        if (chunk.usage) usage = chunk.usage;
      } catch {
        // ignore malformed SSE frames
      }
    }
  }
  return { text, usage };
}
