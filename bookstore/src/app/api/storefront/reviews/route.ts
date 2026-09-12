import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { apiError, reqStr } from "@/lib/api";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

// GET /api/storefront/reviews?productId= — N3c public: APPROVED rows only,
// newest first, plus average + count for the product header.
export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get("productId");
    if (!productId)
      throw Object.assign(new Error("productId is required"), { status: 400, code: "VALIDATION" });
    const product = await prismaRead.product.findFirst({
      where: { id: productId, status: "active" },
      select: { id: true, orgId: true },
    });
    if (!product)
      throw Object.assign(new Error("Product not found"), { status: 404, code: "NOT_FOUND" });
    const [reviews, agg] = await Promise.all([
      prismaRead.productReview.findMany({
        where: { productId, status: "APPROVED" },
        select: { id: true, authorName: true, rating: true, title: true, body: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prismaRead.productReview.aggregate({
        where: { productId, status: "APPROVED" },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    return NextResponse.json({
      reviews,
      average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
      count: agg._count._all,
    });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/storefront/reviews — submit a review (PENDING moderation).
// Rate-limited per IP; auto-links customerId when phone matches this org.
export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("storefront-reviews", clientIp(req.headers), 10, 60_000);
    const body = (await req.json().catch(() => ({}))) as {
      productId?: string;
      authorName?: string;
      rating?: number;
      title?: string;
      body?: string;
      phone?: string;
    };
    const productId = reqStr(body.productId, "productId", 64);
    const authorName = reqStr(body.authorName, "authorName", 100);
    const text = reqStr(body.body, "body", 2000);
    if (!Number.isInteger(body.rating) || (body.rating as number) < 1 || (body.rating as number) > 5)
      throw Object.assign(new Error("rating must be an integer between 1 and 5"), { status: 400, code: "VALIDATION" });
    const product = await prisma.product.findFirst({
      where: { id: productId, status: "active" },
      select: { id: true, orgId: true },
    });
    if (!product)
      throw Object.assign(new Error("Product not found"), { status: 404, code: "NOT_FOUND" });
    let customerId: string | null = null;
    if (typeof body.phone === "string" && body.phone.trim()) {
      const customer = await prisma.customer.findFirst({
        where: { orgId: product.orgId, phone: body.phone.trim() },
        select: { id: true },
      });
      customerId = customer?.id ?? null;
    }
    const review = await prisma.productReview.create({
      data: {
        productId,
        customerId,
        authorName,
        rating: body.rating as number,
        title: typeof body.title === "string" ? body.title.slice(0, 200) : null,
        body: text,
        status: "PENDING",
      },
      select: { id: true },
    });
    return NextResponse.json({ id: review.id, status: "PENDING" }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
