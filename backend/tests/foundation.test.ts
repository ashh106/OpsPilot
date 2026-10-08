import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("health", () => {
  it("reports database connectivity", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });
});

describe("error handling", () => {
  it("returns a structured 404 for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for malformed JSON without leaking internals", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("SyntaxError");
  });
});

describe("env validation", () => {
  it("rejects a short JWT secret", () => {
    expect(() => loadEnv({ DATABASE_URL: "x", JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadEnv({ JWT_SECRET: "a".repeat(32) })).toThrow(/DATABASE_URL/);
  });
});

describe("schema guards", () => {
  it("database rejects overlapping active appointments for one business", async () => {
    const business = await prisma.business.create({ data: { slug: "guard-test", name: "Guard" } });
    try {
      const customer = await prisma.customer.create({
        data: { businessId: business.id, name: "C", phone: "1" },
      });
      const service = await prisma.service.create({
        data: { businessId: business.id, name: "S", durationMinutes: 30, price: 100 },
      });
      const base = {
        businessId: business.id,
        customerId: customer.id,
        serviceId: service.id,
      };
      await prisma.appointment.create({
        data: { ...base, startTime: new Date("2030-01-07T11:30:00Z"), endTime: new Date("2030-01-07T12:00:00Z") },
      });
      await expect(
        prisma.appointment.create({
          data: { ...base, startTime: new Date("2030-01-07T11:45:00Z"), endTime: new Date("2030-01-07T12:15:00Z") },
        }),
      ).rejects.toThrow();
      // Adjacent slot is fine, and a cancelled one never blocks.
      await prisma.appointment.create({
        data: { ...base, startTime: new Date("2030-01-07T12:00:00Z"), endTime: new Date("2030-01-07T12:30:00Z") },
      });
      await prisma.appointment.create({
        data: { ...base, status: "CANCELLED", startTime: new Date("2030-01-07T11:30:00Z"), endTime: new Date("2030-01-07T12:00:00Z") },
      });
    } finally {
      await prisma.business.delete({ where: { id: business.id } });
    }
  });
});
