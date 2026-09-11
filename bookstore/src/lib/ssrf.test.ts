// SEC-006 self-check for the SSRF URL guard. Pure sync functions only —
// the async DNS path is exercised implicitly by webhook-bus tests.
import { describe, it, expect, vi } from "vitest";
import { webhookUrlBlockReason, blockedIpReason } from "./ssrf";

describe("webhookUrlBlockReason", () => {
  it("accepts ordinary public urls", () => {
    expect(webhookUrlBlockReason("https://example.com/hook")).toBeNull();
    expect(webhookUrlBlockReason("http://203.0.113.7/cb")).toBeNull();
  });

  it("rejects non-http protocols and garbage", () => {
    expect(webhookUrlBlockReason("ftp://x")).toMatch(/http/);
    expect(webhookUrlBlockReason("file:///etc/passwd")).toMatch(/http/);
    expect(webhookUrlBlockReason("not a url")).toBeTruthy();
  });

  it("rejects localhost-style hostnames", () => {
    expect(webhookUrlBlockReason("http://localhost:3000/hook")).toBeTruthy();
    expect(webhookUrlBlockReason("http://api.local/hook")).toBeTruthy();
    expect(webhookUrlBlockReason("http://db.internal/hook")).toBeTruthy();
  });

  it("rejects internal v4 literals incl. cloud metadata", () => {
    expect(webhookUrlBlockReason("http://127.0.0.1/x")).toBeTruthy();
    expect(webhookUrlBlockReason("http://10.1.2.3/x")).toBeTruthy();
    expect(webhookUrlBlockReason("http://192.168.1.1/x")).toBeTruthy();
    expect(webhookUrlBlockReason("http://172.16.0.9/x")).toBeTruthy();
    expect(webhookUrlBlockReason("http://169.254.169.254/latest/meta-data")).toBeTruthy();
    expect(webhookUrlBlockReason("http://[::1]/x")).toBeTruthy();
  });
});

describe("blockedIpReason", () => {
  it("classifies v4 ranges", () => {
    expect(blockedIpReason("169.254.169.254")).toMatch(/link-local/);
    expect(blockedIpReason("10.0.0.1")).toMatch(/private/);
    expect(blockedIpReason("8.8.8.8")).toBeNull();
    expect(blockedIpReason("999.1.1.1")).toMatch(/malformed/);
  });

  it("classifies v6 ranges", () => {
    expect(blockedIpReason("::1")).toMatch(/loopback/);
    expect(blockedIpReason("fe80::1")).toMatch(/link-local/);
    expect(blockedIpReason("fd00::1")).toMatch(/ULA/);
    expect(blockedIpReason("::ffff:10.0.0.1")).toMatch(/private/);
    expect(blockedIpReason("2001:db8::1")).toBeNull();
  });
});

describe("WEBHOOK_ALLOW_HOSTS operator allowlist", () => {
  const withAllow = async (env: string | undefined, fn: () => Promise<void> | void) => {
    const saved = process.env.WEBHOOK_ALLOW_HOSTS;
    if (env === undefined) delete process.env.WEBHOOK_ALLOW_HOSTS;
    else process.env.WEBHOOK_ALLOW_HOSTS = env;
    try {
      vi.resetModules(); // guard caches ALLOWED at module load — re-import fresh
      await fn();
    } finally {
      if (saved === undefined) delete process.env.WEBHOOK_ALLOW_HOSTS;
      else process.env.WEBHOOK_ALLOW_HOSTS = saved;
      vi.resetModules(); // next imports see the restored (original) env
    }
  };

  it("admits an allowlisted internal host (CI smoke receivers)", async () => {
    await withAllow("127.0.0.1", async () => {
      const fresh = await import("./ssrf");
      expect(fresh.webhookUrlBlockReason("http://127.0.0.1:3999/hook")).toBeNull();
      await expect(fresh.assertSafeWebhookTarget("http://127.0.0.1:3999/hook")).resolves.toBeUndefined();
    });
  });

  it("still blocks internal hosts when the allowlist is empty", () => {
    // No env surgery needed — the suite imports (top of file) ran without an
    // allowlist, so this checks the default behavior directly.
    expect(webhookUrlBlockReason("http://127.0.0.1/x")).toBeTruthy();
  });

  it("does not leak the allowlist to OTHER hosts", async () => {
    await withAllow("127.0.0.1", async () => {
      const fresh = await import("./ssrf");
      expect(fresh.webhookUrlBlockReason("http://10.0.0.5/x")).toMatch(/private/);
      expect(fresh.webhookUrlBlockReason("http://[::1]/x")).toMatch(/loopback/);
    });
  });
});
