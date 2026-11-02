/**
 * GET    /api/admin/cases/[id] — détail d'un dossier (détections + notes + historique)
 * PATCH  /api/admin/cases/[id] — transitions validées par machine à états (§28):
 *          - statut: canTransition() + motif obligatoire selon requiresReason()
 *          - chaque changement enregistré dans CaseTransition (acteur, from→to, motif)
 *          - assignation / appel inchangés (audités)
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import {
  allowedTargets,
  canTransition,
  isCaseStatus,
  requiresReason,
  transitionError,
} from "@/lib/case-machine";

const APPEALS = ["NONE", "PENDING", "ACCEPTED", "REJECTED"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("VIEW_CASES");
  if (guard.error) return guard.error;
  const { id } = await ctx.params;

  const caseFile = await db.caseFile.findUnique({
    where: { id },
    include: {
      player: { select: { id: true, name: true, license: true, riskScore: true, isOnline: true } },
      assignedTo: { select: { id: true, username: true } },
      detections: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { server: { select: { name: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { staff: { select: { username: true } } },
      },
      transitions: {
        orderBy: { createdAt: "asc" },
        include: { staff: { select: { username: true, role: true } } },
      },
    },
  });
  if (!caseFile) return Response.json({ error: "Dossier introuvable" }, { status: 404 });

  return Response.json({
    case: caseFile,
    machine: {
      allowedTargets: allowedTargets(caseFile.status as never),
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MANAGE_CASES");
  if (guard.error) return guard.error;
  const { id } = await ctx.params;

  let body: { status?: string; assignedToId?: string | null; appealStatus?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const existing = await db.caseFile.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Dossier introuvable" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};

  // ---- Transition de statut: machine à états + motif ----
  if (body.status !== undefined) {
    const from = existing.status;
    const to = body.status;

    if (!isCaseStatus(to)) {
      return Response.json({ error: `Statut invalide (valides: OPEN, REVIEWING, ESCALATED, CLOSED_FP, CLOSED_SANCTION, DISMISSED)` }, { status: 400 });
    }
    if (from !== to) {
      if (!isCaseStatus(from) || !canTransition(from, to)) {
        return Response.json({ error: transitionError(from as never, to) }, { status: 409 });
      }
      const reason = (body.reason ?? "").trim();
      if (requiresReason(from, to) && reason.length < 4) {
        return Response.json(
          { error: "Motif obligatoire (4 caractères minimum) pour cette transition", requiresReason: true },
          { status: 400 }
        );
      }

      data.status = to;
      changes.status = { from, to };

      if (to === "CLOSED_FP" || to === "CLOSED_SANCTION" || to === "DISMISSED") {
        data.closedAt = new Date();
        data.closedById = guard.staff.id;
      } else {
        // réouverture: on repart en revue
        data.closedAt = null;
        data.closedById = null;
      }

      // Enregistre la transition (historique audité, jamais silencieux)
      await db.caseTransition.create({
        data: {
          caseId: id,
          fromStatus: from,
          toStatus: to,
          staffId: guard.staff.id,
          reason: reason.length > 0 ? reason.slice(0, 500) : null,
        },
      });
    }
  }

  // ---- Assignation ----
  if (body.assignedToId !== undefined) {
    if (body.assignedToId === null || body.assignedToId === "") {
      data.assignedToId = null;
      changes.assignedTo = { from: existing.assignedToId, to: null };
    } else {
      const staff = await db.staff.findUnique({ where: { id: body.assignedToId } });
      if (!staff) return Response.json({ error: "Membre du staff introuvable" }, { status: 400 });
      data.assignedToId = staff.id;
      changes.assignedTo = { from: existing.assignedToId, to: staff.username };
    }
  }

  // ---- Appel ----
  if (body.appealStatus !== undefined) {
    if (!APPEALS.includes(body.appealStatus)) {
      return Response.json({ error: "Statut d'appel invalide" }, { status: 400 });
    }
    data.appealStatus = body.appealStatus;
    changes.appealStatus = { from: existing.appealStatus, to: body.appealStatus };
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Aucune modification fournie" }, { status: 400 });
  }

  const updated = await db.caseFile.update({ where: { id }, data });

  await db.auditLog.create({
    data: {
      staffId: guard.staff.id,
      action: "CASE_UPDATE",
      target: existing.ref,
      details: JSON.stringify({ ...changes, motif: body.reason ?? undefined }),
    },
  });

  return Response.json({ ok: true, case: updated });
}
