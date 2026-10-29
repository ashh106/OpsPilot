import { prisma } from "../db/client.js";
import { AppError } from "../utils/errors.js";
import {
  formatZonedTime,
  getWeekdayForDate,
  isOverlapping,
  parseZonedTime,
} from "../utils/timezone.js";

export interface AvailabilityQuery {
  businessId: string;
  serviceId: string;
  date: string; // "YYYY-MM-DD"
  slotStepMinutes?: number;
}

export interface AvailableSlot {
  startTime: string; // ISO 8601 UTC
  endTime: string; // ISO 8601 UTC
  localStartTime: string; // "HH:mm" in business timezone
  localEndTime: string; // "HH:mm" in business timezone
}

export interface AvailabilityResult {
  date: string;
  businessId: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  timezone: string;
  closed: boolean;
  slots: AvailableSlot[];
  message?: string;
}

export class AvailabilityService {
  static async calculateAvailability(
    query: AvailabilityQuery,
    now: Date = new Date(),
  ): Promise<AvailabilityResult> {
    const { businessId, serviceId, date, slotStepMinutes } = query;

    // 1. Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw AppError.validation("Invalid date format. Expected YYYY-MM-DD.");
    }

    // 2. Fetch business
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, timezone: true },
    });
    if (!business) {
      throw AppError.notFound("Business not found");
    }

    // 3. Fetch service
    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
      select: { id: true, name: true, durationMinutes: true },
    });
    if (!service) {
      throw AppError.notFound("Service not found or inactive for this business");
    }

    const durationMs = service.durationMinutes * 60 * 1000;
    const stepMs = (slotStepMinutes ?? Math.min(30, service.durationMinutes)) * 60 * 1000;

    // 4. Determine day of week in business timezone
    let dayOfWeek: number;
    try {
      dayOfWeek = getWeekdayForDate(date, business.timezone);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid date value";
      throw AppError.validation(msg);
    }

    // 5. Query operating hours for that day
    const hours = await prisma.businessHours.findUnique({
      where: {
        businessId_dayOfWeek: {
          businessId,
          dayOfWeek,
        },
      },
    });

    if (!hours) {
      return {
        date,
        businessId,
        serviceId: service.id,
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        timezone: business.timezone,
        closed: true,
        slots: [],
        message: "Business is closed on this day.",
      };
    }

    // 6. Convert operating hours to UTC instants
    const openUtc = parseZonedTime(date, hours.openTime, business.timezone);
    const closeUtc = parseZonedTime(date, hours.closeTime, business.timezone);

    // If closing time has already passed completely
    if (closeUtc.getTime() <= now.getTime()) {
      return {
        date,
        businessId,
        serviceId: service.id,
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        timezone: business.timezone,
        closed: false,
        slots: [],
        message: "Operating hours for this date have already passed.",
      };
    }

    // 7. Query active appointments overlapping the open window
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { lt: closeUtc },
        endTime: { gt: openUtc },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: "asc" },
    });

    // 8. Generate candidate slots
    const slots: AvailableSlot[] = [];
    let candidateStart = openUtc.getTime();

    while (candidateStart + durationMs <= closeUtc.getTime()) {
      const candidateEnd = candidateStart + durationMs;
      const slotStartDate = new Date(candidateStart);
      const slotEndDate = new Date(candidateEnd);

      // Only allow future slots
      if (candidateStart > now.getTime()) {
        const hasConflict = existingAppointments.some((appt) =>
          isOverlapping(slotStartDate, slotEndDate, appt.startTime, appt.endTime),
        );

        if (!hasConflict) {
          slots.push({
            startTime: slotStartDate.toISOString(),
            endTime: slotEndDate.toISOString(),
            localStartTime: formatZonedTime(slotStartDate, business.timezone),
            localEndTime: formatZonedTime(slotEndDate, business.timezone),
          });
        }
      }

      candidateStart += stepMs;
    }

    return {
      date,
      businessId,
      serviceId: service.id,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      timezone: business.timezone,
      closed: false,
      slots,
    };
  }
}
