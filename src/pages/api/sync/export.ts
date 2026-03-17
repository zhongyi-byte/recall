import type { APIRoute } from "astro";

import { requireApiAuth } from "@/lib/auth";
import { exportSyncSnapshot } from "@/lib/db";
import { json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

export const GET: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const snapshot = await exportSyncSnapshot(getDb(context));
  return json(snapshot);
};
