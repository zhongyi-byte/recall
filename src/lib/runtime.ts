import type { APIContext, AstroGlobal } from "astro";
import { env } from "cloudflare:workers";

const workerEnv = env as {
  DB?: D1Database;
};

export function getDb(_context: APIContext | AstroGlobal) {
  const db = workerEnv.DB;
  if (!db) {
    throw new Error("Missing D1 binding: DB");
  }
  return db;
}
