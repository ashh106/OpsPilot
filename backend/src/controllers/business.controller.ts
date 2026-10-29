import type { Request, Response } from "express";
import { z } from "zod";
import { BusinessService } from "../services/business.service.js";
import { AppError } from "../utils/errors.js";

const createBusinessSchema = z.object({
  name: z.string().min(1, "Business name is required").max(100),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and single hyphens"),
  description: z.string().max(500).optional(),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  cancellationPolicy: z.string().max(1000).optional(),
  cancellationNoticeHours: z.number().int().min(0).max(168).default(2),
});

const updateBusinessSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  timezone: z.string().min(1).optional(),
  cancellationPolicy: z.string().max(1000).optional(),
  cancellationNoticeHours: z.number().int().min(0).max(168).optional(),
});

const serviceSchema = z.object({
  name: z.string().min(1, "Service name is required").max(100),
  description: z.string().max(500).optional(),
  durationMinutes: z.number().int().positive("Duration must be a positive integer in minutes"),
  price: z.number().nonnegative("Price must be 0 or greater"),
  currency: z.string().length(3).default("INR"),
});

const updateServiceSchema = serviceSchema.partial().extend({
  active: z.boolean().optional(),
});

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const businessHoursSchema = z.array(
  z
    .object({
      dayOfWeek: z.number().int().min(0).max(6),
      openTime: z.string().regex(timeRegex, "openTime must be in HH:mm format (00:00 - 23:59)"),
      closeTime: z.string().regex(timeRegex, "closeTime must be in HH:mm format (00:00 - 23:59)"),
    })
    .refine((data) => data.openTime < data.closeTime, {
      message: "openTime must be before closeTime",
      path: ["closeTime"],
    }),
);

export class BusinessController {
  static async create(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const input = createBusinessSchema.parse(req.body);
    const business = await BusinessService.createBusiness(req.user.userId, input);
    res.status(201).json({ business });
  }

  static async listMine(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businesses = await BusinessService.getUserBusinesses(req.user.userId);
    res.status(200).json({ businesses });
  }

  static async getById(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const business = await BusinessService.getBusinessById(businessId, req.user.userId);
    res.status(200).json({ business });
  }

  static async update(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const input = updateBusinessSchema.parse(req.body);
    const business = await BusinessService.updateBusiness(businessId, req.user.userId, input);
    res.status(200).json({ business });
  }

  // --- Services ---

  static async createService(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const input = serviceSchema.parse(req.body);
    const service = await BusinessService.createService(businessId, req.user.userId, input);
    res.status(201).json({ service });
  }

  static async getServices(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const services = await BusinessService.getServices(businessId, req.user.userId);
    res.status(200).json({ services });
  }

  static async updateService(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const serviceId = req.params.serviceId as string;
    const input = updateServiceSchema.parse(req.body);
    const service = await BusinessService.updateService(businessId, serviceId, req.user.userId, input);
    res.status(200).json({ service });
  }

  // --- Hours ---

  static async getHours(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const hours = await BusinessService.getBusinessHours(businessId, req.user.userId);
    res.status(200).json({ hours });
  }

  static async setHours(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const hours = businessHoursSchema.parse(req.body);
    const updated = await BusinessService.setBusinessHours(businessId, req.user.userId, hours);
    res.status(200).json({ hours: updated });
  }
}
