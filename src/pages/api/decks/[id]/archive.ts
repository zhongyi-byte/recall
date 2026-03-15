import type { APIRoute } from "astro";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth";
import { getDeck, setDeckArchived } from "@/lib/db";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

const schema = z.object({
  archived: z.boolean()
});

export const POST: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = context.params;
  if (!id) {
    return badRequest("Deck id is required");
  }

  const body = await context.request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const db = getDb(context);
  const deck = await getDeck(db, id);
  if (!deck) {
    return badRequest("Deck not found", 404);
  }

  const updated = await setDeckArchived(db, id, parsed.data.archived);
  return json({ deck: updated });
};
