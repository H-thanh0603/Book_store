import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, fail, ok } from "@/lib/api";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

/**
 * Public delivery tracking. Two-factor lookup: the exact order number AND the
 * phone recorded on the order must both match — knowing one alone reveals
 * nothing. The response carries fulfillment status only: no customer name,
 * phone or address ever leaves the system here.
 */
function normPhone(v: string) {
  // 0901234567 / +84 90 123 4567 / 84 912345678 all normalize to the same core.
  return v.replace(/\D/g, "").replace(/^84/, "").replace(/^0/, "");
}

export async function GET(req: NextRequest) {
  try {
    await enforceRateLimit("storefront-track", clientIp(req.headers), 20, 60_000);
    const sp = req.nextUrl.searchParams;
    const number = (sp.get("number") ?? "").trim().toUpperCase();
    const phone = (sp.get("phone") ?? "").trim();
    if (!number || !phone)
      fail(400, "VALIDATION", "Both the order number and the ordering phone are required");

    const order = await prisma.order.findUnique({
      where: { number },
      select: {
        number: true, status: true, createdAt: true, total: true,
        store: { select: { name: true } },
        customer: { select: { phone: true } }, // verification factor only — never returned
        shipment: { select: { carrier: true, trackingNumber: true, status: true } },
        items: {
          select: {
            id: true, quantity: true, unitPrice: true,
            variant: { select: { product: { select: { name: true } } } },
          },
        },
      },
    });
    if (!order || !order.customer.phone) return ok({ order: null });
    if (normPhone(order.customer.phone) !== normPhone(phone)) return ok({ order: null });

    const isDelivered = order.status === "DELIVERED";
    const isShipped = order.status === "SHIPPED" || isDelivered;
    const isPacked = ["PACKED", "READY"].includes(order.status) || isShipped;
    const isConfirmed = order.status !== "NEW" && order.status !== "CANCELLED";

    const stages = [
      { label: "Đã tiếp nhận đơn", time: new Date(order.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), done: true, desc: "Hệ thống đã xác nhận đơn hàng" },
      { label: "Thủ thư đóng gói", time: "", done: isConfirmed, desc: "Đã kiểm tra chất lượng ấn bản & bọc chống sốc" },
      { label: "Bàn giao vận chuyển", time: "", done: isPacked, desc: "Đơn vị vận chuyển đã nhận hàng" },
      { label: "Đang giao hàng", time: "", done: isShipped, desc: "Shipper đang trên đường giao đến bạn" },
      { label: "Giao thành công", time: "", done: isDelivered, desc: "Hoàn tất đơn hàng" },
    ];

    return ok({
      order: {
        number: order.number,
        status: order.status,
        createdAt: order.createdAt,
        total: Number(order.total),
        storeName: order.store?.name ?? "Kho Trung Tâm",
        shipment: order.shipment,
        items: order.items.map((it) => ({
          id: it.id,
          name: it.variant.product.name,
          quantity: it.quantity,
          price: Number(it.unitPrice),
        })),
        stages,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
