import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client.js";
import { defaultToolRegistry } from "../src/tools/registry.js";
import { MockAiProvider } from "../src/agents/mock-provider.js";
import { AgentOrchestrator } from "../src/agents/orchestrator.js";
import { ToolContext } from "../src/tools/types.js";
import { ToolStatus, MessageRole } from "@prisma/client";

describe("Milestone A: AI Agent & Tool Registry Subsystem", () => {
  let testBusiness: { id: string; name: string; timezone: string };
  let testService: { id: string; name: string; durationMinutes: number };
  let testConversationId: string;

  beforeAll(async () => {
    // Clean up previous runs
    await prisma.business.deleteMany({
      where: { slug: "agent-test-clinic" },
    });

    const biz = await prisma.business.create({
      data: {
        slug: "agent-test-clinic",
        name: "Dr. Robin's Test Clinic",
        timezone: "Asia/Kolkata",
        cancellationNoticeHours: 2,
        hours: {
          createMany: {
            data: [
              { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00" }, // Monday
              { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00" }, // Tuesday
              { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00" }, // Wednesday
              { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00" }, // Thursday
              { dayOfWeek: 5, openTime: "09:00", closeTime: "17:00" }, // Friday
            ],
          },
        },
      },
    });

    testBusiness = { id: biz.id, name: biz.name, timezone: biz.timezone };

    const svc = await prisma.service.create({
      data: {
        businessId: testBusiness.id,
        name: "General Consultation",
        description: "Routine health checkup",
        durationMinutes: 30,
        price: 500,
        currency: "INR",
        active: true,
      },
    });

    testService = { id: svc.id, name: svc.name, durationMinutes: svc.durationMinutes };

    // Create a test conversation
    const conv = await prisma.conversation.create({
      data: {
        businessId: testBusiness.id,
        tokenHash: "test-hash-token-1234",
      },
    });
    testConversationId = conv.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({
      where: { slug: "agent-test-clinic" },
    });
  });

  describe("1. Tool Registry & Parameter Validation", () => {
    it("exposes all required tool definitions with parameters", () => {
      const defs = defaultToolRegistry.getDefinitions();
      const names = defs.map((d) => d.name);

      expect(names).toContain("check_availability");
      expect(names).toContain("book_appointment");
      expect(names).toContain("reschedule_appointment");
      expect(names).toContain("cancel_appointment");
      expect(names).toContain("get_business_information");

      const bookDef = defs.find((d) => d.name === "book_appointment");
      expect(bookDef?.parameters.required).toContain("serviceId");
      expect(bookDef?.parameters.required).toContain("startTime");
    });

    it("rejects invalid input schema with structured validation error", async () => {
      const ctx: ToolContext = {
        businessId: testBusiness.id,
        conversationId: testConversationId,
      };

      // Missing required startDate and invalid format
      const res = await defaultToolRegistry.execute(
        "check_availability",
        { serviceId: testService.id, startDate: "invalid-date" },
        ctx,
      );

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("VALIDATION_ERROR");
      expect(res.error?.message).toContain("YYYY-MM-DD");
    });

    it("retrieves business profile and services via get_business_information", async () => {
      const ctx: ToolContext = {
        businessId: testBusiness.id,
        conversationId: testConversationId,
      };

      const res = await defaultToolRegistry.execute(
        "get_business_information",
        { includeServices: true },
        ctx,
      );

      expect(res.success).toBe(true);
      const data = res.data as {
        name: string;
        timezone: string;
        services: Array<{ name: string; price: number }>;
      };
      expect(data.name).toBe("Dr. Robin's Test Clinic");
      expect(data.timezone).toBe("Asia/Kolkata");
      expect(data.services.length).toBeGreaterThan(0);
      expect(data.services[0]?.name).toBe("General Consultation");
      expect(data.services[0]?.price).toBe(500);
    });

    it("checks availability for a future operating date", async () => {
      const ctx: ToolContext = {
        businessId: testBusiness.id,
        conversationId: testConversationId,
      };

      // Monday in future: 2026-11-02
      const res = await defaultToolRegistry.execute(
        "check_availability",
        { serviceId: "General Consultation", startDate: "2026-11-02" },
        ctx,
      );

      expect(res.success).toBe(true);
      const data = res.data as { totalAvailableSlots: number; slots: Array<{ localStartTime: string }> };
      expect(data.totalAvailableSlots).toBeGreaterThan(0);
      expect(data.slots[0]?.localStartTime).toBe("09:00");
    });
  });

  describe("2. Mock AI Provider Behavior", () => {
    it("returns queued responses in FIFO order", async () => {
      const mock = new MockAiProvider();
      mock.queueResponse({ content: "First response", finishReason: "stop" });
      mock.queueResponse({ content: "Second response", finishReason: "stop" });

      const res1 = await mock.generateResponse([], []);
      expect(res1.content).toBe("First response");

      const res2 = await mock.generateResponse([], []);
      expect(res2.content).toBe("Second response");
    });

    it("uses heuristic tool dispatch when no scripted responses are queued", async () => {
      const mock = new MockAiProvider();
      const res = await mock.generateResponse(
        [{ role: "user", content: "What time slots are available tomorrow?" }],
        [],
      );

      expect(res.toolCalls).toBeDefined();
      expect(res.toolCalls?.[0]?.name).toBe("check_availability");
    });
  });

  describe("3. Agent Orchestrator & Bounded Loop Execution", () => {
    it("executes a complete availability inquiry turn with tool call and persistence", async () => {
      const mock = new MockAiProvider();
      // Queue tool call followed by confirmation
      mock.queueResponses([
        {
          content: "Let me check available times for you.",
          toolCalls: [
            {
              id: "call_avail_1",
              name: "check_availability",
              arguments: {
                serviceId: testService.id,
                startDate: "2026-11-02",
              },
            },
          ],
          finishReason: "tool_calls",
        },
        {
          content: "We have multiple slots open on Monday, November 2nd starting from 9:00 AM.",
          finishReason: "stop",
        },
      ]);

      const result = await AgentOrchestrator.processMessage({
        businessId: testBusiness.id,
        conversationId: testConversationId,
        customerMessage: "Can I see a doctor next Monday?",
        provider: mock,
        persist: true,
      });

      expect(result.reply).toContain("Monday, November 2nd");
      expect(result.toolExecutions.length).toBe(1);
      expect(result.toolExecutions[0]?.toolName).toBe("check_availability");
      expect(result.toolExecutions[0]?.status).toBe("SUCCESS");

      // Verify Prisma database records
      const savedExec = await prisma.toolExecution.findFirst({
        where: { conversationId: testConversationId, toolName: "check_availability" },
      });
      expect(savedExec).not.toBeNull();
      expect(savedExec?.status).toBe(ToolStatus.SUCCESS);

      const messages = await prisma.message.findMany({
        where: { conversationId: testConversationId },
        orderBy: { createdAt: "desc" },
        take: 2,
      });
      expect(messages.some((m) => m.role === MessageRole.USER)).toBe(true);
      expect(messages.some((m) => m.role === MessageRole.ASSISTANT)).toBe(true);
    });

    it("books an appointment and prevents overlapping booking (conflict handling)", async () => {
      const mock = new MockAiProvider();
      const startTime = "2026-11-02T04:30:00.000Z"; // 10:00 AM IST

      // 1. First booking should succeed
      mock.queueResponses([
        {
          content: "Booking your appointment now...",
          toolCalls: [
            {
              id: "call_book_1",
              name: "book_appointment",
              arguments: {
                serviceId: testService.id,
                startTime,
                customerName: "Alice Smith",
                customerPhone: "+919988776655",
              },
            },
          ],
          finishReason: "tool_calls",
        },
        {
          content: "Your appointment is confirmed for November 2nd at 10:00 AM.",
          finishReason: "stop",
        },
      ]);

      const res1 = await AgentOrchestrator.processMessage({
        businessId: testBusiness.id,
        conversationId: testConversationId,
        customerMessage: "Please book 10:00 AM for Alice",
        provider: mock,
      });

      expect(res1.reply).toContain("confirmed");
      expect(res1.toolExecutions[0]?.status).toBe("SUCCESS");

      // 2. Second booking on the exact same slot must return APPOINTMENT_CONFLICT
      const mockConflict = new MockAiProvider();
      mockConflict.queueResponses([
        {
          content: "Attempting to book the 10:00 AM slot...",
          toolCalls: [
            {
              id: "call_book_2",
              name: "book_appointment",
              arguments: {
                serviceId: testService.id,
                startTime,
                customerName: "Bob Jones",
                customerPhone: "+919911223344",
              },
            },
          ],
          finishReason: "tool_calls",
        },
        {
          content: "I apologize, but that 10:00 AM slot was just taken by another patient. Would 10:30 AM work instead?",
          finishReason: "stop",
        },
      ]);

      const res2 = await AgentOrchestrator.processMessage({
        businessId: testBusiness.id,
        conversationId: testConversationId,
        customerMessage: "Can Bob book 10:00 AM on Monday?",
        provider: mockConflict,
      });

      expect(res2.reply).toContain("apologize");
      expect(res2.toolExecutions[0]?.status).toBe("ERROR");
      const errResult = res2.toolExecutions[0]?.result as { error?: { code: string } };
      expect(errResult.error?.code).toBe("APPOINTMENT_CONFLICT");
    });

    it("bounds the execution loop to maxIterations to prevent runaway loops", async () => {
      const loopingMock = new MockAiProvider();
      // Keep returning tool calls indefinitely
      loopingMock.generateResponse = async () => ({
        content: "Checking info again...",
        toolCalls: [
          {
            id: `loop_${Date.now()}`,
            name: "get_business_information",
            arguments: {},
          },
        ],
        finishReason: "tool_calls",
      });

      const maxIter = 3;
      const result = await AgentOrchestrator.processMessage({
        businessId: testBusiness.id,
        conversationId: testConversationId,
        customerMessage: "Loop test",
        provider: loopingMock,
        maxIterations: maxIter,
        persist: false,
      });

      // Exactly maxIter tool executions occurred before loop termination
      expect(result.toolExecutions.length).toBe(maxIter);
      expect(result.reply).toBeDefined();
    });
  });
});
