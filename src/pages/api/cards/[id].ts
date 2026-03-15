import type { APIRoute } from "astro";

import { requireApiAuth } from "@/lib/auth";
import { deleteCard } from "@/lib/db";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

export const DELETE: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = context.params;
  if (!id) {
    return badRequest("Card id is required");
  }

  const deleted = await deleteCard(getDb(context), id);
  if (!deleted) {
    return badRequest("Card not found", 404);
  }

  return json(deleted);
};
