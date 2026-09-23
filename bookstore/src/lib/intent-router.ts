// Jev intent router — TypeSafe System One pre-LLM classification for the
// concierge. One cheap Jev call (Choice intent + Noul checkout_ready) runs
// before the DeepSeek tool loop; the route decides tools/fast paths.
// Fail-open by design: missing key, timeout, or bad shape → null and the
// caller runs the full LLM loop as before. No new dependency — plain fetch.
// Docs: https://docs.typesafe.ai/introduction/quickstart

export type ConciergeIntent =
  | "search_product"
  | "plan_combo"
  | "compare_products"
  | "get_voucher"
  | "prepare_checkout"
  | "track_order"
  | "return_policy"
  | "chitchat";

export type IntentRoute = {
  intent: ConciergeIntent;
  confidence: number;
  checkoutReady: number;
  usage?: { input_tokens: number; output_tokens: number };
};

const INTENTS: ConciergeIntent[] = [
  "search_product",
  "plan_combo",
  "compare_products",
  "get_voucher",
  "prepare_checkout",
  "track_order",
  "return_policy",
  "chitchat",
];

function isIntent(v: unknown): v is ConciergeIntent {
  return typeof v === "string" && (INTENTS as string[]).includes(v);
}

export function intentRouterConfigured(): boolean {
  return (process.env.TYPESAFE_API_KEY ?? "").length > 0;
}

export function intentRouterModel(): string {
  return process.env.JEV_MODEL || "jev-latest";
}

function timeoutMs(): number {
  const n = Number(process.env.JEV_TIMEOUT_MS ?? 400);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : 400;
}

// Tiny per-process cache: identical messages within 60s share one verdict.
// Keyed by a hash, never by raw text (avoids holding PII in memory).
// ponytail: per-process only — multi-instance deploys repeat Jev calls;
// share via Redis when measured Jev spend justifies it.
const cache = new Map<string, { at: number; route: IntentRoute }>();
const CACHE_TTL_MS = 60_000;

function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `h${h >>> 0}:${s.length}`;
}

export function clearIntentCache(): void {
  cache.clear();
}

function clamp01(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export async function routeIntent(text: string): Promise<IntentRoute | null> {
  const apiKey = process.env.TYPESAFE_API_KEY ?? "";
  if (!apiKey) return null;
  const state = text.trim().slice(0, 1000);
  if (!state) return null;

  const key = hashText(state);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.route;

  let res: Response;
  try {
    res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        state,
        model: intentRouterModel(),
        questions: {
          intent: {
            type: "choice",
            instructions: "Ý định chính của khách Melio Bookstore (nhà sách Việt Nam)",
            criteria: {
              search_product: "Tìm/gợi ý sách, văn phòng phẩm, LEGO, quà tặng",
              plan_combo: "Combo/danh sách nhiều món theo ngân sách",
              compare_products: "So sánh 2-4 món, hỏi loại nào tốt/khác nhau thế nào",
              get_voucher: "Hỏi mã giảm giá, khuyến mãi",
              prepare_checkout: "Chốt mua hàng",
              track_order: "Hỏi trạng thái đơn, mã vận đơn, giao hàng",
              return_policy: "Đổi trả, bảo hành, hoàn tiền, khiếu nại",
              chitchat: "Chào hỏi, cảm ơn, câu không cần catalogue",
            },
          },
          checkout_ready: {
            type: "noul",
            instructions: "Khách đã chốt mua với món + số lượng cụ thể?",
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch {
    return null; // network/timeout → fail open
  }
  if (!res.ok) return null;
  let data: {
    answers?: {
      intent?: { choice?: unknown; confidence?: unknown };
      checkout_ready?: { noul?: unknown };
    };
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return null;
  }
  const choice = data.answers?.intent?.choice;
  if (!isIntent(choice)) return null;
  const route: IntentRoute = {
    intent: choice,
    confidence: clamp01(data.answers?.intent?.confidence),
    checkoutReady: clamp01(data.answers?.checkout_ready?.noul),
    ...(typeof data.usage?.input_tokens === "number" &&
    typeof data.usage?.output_tokens === "number"
      ? { usage: { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } }
      : {}),
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), route });
  return route;
}

// Checkout is gated on BOTH signals: Jev must say prepare_checkout with
// solid confidence AND the checkout_ready Noul must agree. Otherwise the
// turn falls through to the normal tool loop (the model still validates
// món + số lượng + chi nhánh via prepare_checkout tool contract).
export function checkoutGated(route: IntentRoute | null): boolean {
  if (!route) return false;
  return route.intent === "prepare_checkout" && route.confidence >= 0.7 && route.checkoutReady >= 0.8;
}
