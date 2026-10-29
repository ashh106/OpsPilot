import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireOwnerEmail } from "../server/owner.js";

export default defineAction({
  description: "Mark one of the caller's appointments as completed or cancelled.",
  schema: z.object({
    id: z.string().min(1).describe("Appointment id"),
    status: z.enum(["completed", "cancelled"]).describe("New status"),
  }),
  run: async ({ id, status }) => {
    const ownerEmail = requireOwnerEmail();
    const [row] = await getDb()
      .update(schema.appointments)
      .set({ status })
      .where(
        and(
          eq(schema.appointments.id, id),
          eq(schema.appointments.ownerEmail, ownerEmail),
        ),
      )
      .returning();
    if (!row) fail("Appointment not found", { statusCode: 404 });
    return row;
  },
});
