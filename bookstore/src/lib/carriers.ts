import { prisma } from "./db";

// R1: logistics carrier adapters (GHTK / ViettelPost). MANUAL (default) keeps
// the current behavior — staff type carrier + tracking number by hand.
// Booking via provider is opt-in per shipment and always needs credentials:
// without GHTK_TOKEN / VTP_* env the adapter refuses loudly instead of
// silently creating a fake tracking number.

export const CARRIERS = ["MANUAL", "GHTK", "VTP"] as const;
export type CarrierKind = (typeof CARRIERS)[number];

export type CarrierBooking = {
  trackingNumber: string;
  fee: number;
  labelUrl?: string;
  raw: unknown;
};

const FETCH_TIMEOUT_MS = 10_000;

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok)
      throw new Error(`Carrier HTTP ${res.status}: ${JSON.stringify(data)?.slice(0, 300)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export type BookShipmentInput = {
  orderId: string;
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  codAmount: number;
  weightGrams: number;
  storeAddress: string;
};

async function bookGHTK(input: BookShipmentInput): Promise<CarrierBooking> {
  const token = process.env.GHTK_TOKEN;
  const shopId = process.env.GHTK_SHOP_ID;
  if (!token || !shopId) throw new Error("GHTK is not configured (GHTK_TOKEN / GHTK_SHOP_ID)");
  const base = process.env.GHTK_API_BASE ?? "https://services.giaohangtietkiem.vn";
  const data = (await postJson(
    `${base}/services/shipment/order`,
    {
      id: input.orderNumber,
      pick_address: input.storeAddress,
      pick_tel: "",
      name: input.recipientName,
      address: input.address,
      phone: input.recipientPhone.replace(/\D/g, ""),
      cod_amount: Math.round(input.codAmount),
      weight: Math.max(100, input.weightGrams || 500),
      deliver_option: "none",
    },
    { Token: token, ShopId: shopId }
  )) as { success?: boolean; message?: string; order?: { label?: string; tracking_id?: string; id?: string; fee?: number } };
  if (!data?.success || !data.order)
    throw new Error(`GHTK rejected the order: ${data?.message ?? "unknown"}`);
  return {
    trackingNumber: String(data.order.tracking_id ?? data.order.id),
    fee: Number(data.order.fee ?? 0),
    labelUrl: data.order.label,
    raw: data,
  };
}

async function loginVTP(): Promise<string> {
  const username = process.env.VTP_USERNAME;
  const password = process.env.VTP_PASSWORD;
  if (!username || !password) throw new Error("ViettelPost is not configured (VTP_USERNAME / VTP_PASSWORD)");
  const base = process.env.VTP_API_BASE ?? "https://partner.viettelpost.vn";
  const data = (await postJson(
    `${base}/v2/user/Login`,
    { USERNAME: username, PASSWORD: password },
    {}
  )) as { status?: number; message?: string; data?: { token?: string } };
  if (data?.status !== 200 || !data.data?.token)
    throw new Error(`ViettelPost login failed: ${data?.message ?? "unknown"}`);
  return data.data.token;
}

async function bookVTP(input: BookShipmentInput): Promise<CarrierBooking> {
  const base = process.env.VTP_API_BASE ?? "https://partner.viettelpost.vn";
  const token = await loginVTP();
  const data = (await postJson(
    `${base}/v2/order/createOrder`,
    {
      ORDER_NUMBER: input.orderNumber,
      SENDER_FULLNAME: "Melio Bookstore",
      SENDER_ADDRESS: input.storeAddress,
      RECEIVER_FULLNAME: input.recipientName,
      RECEIVER_ADDRESS: input.address,
      RECEIVER_PHONE: input.recipientPhone.replace(/\D/g, ""),
      PRODUCT_NAME: `Sách/văn phòng phẩm (${input.orderNumber})`,
      PRODUCT_WEIGHT: Math.max(100, input.weightGrams || 500),
      MONEY_COLLECTION: String(Math.round(input.codAmount)),
      TYPE: 1,
    },
    { Token: token }
  )) as { status?: number; message?: string; data?: { ORDER_NUMBER?: string; MONEY_TOTAL?: number } };
  if (data?.status !== 200 || !data.data?.ORDER_NUMBER)
    throw new Error(`ViettelPost rejected the order: ${data?.message ?? "unknown"}`);
  return {
    trackingNumber: String(data.data.ORDER_NUMBER),
    fee: Number(data.data.MONEY_TOTAL ?? 0),
    raw: data,
  };
}

export async function bookCarrierShipment(
  carrier: CarrierKind,
  input: BookShipmentInput
): Promise<CarrierBooking> {
  if (carrier === "GHTK") return bookGHTK(input);
  if (carrier === "VTP") return bookVTP(input);
  throw new Error("MANUAL carrier has no booking API — type the tracking number by hand");
}

/** Map a provider status push to our ShipmentStatus. Unknown → null (ignored).
 *  GHTK pushes Vietnamese slugs (dang_giao, da_giao, huy...); ViettelPost
 *  pushes numeric ORDER_STATUS (505 = delivered, 500/503/507 ~ returned). */
export function normalizeCarrierStatus(provider: string, raw: string | number): "SHIPPED" | "DELIVERED" | "CANCELLED" | null {
  const s = String(raw).toLowerCase().trim();
  if (provider === "VTP") {
    if (["505"].includes(s)) return "DELIVERED";
    if (["500", "503", "507", "509"].includes(s)) return "CANCELLED";
    if (["100", "101", "102", "103", "104", "200", "201"].includes(s)) return "SHIPPED";
    return null;
  }
  if (["da_giao", "delivered", "hoan_thanh"].includes(s)) return "DELIVERED";
  if (["huy", "cancelled", "tra_hang", "returned"].includes(s)) return "CANCELLED";
  if (["dang_giao", "dang_lay", "da_lay", "shipped", "in_transit"].includes(s)) return "SHIPPED";
  return null;
}

/** Persist a booking onto the order's shipment (creates it if missing). */
export async function attachCarrierBooking(orderId: string, carrier: CarrierKind, booking: CarrierBooking) {
  return prisma.shipment.upsert({
    where: { orderId },
    create: {
      orderId,
      carrier,
      trackingNumber: booking.trackingNumber,
      recipientName: "",
      recipientPhone: "",
      address: "",
      status: "SHIPPED",
      shippedAt: new Date(),
    },
    update: {
      carrier,
      trackingNumber: booking.trackingNumber,
      status: "SHIPPED",
      shippedAt: new Date(),
    },
  });
}
