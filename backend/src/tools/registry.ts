import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/errors.js";
import { AvailabilityService } from "../services/availability.service.js";
import { AppointmentService } from "../services/appointment.service.js";
import { AgentTool, ToolContext, ToolResult } from "./types.js";
import { ToolDefinition } from "../agents/provider.js";
import {
  listProductsTool,
  getProductTool,
  createProductTool,
  updateProductPriceTool,
  adjustInventoryTool,
  getInventorySummaryTool,
} from "./inventory.tools.js";

// Helper to resolve serviceId from either UUID or case-insensitive service name
async function resolveServiceId(businessId: string, serviceQuery: string): Promise<string> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceQuery);
  if (isUuid) {
    const service = await prisma.service.findFirst({
      where: { id: serviceQuery, businessId, active: true },
    });
    if (service) return service.id;
  }

  // Fallback to name search
  const serviceByName = await prisma.service.findFirst({
    where: {
      businessId,
      active: true,
      name: { contains: serviceQuery, mode: "insensitive" },
    },
  });

  if (!serviceByName) {
    throw AppError.notFound(`Service matching "${serviceQuery}" not found for this business.`);
  }

  return serviceByName.id;
}

// 1. check_availability
const checkAvailabilitySchema = z.object({
  serviceId: z.string().min(1, "serviceId or service name is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be in YYYY-MM-DD format").optional(),
});

export const checkAvailabilityTool: AgentTool = {
  definition: {
    name: "check_availability",
    description: "Check available appointment slots for a specific service on a given date or date range.",
    parameters: {
      type: "object",
      properties: {
        serviceId: {
          type: "string",
          description: "The service ID (UUID) or service name (e.g. 'General Consultation').",
        },
        startDate: {
          type: "string",
          description: "Start date to check slots for in 'YYYY-MM-DD' format (e.g. '2026-11-01').",
        },
        endDate: {
          type: "string",
          description: "Optional end date in 'YYYY-MM-DD' format. If omitted, checks single startDate.",
        },
      },
      required: ["serviceId", "startDate"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = checkAvailabilitySchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const resolvedServiceId = await resolveServiceId(context.businessId, parsed.data.serviceId);
      const startDate = parsed.data.startDate;
      const endDate = parsed.data.endDate ?? startDate;

      const results = [];
      const curr = new Date(startDate);
      const end = new Date(endDate);

      // Bound date range to max 7 days to avoid unbounded computation
      let daysCount = 0;
      while (curr <= end && daysCount < 7) {
        const dateStr = curr.toISOString().split("T")[0]!;
        const res = await AvailabilityService.calculateAvailability({
          businessId: context.businessId,
          serviceId: resolvedServiceId,
          date: dateStr,
        });
        results.push(res);
        curr.setDate(curr.getDate() + 1);
        daysCount++;
      }

      const totalSlots = results.flatMap((r) => r.slots);

      return {
        success: true,
        data: {
          days: results,
          totalAvailableSlots: totalSlots.length,
          slots: totalSlots,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to retrieve availability slots.";
      return {
        success: false,
        error: {
          code: err instanceof AppError ? err.code : "AVAILABILITY_ERROR",
          message,
        },
      };
    }
  },
};

// 2. book_appointment
const bookAppointmentSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  startTime: z.string().min(1, "startTime must be an ISO-8601 timestamp string"),
  customerName: z.string().min(1).optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
});

export const bookAppointmentTool: AgentTool = {
  definition: {
    name: "book_appointment",
    description: "Book an appointment for a customer. Requires serviceId, startTime ISO timestamp, and customer details.",
    parameters: {
      type: "object",
      properties: {
        serviceId: {
          type: "string",
          description: "The ID or name of the service to book.",
        },
        startTime: {
          type: "string",
          description: "The exact start timestamp in ISO 8601 format (e.g. '2026-11-01T10:00:00.000Z' or from available slots).",
        },
        customerName: {
          type: "string",
          description: "Full name of the customer booking the appointment.",
        },
        customerPhone: {
          type: "string",
          description: "Phone number of the customer (e.g. WhatsApp number).",
        },
        customerEmail: {
          type: "string",
          description: "Optional email address of the customer.",
        },
      },
      required: ["serviceId", "startTime"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = bookAppointmentSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const resolvedServiceId = await resolveServiceId(context.businessId, parsed.data.serviceId);
      const name = parsed.data.customerName || context.customerName || "Customer";
      const phone = parsed.data.customerPhone || context.customerPhone;
      const email = parsed.data.customerEmail;

      const appointment = await AppointmentService.createAppointment({
        businessId: context.businessId,
        serviceId: resolvedServiceId,
        startTime: parsed.data.startTime,
        customerId: context.customerId,
        idempotencyKey: context.idempotencyKey,
        customer: {
          name,
          phone,
          email,
        },
      });

      return {
        success: true,
        data: {
          appointmentId: appointment.id,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          status: appointment.status,
          service: appointment.service.name,
          customer: appointment.customer.name,
          message: "Appointment successfully confirmed.",
        },
      };
    } catch (err: unknown) {
      if (err instanceof AppError && err.code === "APPOINTMENT_CONFLICT") {
        return {
          success: false,
          error: {
            code: "APPOINTMENT_CONFLICT",
            message: "This slot is already booked by another customer. Please choose an alternative time slot.",
          },
        };
      }

      const message = err instanceof Error ? err.message : "Failed to book appointment.";
      return {
        success: false,
        error: {
          code: err instanceof AppError ? err.code : "BOOKING_ERROR",
          message,
        },
      };
    }
  },
};

// 3. reschedule_appointment
const rescheduleSchema = z.object({
  appointmentId: z.string().uuid("appointmentId must be a valid UUID"),
  newStartTime: z.string().min(1, "newStartTime ISO timestamp is required"),
});

export const rescheduleAppointmentTool: AgentTool = {
  definition: {
    name: "reschedule_appointment",
    description: "Reschedule an existing confirmed appointment to a new date and time.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "The unique UUID of the existing appointment to reschedule.",
        },
        newStartTime: {
          type: "string",
          description: "The new start timestamp in ISO 8601 format.",
        },
      },
      required: ["appointmentId", "newStartTime"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = rescheduleSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const updated = await AppointmentService.rescheduleAppointment({
        businessId: context.businessId,
        appointmentId: parsed.data.appointmentId,
        newStartTime: parsed.data.newStartTime,
      });

      return {
        success: true,
        data: {
          appointmentId: updated.id,
          newStartTime: updated.startTime,
          newEndTime: updated.endTime,
          status: updated.status,
          message: "Appointment successfully rescheduled.",
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reschedule appointment.";
      return {
        success: false,
        error: {
          code: err instanceof AppError ? err.code : "RESCHEDULE_ERROR",
          message,
        },
      };
    }
  },
};

// 4. cancel_appointment
const cancelSchema = z.object({
  appointmentId: z.string().uuid("appointmentId must be a valid UUID"),
});

export const cancelAppointmentTool: AgentTool = {
  definition: {
    name: "cancel_appointment",
    description: "Cancel an existing appointment and release the reserved slot.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "The unique UUID of the appointment to cancel.",
        },
      },
      required: ["appointmentId"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = cancelSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const cancelled = await AppointmentService.cancelAppointment(
        context.businessId,
        parsed.data.appointmentId,
      );

      return {
        success: true,
        data: {
          appointmentId: cancelled.id,
          status: cancelled.status,
          message: "Appointment successfully cancelled.",
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to cancel appointment.";
      return {
        success: false,
        error: {
          code: err instanceof AppError ? err.code : "CANCELLATION_ERROR",
          message,
        },
      };
    }
  },
};

// 5. get_business_information
export const getBusinessInformationTool: AgentTool = {
  definition: {
    name: "get_business_information",
    description: "Get general information about the business including operating hours, timezone, description, and list of available services with durations and prices.",
    parameters: {
      type: "object",
      properties: {
        includeServices: {
          type: "boolean",
          description: "Whether to include list of active services (default true).",
        },
      },
      required: [],
    },
  },
  async execute(_rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const business = await prisma.business.findUnique({
        where: { id: context.businessId },
        include: {
          hours: {
            orderBy: { dayOfWeek: "asc" },
          },
          services: {
            where: { active: true },
            select: {
              id: true,
              name: true,
              description: true,
              durationMinutes: true,
              price: true,
              currency: true,
            },
          },
        },
      });

      if (!business) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Business record not found.",
          },
        };
      }

      return {
        success: true,
        data: {
          name: business.name,
          timezone: business.timezone,
          cancellationNoticeHours: business.cancellationNoticeHours,
          workingHours: business.hours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            open: h.openTime,
            close: h.closeTime,
          })),
          services: business.services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            durationMinutes: s.durationMinutes,
            price: Number(s.price),
            currency: s.currency,
          })),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to retrieve business information.";
      return {
        success: false,
        error: {
          code: "BUSINESS_INFO_ERROR",
          message,
        },
      };
    }
  },
};

// Tool Registry singleton
export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  constructor() {
    // Appointment Tools
    this.register(checkAvailabilityTool);
    this.register(bookAppointmentTool);
    this.register(rescheduleAppointmentTool);
    this.register(cancelAppointmentTool);
    this.register(getBusinessInformationTool);

    // Inventory & Catalog Tools
    this.register(listProductsTool);
    this.register(getProductTool);
    this.register(createProductTool);
    this.register(updateProductPriceTool);
    this.register(adjustInventoryTool);
    this.register(getInventorySummaryTool);
  }

  register(tool: AgentTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(name: string, input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool "${name}" is not registered.`,
        },
      };
    }

    return tool.execute(input, context);
  }
}

export const defaultToolRegistry = new ToolRegistry();
