// B1 tests: backend contracts — stub unavailable on every method, prisma
// implementations conform to the interfaces, env switch parses correctly.
import { describe, expect, it } from "vitest";
import {
  commerceBackendKind,
  getMerchantBackend,
  getStorefrontBackend,
  isUnavailable,
  PrismaMerchantBackend,
  PrismaStorefrontBackend,
  resetCommerceBackends,
  StubMerchantBackend,
  StubStorefrontBackend,
  merchantSwitches,
  storefrontSwitches,
} from "./index";

describe("StubStorefrontBackend", () => {
  const stub = new StubStorefrontBackend();
  it("returns unavailable for search/quote/track without touching prompt bytes", async () => {
    for (const result of [
      await stub.searchProducts({ q: "potter" }),
      await stub.quoteOrder({ items: [] }),
      await stub.trackOrder({ number: "MB-1", phone: "090" }),
      await stub.prepareCheckout({ storeId: "s1", items: [] }),
    ]) {
      expect(isUnavailable(result)).toBe(true);
      if (isUnavailable(result)) expect(result.reason).toContain("stub");
    }
  });
});

describe("StubMerchantBackend", () => {
  const stub = new StubMerchantBackend();
  it("returns unavailable for all four reads", async () => {
    expect(isUnavailable(await stub.getDigestStats({ orgId: "t" }))).toBe(true);
    expect(isUnavailable(await stub.getTopSuggestions({ orgId: "t" }))).toBe(true);
    expect(isUnavailable(await stub.getSlowMovers({ orgId: "t" }))).toBe(true);
    expect(isUnavailable(await stub.getListingIssues({ orgId: "t" }))).toBe(true);
  });
  it("refuses writes with a staged kind", async () => {
    const res = await stub.applyChange({ kind: "promotion.create", payload: {} });
    expect(res).toMatchObject({ refused: true, stagedKind: "promotion.create" });
  });
});

describe("PrismaMerchantBackend", () => {
  const backend = new PrismaMerchantBackend();
  it("conforms to the interface and refuses direct writes", async () => {
    expect(backend.kind).toBe("prisma");
    expect(typeof backend.getDigestStats).toBe("function");
    expect(typeof backend.getTopSuggestions).toBe("function");
    expect(typeof backend.getSlowMovers).toBe("function");
    expect(typeof backend.getListingIssues).toBe("function");
    const res = await backend.applyChange({ kind: "product.patch", payload: {} });
    expect(res).toMatchObject({ refused: true, stagedKind: "product.patch" });
  });
});

describe("PrismaStorefrontBackend", () => {
  it("conforms to the interface", () => {
    const backend = new PrismaStorefrontBackend();
    expect(backend.kind).toBe("prisma");
    expect(typeof backend.searchProducts).toBe("function");
    expect(typeof backend.quoteOrder).toBe("function");
    expect(typeof backend.trackOrder).toBe("function");
    expect(typeof backend.prepareCheckout).toBe("function");
  });
});

describe("commerce backend factory", () => {
  it("defaults to prisma and switches on COMMERCE_BACKEND=stub", () => {
    resetCommerceBackends();
    delete process.env.COMMERCE_BACKEND;
    expect(commerceBackendKind()).toBe("prisma");
    expect(getStorefrontBackend().kind).toBe("prisma");
    expect(getMerchantBackend().kind).toBe("prisma");
    process.env.COMMERCE_BACKEND = "stub";
    resetCommerceBackends();
    expect(commerceBackendKind()).toBe("stub");
    expect(getStorefrontBackend().kind).toBe("stub");
    expect(getMerchantBackend().kind).toBe("stub");
    delete process.env.COMMERCE_BACKEND;
    resetCommerceBackends();
  });
});

describe("commerce switches", () => {
  it("default all-on and parse env off values", () => {
    for (const key of [
      "COMMERCE_ENABLE_SEARCH",
      "COMMERCE_ENABLE_QUOTE",
      "COMMERCE_ENABLE_CHECKOUT",
      "COMMERCE_ENABLE_TRACKING",
      "COMMERCE_ENABLE_MEMORY",
    ]) delete process.env[key];
    expect(storefrontSwitches()).toMatchObject({
      enableSearch: true, enableQuote: true, enableCheckout: true,
      enableOrderTracking: true, enableMemory: true,
    });
    process.env.COMMERCE_ENABLE_CHECKOUT = "0";
    process.env.COMMERCE_ENABLE_MEMORY = "off";
    expect(storefrontSwitches()).toMatchObject({ enableCheckout: false, enableMemory: false });
    delete process.env.COMMERCE_ENABLE_CHECKOUT;
    delete process.env.COMMERCE_ENABLE_MEMORY;

    expect(merchantSwitches()).toMatchObject({
      enableDigest: true, enableInventory: true, enablePricing: true,
      enableCampaigns: true, enableListingEdits: true,
    });
    process.env.COMMERCE_ENABLE_PRICING = "false";
    expect(merchantSwitches().enablePricing).toBe(false);
    delete process.env.COMMERCE_ENABLE_PRICING;
  });
});
