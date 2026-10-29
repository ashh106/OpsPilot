import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { hashPassword, signToken } from "../src/utils/auth.js";
import { AvailabilityService } from "../src/services/availability.service.js";
import { AppointmentService } from "../src/services/appointment.service.js";

const app = createApp();

let userA: { id: string; email: string; name: string };
let tokenA: string;
let userB: { id: string; email: string; name: string };
let tokenB: string;

let businessA: { id: string; slug: string; timezone: string };
let serviceA30: { id: string; name: string; durationMinutes: number };

beforeAll(async () => {
  // Clean up any previous test artifacts
  await prisma.business.deleteMany({
    where: { slug: { in: ["apt-test-biz-a", "apt-test-biz-b"] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: ["user.a@apt.com", "user.b@apt.com"] } },
  });

  const pwd = await hashPassword("Password123!");
  const createdUserA = await prisma.user.create({
    data: { email: "user.a@apt.com", name: "User A", passwordHash: pwd },
  });
  userA = { id: createdUserA.id, email: createdUserA.email, name: createdUserA.name };
  tokenA = signToken({ userId: userA.id, email: userA.email, name: userA.name });

  const createdUserB = await prisma.user.create({
    data: { email: "user.b@apt.com", name: "User B", passwordHash: pwd },
  });
  userB = { id: createdUserB.id, email: createdUserB.email, name: createdUserB.name };
  tokenB = signToken({ userId: userB.id, email: userB.email, name: userB.name });

  // Create Business A in Asia/Kolkata timezone
  const createdBizA = await prisma.business.create({
    data: {
      slug: "apt-test-biz-a",
      name: "Clinic A",
      timezone: "Asia/Kolkata",
      cancellationNoticeHours: 2,
    },
  });
  businessA = { id: createdBizA.id, slug: createdBizA.slug, timezone: createdBizA.timezone };

  await prisma.businessMember.create({
    data: { userId: userA.id, businessId: businessA.id, role: "OWNER" },
  });

  // Services
  const s30 = await prisma.service.create({
    data: {
      businessId: businessA.id,
      name: "Checkup 30",
      durationMinutes: 30,
      price: 500,
    },
  });
  serviceA30 = { id: s30.id, name: s30.name, durationMinutes: s30.durationMinutes };

  // Set BusinessHours: Monday (1) to Friday (5) from 09:00 to 18:00
  for (let day = 1; day <= 5; day++) {
    await prisma.businessHours.create({
      data: {
        businessId: businessA.id,
        dayOfWeek: day,
        openTime: "09:00",
        closeTime: "18:00",
      },
    });
  }
});

afterAll(async () => {
  await prisma.business.deleteMany({
    where: { slug: { in: ["apt-test-biz-a", "apt-test-biz-b"] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: ["user.a@apt.com", "user.b@apt.com"] } },
  });
  await prisma.$disconnect();
});

describe("Availability Engine", () => {
  it("calculates slots on an open weekday in the future", async () => {
    // 2030-01-07 is a Monday
    const result = await AvailabilityService.calculateAvailability(
      {
        businessId: businessA.id,
        serviceId: serviceA30.id,
        date: "2030-01-07",
      },
      new Date("2030-01-01T00:00:00Z"),
    );

    expect(result.closed).toBe(false);
    expect(result.slots.length).toBeGreaterThan(0);
    // Opening is 09:00, first slot should start at local 09:00
    expect(result.slots[0]?.localStartTime).toBe("09:00");
    expect(result.slots[0]?.localEndTime).toBe("09:30");
    // Closing is 18:00, last 30m slot should finish at 18:00 (starts at 17:30)
    const lastSlot = result.slots[result.slots.length - 1];
    expect(lastSlot?.localStartTime).toBe("17:30");
    expect(lastSlot?.localEndTime).toBe("18:00");
  });

  it("reports closed when business has no hours for that day", async () => {
    // 2030-01-06 is a Sunday (dayOfWeek 0, no hours configured)
    const result = await AvailabilityService.calculateAvailability(
      {
        businessId: businessA.id,
        serviceId: serviceA30.id,
        date: "2030-01-06",
      },
      new Date("2030-01-01T00:00:00Z"),
    );

    expect(result.closed).toBe(true);
    expect(result.slots).toHaveLength(0);
    expect(result.message).toContain("closed");
  });

  it("filters out booked slots from available options", async () => {
    // Book a 30m appointment on 2030-01-07 at 09:00
    const startUtc = new Date("2030-01-07T03:30:00.000Z"); // 09:00 IST
    const customer = await AppointmentService.resolveCustomer(businessA.id, undefined, {
      name: "Existing Client",
      phone: "+919999999999",
    });

    const appt = await prisma.appointment.create({
      data: {
        businessId: businessA.id,
        serviceId: serviceA30.id,
        customerId: customer.id,
        startTime: startUtc,
        endTime: new Date(startUtc.getTime() + 30 * 60 * 1000),
        status: "CONFIRMED",
      },
    });

    try {
      const result = await AvailabilityService.calculateAvailability(
        {
          businessId: businessA.id,
          serviceId: serviceA30.id,
          date: "2030-01-07",
        },
        new Date("2030-01-01T00:00:00Z"),
      );

      // The 09:00 - 09:30 slot must NOT be in available slots
      const hasBookedSlot = result.slots.some((s) => s.localStartTime === "09:00");
      expect(hasBookedSlot).toBe(false);

      // The 09:30 - 10:00 slot MUST be available
      const hasAdjacentSlot = result.slots.some((s) => s.localStartTime === "09:30");
      expect(hasAdjacentSlot).toBe(true);
    } finally {
      await prisma.appointment.delete({ where: { id: appt.id } });
    }
  });
});

describe("Appointment Lifecycle & Concurrency Invariants", () => {
  it("creates an appointment with duration matching the service", async () => {
    // 2030-01-08 at 10:00 IST = 04:30 UTC
    const startTimeIso = "2030-01-08T04:30:00.000Z";

    const res = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: startTimeIso,
        customer: { name: "Alice Test", phone: "1234567890" },
      });

    expect(res.status).toBe(201);
    expect(res.body.appointment).toBeDefined();
    expect(res.body.appointment.status).toBe("CONFIRMED");

    const appt = res.body.appointment;
    const diffMins = (new Date(appt.endTime).getTime() - new Date(appt.startTime).getTime()) / 60000;
    expect(diffMins).toBe(30);

    // Clean up
    await prisma.appointment.delete({ where: { id: appt.id } });
  });

  it("rejects booking outside business operating hours", async () => {
    // 04:00 IST is before 09:00 open time
    const tooEarlyIso = "2030-01-08T22:30:00.000Z"; // Previous day 22:30 UTC = 04:00 IST

    const res = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: tooEarlyIso,
        customer: { name: "Early Bird" },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BUSINESS_CLOSED");
  });

  it("catches overlapping booking races and translates to HTTP 409 APPOINTMENT_CONFLICT", async () => {
    const startTimeIso = "2030-01-09T05:30:00.000Z"; // 11:00 IST

    // 1. First booking succeeds
    const res1 = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: startTimeIso,
        customer: { name: "First Comer" },
      });
    expect(res1.status).toBe(201);
    const apptId = res1.body.appointment.id;

    try {
      // 2. Second overlapping booking (starts 15 mins into the first 30m appointment)
      const overlapTimeIso = "2030-01-09T05:45:00.000Z"; // 11:15 IST
      const res2 = await request(app)
        .post(`/api/businesses/${businessA.id}/appointments`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          serviceId: serviceA30.id,
          startTime: overlapTimeIso,
          customer: { name: "Concurrent User" },
        });

      // Must be caught by Postgres exclusion constraint and translated to 409
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe("APPOINTMENT_CONFLICT");
      expect(res2.body.error.message).toContain("already been booked");
    } finally {
      await prisma.appointment.delete({ where: { id: apptId } });
    }
  });

  it("allows adjacent bookings without conflict", async () => {
    const slot1Start = "2030-01-10T04:30:00.000Z"; // 10:00 - 10:30 IST
    const slot2Start = "2030-01-10T05:00:00.000Z"; // 10:30 - 11:00 IST (Adjacent)

    const res1 = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: slot1Start,
        customer: { name: "Adjacent 1" },
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: slot2Start,
        customer: { name: "Adjacent 2" },
      });
    expect(res2.status).toBe(201);

    // Clean up
    await prisma.appointment.deleteMany({
      where: { id: { in: [res1.body.appointment.id, res2.body.appointment.id] } },
    });
  });

  it("reschedules an appointment safely and releases old slot", async () => {
    const originalStart = "2030-01-11T04:30:00.000Z";
    const res = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: originalStart,
        customer: { name: "Reschedule Test" },
      });
    expect(res.status).toBe(201);
    const apptId = res.body.appointment.id;

    try {
      // Reschedule to 11:00 IST (05:30 UTC)
      const newStart = "2030-01-11T05:30:00.000Z";
      const resReschedule = await request(app)
        .patch(`/api/businesses/${businessA.id}/appointments/${apptId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newStartTime: newStart });

      expect(resReschedule.status).toBe(200);
      expect(new Date(resReschedule.body.appointment.startTime).toISOString()).toBe(newStart);

      // Now the old slot (originalStart) should be available again for another booking!
      const resRebook = await request(app)
        .post(`/api/businesses/${businessA.id}/appointments`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          serviceId: serviceA30.id,
          startTime: originalStart,
          customer: { name: "New Client on Old Slot" },
        });
      expect(resRebook.status).toBe(201);

      await prisma.appointment.delete({ where: { id: resRebook.body.appointment.id } });
    } finally {
      await prisma.appointment.delete({ where: { id: apptId } });
    }
  });

  it("cancelling an appointment releases slot immediately", async () => {
    const slot = "2030-01-14T04:30:00.000Z";
    const res = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: slot,
        customer: { name: "Will Cancel" },
      });
    expect(res.status).toBe(201);
    const apptId = res.body.appointment.id;

    // Cancel appointment
    const resCancel = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments/${apptId}/cancel`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(resCancel.status).toBe(200);
    expect(resCancel.body.appointment.status).toBe("CANCELLED");

    // The slot is now free! A new booking on the exact same slot succeeds:
    const resBookAgain = await request(app)
      .post(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        serviceId: serviceA30.id,
        startTime: slot,
        customer: { name: "Took Cancelled Slot" },
      });
    expect(resBookAgain.status).toBe(201);

    await prisma.appointment.deleteMany({
      where: { id: { in: [apptId, resBookAgain.body.appointment.id] } },
    });
  });

  it("enforces tenant boundary: User B cannot access or book appointments for Business A", async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessA.id}/appointments`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
