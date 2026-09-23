// Payment gateway hosts: sandbox default (dev-safe), live via env (audit Q155).
import { afterEach, describe, expect, it } from "vitest";
import {
  MOMO_LIVE_URL,
  MOMO_SANDBOX_URL,
  momoCreateUrl,
  momoLive,
} from "./momo";
import { VNP_LIVE_HOST, VNP_SANDBOX_HOST, vnpayHost, vnpayLive } from "./vnpay";
import {
  ZALOPAY_LIVE_URL,
  ZALOPAY_SANDBOX_URL,
  zaloPayCreateUrl,
  zaloPayLive,
} from "./zalopay";

const KEYS = ["VNP_PAY_HOST", "MOMO_CREATE_URL", "ZALOPAY_CREATE_URL"];

function snapshot(): Record<string, string | undefined> {
  return Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
}

function restore(snap: Record<string, string | undefined>) {
  for (const k of KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("payment gateway hosts", () => {
  const snap = snapshot();
  afterEach(() => restore(snap));

  it("defaults to sandbox (dev-safe, no real money)", () => {
    delete process.env.VNP_PAY_HOST;
    delete process.env.MOMO_CREATE_URL;
    delete process.env.ZALOPAY_CREATE_URL;
    expect(vnpayHost()).toBe(VNP_SANDBOX_HOST);
    expect(vnpayLive()).toBe(false);
    expect(momoCreateUrl()).toBe(MOMO_SANDBOX_URL);
    expect(momoLive()).toBe(false);
    expect(zaloPayCreateUrl()).toBe(ZALOPAY_SANDBOX_URL);
    expect(zaloPayLive()).toBe(false);
  });

  it("switches to live hosts via env", () => {
    process.env.VNP_PAY_HOST = VNP_LIVE_HOST;
    process.env.MOMO_CREATE_URL = MOMO_LIVE_URL;
    process.env.ZALOPAY_CREATE_URL = ZALOPAY_LIVE_URL;
    expect(vnpayHost()).toBe(VNP_LIVE_HOST);
    expect(vnpayLive()).toBe(true);
    expect(momoLive()).toBe(true);
    expect(zaloPayLive()).toBe(true);
  });
});
