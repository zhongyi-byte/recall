import type { APIRoute } from "astro";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth";
import { undoReview } from "@/lib/db";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

const undoSchema = z.object({
  cardId: z.string().trim().min(1),
  logId: z.string().trim().min(1),
  previousState: z.object({
    due: z.string(),
    stability: z.number(),
    difficulty: z.number(),
    elapsed_days: z.number().int(),
    last_elapsed_days: z.number().int(),
    scheduled_days: z.number().int(),
    learning_steps: z.number().int(),
    reps: z.number().int(),
    lapses: z.number().int(),
    state: z.number().int(),
    last_review: z.string().nullable()
  })
});

export const POST: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const body = await context.request.json().catch(() => null);
  const parsed = undoSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  await undoReview(getDb(context), parsed.data);
  return json({ ok: true });
};
