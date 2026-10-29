import type { Request, Response } from "express";
import { AppointmentStatus } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { assertBusinessMembership } from "../middleware/auth.js";
import { AvailabilityService } from "../services/availability.service.js";
import { AppointmentService } from "../services/appointment.service.js";

const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid("Invalid serviceId UUID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
  slotStepMinutes: z.coerce.number().int().min(5).max(120).optional(),
});

const createAppointmentSchema = z.object({
  serviceId: z.string().uuid("Invalid serviceId UUID"),
  startTime: z.string().datetime({ message: "startTime must be a valid ISO 8601 timestamp" }),
  customerId: z.string().uuid().optional(),
  customer: z
    .object({
      name: z.string().min(1, "Customer name is required").max(100),
      phone: z.string().max(25).optional(),
      email: z.string().email("Invalid email format").optional(),
    })
    .optional(),
}).refine((data) => data.customerId || data.customer, {
  message: "Either customerId or customer details (name) must be provided",
  path: ["customer"],
});

const listAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  customerId: z.string().uuid().optional(),
});

const rescheduleSchema = z.object({
  newStartTime: z.string().datetime({ message: "newStartTime must be a valid ISO 8601 timestamp" }),
});

export class AppointmentController {
  static async getAvailability(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    await assertBusinessMembership(req.user.userId, businessId);

    const query = availabilityQuerySchema.parse(req.query);
    const result = await AvailabilityService.calculateAvailability({
      businessId,
      serviceId: query.serviceId,
      date: query.date,
      slotStepMinutes: query.slotStepMinutes,
    });

    res.status(200).json(result);
  }

  static async create(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    await assertBusinessMembership(req.user.userId, businessId, "OWNER");

    const input = createAppointmentSchema.parse(req.body);
    const appointment = await AppointmentService.createAppointment({
      businessId,
      serviceId: input.serviceId,
      startTime: input.startTime,
      customerId: input.customerId,
      customer: input.customer,
    });

    res.status(201).json({ appointment });
  }

  static async list(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    await assertBusinessMembership(req.user.userId, businessId);

    const query = listAppointmentsQuerySchema.parse(req.query);
    const appointments = await AppointmentService.listAppointments({
      businessId,
      date: query.date,
      status: query.status,
      customerId: query.customerId,
    });

    res.status(200).json({ appointments });
  }

  static async getById(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const appointmentId = req.params.appointmentId as string;
    await assertBusinessMembership(req.user.userId, businessId);

    const appointment = await AppointmentService.getAppointmentById(businessId, appointmentId);
    res.status(200).json({ appointment });
  }

  static async reschedule(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const appointmentId = req.params.appointmentId as string;
    await assertBusinessMembership(req.user.userId, businessId, "OWNER");

    const input = rescheduleSchema.parse(req.body);
    const updated = await AppointmentService.rescheduleAppointment({
      businessId,
      appointmentId,
      newStartTime: input.newStartTime,
    });

    res.status(200).json({ appointment: updated });
  }

  static async cancel(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    const appointmentId = req.params.appointmentId as string;
    await assertBusinessMembership(req.user.userId, businessId, "OWNER");

    const cancelled = await AppointmentService.cancelAppointment(businessId, appointmentId);
    res.status(200).json({ appointment: cancelled });
  }

  static async listCustomers(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const businessId = req.params.id as string;
    await assertBusinessMembership(req.user.userId, businessId);

    const customers = await AppointmentService.listCustomers(businessId);
    res.status(200).json({ customers });
  }
}
