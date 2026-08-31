import { getAuth } from "./_lib/auth.js";

const MODULE_PATHS = [
  { prefix: "/ot", module: "ot" },
  { prefix: "/st", module: "st" },
  { prefix: "/movement", module: "pt" }
];

function requestedModule(pathname) {
  return MODULE_PATHS.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`))?.module || "si";
}

function memberModules(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => ["si", "ot", "st", "pt"].includes(item));
}

function loginRedirect(request, reason = "login") {
  const source = new URL(request.url);
  const target = new URL("/team.html", source.origin);
  target.searchParams.set("return", `${source.pathname}${source.search}`);
  target.searchParams.set("reason", reason);
  return Response.redirect(target.toString(), 302);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return next();

  try {
    const auth = getAuth(request, env);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return loginRedirect(request);

    const member = await env.DB.prepare(`
      SELECT role, status, module_access, password_change_required
      FROM team_members
      WHERE user_id = ?
    `).bind(session.user.id).first();
    if (!member || member.status !== "active") return loginRedirect(request, "inactive");
    if (Number(member.password_change_required) === 1) return loginRedirect(request, "password");

    const moduleId = requestedModule(url.pathname);
    const allowed = member.role === "admin"
      || (member.role === "evaluator" && memberModules(member.module_access).includes(moduleId));
    if (!allowed) return loginRedirect(request, "module");

    const response = await next();
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return loginRedirect(request, "unavailable");
  }
}
