import { betterAuth } from "better-auth";

const AUTH_CACHE = new Map();

function configuredOrigins(env, requestOrigin) {
  return Array.from(new Set([
    requestOrigin,
    ...String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  ]));
}

export function getAuth(request, env) {
  if (!env.BETTER_AUTH_SECRET || String(env.BETTER_AUTH_SECRET).length < 32) {
    throw new Error("auth_not_configured");
  }

  const origin = new URL(request.url).origin;
  const cacheKey = `${origin}:${String(env.BETTER_AUTH_SECRET).slice(0, 8)}`;
  if (AUTH_CACHE.has(cacheKey)) return AUTH_CACHE.get(cacheKey);

  const auth = betterAuth({
    appName: "知衡团队协作",
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: "/api/auth",
    trustedOrigins: configuredOrigins(env, origin),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60
    },
    advanced: {
      cookiePrefix: "zhiheng-team",
      useSecureCookies: origin.startsWith("https://"),
      ipAddress: { disableIpTracking: true }
    }
  });

  AUTH_CACHE.set(cacheKey, auth);
  return auth;
}
