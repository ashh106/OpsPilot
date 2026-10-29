import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireOwnerEmail } from "../server/owner.js";

export default defineAction({
  description: "Create a customer record owned by the caller.",
  schema: z.object({
    name: z.string().trim().min(1).max(120).describe("Customer name"),
    email: z.string().trim().email().max(254).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    notes: z.string().max(2000).optional(),
  }),
  run: async ({ name, email, phone, notes }) => {
    const ownerEmail = requireOwnerEmail();
    const [row] = await getDb()
      .insert(schema.customers)
      .values({
        id: crypto.randomUUID(),
        ownerEmail,
        name,
        email: email || null,
        phone: phone || null,
        notes: notes?.trim() ?? "",
        createdAt: new Date().toISOString(),
      })
      .returning();
    return row;
  },
});
