import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireOwnerEmail } from "../server/owner.js";

export default defineAction({
  description:
    "Update one of the caller's services. Use active=false to stop offering it.",
  schema: z.object({
    id: z.string().min(1).describe("Service id"),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    priceCents: z.number().int().min(0).nullable().optional(),
    active: z.boolean().optional(),
  }),
  run: async ({ id, name, description, durationMinutes, priceCents, active }) => {
    const ownerEmail = requireOwnerEmail();
    const patch: Partial<typeof schema.services.$inferInsert> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description.trim();
    if (durationMinutes !== undefined) patch.durationMinutes = durationMinutes;
    if (priceCents !== undefined) patch.priceCents = priceCents;
    if (active !== undefined) patch.active = active;

    const [row] = await getDb()
      .update(schema.services)
      .set(patch)
      .where(
        and(
          eq(schema.services.id, id),
          eq(schema.services.ownerEmail, ownerEmail),
        ),
      )
      .returning();
    if (!row) fail("Service not found", { statusCode: 404 });
    return row;
  },
});
