import { InboxStatus, WebhookInbox } from "@prisma/client";
import { prisma } from "../db/client.js";
import { WhatsAppService } from "../integrations/whatsapp/service.js";
import { WhatsAppInboundMessage } from "../integrations/whatsapp/types.js";

export class InboxWorker {
  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private currentJobPromise: Promise<boolean> | null = null;

  constructor(
    private readonly service: WhatsAppService = new WhatsAppService(),
    public readonly workerId: string = `worker_${Math.random().toString(36).substring(2, 9)}`,
    public readonly maxAttempts: number = 5,
  ) {}

  /**
   * Atomically claims the next pending or stale job using PostgreSQL's FOR UPDATE SKIP LOCKED.
   * Prevents race conditions among concurrent workers and recovers abandoned jobs.
   */
  async claimNextJob(): Promise<WebhookInbox | null> {
    const records = await prisma.$queryRaw<WebhookInbox[]>`
      WITH candidate AS (
        SELECT id
        FROM "WebhookInbox"
        WHERE ("status" = 'PENDING'::"InboxStatus" OR ("status" = 'PROCESSING'::"InboxStatus" AND "lockedAt" < NOW() - INTERVAL '2 minutes'))
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
          AND "attempts" < ${this.maxAttempts}
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "WebhookInbox"
      SET "status" = 'PROCESSING'::"InboxStatus",
          "lockedAt" = NOW(),
          "lockedBy" = ${this.workerId},
          "attempts" = "attempts" + 1
      FROM candidate
      WHERE "WebhookInbox".id = candidate.id
      RETURNING "WebhookInbox".*;
    `;

    return records[0] || null;
  }

  /**
   * Executes a single claimed job with exponential backoff and terminal failure handling.
   */
  async executeJob(job: WebhookInbox): Promise<boolean> {
    try {
      if (job.eventType === "message") {
        const msg = job.payload as unknown as WhatsAppInboundMessage;
        const customerName = (job.payload as { customerName?: string })?.customerName || "Customer";

        const outcome = await this.service.processInboundMessageDirectly(
          job.businessId!,
          msg,
          customerName,
          job.providerMessageId,
        );

        if (outcome.status === "FAILED") {
          throw new Error(outcome.error || "Execution failed");
        }
      }

      // Mark success
      await prisma.webhookInbox.update({
        where: { id: job.id },
        data: {
          status: InboxStatus.PROCESSED,
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });

      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Job processing failure";
      const isTerminal = job.attempts >= this.maxAttempts;

      // Exponential backoff: 10s, 20s, 40s, 80s... max 5 mins
      const delaySeconds = Math.min(300, Math.pow(2, job.attempts) * 10);
      const nextRetry = new Date(Date.now() + delaySeconds * 1000);

      await prisma.webhookInbox.update({
        where: { id: job.id },
        data: {
          status: isTerminal ? InboxStatus.FAILED : InboxStatus.PENDING,
          lastError: errorMsg,
          nextRetryAt: isTerminal ? null : nextRetry,
          lockedAt: null,
          lockedBy: null,
        },
      });

      return false;
    }
  }

  /**
   * Claims and processes a single job. Returns true if a job was found and processed.
   */
  async processNext(): Promise<boolean> {
    const job = await this.claimNextJob();
    if (!job) return false;

    return this.executeJob(job);
  }

  /**
   * Starts the polling background worker loop.
   */
  start(intervalMs: number = 1000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const poll = async () => {
      if (!this.isRunning) return;
      try {
        this.currentJobPromise = this.processNext();
        await this.currentJobPromise;
      } catch {
        // Silently catch to keep worker loop alive
      } finally {
        this.currentJobPromise = null;
        if (this.isRunning) {
          this.timer = setTimeout(poll, intervalMs);
        }
      }
    };

    poll();
  }

  /**
   * Gracefully stops the worker, allowing any in-flight job to drain.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.currentJobPromise) {
      await this.currentJobPromise;
    }
  }
}
