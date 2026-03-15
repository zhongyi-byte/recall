import type { APIRoute } from "astro";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth";
import { submitReview } from "@/lib/db";
import { badRequest, json } from "@/lib/http";
import { getDb } from "@/lib/runtime";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(4)
});

export const POST: APIRoute = async (context) => {
  const unauthorized = requireApiAuth(context);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = context.params;
  if (!id) {
    return badRequest("Card id is required");
  }

  const body = await context.request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  try {
    const result = await submitReview(getDb(context), id, parsed.data.rating as 1 | 2 | 3 | 4);
    return json(result);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Review failed", 404);
  }
};
