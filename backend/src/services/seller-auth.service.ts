import { prisma } from "../db/client.js";

export interface SellerAuthResult {
  authorized: boolean;
  userId?: string;
  userName?: string;
  userEmail?: string;
  role?: string;
  reason?: "USER_NOT_FOUND" | "PHONE_NOT_VERIFIED" | "NOT_A_BUSINESS_MEMBER" | "SUCCESS";
}

export class SellerAuthService {
  /**
   * Normalizes incoming WhatsApp phone number variants.
   * WhatsApp webhooks typically deliver numbers without '+', e.g. "919876543210".
   */
  static getPhoneVariants(rawPhone: string): string[] {
    const digitsOnly = rawPhone.replace(/\D/g, "");
    const variants = new Set<string>();

    if (rawPhone.trim()) {
      variants.add(rawPhone.trim());
    }
    if (digitsOnly) {
      variants.add(digitsOnly);
      variants.add(`+${digitsOnly}`);
      // If 12 digits starting with 91 (India country code), also test 10-digit national number
      if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
        variants.add(digitsOnly.substring(2));
      }
      // If 10 digits, also test with 91 and +91
      if (digitsOnly.length === 10) {
        variants.add(`91${digitsOnly}`);
        variants.add(`+91${digitsOnly}`);
      }
    }

    return Array.from(variants);
  }

  /**
   * Verifies if a WhatsApp sender phone number belongs to an authorized business owner/member.
   */
  static async verifySeller(businessId: string, senderPhone: string): Promise<SellerAuthResult> {
    if (!senderPhone || !businessId) {
      return { authorized: false, reason: "USER_NOT_FOUND" };
    }

    const variants = this.getPhoneVariants(senderPhone);

    // 1. Look up User by any phone variant
    const user = await prisma.user.findFirst({
      where: {
        phone: { in: variants },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneVerified: true,
      },
    });

    if (!user) {
      return { authorized: false, reason: "USER_NOT_FOUND" };
    }

    if (user.phoneVerified === false) {
      return { authorized: false, reason: "PHONE_NOT_VERIFIED" };
    }

    // 2. Check BusinessMember relation
    const membership = await prisma.businessMember.findFirst({
      where: {
        businessId,
        userId: user.id,
        role: "OWNER",
      },
      select: {
        role: true,
      },
    });

    if (!membership) {
      return { authorized: false, reason: "NOT_A_BUSINESS_MEMBER" };
    }

    return {
      authorized: true,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: membership.role,
      reason: "SUCCESS",
    };
  }
}
