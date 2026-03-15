import type { APIRoute } from "astro";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth";
import { bulkCreateCards } from "@/lib/db";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

const bulkSchema = z
  .object({
    deckId: z.string().trim().min(1).optional(),
    deckName: z.string().trim().min(1).optional(),
    cards: z
      .array(
        z.object({
          front: z.string().trim().min(1),
          back: z.string().trim().min(1),
          source: z.string().trim().optional(),
          tags: z.array(z.string().trim().min(1)).optional().default([])
        })
      )
      .min(1)
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
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const ids = await bulkCreateCards(getDb(context), parsed.data);
  return json({ count: ids.length, ids }, { status: 201 });
};
