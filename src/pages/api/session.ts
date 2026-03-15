import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { clearAuthCookie, readLoginApiKey, setAuthCookie } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";

const workerEnv = env as {
  API_KEY?: string;
};

export const POST: APIRoute = async (context) => {
  const key = await readLoginApiKey(context.request);
  const expected = workerEnv.API_KEY ?? import.meta.env.API_KEY ?? "";

  if (!key) {
    return badRequest("API key is required");
  }

  if (!expected || key !== expected) {
    return badRequest("Invalid API key", 401);
  }

  setAuthCookie(context, key);
  return json({ ok: true });
};

export const DELETE: APIRoute = async (context) => {
  clearAuthCookie(context);
  return json({ ok: true });
};
