import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

// GET /api/products?q=&barcode=&sku=&page=
export async function GET(req: NextRequest) {
  try {
    await requirePermission("product.view");
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q");
    const barcode = sp.get("barcode");
    const sku = sp.get("sku");
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const take = 25;

    const where = {
      AND: [
        barcode ? { variants: { some: { barcodes: { some: { barcode } } } } } : {},
        sku ? { variants: { some: { sku } } } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { variants: { some: { sku: { contains: q, mode: "insensitive" as const } } } },
                { variants: { some: { barcodes: { some: { barcode: q } } } } },
                { author: { name: { contains: q, mode: "insensitive" as const } } },
                { publisher: { name: { contains: q, mode: "insensitive" as const } } },
                { brand: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {},
      ],
    };

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          category: true, brand: true, author: true, publisher: true,
          variants: {
            include: {
              barcodes: true,
              prices: { where: { priceList: { kind: "retail" } }, orderBy: { validFrom: "desc" }, take: 1 },
            },
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * take,
        take,
      }),
    ]);
    return ok({ total, page, products });
  } catch (err) {
    return apiError(err);
  }
}
