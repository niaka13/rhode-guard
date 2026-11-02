/**
 * GET /api/admin/me — staff courant, permissions, mode global
 */
import { currentStaff } from "@/lib/auth";
import { MAX_TEMP_BAN_HOURS, can, Role } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const staff = await currentStaff();
  if (!staff) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const settings = await getSettings();
  return Response.json({
    staff,
    permissions: {
      canBanTemp: can(staff.role, "CREATE_BAN_TEMP"),
      canBanPerm: can(staff.role, "CREATE_BAN_PERM"),
      canHwidBan: can(staff.role, "HWID_BAN"),
      canRevoke: can(staff.role, "REVOKE_BAN"),
      canManageStaff: can(staff.role, "MANAGE_STAFF"),
      canManageWebhooks: can(staff.role, "MANAGE_WEBHOOKS"),
      canManageServers: can(staff.role, "MANAGE_SERVERS"),
      canViewAudit: can(staff.role, "VIEW_AUDIT"),
      canMarkFalse: can(staff.role, "MARK_FALSE_POSITIVE"),
      canViewCases: can(staff.role, "VIEW_CASES"),
      canManageCases: can(staff.role, "MANAGE_CASES"),
      canCaseNotes: can(staff.role, "CASE_NOTES"),
      canViewSettings: can(staff.role, "VIEW_SETTINGS"),
      canManageSettings: can(staff.role, "MANAGE_SETTINGS"),
      canViewAppeals: can(staff.role, "VIEW_APPEALS"),
      canDecideAppeals: can(staff.role, "DECIDE_APPEALS"),
    },
    maxTempBanHours: MAX_TEMP_BAN_HOURS[staff.role as Role] ?? 0,
    mode: settings.mode,
  });
}
