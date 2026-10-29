import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { verifyToken, type TokenPayload } from "../utils/auth.js";
import { prisma } from "../db/client.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw AppError.unauthorized("Authentication required: Bearer token missing");
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw AppError.unauthorized("Authentication required: Token is empty");
  }

  const payload = verifyToken(token);
  req.user = payload;
  next();
}

/**
 * Ensures the authenticated user is an active member with the required role for the given business.
 */
export async function assertBusinessMembership(
  userId: string,
  businessId: string,
  requiredRole: "OWNER" = "OWNER",
) {
  const membership = await prisma.businessMember.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId,
      },
    },
    include: {
      business: true,
    },
  });

  if (!membership) {
    throw AppError.forbidden("You do not have access to this business");
  }

  if (requiredRole && membership.role !== requiredRole) {
    throw AppError.forbidden(`Requires ${requiredRole} role`);
  }

  return membership;
}
