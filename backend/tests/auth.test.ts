import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { comparePassword, hashPassword, signToken, verifyToken } from "../src/utils/auth.js";
import { AppError } from "../src/utils/errors.js";

const app = createApp();

describe("auth cryptography & tokens", () => {
  it("hashes password and verifies match correctly", async () => {
    const raw = "SuperSecretPassword123!";
    const hash = await hashPassword(raw);

    expect(hash).not.toBe(raw);
    expect(hash.startsWith("$2")).toBe(true); // bcrypt prefix

    const isMatch = await comparePassword(raw, hash);
    expect(isMatch).toBe(true);

    const isMismatch = await comparePassword("WrongPassword!", hash);
    expect(isMismatch).toBe(false);
  });

  it("signs and verifies JWT token accurately", () => {
    const payload = {
      userId: "123e4567-e89b-12d3-a456-426614174000",
      email: "owner@clinic.com",
      name: "Dr. Owner",
    };

    const token = signToken(payload);
    expect(typeof token).toBe("string");

    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.name).toBe(payload.name);
  });

  it("rejects invalid or tampered tokens with 401 UNAUTHORIZED", () => {
    expect(() => verifyToken("invalid-garbage-token")).toThrow(AppError);
  });
});

describe("auth route security boundaries", () => {
  it("rejects /api/auth/me when no authorization header is provided", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects /api/auth/me with malformed bearer token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-valid-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects registration with invalid email or short password", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "not-an-email",
      password: "123", // too short
      name: "",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects login with missing password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("business route authorization guards", () => {
  it("rejects business creation without authentication", async () => {
    const res = await request(app).post("/api/businesses").send({
      name: "Test Clinic",
      slug: "test-clinic",
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects listing businesses without authentication", async () => {
    const res = await request(app).get("/api/businesses");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates business slug format when token is present", async () => {
    const fakeToken = signToken({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      email: "owner@clinic.com",
      name: "Owner",
    });

    const res = await request(app)
      .post("/api/businesses")
      .set("Authorization", `Bearer ${fakeToken}`)
      .send({
        name: "Test Clinic",
        slug: "INVALID SLUG WITH SPACES",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates business hours format (openTime must be before closeTime)", async () => {
    const fakeToken = signToken({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      email: "owner@clinic.com",
      name: "Owner",
    });

    const res = await request(app)
      .put("/api/businesses/123e4567-e89b-12d3-a456-426614174000/hours")
      .set("Authorization", `Bearer ${fakeToken}`)
      .send([
        {
          dayOfWeek: 1,
          openTime: "18:00",
          closeTime: "09:00", // invalid: close before open
        },
      ]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
