import type { APIRoute } from "astro";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth";
import { createCard } from "@/lib/db";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

const createCardSchema = z
  .object({
    deckId: z.string().trim().min(1).optional(),
    deckName: z.string().trim().min(1).optional(),
    front: z.string().trim().min(1),
    back: z.string().trim().min(1),
    source: z.string().trim().optional(),
    tags: z.array(z.string().trim().min(1)).optional().default([])
  })
  .refine((value) => value.deckId || value.deckName, {
    message: "deckId or deckName is required"
  });

export const POST: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await context.request.json().catch(() => null);
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const cardId = await createCard(getDb(context), parsed.data);
  return json({ cardId }, { status: 201 });
};
