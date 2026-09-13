// Commerce backends entry point. Select implementation with
// COMMERCE_BACKEND=prisma (default) or COMMERCE_BACKEND=stub (pilot mode:
// every method returns { unavailable: true } and no prompt bytes change).

import { MerchantBackend, PrismaMerchantBackend, StubMerchantBackend } from "./merchant-backend";
import { PrismaStorefrontBackend, StorefrontBackend, StubStorefrontBackend } from "./storefront-backend";

export * from "./types";
export * from "./storefront-backend";
export * from "./merchant-backend";

export type CommerceBackendKind = "prisma" | "stub";

export function commerceBackendKind(): CommerceBackendKind {
  return process.env.COMMERCE_BACKEND === "stub" ? "stub" : "prisma";
}

let storefrontSingleton: StorefrontBackend | null = null;
let merchantSingleton: MerchantBackend | null = null;

export function getStorefrontBackend(kind: CommerceBackendKind = commerceBackendKind()): StorefrontBackend {
  const current = storefrontSingleton;
  if (!current || current.kind !== kind) {
    const next: StorefrontBackend =
      kind === "stub" ? new StubStorefrontBackend() : new PrismaStorefrontBackend();
    storefrontSingleton = next;
    return next;
  }
  return current;
}

export function getMerchantBackend(kind: CommerceBackendKind = commerceBackendKind()): MerchantBackend {
  const current = merchantSingleton;
  if (!current || current.kind !== kind) {
    const next: MerchantBackend =
      kind === "stub" ? new StubMerchantBackend() : new PrismaMerchantBackend();
    merchantSingleton = next;
    return next;
  }
  return current;
}

/** Test-only: drop cached singletons so env switches take effect. */
export function resetCommerceBackends() {
  storefrontSingleton = null;
  merchantSingleton = null;
}
