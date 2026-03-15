import type { APIRoute } from "astro";
import { z } from "zod";

import { createDeck, listDecks } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

const createDeckSchema = z.object({
  name: z.string().trim().min(1),
  desc: z.string().trim().optional().default("")
});

export const GET: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const decks = await listDecks(getDb(context));
  return json({ decks });
};

export const POST: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await context.request.json().catch(() => null);
  const parsed = createDeckSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  try {
    const deck = await createDeck(getDb(context), parsed.data);
    return json({ deck }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to create deck", 409);
  }
};
