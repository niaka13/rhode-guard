/** Authentification staff avec mots de passe scrypt et sessions opaques. */
import { db } from "@/lib/db";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "rg_session";
const SESSION_TTL_MS = 12 * 3600 * 1000;
const PASSWORD_KEY_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, PASSWORD_KEY_BYTES).toString("hex");
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, expectedHex, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || extra) return false;
  try {
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length !== PASSWORD_KEY_BYTES) return false;
    const actual = scryptSync(password, salt, PASSWORD_KEY_BYTES);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sessionDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type StaffCtx = { id: string; username: string; role: string };

export async function login(username: string, password: string, ip?: string) {
  const staff = await db.staff.findUnique({ where: { username } });
  if (!staff || !staff.isActive || !verifyPassword(password, staff.passwordHash)) {
    await db.auditLog.create({
      data: { action: "LOGIN_FAILED", target: username.slice(0, 40), details: JSON.stringify({ ip: ip ?? "inconnu" }) },
    }).catch(() => undefined);
    return null;
  }
  const token = randomBytes(32).toString("hex");
  await db.staffSession.create({
    data: {
      token: sessionDigest(token),
      staffId: staff.id,
      ip: ip ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await db.staff.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({
    data: { staffId: staff.id, action: "LOGIN", target: staff.username, details: JSON.stringify({ ip: ip ?? "inconnu" }) },
  });
  return { token, staff: { id: staff.id, username: staff.username, role: staff.role } as StaffCtx };
}

export async function getStaffByToken(token: string | undefined | null): Promise<StaffCtx | null> {
  if (!token) return null;
  const session = await db.staffSession.findUnique({ where: { token: sessionDigest(token) }, include: { staff: true } });
  if (!session || session.expiresAt < new Date() || !session.staff.isActive) return null;
  return { id: session.staff.id, username: session.staff.username, role: session.staff.role };
}

export async function currentStaff(): Promise<StaffCtx | null> {
  const jar = await cookies();
  return getStaffByToken(jar.get(SESSION_COOKIE)?.value);
}

export async function logout(token: string | undefined | null) {
  if (token) await db.staffSession.deleteMany({ where: { token: sessionDigest(token) } });
}

type Bucket = { count: number; resetAt: number };
const loginBuckets = new Map<string, Bucket>();
const LOGIN_MAX = 8;
const LOGIN_WINDOW_MS = 10 * 60_000;

export function loginRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = loginBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    loginBuckets.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > LOGIN_MAX) return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  return { allowed: true, retryAfterSec: 0 };
}
