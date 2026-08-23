import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const query = sp.get("q")?.trim() || sp.get("number")?.trim() || sp.get("phone")?.trim();

    if (!query) {
      return ok({ orders: [] });
    }

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { number: { equals: query, mode: "insensitive" } },
          { customer: { phone: { contains: query } } },
          { customer: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      include: {
        customer: true,
        store: { select: { name: true, code: true } },
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    category: true,
                    brand: true,
                    author: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const mapped = orders.map((o) => {
      const isDelivered = o.status === "DELIVERED";
      const isShipped = o.status === "SHIPPED" || isDelivered;
      const isPacked = o.status === "PACKED" || o.status === "READY" || isShipped;
      const isConfirmed = o.status !== "NEW" && o.status !== "CANCELLED";

      const stages = [
        { label: "Đã tiếp nhận đơn", time: new Date(o.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), done: true, desc: "Hệ thống Melio đã xác nhận đơn hàng" },
        { label: "Thủ thư đóng gói", time: "30 phút sau", done: isConfirmed, desc: "Đã kiểm tra chất lượng ấn bản & bọc chống sốc" },
        { label: "Bàn giao vận chuyển", time: "1 giờ sau", done: isPacked, desc: "Đơn vị vận chuyển Melio Express đã nhận hàng" },
        { label: "Đang giao hàng", time: "Trong ngày", done: isShipped, desc: "Shipper đang trên đường giao đến địa chỉ của bạn" },
        { label: "Giao thành công", time: "Hoàn tất", done: isDelivered, desc: "Đã thanh toán COD & tích 5% điểm thưởng" },
      ];

      return {
        id: o.id,
        number: o.number,
        status: o.status,
        createdAt: o.createdAt,
        total: Number(o.total),
        subtotal: Number(o.subtotal),
        discountTotal: Number(o.discountTotal),
        channel: o.channel,
        storeName: o.store?.name ?? "Melio Central",
        customer: {
          name: o.customer?.name ?? "Khách Hàng",
          phone: o.customer?.phone ?? "",
          address: o.customer?.address ?? "Nhận tại cửa hàng",
        },
        items: o.items.map((it) => ({
          id: it.id,
          name: it.variant.product.name,
          category: it.variant.product.category.name,
          brand: it.variant.product.brand?.name ?? null,
          quantity: it.quantity,
          price: Number(it.unitPrice),
        })),
        stages,
      };
    });

    return ok({ orders: mapped });
  } catch (err) {
    return apiError(err);
  }
}
