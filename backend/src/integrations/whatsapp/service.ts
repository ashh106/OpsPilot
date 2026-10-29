import { InboxStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { AgentOrchestrator } from "../../agents/orchestrator.js";
import { AiProvider } from "../../agents/provider.js";
import { getAiProvider } from "../../agents/factory.js";
import { defaultWhatsAppClient, WhatsAppClient } from "./client.js";
import {
  WhatsAppInboundMessage,
  WhatsAppStatusEvent,
  WhatsAppWebhookPayload,
} from "./types.js";
import { ConversationStateService } from "../../services/conversation-state.service.js";
import { ProductService } from "../../services/product.service.js";
import { SellerAuthService } from "../../services/seller-auth.service.js";
import {
  resolveLanguage,
  renderSellerMenu,
  t,
  SupportedLanguage,
} from "../../i18n/index.js";
import {
  AudioTranscriptionProvider,
  getTranscriptionProvider,
  MAX_AUDIO_SIZE_BYTES,
  SUPPORTED_AUDIO_MIMES,
} from "../voice/index.js";

export interface WebhookProcessResult {
  processedMessages: number;
  queuedMessages: number;
  duplicatesIgnored: number;
  statusesUpdated: number;
  errors: string[];
}

export class WhatsAppService {
  constructor(
    private readonly client: WhatsAppClient = defaultWhatsAppClient,
    private readonly aiProvider: AiProvider = getAiProvider(),
    private readonly asyncQueue: boolean = false,
    private readonly transcriptionProvider: AudioTranscriptionProvider = getTranscriptionProvider(),
  ) {}

  /**
   * Resolves the internal business UUID associated with the destination WhatsApp phone number.
   */
  async resolveBusiness(destinationPhoneNumberId: string): Promise<string> {
    if (env.WHATSAPP_BUSINESS_ID) {
      const biz = await prisma.business.findUnique({
        where: { id: env.WHATSAPP_BUSINESS_ID },
        select: { id: true },
      });
      if (biz) return biz.id;
    }

    if (
      env.WHATSAPP_PHONE_NUMBER_ID &&
      destinationPhoneNumberId === env.WHATSAPP_PHONE_NUMBER_ID
    ) {
      const primary = await prisma.business.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (primary) return primary.id;
    }

    const fallback = await prisma.business.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!fallback) {
      throw AppError.notFound(
        `No configured business found for WhatsApp destination phone number ID: ${destinationPhoneNumberId}`,
      );
    }

    return fallback.id;
  }

  /**
   * Primary entry point for processing verified incoming WhatsApp webhooks.
   */
  async handleWebhookPayload(payload: WhatsAppWebhookPayload): Promise<WebhookProcessResult> {
    const result: WebhookProcessResult = {
      processedMessages: 0,
      queuedMessages: 0,
      duplicatesIgnored: 0,
      statusesUpdated: 0,
      errors: [],
    };

    if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
      return result;
    }

    for (const entry of payload.entry) {
      if (!Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        if (change.field !== "messages") continue;
        const val = change.value;
        if (!val || val.messaging_product !== "whatsapp") continue;

        const phoneNumberId = val.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        let businessId: string;
        try {
          businessId = await this.resolveBusiness(phoneNumberId);
        } catch (err: unknown) {
          result.errors.push(err instanceof Error ? err.message : "Failed to resolve business");
          continue;
        }

        // 1. Process Inbound Messages
        if (Array.isArray(val.messages)) {
          for (const msg of val.messages) {
            const customerName = val.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name || "Customer";

            // Ingest to WebhookInbox first
            try {
              await prisma.webhookInbox.create({
                data: {
                  provider: "whatsapp",
                  providerMessageId: msg.id,
                  eventType: "message",
                  businessId,
                  payload: { ...msg, customerName } as unknown as Prisma.InputJsonValue,
                  status: InboxStatus.PENDING,
                },
              });
              result.queuedMessages++;
            } catch (err: unknown) {
              if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
                result.duplicatesIgnored++;
                continue;
              }
              result.errors.push(err instanceof Error ? err.message : "Persistence failure");
              continue;
            }

            // If synchronous processing is requested, execute immediately
            if (!this.asyncQueue) {
              const outcome = await this.processInboundMessageDirectly(
                businessId,
                msg,
                customerName,
                msg.id,
              );

              if (outcome.status === "PROCESSED") {
                result.processedMessages++;
                await prisma.webhookInbox.updateMany({
                  where: { providerMessageId: msg.id },
                  data: { status: InboxStatus.PROCESSED, processedAt: new Date() },
                });
              } else if (outcome.status === "FAILED") {
                result.errors.push(outcome.error || "Message execution failed");
                await prisma.webhookInbox.updateMany({
                  where: { providerMessageId: msg.id },
                  data: { status: InboxStatus.FAILED, lastError: outcome.error },
                });
              }
            }
          }
        }

        // 2. Process Delivery Status Updates
        if (Array.isArray(val.statuses)) {
          for (const status of val.statuses) {
            const updated = await this.processStatusEvent(businessId, status);
            if (updated) {
              result.statusesUpdated++;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Executes business logic for an inbound message, integrating ConversationStateService,
   * Multilingual Menus, Seller Authorization, Audio Voice Transcription, and AgentOrchestrator.
   */
  async processInboundMessageDirectly(
    businessId: string,
    msg: WhatsAppInboundMessage,
    customerName: string,
    idempotencyKey?: string,
  ): Promise<{ status: "PROCESSED" | "FAILED"; error?: string }> {
    try {
      // 1. Fetch business metadata
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          category: true,
          defaultLanguage: true,
          supportedLanguages: true,
          timezone: true,
        },
      });

      if (!business) {
        throw AppError.notFound(`Business '${businessId}' not found.`);
      }

      // 2. Resolve or create Customer record within business tenant
      let customer = await prisma.customer.findFirst({
        where: { businessId, phone: msg.from },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            businessId,
            phone: msg.from,
            name: customerName,
          },
        });
      }

      // 3. Resolve or create Conversation
      let conversation = await prisma.conversation.findFirst({
        where: { businessId, customerId: customer.id },
        orderBy: { updatedAt: "desc" },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            businessId,
            customerId: customer.id,
            tokenHash: `whatsapp-${msg.from}`,
            language: business.defaultLanguage || "en",
          },
        });
      }

      let lang: SupportedLanguage = resolveLanguage(
        conversation.language,
        business.defaultLanguage,
        business.supportedLanguages,
      );

      // 4. Extract message content (Text, Interactive Buttons/List, or Audio Voice Notes)
      let rawText = "";

      if (msg.type === "text" && msg.text?.body) {
        rawText = msg.text.body.trim();
      } else if (msg.type === "interactive") {
        rawText =
          msg.interactive?.button_reply?.id ||
          msg.interactive?.list_reply?.id ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          "";
      } else if (msg.type === "audio") {
        if (!msg.audio?.id) {
          await this.client.sendTextMessage(msg.from, t(lang, "transcription_unavailable"));
          return { status: "PROCESSED" };
        }

        try {
          const media = await this.client.fetchMedia(msg.audio.id);

          // Validate MIME and size
          if (media.fileSize && media.fileSize > MAX_AUDIO_SIZE_BYTES) {
            await this.client.sendTextMessage(
              msg.from,
              "Audio message is too large. Please send a shorter voice note under 16MB.",
            );
            return { status: "PROCESSED" };
          }

          if (
            media.mimeType &&
            !SUPPORTED_AUDIO_MIMES.some((m) => media.mimeType.toLowerCase().startsWith(m))
          ) {
            await this.client.sendTextMessage(
              msg.from,
              "Unsupported audio format. Please send a standard WhatsApp voice note.",
            );
            return { status: "PROCESSED" };
          }

          const transcription = await this.transcriptionProvider.transcribe({
            audioBuffer: media.buffer,
            mimeType: media.mimeType,
            languageHint: lang,
          });

          if (!transcription.text?.trim() || (transcription.confidence !== undefined && transcription.confidence < 0.70)) {
            await this.client.sendTextMessage(msg.from, t(lang, "ambiguous_voice_command"));
            return { status: "PROCESSED" };
          }

          rawText = transcription.text.trim();
        } catch {
          await this.client.sendTextMessage(msg.from, t(lang, "transcription_unavailable"));
          return { status: "PROCESSED" };
        }
      } else {
        // Fallback for non-supported message types (stickers, documents)
        const fallbackText =
          business.category === "CLINIC"
            ? `Thank you for contacting ${business.name}. Please send your appointment inquiry by text.`
            : `Welcome to ${business.name}. Please select an option or send your inquiry by text or voice note.`;
        await this.client.sendTextMessage(msg.from, fallbackText);
        return { status: "PROCESSED" };
      }

      if (!rawText) {
        return { status: "PROCESSED" };
      }

      // 5. Check Seller Authorization
      const sellerAuth = await SellerAuthService.verifySeller(businessId, msg.from);
      const isSeller = sellerAuth.authorized;

      // 6. Check Language Selection commands
      const lowerText = rawText.toLowerCase();
      if (
        lowerText === "1" ||
        lowerText === "english" ||
        lowerText === "lang_en" ||
        lowerText === "language_en"
      ) {
        if (lowerText === "english" || lowerText.startsWith("lang_")) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { language: "en" },
          });
          lang = "en";
          const reply = `${t(lang, "language_changed")}\n\n${renderSellerMenu(lang, business.name)}`;
          await this.client.sendTextMessage(msg.from, reply);
          return { status: "PROCESSED" };
        }
      } else if (
        lowerText === "2" ||
        lowerText === "hindi" ||
        lowerText === "हिंदी" ||
        lowerText === "lang_hi" ||
        lowerText === "language_hi"
      ) {
        if (lowerText === "hindi" || lowerText === "हिंदी" || lowerText.startsWith("lang_")) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { language: "hi" },
          });
          lang = "hi";
          const reply = `${t(lang, "language_changed")}\n\n${renderSellerMenu(lang, business.name)}`;
          await this.client.sendTextMessage(msg.from, reply);
          return { status: "PROCESSED" };
        }
      } else if (
        lowerText === "3" ||
        lowerText === "marathi" ||
        lowerText === "मराठी" ||
        lowerText === "lang_mr" ||
        lowerText === "language_mr"
      ) {
        if (lowerText === "marathi" || lowerText === "मराठी" || lowerText.startsWith("lang_")) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { language: "mr" },
          });
          lang = "mr";
          const reply = `${t(lang, "language_changed")}\n\n${renderSellerMenu(lang, business.name)}`;
          await this.client.sendTextMessage(msg.from, reply);
          return { status: "PROCESSED" };
        }
      }

      // 7. Check Menu Navigation for sellers
      if (isSeller) {
        if (lowerText === "menu" || lowerText === "help" || lowerText === "hi" || lowerText === "hello") {
          const menuText = renderSellerMenu(lang, business.name);
          await this.client.sendTextMessage(msg.from, menuText);
          return { status: "PROCESSED" };
        }

        // Option 1: View Products
        if (lowerText === "1" || lowerText === "view products" || lowerText === "menu_1") {
          const products = await ProductService.listProducts(businessId, { activeOnly: true });
          if (products.length === 0) {
            await this.client.sendTextMessage(msg.from, t(lang, "no_products"));
          } else {
            const listItems = products
              .slice(0, 15)
              .map((p) =>
                t(lang, "product_item", {
                  name: p.name,
                  price: Number(p.price),
                  stock: p.stockQuantity,
                  unit: p.unit,
                }),
              )
              .join("\n");
            const responseText = `${t(lang, "product_list_header")}\n\n${listItems}`;
            await this.client.sendTextMessage(msg.from, responseText);
          }
          return { status: "PROCESSED" };
        }

        // Option 5: Inventory Summary
        if (lowerText === "5" || lowerText === "inventory summary" || lowerText === "menu_5") {
          const summary = await ProductService.getInventorySummary(businessId);
          const responseText = `${t(lang, "inventory_summary_header", { businessName: business.name })}\n\n${t(
            lang,
            "inventory_summary_item",
            {
              totalProducts: summary.totalProducts,
              lowStockCount: summary.lowStockProducts,
              totalValue: summary.totalInventoryValue,
            },
          )}`;
          await this.client.sendTextMessage(msg.from, responseText);
          return { status: "PROCESSED" };
        }

        // Option 6: Help & Audio Instructions
        if (lowerText === "6" || lowerText === "instructions" || lowerText === "menu_6") {
          await this.client.sendTextMessage(msg.from, t(lang, "audio_tutorial_prompt"));
          return { status: "PROCESSED" };
        }

        // Option 7: Change Language
        if (lowerText === "7" || lowerText === "change language" || lowerText === "menu_7") {
          await this.client.sendTextMessage(msg.from, t(lang, "language_picker_title"));
          return { status: "PROCESSED" };
        }

        // Option 8: Support
        if (lowerText === "8" || lowerText === "support" || lowerText === "menu_8") {
          await this.client.sendTextMessage(msg.from, t(lang, "human_handoff"));
          return { status: "PROCESSED" };
        }
      }

      // 8. Server-Managed Conversation State Machine Confirmation Check:
      // Evaluates whether the user is affirming or rejecting an active proposal
      const confirmation = await ConversationStateService.handleConfirmation({
        conversationId: conversation.id,
        customerMessage: rawText,
        businessId,
        customerId: customer.id,
        senderPhone: msg.from,
        idempotencyKey,
      });

      let finalReply = "";

      if (confirmation && confirmation.handled) {
        finalReply = confirmation.reply;

        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "USER",
            content: rawText,
          },
        });

        const assistantMsg = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "ASSISTANT",
            content: finalReply,
          },
        });

        const sendResult = await this.client.sendTextMessage(msg.from, finalReply);

        await prisma.message.update({
          where: { id: assistantMsg.id },
          data: {
            providerMessageId: sendResult.messageId,
            status: "sent",
          },
        });

        return { status: "PROCESSED" };
      }

      // 9. Natural Language Inventory Mutation Interpreter for Authorized Sellers
      // Matches stock updates like "Add 10 kg potatoes" or "10 किलो आलू जोड़ो"
      if (isSeller) {
        const stockMatch =
          rawText.match(/(?:add|जोड़ो|जोडा|बढ़ाओ)\s+(\d+)\s*(?:kg|kilo|किलो|pcs)?\s+(.+)/i) ||
          rawText.match(/(\d+)\s*(?:kg|kilo|किलो|pcs)?\s+(.+)\s+(?:add|जोड़ो|जोडा)/i);

        if (stockMatch && stockMatch[1] && stockMatch[2]) {
          const delta = parseInt(stockMatch[1], 10);
          const productQuery = stockMatch[2].trim();

          try {
            const product = await ProductService.findProductByNameOrQuery(businessId, productQuery);
            const newStock = product.stockQuantity + delta;

            await ConversationStateService.proposeStockAdjustment(conversation.id, {
              productId: product.id,
              productName: product.name,
              quantityDelta: delta,
              newStock,
              unit: product.unit,
              performedBy: msg.from,
            });

            const promptText = t(lang, "confirm_stock_adjustment", {
              name: product.name,
              delta: `+${delta}`,
              newStock,
              unit: product.unit,
            });

            await this.client.sendTextMessage(msg.from, promptText);
            return { status: "PROCESSED" };
          } catch {
            // Product not found or ambiguous, fall through to agent
          }
        }
      }

      // 10. Natural Language Agent Loop via AgentOrchestrator
      const agentResult = await AgentOrchestrator.processMessage({
        businessId,
        conversationId: conversation.id,
        customerMessage: rawText,
        customerId: customer.id,
        customerPhone: msg.from,
        customerName: customer.name,
        idempotencyKey,
        isSellerAuthorized: isSeller,
        provider: this.aiProvider,
        persist: true,
      });

      finalReply = agentResult.reply;

      // 11. Send Outbound WhatsApp reply
      const sendResult = await this.client.sendTextMessage(msg.from, finalReply);

      // 12. Correlate Assistant message with provider wamid
      if (agentResult.assistantMessageId) {
        await prisma.message.update({
          where: { id: agentResult.assistantMessageId },
          data: {
            providerMessageId: sendResult.messageId,
            status: "sent",
          },
        });
      }

      return { status: "PROCESSED" };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Error processing inbound message";
      return { status: "FAILED", error: errorMsg };
    }
  }

  /**
   * Ingests delivery-status receipts (sent, delivered, read, failed).
   */
  private async processStatusEvent(
    businessId: string,
    status: WhatsAppStatusEvent,
  ): Promise<boolean> {
    const statusDedupeKey = `status_${status.id}_${status.status}`;

    try {
      await prisma.webhookInbox.create({
        data: {
          provider: "whatsapp",
          providerMessageId: statusDedupeKey,
          eventType: "status",
          businessId,
          payload: status as unknown as Prisma.InputJsonValue,
          status: InboxStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return false;
      }
    }

    await prisma.message.updateMany({
      where: { providerMessageId: status.id },
      data: { status: status.status },
    });

    return true;
  }
}
