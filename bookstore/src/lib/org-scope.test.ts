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
  it("throws for org-less caller (Q35 fail-closed)", () => {
    expect(() => withOrg(auth(null), { foo: 1 } as Record<string, unknown>)).toThrowError(/no organization/);
  });
});

describe("withOrgViaStore", () => {
  it("builds the region join for store-scoped queries", () => {
    const out = withOrgViaStore(auth("org-1"));
    expect(out).toEqual({ store: { region: { orgId: "org-1" } } });
  });
  it("throws for org-less caller (Q35 fail-closed)", () => {
    expect(() => withOrgViaStore(auth(null))).toThrowError(/no organization/);
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
  it("throws for org-less caller (Q35 fail-closed)", () => {
    expect(() => assertSameOrg(auth(null), "anything")).toThrowError(/no organization/);
  });
});
