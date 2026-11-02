/**
 * POST /api/admin/login — connexion staff
 * - cookie httpOnly 12h + cookie lisible pour l'auth WebSocket du relay
 * - rate-limit par IP (anti brute-force), message générique, audit des échecs
 */
import { login, loginRateLimit, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.username || !body.password) {
    return Response.json({ error: "Identifiants requis" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = loginRateLimit(ip);
  if (!rl.allowed) {
    return Response.json(
      { error: `Trop de tentatives — réessaie dans ${Math.ceil(rl.retryAfterSec / 60)} min` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const result = await login(body.username, body.password, ip);
  if (!result) {
    // Message générique: ne divulgue pas si le compte existe
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  }

  const res = Response.json({ ok: true, staff: result.staff }, { headers: { "Cache-Control": "no-store" } });
  const secure = new URL(req.url).protocol === "https:";
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 3600}${secure ? "; Secure" : ""}`
  );
  return res;
}
