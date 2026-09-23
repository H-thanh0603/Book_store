// Jev intent router: fail-open, caching, checkout gating.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkoutGated,
  clearIntentCache,
  intentRouterConfigured,
  routeIntent,
} from "./intent-router";

const KEYS = ["TYPESAFE_API_KEY", "JEV_MODEL", "JEV_TIMEOUT_MS"];

function snapshot(): Record<string, string | undefined> {
  return Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
}

function restore(snap: Record<string, string | undefined>) {
  for (const k of KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function jevReply(choice: string, confidence = 0.9, noul = 0.1) {
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        intent: { type: "choice", choice, confidence, probabilities: { [choice]: 1 } },
        checkout_ready: { type: "noul", noul },
      },
      usage: { input_tokens: 300, output_tokens: 20 },
    }),
    { status: 200 },
  );
}

describe("intent router", () => {
  const snap = snapshot();
  afterEach(() => {
    restore(snap);
    clearIntentCache();
    vi.unstubAllGlobals();
  });

  it("fail-opens to null without an API key (no behavior change)", async () => {
    delete process.env.TYPESAFE_API_KEY;
    expect(intentRouterConfigured()).toBe(false);
    expect(await routeIntent("tìm sách trinh thám")).toBeNull();
  });

  it("returns the intent with confidence and checkout signal", async () => {
    process.env.TYPESAFE_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => jevReply("track_order", 0.95, 0.05)));
    const route = await routeIntent("đơn của mình tới đâu rồi?");
    expect(route).toMatchObject({ intent: "track_order", confidence: 0.95, checkoutReady: 0.05 });
    expect(route?.usage).toMatchObject({ input_tokens: 300, output_tokens: 20 });
  });

  it("caches identical messages (one fetch for two calls)", async () => {
    process.env.TYPESAFE_API_KEY = "k";
    const fetchSpy = vi.fn(async () => jevReply("chitchat", 0.99, 0));
    vi.stubGlobal("fetch", fetchSpy);
    await routeIntent("xin chào");
    await routeIntent("xin chào");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fail-opens on timeout and bad shape", async () => {
    process.env.TYPESAFE_API_KEY = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect(await routeIntent("hello")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await routeIntent("hello")).toBeNull();
  });

  it("gates checkout on intent + confidence + ready signal", () => {
    expect(checkoutGated(null)).toBe(false);
    expect(checkoutGated({ intent: "prepare_checkout", confidence: 0.9, checkoutReady: 0.9 })).toBe(true);
    expect(checkoutGated({ intent: "prepare_checkout", confidence: 0.6, checkoutReady: 0.9 })).toBe(false);
    expect(checkoutGated({ intent: "prepare_checkout", confidence: 0.9, checkoutReady: 0.5 })).toBe(false);
    expect(checkoutGated({ intent: "search_product", confidence: 0.9, checkoutReady: 0.9 })).toBe(false);
  });
});
