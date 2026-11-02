/**
 * POST /api/admin/logout
 */
import { logout, SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value);
  const secure = new URL(req.url).protocol === "https:";
  const res = Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`);
  return res;
}
