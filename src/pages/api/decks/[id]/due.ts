import type { APIRoute } from "astro";

import { requireApiAuth } from "@/lib/auth";
import { listDueCards } from "@/lib/db";
import { getDb } from "@/lib/runtime";
import { json } from "@/lib/http";

export const GET: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const cards = await listDueCards(getDb(context), context.params.id);
  return json({ cards });
};
