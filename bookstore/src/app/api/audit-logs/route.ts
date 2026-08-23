import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";

const PAGE_SIZE = 50;

// GET /api/audit-logs?action=&entity=&cursor=<createdAt.ms>|<id>
// Keyset (cursor) pagination — stable under inserts and O(log n) deep pages,
// unlike OFFSET which re-scans. Legacy ?page= still works for old clients.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("admin.users");
    const sp = req.nextUrl.searchParams;
    const action = sp.get("action");
    const entity = sp.get("entity");
    const cursorParam = sp.get("cursor");

    const where = {
      ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
      ...(entity ? { entity: { contains: entity, mode: "insensitive" as const } } : {}),
    };

    if (cursorParam) {
      // "start" = first keyset page (newest N rows + nextCursor for the rest).
      const cursorFilter: Prisma.AuditLogWhereInput[] =
        cursorParam === "start" ? [] : (() => {
          const sep = cursorParam.lastIndexOf("|");
          const ms = Number(cursorParam.slice(0, sep));
          const id = cursorParam.slice(sep + 1);
          const cursorDate = new Date(ms);
          if (!Number.isFinite(ms) || Number.isNaN(cursorDate.getTime()) || !id)
            fail(400, "VALIDATION", "Invalid cursor");
          return [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: id } },
          ];
        })();
      const logs = await prisma.auditLog.findMany({
        where: { ...where, ...(cursorFilter.length ? { OR: cursorFilter } : {}) },
        include: { actor: { select: { email: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE,
      });
      const last = logs.at(-1);
      return ok({
        logs,
        nextCursor: logs.length === PAGE_SIZE && last ? `${last.createdAt.getTime()}|${last.id}` : null,
      });
    }

    // Legacy offset mode.
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return ok({ total, page, logs });
  } catch (err) {
    return apiError(err);
  }
}
