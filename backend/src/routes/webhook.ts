import { Request, Response, Router } from "express";
import { verifyWebhookChallenge, verifyWebhookSignature } from "../integrations/whatsapp/security.js";
import { WhatsAppService } from "../integrations/whatsapp/service.js";
import { WhatsAppWebhookPayload } from "../integrations/whatsapp/types.js";

let customWhatsAppService: WhatsAppService | null = null;

export function setCustomWhatsAppService(service: WhatsAppService | null): void {
  customWhatsAppService = service;
}

export function createWebhookRouter(defaultService: WhatsAppService = new WhatsAppService()) {
  const router = Router();

  /**
   * GET /api/webhook/whatsapp
   * Meta Webhook Subscription Verification Challenge.
   */
  router.get("/whatsapp", (req: Request, res: Response) => {
    const challenge = verifyWebhookChallenge(req.query as Record<string, unknown>);

    if (!challenge) {
      res.status(403).send("Forbidden");
      return;
    }

    res.status(200).type("text/plain").send(challenge);
  });

  /**
   * POST /api/webhook/whatsapp
   * Incoming WhatsApp Business Cloud API Events.
   */
  router.post("/whatsapp", async (req: Request, res: Response) => {
    const signature = req.header("x-hub-signature-256");
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;

    // Verify HMAC-SHA-256 signature over raw request bytes
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      res.status(401).json({
        error: "INVALID_SIGNATURE",
        message: "Webhook request signature verification failed.",
      });
      return;
    }

    const activeService = customWhatsAppService || defaultService;

    try {
      const payload = req.body as WhatsAppWebhookPayload;
      const result = await activeService.handleWebhookPayload(payload);

      // Meta requires a prompt 200 OK acknowledgment
      res.status(200).json({
        success: true,
        result,
      });
    } catch {
      // Even if internal background processing has partial errors, acknowledge to prevent Meta delivery storms
      res.status(200).json({
        success: false,
        message: "Webhook processed with warnings.",
      });
    }
  });

  return router;
}

export const webhookRouter = createWebhookRouter();
