import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireOwnerEmail } from "../server/owner.js";

export default defineAction({
  description:
    "List the caller's appointments with customer and service names, optionally filtered by start-time range (ISO 8601) and status.",
  schema: z.object({
    from: z.string().datetime().optional().describe("Include starts at or after this instant"),
    to: z.string().datetime().optional().describe("Include starts before this instant"),
    status: z
      .enum(["scheduled", "completed", "cancelled"])
      .optional()
      .describe("Only return appointments with this status"),
  }),
  http: { method: "GET" },
  run: async ({ from, to, status }) => {
    const ownerEmail = requireOwnerEmail();
    const conditions = [eq(schema.appointments.ownerEmail, ownerEmail)];
    if (from) conditions.push(gte(schema.appointments.startsAt, new Date(from).toISOString()));
    if (to) conditions.push(lt(schema.appointments.startsAt, new Date(to).toISOString()));
    if (status) conditions.push(eq(schema.appointments.status, status));

    return getDb()
      .select({
        id: schema.appointments.id,
        customerId: schema.appointments.customerId,
        customerName: schema.customers.name,
        serviceId: schema.appointments.serviceId,
        serviceName: schema.services.name,
        durationMinutes: schema.services.durationMinutes,
        startsAt: schema.appointments.startsAt,
        endsAt: schema.appointments.endsAt,
        status: schema.appointments.status,
        notes: schema.appointments.notes,
        createdAt: schema.appointments.createdAt,
      })
      .from(schema.appointments)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.appointments.customerId))
      .innerJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
      .where(and(...conditions))
      .orderBy(asc(schema.appointments.startsAt));
  },
});
