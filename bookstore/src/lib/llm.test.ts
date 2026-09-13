// LLM gateway resolution: canonical LLM_* with DEEPSEEK_* fallback.
import { describe, expect, it, afterEach, vi } from "vitest";
import { callLlm, llmConfig, llmConfigured, providerHeaders } from "./llm";

const KEYS = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "OPENROUTER_HTTP_REFERER", "OPENROUTER_X_TITLE"];

function snapshot(): Record<string, string | undefined> {
  return Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
}

function restore(snap: Record<string, string | undefined>) {
  for (const k of KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function clearAll() {
  for (const k of KEYS) delete process.env[k];
}

describe("llm gateway", () => {
  const snap = snapshot();
  afterEach(() => restore(snap));

  it("defaults to DeepSeek chat when nothing is set", () => {
    clearAll();
    expect(llmConfig()).toMatchObject({
      url: "https://api.deepseek.com/chat/completions",
      apiKey: "",
      model: "deepseek-chat",
    });
    expect(llmConfigured()).toBe(false);
  });

  it("prefers LLM_* over DEEPSEEK_*", () => {
    clearAll();
    process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
    process.env.DEEPSEEK_API_KEY = "old-key";
    process.env.DEEPSEEK_MODEL = "deepseek-chat";
    process.env.LLM_BASE_URL = "https://openrouter.ai/api/v1";
    process.env.LLM_API_KEY = "sk-or-new";
    process.env.LLM_MODEL = "nex-agi/nex-n2.5-pro:free";
    expect(llmConfig()).toMatchObject({
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: "sk-or-new",
      model: "nex-agi/nex-n2.5-pro:free",
    });
    expect(llmConfigured()).toBe(true);
  });

  it("falls back to DEEPSEEK_* when LLM_* is absent", () => {
    clearAll();
    process.env.DEEPSEEK_API_KEY = "old-key";
    const cfg = llmConfig();
    expect(cfg.apiKey).toBe("old-key");
    expect(cfg.url).toBe("https://api.deepseek.com/chat/completions");
    expect(llmConfigured()).toBe(true);
  });

  it("forwards OpenRouter headers only when set", () => {
    clearAll();
    expect(providerHeaders()).toEqual({});
    process.env.OPENROUTER_HTTP_REFERER = "https://melio.vn";
    process.env.OPENROUTER_X_TITLE = "Melio Bookstore";
    expect(providerHeaders()).toEqual({
      "HTTP-Referer": "https://melio.vn",
      "X-Title": "Melio Bookstore",
    });
  });

  it("tolerates SSE trailers appended to the JSON body", async () => {
    clearAll();
    process.env.LLM_API_KEY = "k";
    const payload = JSON.stringify({ choices: [{ message: { role: "assistant", content: "OK" } }] });
    const res = new Response(payload + 'data: [DONE]\n\n', { status: 200 });
    const fetchSpy = vi.fn(async () => res);
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const reply = await callLlm([{ role: "user", content: "hi" }], { maxTokens: 10, temperature: 0 });
      expect(reply.message.content).toBe("OK");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
