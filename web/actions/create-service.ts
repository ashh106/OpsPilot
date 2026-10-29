import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireOwnerEmail } from "../server/owner.js";

export default defineAction({
  description: "Create a bookable service owned by the caller.",
  schema: z.object({
    name: z.string().trim().min(1).max(120).describe("Service name"),
    description: z.string().max(1000).optional().describe("Short description"),
    durationMinutes: z
      .number()
      .int()
      .min(5)
      .max(480)
      .describe("Appointment length in minutes"),
    priceCents: z
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .describe("Price in cents, or null when not priced"),
  }),
  run: async ({ name, description, durationMinutes, priceCents }) => {
    const ownerEmail = requireOwnerEmail();
    const [row] = await getDb()
      .insert(schema.services)
      .values({
        id: crypto.randomUUID(),
        ownerEmail,
        name,
        description: description?.trim() ?? "",
        durationMinutes,
        priceCents: priceCents ?? null,
        active: true,
        createdAt: new Date().toISOString(),
      })
      .returning();
    return row;
  },
});
