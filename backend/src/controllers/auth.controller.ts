import type { Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth.service.js";
import { AppError } from "../utils/errors.js";

const registerSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  name: z.string().min(1, "Name is required").max(100),
});

const loginSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(1, "Password is required"),
});

const updateProfileSchema = z
  .object({
    name: z.string().min(1, "Name cannot be empty").max(100).optional(),
    phone: z.string().nullable().optional(),
  })
  .strict(); // Strict mode rejects any attempt to pass protected fields such as phoneVerified

const adminVerifySchema = z
  .object({
    userId: z.string().uuid("A valid UUID is required for userId"),
  })
  .strict();

export class AuthController {
  static async register(req: Request, res: Response) {
    const input = registerSchema.parse(req.body);
    const result = await AuthService.register(input);
    res.status(201).json(result);
  }

  static async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    const result = await AuthService.login(input);
    res.status(200).json(result);
  }

  static async getMe(req: Request, res: Response) {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    const user = await AuthService.getMe(req.user.userId);
    res.status(200).json({ user });
  }

  static async updateProfile(req: Request, res: Response) {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    const input = updateProfileSchema.parse(req.body);
    const user = await AuthService.updateProfile(req.user.userId, input);
    res.status(200).json({ user });
  }

  static async adminVerifyPhone(req: Request, res: Response) {
    const adminKey = (req.headers["x-admin-key"] as string) || "";
    const input = adminVerifySchema.parse(req.body);
    const user = await AuthService.adminVerifyUserPhone(adminKey, input.userId);
    res.status(200).json({ user });
  }
}
