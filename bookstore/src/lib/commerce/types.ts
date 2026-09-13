// Shared commerce-agent primitives — adapted from anthropics/commerce-agents
// `commerce-common` + `docs/backends.md` philosophy:
//
// - Each backend method calls your service server-side with the credential the
//   host holds for the session; the model reads only the result.
// - A flow whose steps have a fixed order enforces that order in the backend.
// - Start small: a stubbed method returns an UNAVAILABLE result and changes no
//   prompt bytes. Set COMMERCE_BACKEND=stub to run the agents with zero DB.
// - A system the business lacks entirely is an `enable_*` switch turned off,
//   which removes its tools, prompt lines and grounding rule on every path.

export type Unavailable = {
  unavailable: true;
  reason: string;
};

export function unavailable(reason: string): Unavailable {
  return { unavailable: true, reason };
}

export function isUnavailable(value: unknown): value is Unavailable {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).unavailable === true
  );
}

export function isBackendUnavailable(value: unknown): value is Unavailable {
  return isUnavailable(value);
}

/** A method the business does not have is switched off entirely. */
export type StorefrontSwitches = {
  enableSearch: boolean;
  enableQuote: boolean;
  enableCheckout: boolean;
  enableOrderTracking: boolean;
  enableMemory: boolean;
};

export type MerchantSwitches = {
  enableDigest: boolean;
  enableInventory: boolean;
  enablePricing: boolean;
  enableCampaigns: boolean;
  enableListingEdits: boolean;
};

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultOn;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

export function storefrontSwitches(): StorefrontSwitches {
  return {
    enableSearch: envFlag("COMMERCE_ENABLE_SEARCH", true),
    enableQuote: envFlag("COMMERCE_ENABLE_QUOTE", true),
    enableCheckout: envFlag("COMMERCE_ENABLE_CHECKOUT", true),
    enableOrderTracking: envFlag("COMMERCE_ENABLE_TRACKING", true),
    enableMemory: envFlag("COMMERCE_ENABLE_MEMORY", true),
  };
}

export function merchantSwitches(): MerchantSwitches {
  return {
    enableDigest: envFlag("COMMERCE_ENABLE_DIGEST", true),
    enableInventory: envFlag("COMMERCE_ENABLE_INVENTORY", true),
    enablePricing: envFlag("COMMERCE_ENABLE_PRICING", true),
    enableCampaigns: envFlag("COMMERCE_ENABLE_CAMPAIGNS", true),
    enableListingEdits: envFlag("COMMERCE_ENABLE_LISTING_EDITS", true),
  };
}
