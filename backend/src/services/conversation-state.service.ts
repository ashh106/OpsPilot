import { ConversationWorkflowState, InventoryChangeType, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { AvailabilityService } from "./availability.service.js";
import { AppointmentService } from "./appointment.service.js";
import { ProductService } from "./product.service.js";
import { SellerAuthService } from "./seller-auth.service.js";
import { formatZonedTime, getZonedParts } from "../utils/timezone.js";
import { isAffirmativeInput, isRejectionInput, t } from "../i18n/index.js";

export interface PendingProposal {
  action: "BOOK" | "RESCHEDULE" | "CANCEL" | "ADJUST_STOCK" | "UPDATE_PRICE" | "CREATE_PRODUCT";
  serviceId?: string;
  serviceName?: string;
  startTime?: string; // ISO 8601 UTC
  endTime?: string;
  appointmentId?: string;
  customerName?: string;
  customerPhone?: string;
  expiresAt: string; // ISO 8601 UTC
  slotLabel?: string; // e.g. "Monday, Nov 2 at 10:00 AM"

  // Inventory-specific proposal fields
  productId?: string;
  productName?: string;
  quantityDelta?: number;
  newStock?: number;
  unit?: string;
  oldPrice?: number;
  newPrice?: number;
  initialStock?: number;
  sku?: string;
  performedBy?: string;
  changeType?: InventoryChangeType;
}

export interface ConfirmationOutcome {
  handled: boolean;
  reply: string;
  actionTaken?:
    | "BOOKED"
    | "RESCHEDULED"
    | "CANCELLED"
    | "ADJUSTED_STOCK"
    | "UPDATED_PRICE"
    | "CREATED_PRODUCT"
    | "ABORTED"
    | "EXPIRED"
    | "SLOT_TAKEN"
    | "ERROR";
  appointmentId?: string;
  productId?: string;
}

export class ConversationStateService {
  /**
   * Retrieves the current workflow state, pending proposal, and version for a conversation.
   */
  static async getConversationState(conversationId: string) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        businessId: true,
        customerId: true,
        language: true,
        workflowState: true,
        pendingProposal: true,
        stateVersion: true,
      },
    });

    if (!conv) return null;

    let proposal: PendingProposal | null = null;
    if (conv.pendingProposal && typeof conv.pendingProposal === "object") {
      proposal = conv.pendingProposal as unknown as PendingProposal;
    }

    return {
      state: conv.workflowState,
      proposal,
      version: conv.stateVersion,
      businessId: conv.businessId,
      customerId: conv.customerId,
      language: conv.language || "en",
    };
  }

  /**
   * Atomically transitions the conversation workflow state using optimistic concurrency control.
   */
  static async transitionState(
    conversationId: string,
    expectedVersion: number,
    newState: ConversationWorkflowState,
    proposal: PendingProposal | null = null,
  ): Promise<boolean> {
    const updateResult = await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        stateVersion: expectedVersion,
      },
      data: {
        workflowState: newState,
        pendingProposal: proposal ? (proposal as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        stateVersion: { increment: 1 },
      },
    });

    return updateResult.count > 0;
  }

  /**
   * Proposes an appointment booking and places the conversation in AWAITING_CONFIRMATION with a TTL.
   */
  static async proposeBooking(
    conversationId: string,
    proposalData: Omit<PendingProposal, "action" | "expiresAt">,
    ttlMinutes: number = 15,
  ): Promise<boolean> {
    const state = await this.getConversationState(conversationId);
    if (!state) return false;

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    const proposal: PendingProposal = {
      action: "BOOK",
      ...proposalData,
      expiresAt,
    };

    return this.transitionState(
      conversationId,
      state.version,
      ConversationWorkflowState.AWAITING_CONFIRMATION,
      proposal,
    );
  }

  /**
   * Proposes a stock adjustment and places conversation in AWAITING_CONFIRMATION with a TTL.
   */
  static async proposeStockAdjustment(
    conversationId: string,
    proposalData: Omit<PendingProposal, "action" | "expiresAt">,
    ttlMinutes: number = 15,
  ): Promise<boolean> {
    const state = await this.getConversationState(conversationId);
    if (!state) return false;

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    const proposal: PendingProposal = {
      action: "ADJUST_STOCK",
      ...proposalData,
      expiresAt,
    };

    return this.transitionState(
      conversationId,
      state.version,
      ConversationWorkflowState.AWAITING_CONFIRMATION,
      proposal,
    );
  }

  /**
   * Proposes a product price update and places conversation in AWAITING_CONFIRMATION with a TTL.
   */
  static async proposePriceUpdate(
    conversationId: string,
    proposalData: Omit<PendingProposal, "action" | "expiresAt">,
    ttlMinutes: number = 15,
  ): Promise<boolean> {
    const state = await this.getConversationState(conversationId);
    if (!state) return false;

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    const proposal: PendingProposal = {
      action: "UPDATE_PRICE",
      ...proposalData,
      expiresAt,
    };

    return this.transitionState(
      conversationId,
      state.version,
      ConversationWorkflowState.AWAITING_CONFIRMATION,
      proposal,
    );
  }

  /**
   * Evaluates if a customer or seller message is confirming or rejecting a pending proposal.
   */
  static async handleConfirmation(params: {
    conversationId: string;
    customerMessage: string;
    businessId: string;
    customerId?: string;
    senderPhone?: string;
    idempotencyKey?: string;
  }): Promise<ConfirmationOutcome | null> {
    const { conversationId, customerMessage, businessId, customerId, senderPhone, idempotencyKey } = params;

    const convState = await this.getConversationState(conversationId);
    if (!convState) return null;

    const { state, proposal, version, language } = convState;

    // Only process if there is an active proposal in a confirmation-awaiting state
    const awaitingStates: ConversationWorkflowState[] = [
      ConversationWorkflowState.AWAITING_CONFIRMATION,
      ConversationWorkflowState.RESCHEDULING,
      ConversationWorkflowState.CANCELLING,
    ];

    if (!awaitingStates.includes(state) || !proposal) {
      return null;
    }

    const isAffirmative = isAffirmativeInput(customerMessage);
    const isNegative = !isAffirmative && isRejectionInput(customerMessage);

    // If neither affirmative nor negative, do not assume confirmation; pass through to agent
    if (!isAffirmative && !isNegative) {
      return null;
    }

    // 1. Rejection / Abort flow
    if (isNegative) {
      await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
      return {
        handled: true,
        actionTaken: "ABORTED",
        reply: t(language, "proposal_cancelled"),
      };
    }

    // 2. Affirmative flow: Check TTL Expiration
    const expiresTimestamp = new Date(proposal.expiresAt).getTime();
    if (Date.now() > expiresTimestamp) {
      await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
      return {
        handled: true,
        actionTaken: "EXPIRED",
        reply: t(language, "proposal_expired"),
      };
    }

    // Fetch business
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, timezone: true, defaultLanguage: true },
    });
    if (!business) return null;

    // 3. Re-verify seller authorization for inventory actions before execution
    const isInventoryAction = ["ADJUST_STOCK", "UPDATE_PRICE", "CREATE_PRODUCT"].includes(proposal.action);
    if (isInventoryAction) {
      const auth = await SellerAuthService.verifySeller(businessId, senderPhone || "");
      if (!auth.authorized) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return {
          handled: true,
          actionTaken: "ERROR",
          reply: t(language, "unauthorized_seller", { businessName: business.name }),
        };
      }

      // Ensure that only the phone number that initiated the proposal (or a verified variant) can confirm it
      if (proposal.performedBy && senderPhone) {
        const propVariants = SellerAuthService.getPhoneVariants(proposal.performedBy);
        const senderVariants = SellerAuthService.getPhoneVariants(senderPhone);
        const matchesProposer = propVariants.some((v) => senderVariants.includes(v));
        if (!matchesProposer) {
          await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
          return {
            handled: true,
            actionTaken: "ERROR",
            reply: "Only the authorized user who initiated this inventory request can confirm it.",
          };
        }
      }
    }

    // 4. Execute Based on Action Type

    // --- Action: ADJUST_STOCK ---
    if (proposal.action === "ADJUST_STOCK") {
      if (!proposal.productId || proposal.quantityDelta === undefined) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return null;
      }

      try {
        const result = await ProductService.adjustStock({
          businessId,
          productId: proposal.productId,
          quantityDelta: proposal.quantityDelta,
          performedBy: proposal.performedBy || senderPhone || "whatsapp-seller",
          changeType: proposal.changeType || InventoryChangeType.MANUAL_TEXT,
          reason: `Confirmed via WhatsApp (${customerMessage})`,
          idempotencyKey: idempotencyKey ? `stock_${idempotencyKey}` : undefined,
        });

        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);

        const deltaFormatted =
          result.audit.quantityDelta > 0 ? `+${result.audit.quantityDelta}` : String(result.audit.quantityDelta);

        return {
          handled: true,
          actionTaken: "ADJUSTED_STOCK",
          productId: result.product.id,
          reply: t(language, "stock_updated", {
            name: result.product.name,
            newStock: result.product.stockQuantity,
            unit: result.product.unit,
            delta: deltaFormatted,
          }),
        };
      } catch (err: unknown) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return {
          handled: true,
          actionTaken: "ERROR",
          reply: err instanceof Error ? err.message : t(language, "generic_error"),
        };
      }
    }

    // --- Action: UPDATE_PRICE ---
    if (proposal.action === "UPDATE_PRICE") {
      if (!proposal.productId || proposal.newPrice === undefined) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return null;
      }

      try {
        const result = await ProductService.updatePrice({
          businessId,
          productId: proposal.productId,
          newPrice: proposal.newPrice,
          performedBy: proposal.performedBy || senderPhone || "whatsapp-seller",
          changeType: proposal.changeType || InventoryChangeType.MANUAL_TEXT,
          reason: `Confirmed via WhatsApp (${customerMessage})`,
          idempotencyKey: idempotencyKey ? `price_${idempotencyKey}` : undefined,
        });

        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);

        return {
          handled: true,
          actionTaken: "UPDATED_PRICE",
          productId: result.product.id,
          reply: t(language, "price_updated", {
            name: result.product.name,
            newPrice: Number(result.product.price),
          }),
        };
      } catch (err: unknown) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return {
          handled: true,
          actionTaken: "ERROR",
          reply: err instanceof Error ? err.message : t(language, "generic_error"),
        };
      }
    }

    // --- Action: BOOK ---
    if (proposal.action === "BOOK") {
      if (!proposal.serviceId || !proposal.startTime) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return null;
      }

      // Revalidate slot availability before executing booking
      const startUtc = new Date(proposal.startTime);
      const parts = getZonedParts(startUtc, business.timezone);
      const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

      const availResult = await AvailabilityService.calculateAvailability({
        businessId,
        serviceId: proposal.serviceId,
        date: dateStr,
      });

      const slotStillAvailable = availResult.slots.some(
        (s) => new Date(s.startTime).getTime() === startUtc.getTime(),
      );

      if (!slotStillAvailable) {
        await this.transitionState(
          conversationId,
          version,
          ConversationWorkflowState.OFFERING_SLOTS,
          null,
        );
        return {
          handled: true,
          actionTaken: "SLOT_TAKEN",
          reply:
            "I apologize, but that exact slot was just reserved by another client. Would you like me to find alternative slots for you?",
        };
      }

      try {
        let finalCustId = customerId;
        if (!finalCustId) {
          const cust = await prisma.customer.create({
            data: {
              businessId,
              name: proposal.customerName || "WhatsApp Client",
              phone: proposal.customerPhone || "unknown",
            },
          });
          finalCustId = cust.id;
        }

        const appt = await AppointmentService.createAppointment({
          businessId,
          customerId: finalCustId,
          serviceId: proposal.serviceId,
          startTime: proposal.startTime,
          idempotencyKey,
        });

        await this.transitionState(
          conversationId,
          version,
          ConversationWorkflowState.BOOKED,
          null,
        );

        const localTimeStr = formatZonedTime(appt.startTime, business.timezone);
        return {
          handled: true,
          actionTaken: "BOOKED",
          appointmentId: appt.id,
          reply: `Great! Your appointment for ${appt.service.name} is confirmed for ${localTimeStr} (Reference: ${appt.id}). See you then!`,
        };
      } catch (err: unknown) {
        return {
          handled: true,
          actionTaken: "ERROR",
          reply: err instanceof Error ? err.message : "Failed to complete appointment booking.",
        };
      }
    }

    // --- Action: RESCHEDULE ---
    if (proposal.action === "RESCHEDULE") {
      if (!proposal.appointmentId || !proposal.startTime) return null;

      const existingAppt = await prisma.appointment.findFirst({
        where: { id: proposal.appointmentId, businessId },
      });

      if (!existingAppt || (customerId && existingAppt.customerId !== customerId)) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return {
          handled: true,
          reply: "You do not have permission to reschedule this appointment.",
        };
      }

      const updated = await AppointmentService.rescheduleAppointment({
        businessId,
        appointmentId: proposal.appointmentId,
        newStartTime: proposal.startTime,
      });

      await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
      const localTimeStr = formatZonedTime(updated.startTime, business.timezone);
      return {
        handled: true,
        actionTaken: "RESCHEDULED",
        appointmentId: updated.id,
        reply: `Your appointment has been successfully rescheduled to ${localTimeStr}.`,
      };
    }

    // --- Action: CANCEL ---
    if (proposal.action === "CANCEL") {
      if (!proposal.appointmentId) return null;

      const existingAppt = await prisma.appointment.findFirst({
        where: { id: proposal.appointmentId, businessId },
      });

      if (!existingAppt || (customerId && existingAppt.customerId !== customerId)) {
        await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);
        return {
          handled: true,
          reply: "You do not have permission to cancel this appointment.",
        };
      }

      await AppointmentService.cancelAppointment(businessId, proposal.appointmentId);
      await this.transitionState(conversationId, version, ConversationWorkflowState.IDLE, null);

      return {
        handled: true,
        actionTaken: "CANCELLED",
        appointmentId: proposal.appointmentId,
        reply: "Your appointment has been successfully cancelled and your time slot has been released.",
      };
    }

    return null;
  }
}
