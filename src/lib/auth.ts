import type { APIContext, AstroGlobal } from "astro";
import { env } from "cloudflare:workers";

import { AUTH_COOKIE_NAME } from "@/lib/constants";
import { badRequest } from "@/lib/http";

const workerEnv = env as {
  API_KEY?: string;
  SESSION_COOKIE_NAME?: string;
};

function expectedApiKey(_context: APIContext | AstroGlobal): string {
  return workerEnv.API_KEY ?? import.meta.env.API_KEY ?? "";
}

export function getSessionCookieName(_context: APIContext | AstroGlobal) {
  return workerEnv.SESSION_COOKIE_NAME || AUTH_COOKIE_NAME;
}

export function getProvidedApiKey(context: APIContext | AstroGlobal) {
  const authHeader = context.request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return context.cookies.get(getSessionCookieName(context))?.value ?? "";
}

export function isAuthorized(context: APIContext | AstroGlobal) {
  const expected = expectedApiKey(context);
  const provided = getProvidedApiKey(context);
  return Boolean(expected && provided && expected === provided);
}

export function requireApiAuth(context: APIContext) {
  if (!isAuthorized(context)) {
    return badRequest("Unauthorized", 401);
  }

  return null;
}

export function requirePageAuth(context: AstroGlobal) {
  if (isAuthorized(context)) {
    return null;
  }

  const url = new URL(context.request.url);
  const next = `${url.pathname}${url.search}`;
  return context.redirect(`/login?next=${encodeURIComponent(next)}`);
}

export async function readLoginApiKey(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return null;
    }
    return "key" in body && typeof body.key === "string" ? body.key.trim() : null;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const key = formData.get("key");
    return typeof key === "string" ? key.trim() : null;
  }

  return null;
}

export function setAuthCookie(context: APIContext, key: string) {
  context.cookies.set(getSessionCookieName(context), key, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(context.request.url).protocol === "https:",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearAuthCookie(context: APIContext) {
  context.cookies.delete(getSessionCookieName(context), { path: "/" });
}
