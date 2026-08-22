import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// GET /api/audit-logs?action=&entity=&page=
export async function GET(req: NextRequest) {
  try {
    await requirePermission("admin.users");
    const sp = req.nextUrl.searchParams;
    const action = sp.get("action");
    const entity = sp.get("entity");
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const take = 50;

    const where = {
      ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
      ...(entity ? { entity: { contains: entity, mode: "insensitive" as const } } : {}),
    };
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
    ]);
    return ok({ total, page, logs });
  } catch (err) {
    return apiError(err);
  }
}
