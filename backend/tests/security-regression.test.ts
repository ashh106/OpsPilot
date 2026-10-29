import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { ProductService } from "../src/services/product.service.js";
import { SellerAuthService } from "../src/services/seller-auth.service.js";
import { ConversationStateService } from "../src/services/conversation-state.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { assertBusinessMembership } from "../src/middleware/auth.js";
import { adjustInventoryTool } from "../src/tools/inventory.tools.js";
import { InventoryChangeType } from "@prisma/client";
import { WhatsAppService } from "../src/integrations/whatsapp/service.js";
import { WhatsAppClient, WhatsAppSendResult } from "../src/integrations/whatsapp/client.js";
import { MockAiProvider } from "../src/agents/mock-provider.js";
import { MockTranscriptionProvider } from "../src/integrations/voice/mock-transcription-provider.js";
import { WhatsAppInboundMessage } from "../src/integrations/whatsapp/types.js";
import { DisabledTranscriptionProvider } from "../src/integrations/voice/index.js";
import { AppError } from "../src/utils/errors.js";
import { env } from "../src/config/env.js";

class MockWhatsAppClient extends WhatsAppClient {
  public sentMessages: Array<{ to: string; text: string }> = [];

  constructor() {
    super({
      accessToken: "test_token",
      phoneNumberId: "test_phone_id",
    });
  }

  override async sendTextMessage(to: string, text: string): Promise<WhatsAppSendResult> {
    this.sentMessages.push({ to, text });
    return {
      messagingProduct: "whatsapp",
      contactWaId: to,
      messageId: `wamid.test_${Date.now()}_${Math.random()}`,
    };
  }

  override async fetchMedia(_mediaId: string): Promise<{ buffer: Buffer; mimeType: string; fileSize?: number }> {
    return {
      buffer: Buffer.from("audio_bytes"),
      mimeType: "audio/ogg; codecs=opus",
      fileSize: 1024,
    };
  }
}

describe("Milestone D.1 Security, Idempotency & Safety Regressions", () => {
  let businessId: string;
  let ownerUserId: string;
  let testProduct: { id: string; name: string };
  const ownerPhone = "919876543210";
  const imposterPhone = "919222222222";

  beforeEach(async () => {
    // Reset test database
    await prisma.inventoryAudit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.businessMember.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();

    // Create verified owner
    const owner = await prisma.user.create({
      data: {
        email: "owner@kirana.test",
        passwordHash: "hash_pw",
        name: "Suresh Owner",
        phone: ownerPhone,
        phoneVerified: true,
      },
    });
    ownerUserId = owner.id;

    // Create Business
    const biz = await prisma.business.create({
      data: {
        name: "Suresh Kirana",
        slug: "suresh-kirana",
        category: "GROCERY",
        defaultLanguage: "hi",
        supportedLanguages: ["hi", "en", "mr"],
      },
    });
    businessId = biz.id;

    // Link membership
    await prisma.businessMember.create({
      data: {
        userId: owner.id,
        businessId,
        role: "OWNER",
      },
    });

    // Seed product
    const prod = await ProductService.createProduct({
      businessId,
      name: "Sugar 1kg",
      price: 45,
      initialStock: 50,
      unit: "kg",
      performedBy: ownerUserId,
    });
    testProduct = { id: prod.id, name: prod.name };
  });

  afterAll(async () => {
    await prisma.inventoryAudit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.businessMember.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();
  });

  // ==========================================
  // TASK 1: PHONE VERIFICATION & AUTHORIZATION
  // ==========================================

  it("1.1 new users are unverified by default (phoneVerified === false)", async () => {
    const { user } = await AuthService.register({
      email: "newuser@kirana.test",
      password: "Password123!",
      name: "New Unverified User",
    });

    expect(user.phoneVerified).toBe(false);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.phoneVerified).toBe(false);
  });

  it("1.2 unverified users are rejected by SellerAuthService and seller tools", async () => {
    const unverifiedPhone = "919999988888";
    const user = await prisma.user.create({
      data: {
        email: "unverified@kirana.test",
        passwordHash: "hash_pw",
        name: "Unverified Seller",
        phone: unverifiedPhone,
        phoneVerified: false,
      },
    });

    await prisma.businessMember.create({
      data: {
        userId: user.id,
        businessId,
        role: "OWNER",
      },
    });

    const auth = await SellerAuthService.verifySeller(businessId, unverifiedPhone);
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toBe("PHONE_NOT_VERIFIED");

    // Tool execution must be forbidden
    const toolResult = await adjustInventoryTool.execute(
      { query: testProduct.name, quantityDelta: 10 },
      {
        businessId,
        conversationId: "conv_test_unverified",
        isSellerAuthorized: false,
        customerPhone: unverifiedPhone,
      },
    );
    expect(toolResult.success).toBe(false);
    expect(toolResult.error?.code).toBe("FORBIDDEN");
  });

  it("1.3 prevents imposter phone from confirming another seller's pending proposal", async () => {
    const owner2 = await prisma.user.create({
      data: {
        email: "owner2@kirana.test",
        passwordHash: "hash_pw",
        name: "Owner Two",
        phone: imposterPhone,
        phoneVerified: true,
      },
    });

    await prisma.businessMember.create({
      data: {
        userId: owner2.id,
        businessId,
        role: "OWNER",
      },
    });

    const conv = await prisma.conversation.create({
      data: {
        businessId,
        tokenHash: "token_hash_002",
        language: "hi",
      },
    });

    await ConversationStateService.proposeStockAdjustment(conv.id, {
      productId: testProduct.id,
      productName: testProduct.name,
      quantityDelta: 20,
      newStock: 70,
      unit: "kg",
      performedBy: ownerPhone,
    });

    const outcome = await ConversationStateService.handleConfirmation({
      conversationId: conv.id,
      customerMessage: "हाँ",
      businessId,
      senderPhone: imposterPhone,
    });

    expect(outcome).not.toBeNull();
    expect(outcome?.actionTaken).toBe("ERROR");
    expect(outcome?.reply).toContain("Only the authorized user who initiated this inventory request can confirm it");

    const prod = await ProductService.getProduct(businessId, testProduct.id);
    expect(prod.stockQuantity).toBe(50);
  });

  it("1.4 revoked or deactivated seller memberships are rejected at confirmation", async () => {
    const conv = await prisma.conversation.create({
      data: {
        businessId,
        tokenHash: "token_revocation_test",
        language: "hi",
      },
    });

    await ConversationStateService.proposeStockAdjustment(conv.id, {
      productId: testProduct.id,
      productName: testProduct.name,
      quantityDelta: 20,
      newStock: 70,
      unit: "kg",
      performedBy: ownerPhone,
    });

    // Revoke owner membership before confirmation
    await prisma.businessMember.deleteMany({
      where: { userId: ownerUserId, businessId },
    });

    const outcome = await ConversationStateService.handleConfirmation({
      conversationId: conv.id,
      customerMessage: "हाँ",
      businessId,
      senderPhone: ownerPhone,
    });

    expect(outcome).not.toBeNull();
    expect(outcome?.actionTaken).toBe("ERROR");
    expect(outcome?.reply).toContain("के इन्वेंटरी प्रबंधन के लिए अधिकृत नहीं है");

    const prod = await ProductService.getProduct(businessId, testProduct.id);
    expect(prod.stockQuantity).toBe(50);
  });

  it("1.5 existing user records created without phoneVerified retain safe unverified status", async () => {
    const rawUser = await prisma.user.create({
      data: {
        email: "legacy@kirana.test",
        passwordHash: "hash_pw",
        name: "Legacy User",
        phone: "919333333333",
      },
    });

    expect(rawUser.phoneVerified).toBe(false);
  });

  it("1.6 updating phone number invalidates verification (sets phoneVerified to false)", async () => {
    const initialUser = await prisma.user.findUnique({ where: { id: ownerUserId } });
    expect(initialUser?.phoneVerified).toBe(true);

    const updated = await AuthService.updateProfile(ownerUserId, {
      phone: "919888877777",
    });

    expect(updated.phoneVerified).toBe(false);

    const dbUser = await prisma.user.findUnique({ where: { id: ownerUserId } });
    expect(dbUser?.phoneVerified).toBe(false);
  });

  it("1.7 rejects administrative verification without trusted admin key", async () => {
    await expect(
      AuthService.adminVerifyUserPhone("invalid_secret_key", ownerUserId),
    ).rejects.toThrow(AppError);

    const verified = await AuthService.adminVerifyUserPhone(env.ADMIN_API_KEY, ownerUserId);
    expect(verified.phoneVerified).toBe(true);
  });

  // ==========================================
  // TASK 2: INVENTORY IDEMPOTENCY & CONCURRENCY
  // ==========================================

  it("2.1 handles 2 simultaneous identical stock adjustments under concurrency without double-mutating", async () => {
    const idempotencyKey = `race_stock_key_${Date.now()}`;

    // Launch 2 simultaneous identical calls with same idempotencyKey
    const [res1, res2] = await Promise.all([
      ProductService.adjustStock({
        businessId,
        productId: testProduct.id,
        quantityDelta: 10,
        performedBy: ownerUserId,
        changeType: InventoryChangeType.RESTOCK,
        idempotencyKey,
      }),
      ProductService.adjustStock({
        businessId,
        productId: testProduct.id,
        quantityDelta: 10,
        performedBy: ownerUserId,
        changeType: InventoryChangeType.RESTOCK,
        idempotencyKey,
      }),
    ]);

    // Both should resolve to the same resulting stock 60 (50 + 10)
    expect(res1.product.stockQuantity).toBe(60);
    expect(res2.product.stockQuantity).toBe(60);
    expect(res1.audit.id).toBe(res2.audit.id);

    // Verify DB state
    const prodInDb = await prisma.product.findUnique({ where: { id: testProduct.id } });
    expect(prodInDb?.stockQuantity).toBe(60);

    const auditCount = await prisma.inventoryAudit.count({ where: { idempotencyKey } });
    expect(auditCount).toBe(1);
  });

  it("2.2 handles several concurrent retries (5 parallel requests) with same key and returns original result", async () => {
    const idempotencyKey = `retry_key_parallel_${Date.now()}`;

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        ProductService.adjustStock({
          businessId,
          productId: testProduct.id,
          quantityDelta: 10,
          performedBy: ownerUserId,
          changeType: InventoryChangeType.RESTOCK,
          idempotencyKey,
        }),
      ),
    );

    for (const res of results) {
      expect(res.product.stockQuantity).toBe(60);
      expect(res.audit.id).toBe(results[0]?.audit.id);
    }

    const prodInDb = await prisma.product.findUnique({ where: { id: testProduct.id } });
    expect(prodInDb?.stockQuantity).toBe(60);

    const auditCount = await prisma.inventoryAudit.count({ where: { idempotencyKey } });
    expect(auditCount).toBe(1);
  });

  it("2.3 rejects reusing an idempotency key with a different quantity payload", async () => {
    const idempotencyKey = `mismatch_qty_key_${Date.now()}`;

    // First call: +10
    const first = await ProductService.adjustStock({
      businessId,
      productId: testProduct.id,
      quantityDelta: 10,
      performedBy: ownerUserId,
      idempotencyKey,
    });
    expect(first.product.stockQuantity).toBe(60);

    // Reusing key with different delta (+20)
    await expect(
      ProductService.adjustStock({
        businessId,
        productId: testProduct.id,
        quantityDelta: 20,
        performedBy: ownerUserId,
        idempotencyKey,
      }),
    ).rejects.toThrow(/Idempotency key has already been used with quantityDelta 10/);

    const prodInDb = await prisma.product.findUnique({ where: { id: testProduct.id } });
    expect(prodInDb?.stockQuantity).toBe(60);

    const auditCount = await prisma.inventoryAudit.count({ where: { idempotencyKey } });
    expect(auditCount).toBe(1);
  });

  it("2.4 rejects reusing an idempotency key for a different product", async () => {
    const idempotencyKey = `diff_prod_key_${Date.now()}`;

    const secondProduct = await ProductService.createProduct({
      businessId,
      name: "Wheat Flour 5kg",
      price: 210,
      initialStock: 30,
      performedBy: ownerUserId,
    });

    // Use key for product 1
    await ProductService.adjustStock({
      businessId,
      productId: testProduct.id,
      quantityDelta: 10,
      performedBy: ownerUserId,
      idempotencyKey,
    });

    // Reusing same key for product 2 must fail
    await expect(
      ProductService.adjustStock({
        businessId,
        productId: secondProduct.id,
        quantityDelta: 10,
        performedBy: ownerUserId,
        idempotencyKey,
      }),
    ).rejects.toThrow(/Idempotency key has already been used for a different product/);

    // Second product stock remains 30 and has no adjustment audit with the reused key
    const prod2InDb = await prisma.product.findUnique({ where: { id: secondProduct.id } });
    expect(prod2InDb?.stockQuantity).toBe(30);

    const auditCount = await prisma.inventoryAudit.count({
      where: { productId: secondProduct.id, idempotencyKey },
    });
    expect(auditCount).toBe(0);
  });

  it("2.5 rolls back atomic stock update if a transaction failure occurs before audit completion", async () => {
    // Attempt transaction where product is updated but audit fails due to invalid constraint or explicit error
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: testProduct.id },
          data: { stockQuantity: 999 },
        });
        throw new Error("Simulated database failure before audit creation");
      }),
    ).rejects.toThrow("Simulated database failure before audit creation");

    // Stock must remain unchanged at 50!
    const prodInDb = await prisma.product.findUnique({ where: { id: testProduct.id } });
    expect(prodInDb?.stockQuantity).toBe(50);
  });

  it("2.6 preserves every valid stock adjustment without lost updates under concurrent requests with different keys", async () => {
    // 2 parallel requests with different keys and deltas (+10 and +15)
    const [resA, resB] = await Promise.all([
      ProductService.adjustStock({
        businessId,
        productId: testProduct.id,
        quantityDelta: 10,
        performedBy: ownerUserId,
        idempotencyKey: `key_a_${Date.now()}`,
      }),
      ProductService.adjustStock({
        businessId,
        productId: testProduct.id,
        quantityDelta: 15,
        performedBy: ownerUserId,
        idempotencyKey: `key_b_${Date.now()}`,
      }),
    ]);

    expect(resA).toBeDefined();
    expect(resB).toBeDefined();

    // Final stock must be exactly 50 + 10 + 15 = 75
    const prodInDb = await prisma.product.findUnique({ where: { id: testProduct.id } });
    expect(prodInDb?.stockQuantity).toBe(75);

    const audits = await prisma.inventoryAudit.findMany({
      where: { productId: testProduct.id, idempotencyKey: { not: null } },
    });
    expect(audits).toHaveLength(2);
  });

  it("2.7 handles concurrent price updates with same key and rejects reusing key with different price", async () => {
    const priceKey = `price_parallel_key_${Date.now()}`;

    const [p1, p2] = await Promise.all([
      ProductService.updatePrice({
        businessId,
        productId: testProduct.id,
        newPrice: 55,
        performedBy: ownerUserId,
        idempotencyKey: priceKey,
      }),
      ProductService.updatePrice({
        businessId,
        productId: testProduct.id,
        newPrice: 55,
        performedBy: ownerUserId,
        idempotencyKey: priceKey,
      }),
    ]);

    expect(Number(p1.product.price)).toBe(55);
    expect(Number(p2.product.price)).toBe(55);
    expect(p1.audit.id).toBe(p2.audit.id);

    const priceAudits = await prisma.inventoryAudit.count({ where: { idempotencyKey: priceKey } });
    expect(priceAudits).toBe(1);

    // Reusing key with different price (60)
    await expect(
      ProductService.updatePrice({
        businessId,
        productId: testProduct.id,
        newPrice: 60,
        performedBy: ownerUserId,
        idempotencyKey: priceKey,
      }),
    ).rejects.toThrow(/Idempotency key has already been used with price 55/);

    const prodInDb = await prisma.product.findUnique({ where: { id: testProduct.id } });
    expect(Number(prodInDb?.price)).toBe(55);
  });

  it("2.8 rejects reusing an idempotency key across different businesses", async () => {
    const crossBizKey = `cross_biz_key_${Date.now()}`;

    // Business A performs stock adjustment with key
    const resA = await ProductService.adjustStock({
      businessId,
      productId: testProduct.id,
      quantityDelta: 10,
      performedBy: ownerUserId,
      idempotencyKey: crossBizKey,
    });
    expect(resA.product.stockQuantity).toBe(60);

    // Create Business B with Product B
    const bizB = await prisma.business.create({
      data: {
        name: "Second Store",
        slug: `second-store-${Date.now()}`,
        category: "RETAIL",
      },
    });

    const prodB = await ProductService.createProduct({
      businessId: bizB.id,
      name: "Second Store Product",
      price: 100,
      initialStock: 25,
      performedBy: "admin",
    });

    // Business B attempts to use the same idempotency key
    await expect(
      ProductService.adjustStock({
        businessId: bizB.id,
        productId: prodB.id,
        quantityDelta: 10,
        performedBy: "admin",
        idempotencyKey: crossBizKey,
      }),
    ).rejects.toThrow(/Idempotency key has already been used for a different business/);

    // Business B's product stock must remain untouched
    const prodBInDb = await prisma.product.findUnique({ where: { id: prodB.id } });
    expect(prodBInDb?.stockQuantity).toBe(25);
  });

  it("2.9 rejects reusing an idempotency key across different operation types (STOCK vs PRICE)", async () => {
    const opKey = `op_switch_key_${Date.now()}`;

    // Perform stock adjustment (+10) with key
    await ProductService.adjustStock({
      businessId,
      productId: testProduct.id,
      quantityDelta: 10,
      performedBy: ownerUserId,
      idempotencyKey: opKey,
    });

    // Attempt to reuse key for price update
    await expect(
      ProductService.updatePrice({
        businessId,
        productId: testProduct.id,
        newPrice: 45,
        performedBy: ownerUserId,
        idempotencyKey: opKey,
      }),
    ).rejects.toThrow(/Idempotency key has already been used for a stock adjustment, cannot reuse for a price update/);

    const priceFirstKey = `price_first_key_${Date.now()}`;

    // Perform price update with new key
    await ProductService.updatePrice({
      businessId,
      productId: testProduct.id,
      newPrice: 75,
      performedBy: ownerUserId,
      idempotencyKey: priceFirstKey,
    });

    // Attempt to reuse price key for stock adjustment
    await expect(
      ProductService.adjustStock({
        businessId,
        productId: testProduct.id,
        quantityDelta: 5,
        performedBy: ownerUserId,
        idempotencyKey: priceFirstKey,
      }),
    ).rejects.toThrow(/Idempotency key has already been used for a price update, cannot reuse for a stock adjustment/);
  });

  // ==========================================
  // TASK 3: VOICE SAFETY & TRUTHFULNESS
  // ==========================================

  it("3.1 rejects low-confidence voice transcription and does not create proposal", async () => {
    const testClient = new MockWhatsAppClient();
    const mockTranscription = new MockTranscriptionProvider();

    // Low confidence response (< 0.70)
    mockTranscription.setResponseForMime("audio/ogg; codecs=opus", {
      text: "something ambiguous",
      confidence: 0.55,
    });

    const service = new WhatsAppService(
      testClient,
      new MockAiProvider(),
      false,
      mockTranscription,
    );

    const voiceMsg: WhatsAppInboundMessage = {
      from: ownerPhone,
      id: "wamid.voice_low_conf",
      timestamp: "1730000099",
      type: "audio",
      audio: {
        id: "media_low_conf",
        mime_type: "audio/ogg; codecs=opus",
      },
    };

    await service.processInboundMessageDirectly(businessId, voiceMsg, "Suresh");

    expect(testClient.sentMessages[0]?.text).toContain("उत्पाद या मात्रा पूरी तरह स्पष्ट नहीं हो सकी");

    const conv = await prisma.conversation.findFirst({ where: { businessId } });
    expect(conv?.workflowState).not.toBe("AWAITING_CONFIRMATION");
  });

  it("3.2 fails safely when transcription provider is disabled without performing fake updates", async () => {
    const disabledProvider = new DisabledTranscriptionProvider();
    await expect(
      disabledProvider.transcribe(),
    ).rejects.toThrow(/Audio transcription service is not configured/);
  });

  // ==========================================
  // TASK 4: TENANT ISOLATION
  // ==========================================

  it("4.1 strictly isolates products and audit records across businesses", async () => {
    // Create Business B with Owner B
    const ownerB = await prisma.user.create({
      data: {
        email: "ownerb@bizb.test",
        passwordHash: "hash_pw",
        name: "Owner B",
        phone: "919444444444",
        phoneVerified: true,
      },
    });

    const bizB = await prisma.business.create({
      data: {
        name: "Business B",
        slug: "business-b",
        category: "RETAIL",
      },
    });

    await prisma.businessMember.create({
      data: {
        userId: ownerB.id,
        businessId: bizB.id,
        role: "OWNER",
      },
    });

    const prodB = await ProductService.createProduct({
      businessId: bizB.id,
      name: "Product B Item",
      price: 150,
      initialStock: 100,
      performedBy: ownerB.id,
    });

    // 1. User A belonging to Business A tries to read Product B under Business A
    await expect(
      ProductService.getProduct(businessId, prodB.id),
    ).rejects.toThrow(/not found for this business/);

    // 2. User A tries to mutate stock of Product B under Business A
    await expect(
      ProductService.adjustStock({
        businessId,
        productId: prodB.id,
        quantityDelta: 10,
        performedBy: ownerUserId,
      }),
    ).rejects.toThrow(/not found for this business/);

    // 3. User A tries to mutate price of Product B under Business A
    await expect(
      ProductService.updatePrice({
        businessId,
        productId: prodB.id,
        newPrice: 200,
        performedBy: ownerUserId,
      }),
    ).rejects.toThrow(/not found for this business/);

    // 4. User A queries audits for Product B under Business A -> returns empty list
    const crossAudits = await ProductService.getInventoryAudits(businessId, prodB.id);
    expect(crossAudits).toEqual([]);

    // 5. User A tries to access Business B directly -> Forbidden
    await expect(
      assertBusinessMembership(ownerUserId, bizB.id),
    ).rejects.toThrow(AppError);

    // 6. Product B state in DB must be completely untouched
    const prodBInDb = await prisma.product.findUnique({ where: { id: prodB.id } });
    expect(prodBInDb?.stockQuantity).toBe(100);
    expect(Number(prodBInDb?.price)).toBe(150);
  });
});
