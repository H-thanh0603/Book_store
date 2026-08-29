import { describe, it, expect } from "vitest";
import { withOrg, withOrgViaStore, assertSameOrg } from "./org-scope";
import type { AuthContext } from "./auth";

function auth(orgId: string | null, status: AuthContext["orgStatus"] = "ACTIVE"): AuthContext {
  return {
    userId: "u1",
    email: "u@x.vn",
    orgId,
    orgStatus: status,
    trialEndsAt: null,
    roles: [],
  };
}

describe("withOrg", () => {
  it("injects orgId when caller has an org", () => {
    const out = withOrg(auth("org-1"), { status: "OPEN" } as Record<string, unknown>);
    expect(out).toEqual({ status: "OPEN", orgId: "org-1" });
  });
  it("starts from empty when no where passed", () => {
    const out = withOrg(auth("org-1"));
    expect(out).toEqual({ orgId: "org-1" });
  });
  it("passes through for legacy admin (orgId null)", () => {
    const out = withOrg(auth(null), { foo: 1 } as Record<string, unknown>);
    expect(out).toEqual({ foo: 1 });
  });
});

describe("withOrgViaStore", () => {
  it("builds the region join for store-scoped queries", () => {
    const out = withOrgViaStore(auth("org-1"));
    expect(out).toEqual({ store: { region: { orgId: "org-1" } } });
  });
  it("returns empty for legacy admin", () => {
    expect(withOrgViaStore(auth(null))).toEqual({});
  });
});

describe("assertSameOrg", () => {
  it("throws when caller claims a different org", () => {
    expect(() => assertSameOrg(auth("org-1"), "org-2")).toThrowError(/org mismatch/);
  });
  it("no-op when claimed orgId matches", () => {
    expect(() => assertSameOrg(auth("org-1"), "org-1")).not.toThrow();
  });
  it("no-op when claimed orgId is null/undefined", () => {
    expect(() => assertSameOrg(auth("org-1"), null)).not.toThrow();
    expect(() => assertSameOrg(auth("org-1"), undefined)).not.toThrow();
  });
  it("no-op for legacy admin (bypass)", () => {
    expect(() => assertSameOrg(auth(null), "anything")).not.toThrow();
  });
});
