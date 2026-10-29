import { prisma } from "../db/client.js";
import { AppError } from "../utils/errors.js";
import { assertBusinessMembership } from "../middleware/auth.js";

export interface CreateBusinessInput {
  name: string;
  slug: string;
  description?: string;
  timezone?: string;
  cancellationPolicy?: string;
  cancellationNoticeHours?: number;
}

export interface UpdateBusinessInput {
  name?: string;
  description?: string;
  timezone?: string;
  cancellationPolicy?: string;
  cancellationNoticeHours?: number;
}

export interface CreateServiceInput {
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  currency?: string;
}

export interface BusinessHourSlot {
  dayOfWeek: number;
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
}

export class BusinessService {
  static async createBusiness(userId: string, input: CreateBusinessInput) {
    const slug = input.slug.toLowerCase().trim();

    const existingSlug = await prisma.business.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw AppError.conflict("CONFLICT", `Business slug "${slug}" is already taken`);
    }

    return prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          slug,
          name: input.name.trim(),
          description: input.description?.trim() ?? "",
          timezone: input.timezone?.trim() ?? "Asia/Kolkata",
          cancellationPolicy: input.cancellationPolicy?.trim() ?? "",
          cancellationNoticeHours: input.cancellationNoticeHours ?? 2,
        },
      });

      await tx.businessMember.create({
        data: {
          userId,
          businessId: business.id,
          role: "OWNER",
        },
      });

      return business;
    });
  }

  static async getUserBusinesses(userId: string) {
    const memberships = await prisma.businessMember.findMany({
      where: { userId },
      include: {
        business: {
          include: {
            services: { where: { active: true } },
            hours: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((m) => ({
      ...m.business,
      role: m.role,
    }));
  }

  static async getBusinessById(businessId: string, userId: string) {
    const membership = await assertBusinessMembership(userId, businessId);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        services: true,
        hours: { orderBy: { dayOfWeek: "asc" } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!business) {
      throw AppError.notFound("Business not found");
    }

    return { ...business, currentUserRole: membership.role };
  }

  static async updateBusiness(businessId: string, userId: string, input: UpdateBusinessInput) {
    await assertBusinessMembership(userId, businessId, "OWNER");

    return prisma.business.update({
      where: { id: businessId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description.trim() }),
        ...(input.timezone !== undefined && { timezone: input.timezone.trim() }),
        ...(input.cancellationPolicy !== undefined && { cancellationPolicy: input.cancellationPolicy.trim() }),
        ...(input.cancellationNoticeHours !== undefined && {
          cancellationNoticeHours: input.cancellationNoticeHours,
        }),
      },
    });
  }

  // --- Services Management ---

  static async createService(businessId: string, userId: string, input: CreateServiceInput) {
    await assertBusinessMembership(userId, businessId, "OWNER");

    return prisma.service.create({
      data: {
        businessId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        durationMinutes: input.durationMinutes,
        price: input.price,
        currency: input.currency ?? "INR",
      },
    });
  }

  static async getServices(businessId: string, userId: string) {
    await assertBusinessMembership(userId, businessId);

    return prisma.service.findMany({
      where: { businessId, active: true },
      orderBy: { name: "asc" },
    });
  }

  static async updateService(
    businessId: string,
    serviceId: string,
    userId: string,
    input: Partial<CreateServiceInput> & { active?: boolean },
  ) {
    await assertBusinessMembership(userId, businessId, "OWNER");

    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId },
    });
    if (!service) {
      throw AppError.notFound("Service not found");
    }

    return prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description.trim() }),
        ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.active !== undefined && { active: input.active }),
      },
    });
  }

  // --- Business Hours Management ---

  static async setBusinessHours(businessId: string, userId: string, hours: BusinessHourSlot[]) {
    await assertBusinessMembership(userId, businessId, "OWNER");

    // Replace all hours in a transaction
    return prisma.$transaction(async (tx) => {
      await tx.businessHours.deleteMany({
        where: { businessId },
      });

      if (hours.length > 0) {
        await tx.businessHours.createMany({
          data: hours.map((h) => ({
            businessId,
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime,
            closeTime: h.closeTime,
          })),
        });
      }

      return tx.businessHours.findMany({
        where: { businessId },
        orderBy: { dayOfWeek: "asc" },
      });
    });
  }

  static async getBusinessHours(businessId: string, userId: string) {
    await assertBusinessMembership(userId, businessId);

    return prisma.businessHours.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: "asc" },
    });
  }
}
