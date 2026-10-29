import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { WhatsAppClient, WhatsAppSendResult } from "../src/integrations/whatsapp/client.js";
import { WhatsAppService } from "../src/integrations/whatsapp/service.js";
import { MockAiProvider } from "../src/agents/mock-provider.js";
import { MockTranscriptionProvider } from "../src/integrations/voice/mock-transcription-provider.js";
import { WhatsAppInboundMessage } from "../src/integrations/whatsapp/types.js";
import { ProductService } from "../src/services/product.service.js";

class TestWhatsAppClient extends WhatsAppClient {
  public sentMessages: Array<{ to: string; text: string }> = [];
  public mockAudioBuffer = Buffer.from("fake-audio-bytes-opus");
  public mockMimeType = "audio/ogg; codecs=opus";

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

  override async fetchMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string; fileSize?: number }> {
    if (mediaId === "oversized_media") {
      return {
        buffer: Buffer.alloc(17 * 1024 * 1024), // 17 MB
        mimeType: this.mockMimeType,
        fileSize: 17 * 1024 * 1024,
      };
    }
    if (mediaId === "unsupported_mime") {
      return {
        buffer: Buffer.from("bad_media"),
        mimeType: "video/mp4",
        fileSize: 1024,
      };
    }
    return {
      buffer: this.mockAudioBuffer,
      mimeType: this.mockMimeType,
      fileSize: 1024,
    };
  }
}

describe("WhatsApp Multilingual, Voice & Seller Workflows", () => {
  let businessId: string;
  let testClient: TestWhatsAppClient;
  let mockTranscription: MockTranscriptionProvider;
  let service: WhatsAppService;
  const sellerPhone = "919876543210";
  const customerPhone = "919111111111";

  beforeEach(async () => {
    // Reset database
    await prisma.inventoryAudit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.businessMember.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();

    // Create owner User
    const owner = await prisma.user.create({
      data: {
        email: "ramesh@kirana.test",
        passwordHash: "hash_pw",
        name: "Ramesh Kirana",
        phone: sellerPhone,
        phoneVerified: true,
      },
    });

    // Create Grocery business with default Hindi
    const biz = await prisma.business.create({
      data: {
        name: "Sharma Kirana",
        slug: "sharma-kirana",
        category: "GROCERY",
        defaultLanguage: "hi",
        supportedLanguages: ["hi", "en", "mr"],
      },
    });
    businessId = biz.id;

    // Link owner
    await prisma.businessMember.create({
      data: {
        userId: owner.id,
        businessId,
        role: "OWNER",
      },
    });

    // Seed products
    await ProductService.createProduct({
      businessId,
      name: "आलू (Potatoes)",
      price: 30,
      initialStock: 20,
      unit: "kg",
      performedBy: owner.id,
    });

    await ProductService.createProduct({
      businessId,
      name: "प्याज (Onions)",
      price: 40,
      initialStock: 15,
      unit: "kg",
      performedBy: owner.id,
    });

    testClient = new TestWhatsAppClient();
    mockTranscription = new MockTranscriptionProvider();
    service = new WhatsAppService(
      testClient,
      new MockAiProvider(),
      false,
      mockTranscription,
    );
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

  it("sends localized seller menu when authorized seller says 'menu' or 'hi'", async () => {
    const msg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg1",
      timestamp: "1730000000",
      type: "text",
      text: { body: "menu" },
    };

    await service.processInboundMessageDirectly(businessId, msg, "Ramesh");

    expect(testClient.sentMessages).toHaveLength(1);
    const reply = testClient.sentMessages[0]?.text;
    expect(reply).toContain("Sharma Kirana में आपका स्वागत है!");
    expect(reply).toContain("दुकान प्रबंधन मेनू");
    expect(reply).toContain("1. सभी उत्पाद देखें");
    expect(reply).toContain("5. इन्वेंटरी सारांश");
  });

  it("renders localized product list on menu option 1", async () => {
    const msg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_opt1",
      timestamp: "1730000001",
      type: "text",
      text: { body: "1" },
    };

    await service.processInboundMessageDirectly(businessId, msg, "Ramesh");

    expect(testClient.sentMessages).toHaveLength(1);
    const reply = testClient.sentMessages[0]?.text;
    expect(reply).toContain("वर्तमान उत्पाद सूची");
    expect(reply).toContain("आलू (Potatoes)");
    expect(reply).toContain("₹30");
    expect(reply).toContain("20 kg");
  });

  it("renders inventory summary on menu option 5", async () => {
    const msg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_opt5",
      timestamp: "1730000002",
      type: "text",
      text: { body: "5" },
    };

    await service.processInboundMessageDirectly(businessId, msg, "Ramesh");

    expect(testClient.sentMessages).toHaveLength(1);
    const reply = testClient.sentMessages[0]?.text;
    expect(reply).toContain("Sharma Kirana का इन्वेंटरी सारांश");
    expect(reply).toContain("कुल उत्पाद: 2");
    // Valuation: (20 * 30) + (15 * 40) = 600 + 600 = 1200
    expect(reply).toContain("1200");
  });

  it("updates conversation language when seller selects English or Marathi", async () => {
    // 1. Switch to English
    const msgEn: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_lang_en",
      timestamp: "1730000003",
      type: "text",
      text: { body: "english" },
    };
    await service.processInboundMessageDirectly(businessId, msgEn, "Ramesh");

    expect(testClient.sentMessages[0]?.text).toContain("Language updated to English successfully.");

    // 2. Subsequent menu request is in English
    const msgMenuEn: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_menu_en",
      timestamp: "1730000004",
      type: "text",
      text: { body: "menu" },
    };
    await service.processInboundMessageDirectly(businessId, msgMenuEn, "Ramesh");
    expect(testClient.sentMessages[1]?.text).toContain("Welcome to Sharma Kirana!");
    expect(testClient.sentMessages[1]?.text).toContain("Store Management Menu");

    // 3. Switch to Marathi
    const msgMr: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_lang_mr",
      timestamp: "1730000005",
      type: "text",
      text: { body: "मराठी" },
    };
    await service.processInboundMessageDirectly(businessId, msgMr, "Ramesh");
    expect(testClient.sentMessages[2]?.text).toContain("भाषा यशस्वीरित्या मराठीत सेट केली आहे.");
  });

  it("enforces proposal and affirmative confirmation lifecycle for stock adjustments", async () => {
    // 1. Seller says "Add 10 kg आलू"
    const addMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_add1",
      timestamp: "1730000010",
      type: "text",
      text: { body: "Add 10 kg आलू" },
    };
    await service.processInboundMessageDirectly(businessId, addMsg, "Ramesh");

    // Must NOT mutate stock immediately; must propose and ask for confirmation
    const prodBefore = await ProductService.findProductByNameOrQuery(businessId, "आलू");
    expect(prodBefore.stockQuantity).toBe(20);

    const promptReply = testClient.sentMessages[0]?.text;
    expect(promptReply).toContain("कृपया पुष्टि करें");
    expect(promptReply).toContain("+10");
    expect(promptReply).toContain("30 kg");

    // 2. Seller confirms with Hindi "हाँ"
    const confirmMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_confirm",
      timestamp: "1730000011",
      type: "text",
      text: { body: "हाँ" },
    };
    await service.processInboundMessageDirectly(businessId, confirmMsg, "Ramesh");

    // Stock must now be 30!
    const prodAfter = await ProductService.findProductByNameOrQuery(businessId, "आलू");
    expect(prodAfter.stockQuantity).toBe(30);

    const successReply = testClient.sentMessages[1]?.text;
    expect(successReply).toContain("का स्टॉक अब 30 kg कर दिया गया है");

    // 3. Repeated affirmative message does not double-mutate
    const repeatMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_repeat",
      timestamp: "1730000012",
      type: "text",
      text: { body: "हाँ" },
    };
    await service.processInboundMessageDirectly(businessId, repeatMsg, "Ramesh");
    const prodFinal = await ProductService.findProductByNameOrQuery(businessId, "आलू");
    expect(prodFinal.stockQuantity).toBe(30); // Still 30!
  });

  it("cancels pending proposal safely when seller rejects with 'नहीं'", async () => {
    // 1. Seller requests addition
    const addMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_reject1",
      timestamp: "1730000020",
      type: "text",
      text: { body: "Add 5 kg प्याज" },
    };
    await service.processInboundMessageDirectly(businessId, addMsg, "Ramesh");

    // 2. Seller rejects
    const rejectMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.msg_reject2",
      timestamp: "1730000021",
      type: "text",
      text: { body: "नहीं" },
    };
    await service.processInboundMessageDirectly(businessId, rejectMsg, "Ramesh");

    const reply = testClient.sentMessages[1]?.text;
    expect(reply).toContain("कार्रवाई रद्द कर दी गई");

    // Stock remains unchanged at 15
    const prod = await ProductService.findProductByNameOrQuery(businessId, "प्याज");
    expect(prod.stockQuantity).toBe(15);
  });

  it("processes voice note audio messages through transcription into proposal and confirmation", async () => {
    // Mock audio transcription provider to return Hindi voice update
    mockTranscription.setResponseForMime("audio/ogg; codecs=opus", {
      text: "Add 10 kg आलू",
      detectedLanguage: "hi",
      confidence: 0.98,
    });

    const voiceMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.voice_001",
      timestamp: "1730000030",
      type: "audio",
      audio: {
        id: "media_voice_001",
        mime_type: "audio/ogg; codecs=opus",
      },
    };

    await service.processInboundMessageDirectly(businessId, voiceMsg, "Ramesh");

    // Verify it transcribed and generated confirmation prompt
    expect(testClient.sentMessages).toHaveLength(1);
    const reply = testClient.sentMessages[0]?.text;
    expect(reply).toContain("कृपया पुष्टि करें");
    expect(reply).toContain("आलू");

    // Seller confirms with English "yes"
    const confirmMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.voice_confirm",
      timestamp: "1730000031",
      type: "text",
      text: { body: "yes" },
    };
    await service.processInboundMessageDirectly(businessId, confirmMsg, "Ramesh");

    const prod = await ProductService.findProductByNameOrQuery(businessId, "आलू");
    expect(prod.stockQuantity).toBe(30); // 20 + 10 = 30
  });

  it("rejects oversized audio voice notes safely without crashing", async () => {
    const oversizedMsg: WhatsAppInboundMessage = {
      from: sellerPhone,
      id: "wamid.voice_oversized",
      timestamp: "1730000040",
      type: "audio",
      audio: {
        id: "oversized_media",
        mime_type: "audio/ogg; codecs=opus",
      },
    };

    await service.processInboundMessageDirectly(businessId, oversizedMsg, "Ramesh");

    expect(testClient.sentMessages[0]?.text).toContain("Audio message is too large");
  });

  it("prevents unauthorized customers from mutating inventory", async () => {
    // Customer phone (not a business member) tries to say "Add 10 kg आलू"
    const custMsg: WhatsAppInboundMessage = {
      from: customerPhone,
      id: "wamid.cust_hack",
      timestamp: "1730000050",
      type: "text",
      text: { body: "Add 10 kg आलू" },
    };

    await service.processInboundMessageDirectly(businessId, custMsg, "Hacker / Customer");

    // Verify no proposal was created and stock did not change
    const prod = await ProductService.findProductByNameOrQuery(businessId, "आलू");
    expect(prod.stockQuantity).toBe(20);
  });
});
