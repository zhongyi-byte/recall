import type { APIRoute } from "astro";

import { requireApiAuth } from "@/lib/auth";
import { deleteDeck, getDeck, listCardsByDeck } from "@/lib/db";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

export const GET: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = context.params;
  if (!id) {
    return badRequest("Deck id is required");
  }

  const db = getDb(context);
  const deck = await getDeck(db, id);
  if (!deck) {
    return badRequest("Deck not found", 404);
  }

  const cards = await listCardsByDeck(db, id);
  return json({ deck, cards });
};

export const DELETE: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = context.params;
  if (!id) {
    return badRequest("Deck id is required");
  }

  const deleted = await deleteDeck(getDb(context), id);
  if (!deleted) {
    return badRequest("Deck not found", 404);
  }

  return json(deleted);
};
