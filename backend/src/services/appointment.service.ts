import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/errors.js";
import {
  formatZonedTime,
  getWeekdayForDate,
  parseZonedTime,
} from "../utils/timezone.js";

export interface CreateAppointmentInput {
  businessId: string;
  serviceId: string;
  startTime: string; // ISO 8601 string
  customerId?: string;
  idempotencyKey?: string;
  customer?: {
    name: string;
    phone?: string;
    email?: string;
  };
}

export interface ListAppointmentsFilter {
  businessId: string;
  date?: string; // "YYYY-MM-DD"
  status?: AppointmentStatus;
  customerId?: string;
}

export interface RescheduleAppointmentInput {
  businessId: string;
  appointmentId: string;
  newStartTime: string; // ISO 8601 string
}

export class AppointmentService {
  /**
   * Helper to resolve or create a customer record within a business tenant.
   */
  static async resolveCustomer(
    businessId: string,
    customerId?: string,
    customerData?: { name: string; phone?: string; email?: string },
  ) {
    if (customerId) {
      const existing = await prisma.customer.findFirst({
        where: { id: customerId, businessId },
      });
      if (!existing) {
        throw AppError.notFound("Customer not found for this business");
      }
      return existing;
    }

    if (!customerData?.name?.trim()) {
      throw AppError.validation("Customer name or customerId is required to book an appointment");
    }

    // Try finding existing customer by phone or email in this business
    let customer = null;
    if (customerData.phone) {
      customer = await prisma.customer.findFirst({
        where: { businessId, phone: customerData.phone.trim() },
      });
    }
    if (!customer && customerData.email) {
      customer = await prisma.customer.findFirst({
        where: { businessId, email: customerData.email.trim().toLowerCase() },
      });
    }

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          businessId,
          name: customerData.name.trim(),
          phone: customerData.phone?.trim() ?? null,
          email: customerData.email?.trim().toLowerCase() ?? null,
        },
      });
    }

    return customer;
  }

  /**
   * Validates that an appointment interval fits within the weekly business hours.
   */
  static async validateWithinOperatingHours(
    businessId: string,
    timezone: string,
    startTime: Date,
    endTime: Date,
  ) {
    // Format start time into the business local date "YYYY-MM-DD"
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const localDateStr = formatter.format(startTime); // en-CA gives YYYY-MM-DD
    const dayOfWeek = getWeekdayForDate(localDateStr, timezone);

    const hours = await prisma.businessHours.findUnique({
      where: {
        businessId_dayOfWeek: {
          businessId,
          dayOfWeek,
        },
      },
    });

    if (!hours) {
      throw new AppError(400, "BUSINESS_CLOSED", "Business is closed on this day");
    }

    const openUtc = parseZonedTime(localDateStr, hours.openTime, timezone);
    const closeUtc = parseZonedTime(localDateStr, hours.closeTime, timezone);

    if (startTime.getTime() < openUtc.getTime() || endTime.getTime() > closeUtc.getTime()) {
      throw new AppError(
        400,
        "BUSINESS_CLOSED",
        `Requested slot (${formatZonedTime(startTime, timezone)} - ${formatZonedTime(
          endTime,
          timezone,
        )}) is outside operating hours (${hours.openTime} - ${hours.closeTime}).`,
      );
    }
  }

  /**
   * Creates an appointment with duration verification and PostgreSQL exclusion constraint protection.
   */
  static async createAppointment(input: CreateAppointmentInput, now: Date = new Date()) {
    const { businessId, serviceId, startTime: startTimeStr } = input;

    const startTime = new Date(startTimeStr);
    if (isNaN(startTime.getTime())) {
      throw AppError.validation("Invalid startTime ISO timestamp");
    }

    if (startTime.getTime() <= now.getTime()) {
      throw AppError.validation("Cannot book appointments in the past");
    }

    // Check idempotency key before attempting creation
    if (input.idempotencyKey) {
      const existing = await prisma.appointment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: {
          customer: true,
          service: true,
        },
      });
      if (existing) {
        return existing;
      }
    }

    // 1. Fetch business
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw AppError.notFound("Business not found");
    }

    // 2. Fetch service
    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
    });
    if (!service) {
      throw AppError.notFound("Service not found or inactive for this business");
    }

    // 3. Compute authoritative endTime based on service duration
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

    // 4. Validate fits inside operating hours
    await this.validateWithinOperatingHours(businessId, business.timezone, startTime, endTime);

    // 5. Resolve or create customer
    const customer = await this.resolveCustomer(businessId, input.customerId, input.customer);

    // 6. Attempt atomic insert. Catch Postgres Exclusion Constraint violation.
    try {
      const appointment = await prisma.appointment.create({
        data: {
          businessId,
          customerId: customer.id,
          serviceId: service.id,
          startTime,
          endTime,
          status: AppointmentStatus.CONFIRMED,
          idempotencyKey: input.idempotencyKey,
        },
        include: {
          customer: true,
          service: true,
        },
      });

      return appointment;
    } catch (err: unknown) {
      // If an idempotencyKey was provided, check if a concurrent transaction already created it.
      // Poll briefly to allow the winning concurrent transaction to finish committing.
      if (input.idempotencyKey) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const existing = await prisma.appointment.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            include: { customer: true, service: true },
          });
          if (existing) return existing;
          await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)));
        }
      }

      // Check if this is a PostgreSQL exclusion constraint violation (error code 23P01)
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === "P2002" || err.code === "P2034")) ||
        (err && typeof err === "object" && "code" in err && ((err as { code: string }).code === "23P01" || (err as { code: string }).code === "40P01")) ||
        (err instanceof Error && (err.message.includes("Appointment_no_overlap") || err.message.includes("write conflict") || err.message.includes("deadlock")))
      ) {
        throw AppError.conflict(
          "APPOINTMENT_CONFLICT",
          "This appointment slot has already been booked. Please choose an alternative slot.",
        );
      }
      throw err;
    }
  }

  /**
   * Lists appointments for a business with optional date and status filters.
   */
  static async listAppointments(filter: ListAppointmentsFilter) {
    const { businessId, date, status, customerId } = filter;

    const where: Prisma.AppointmentWhereInput = {
      businessId,
      ...(status && { status }),
      ...(customerId && { customerId }),
    };

    if (date) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { timezone: true },
      });
      if (!business) throw AppError.notFound("Business not found");

      const startOfDay = parseZonedTime(date, "00:00", business.timezone);
      const endOfDay = parseZonedTime(date, "23:59", business.timezone);

      where.startTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    return prisma.appointment.findMany({
      where,
      include: {
        customer: true,
        service: true,
      },
      orderBy: { startTime: "asc" },
    });
  }

  /**
   * Retrieves single appointment details, ensuring tenant isolation.
   */
  static async getAppointmentById(businessId: string, appointmentId: string) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      include: {
        customer: true,
        service: true,
        business: {
          select: { id: true, name: true, timezone: true, cancellationNoticeHours: true },
        },
      },
    });

    if (!appointment) {
      throw AppError.notFound("Appointment not found");
    }

    return appointment;
  }

  /**
   * Reschedules an appointment transactionally with notice policy check.
   */
  static async rescheduleAppointment(
    input: RescheduleAppointmentInput,
    now: Date = new Date(),
  ) {
    const { businessId, appointmentId, newStartTime: newStartTimeStr } = input;

    const newStartTime = new Date(newStartTimeStr);
    if (isNaN(newStartTime.getTime())) {
      throw AppError.validation("Invalid newStartTime ISO timestamp");
    }

    if (newStartTime.getTime() <= now.getTime()) {
      throw AppError.validation("Cannot reschedule an appointment to the past");
    }

    const appointment = await this.getAppointmentById(businessId, appointmentId);

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw AppError.conflict("CONFLICT", "Cannot reschedule a cancelled appointment");
    }
    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw AppError.conflict("CONFLICT", "Cannot reschedule a completed appointment");
    }

    // Cancellation notice policy enforcement
    const noticeMs = (appointment.business.cancellationNoticeHours ?? 2) * 3600 * 1000;
    if (appointment.startTime.getTime() - now.getTime() < noticeMs) {
      throw AppError.forbidden(
        `Cannot reschedule within ${appointment.business.cancellationNoticeHours} hours of the appointment.`,
      );
    }

    const durationMs = appointment.service.durationMinutes * 60 * 1000;
    const newEndTime = new Date(newStartTime.getTime() + durationMs);

    // Validate new slot fits in operating hours
    await this.validateWithinOperatingHours(
      businessId,
      appointment.business.timezone,
      newStartTime,
      newEndTime,
    );

    try {
      return await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          startTime: newStartTime,
          endTime: newEndTime,
          status: AppointmentStatus.CONFIRMED,
        },
        include: {
          customer: true,
          service: true,
        },
      });
    } catch (err: unknown) {
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") ||
        (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23P01") ||
        (err instanceof Error && err.message.includes("Appointment_no_overlap"))
      ) {
        throw AppError.conflict(
          "APPOINTMENT_CONFLICT",
          "The requested reschedule slot is already booked. Please choose another time.",
        );
      }
      throw err;
    }
  }

  /**
   * Cancels an appointment and releases its slot.
   */
  static async cancelAppointment(
    businessId: string,
    appointmentId: string,
    now: Date = new Date(),
  ) {
    const appointment = await this.getAppointmentById(businessId, appointmentId);

    // Idempotent: if already cancelled, return existing
    if (appointment.status === AppointmentStatus.CANCELLED) {
      return appointment;
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw AppError.conflict("CONFLICT", "Cannot cancel a completed appointment");
    }

    // Cancellation notice check
    const noticeMs = (appointment.business.cancellationNoticeHours ?? 2) * 3600 * 1000;
    if (appointment.startTime.getTime() - now.getTime() < noticeMs) {
      throw AppError.forbidden(
        `Cannot cancel within ${appointment.business.cancellationNoticeHours} hours of the scheduled appointment.`,
      );
    }

    return prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
      include: {
        customer: true,
        service: true,
      },
    });
  }

  // --- Customer Directory Subsystem ---

  static async listCustomers(businessId: string) {
    return prisma.customer.findMany({
      where: { businessId },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
