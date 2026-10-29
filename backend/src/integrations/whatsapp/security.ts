import crypto from "crypto";
import { env } from "../../config/env.js";

/**
 * Validates Meta's GET webhook subscription challenge.
 * Returns the challenge string if valid, or null if invalid.
 */
export function verifyWebhookChallenge(
  query: Record<string, unknown>,
  expectedToken: string = env.WHATSAPP_VERIFY_TOKEN,
): string | null {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode === "subscribe" && token === expectedToken && typeof challenge === "string") {
    return challenge;
  }

  return null;
}

/**
 * Verifies Meta's POST webhook signature using HMAC-SHA-256 over raw request bytes.
 * Uses constant-time comparison to protect against timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string = env.WHATSAPP_APP_SECRET,
): boolean {
  if (!rawBody || !signatureHeader) {
    return false;
  }

  // Header format: "sha256=<hex_digest>"
  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    return false;
  }

  const expectedDigest = parts[1]?.toLowerCase();
  if (!expectedDigest || expectedDigest.length !== 64) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(rawBody);
  const calculatedDigest = hmac.digest("hex").toLowerCase();

  const expectedBuffer = Buffer.from(expectedDigest, "utf8");
  const calculatedBuffer = Buffer.from(calculatedDigest, "utf8");

  if (expectedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
}
