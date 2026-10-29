import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireOwnerEmail } from "../server/owner.js";

export default defineAction({
  description:
    "Book a customer into a service at a start time. The server computes the end time from the service duration and rejects overlapping bookings.",
  schema: z.object({
    customerId: z.string().min(1).describe("Customer id"),
    serviceId: z.string().min(1).describe("Service id"),
    startsAt: z.string().datetime().describe("Start time as an ISO 8601 instant"),
    notes: z.string().max(2000).optional().describe("Optional booking notes"),
  }),
  run: async ({ customerId, serviceId, startsAt, notes }) => {
    const ownerEmail = requireOwnerEmail();
    const db = getDb();

    const [customer] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.id, customerId),
          eq(schema.customers.ownerEmail, ownerEmail),
        ),
      );
    if (!customer) fail("Customer not found", { statusCode: 404 });

    const [service] = await db
      .select()
      .from(schema.services)
      .where(
        and(
          eq(schema.services.id, serviceId),
          eq(schema.services.ownerEmail, ownerEmail),
        ),
      );
    if (!service) fail("Service not found", { statusCode: 404 });
    if (!service.active) {
      fail("This service is inactive and cannot be booked", { statusCode: 422 });
    }

    const start = new Date(startsAt);
    const end = new Date(start.getTime() + service.durationMinutes * 60_000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const [conflict] = await db
      .select({ id: schema.appointments.id })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.ownerEmail, ownerEmail),
          eq(schema.appointments.status, "scheduled"),
          lt(schema.appointments.startsAt, endIso),
          gt(schema.appointments.endsAt, startIso),
        ),
      )
      .limit(1);
    if (conflict) {
      fail("That time overlaps another scheduled appointment. Choose a different time.", {
        statusCode: 409,
      });
    }

    const [row] = await db
      .insert(schema.appointments)
      .values({
        id: crypto.randomUUID(),
        ownerEmail,
        customerId,
        serviceId,
        startsAt: startIso,
        endsAt: endIso,
        status: "scheduled",
        notes: notes?.trim() ?? "",
        createdAt: new Date().toISOString(),
      })
      .returning();
    return row;
  },
});
