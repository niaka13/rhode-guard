/**
 * GET /api/admin/audit?page=
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: Request) {
  const guard = await requireStaff("VIEW_AUDIT");
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 30;

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { staff: { select: { username: true, role: true } } },
    }),
    db.auditLog.count(),
  ]);

  return Response.json({ logs, total, page, pageSize });
}
