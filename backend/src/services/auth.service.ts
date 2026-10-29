import { prisma } from "../db/client.js";
import { AppError } from "../utils/errors.js";
import { comparePassword, hashPassword, signToken } from "../utils/auth.js";
import { env } from "../config/env.js";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string | null;
}

export class AuthService {
  static async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });

    if (existing) {
      throw AppError.conflict("CONFLICT", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        name: input.name.trim(),
        passwordHash,
        phoneVerified: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phoneVerified: true,
        createdAt: true,
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    return { user, token };
  }

  static async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });

    if (!user) {
      // Use uniform message to prevent user enumeration
      throw AppError.unauthorized("Invalid email or password");
    }

    const valid = await comparePassword(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized("Invalid email or password");
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phoneVerified: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            business: {
              select: {
                id: true,
                slug: true,
                name: true,
                timezone: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    return user;
  }

  /**
   * Updates an authenticated user's profile.
   * If the phone number is updated or changed, phoneVerified is automatically invalidated (set to false).
   */
  static async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    const data: { name?: string; phone?: string | null; phoneVerified?: boolean } = {};

    if (input.name !== undefined) {
      data.name = input.name.trim();
    }

    if (input.phone !== undefined) {
      const normalizedPhone = input.phone?.trim() ? input.phone.trim().replace(/\D/g, "") : null;

      // If phone number is changing
      if (normalizedPhone !== user.phone) {
        if (normalizedPhone) {
          const conflict = await prisma.user.findFirst({
            where: { phone: normalizedPhone, id: { not: userId } },
          });
          if (conflict) {
            throw AppError.conflict("CONFLICT", "This phone number is already associated with another account");
          }
        }
        data.phone = normalizedPhone;
        // Invalidate previous verification whenever the phone number changes!
        data.phoneVerified = false;
      }
    }

    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phoneVerified: true,
        createdAt: true,
      },
    });
  }

  /**
   * Dedicated administrative phone verification endpoint.
   * Enforces trusted administrative API key authorization. Ordinary business roles cannot invoke this.
   */
  static async adminVerifyUserPhone(adminApiKey: string, targetUserId: string) {
    if (!adminApiKey || adminApiKey !== env.ADMIN_API_KEY) {
      throw AppError.forbidden("Administrative authorization required");
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      throw AppError.notFound("Target user not found");
    }

    if (!user.phone) {
      throw AppError.validation("Target user does not have a phone number to verify");
    }

    return prisma.user.update({
      where: { id: targetUserId },
      data: { phoneVerified: true },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phoneVerified: true,
        createdAt: true,
      },
    });
  }
}
