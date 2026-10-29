# OpsPilot — WhatsApp Business Cloud API Setup & Local Development Guide

This guide walks you through connecting OpsPilot to Meta's official WhatsApp Business Cloud API for local development and staging verification.

---

## 1. Meta Developer Application Setup

1. **Create a Meta Developer Account**:
   - Go to [developers.facebook.com](https://developers.facebook.com/) and sign in with your Facebook account.
2. **Create an App**:
   - Click **My Apps** > **Create App**.
   - Select **Other** as the use case > click **Next**.
   - Select **Business** as the app type > click **Next**.
   - Enter an **App Name** (e.g. `OpsPilot-Dev`) and your contact email.
   - Click **Create App**.
3. **Add WhatsApp Product**:
   - On the App Dashboard, locate **WhatsApp** and click **Set up**.
   - Accept the WhatsApp Business Platform terms.

---

## 2. Obtain Development Credentials

In the left sidebar, navigate to **WhatsApp** > **API Setup**:

1. **Temporary Access Token**:
   - Copy the 24-hour temporary access token (or generate a System User permanent token under Meta Business Settings).
   - Set as `WHATSAPP_ACCESS_TOKEN`.
2. **Phone Number ID**:
   - Copy the numerical **Phone number ID** (e.g. `109876543210987`) listed under the test phone number.
   - Set as `WHATSAPP_PHONE_NUMBER_ID`.
3. **WhatsApp Business Account ID (WABA ID)**:
   - Copy the numerical **WhatsApp Business Account ID**.
   - Set as `WHATSAPP_WABA_ID`.
4. **App Secret**:
   - In the left sidebar, click **App settings** > **Basic**.
   - Click **Show** next to **App secret** and copy the value.
   - Set as `WHATSAPP_APP_SECRET`.
5. **Webhook Verification Token**:
   - Choose a high-entropy secret string (e.g. a random 32-character string).
   - Set as `WHATSAPP_VERIFY_TOKEN`.

---

## 3. Configure Local Environment (`backend/.env`)

Add the following environment variables to `backend/.env`:

```env
# Meta WhatsApp Cloud API Configuration
WHATSAPP_GRAPH_API_VERSION=v26.0
WHATSAPP_ACCESS_TOKEN=your_meta_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_WABA_ID=your_waba_id_here
WHATSAPP_VERIFY_TOKEN=your_chosen_verify_token_here
WHATSAPP_APP_SECRET=your_app_secret_here

# Optional: bind to a specific business UUID (defaults to primary clinic if omitted)
# WHATSAPP_BUSINESS_ID=your_business_uuid_here
```

> [!CAUTION]
> Never commit real access tokens or app secrets to GitHub. `backend/.env` is ignored by `.gitignore`.

---

## 4. Setting Up Local Webhook Tunnel (HTTPS)

Meta's webhook servers require a publicly accessible HTTPS URL. For local development, use an HTTPS tunnel:

### Option A: Cloudflare Tunnel (Free, No Account Required)
```bash
cloudflared tunnel --url http://localhost:4000
```
Copy the generated `https://<subdomain>.trycloudflare.com` URL.

### Option B: Ngrok
```bash
ngrok http 4000
```
Copy the generated `https://<subdomain>.ngrok-free.app` URL.

---

## 5. Register the Webhook in Meta Dashboard

1. In the Meta App Dashboard, navigate to **WhatsApp** > **Configuration** (in the sidebar).
2. Under **Webhook**, click **Edit**.
3. **Callback URL**: Enter `https://<your-tunnel-url>/api/webhook/whatsapp`.
4. **Verify token**: Enter the exact string configured in `WHATSAPP_VERIFY_TOKEN`.
5. Click **Verify and save**.
   - Meta will send a `GET` challenge to your endpoint.
   - OpsPilot will verify the token and return `hub.challenge`.
   - The status in Meta dashboard will display a green checkmark.
6. Under **Webhook fields**, click **Manage**.
7. Subscribe to **`messages`** by clicking **Subscribe**.

---

## 6. Authorize a Test Recipient

Meta's test sandbox phone numbers can only message numbers that have been added to the test recipient list:

1. In the Meta Dashboard under **WhatsApp** > **API Setup**, find the **To** dropdown under "Send and receive messages".
2. Select **Manage phone number list**.
3. Add your personal WhatsApp phone number (with country code, e.g. `+919876543210`).
4. Enter the verification code sent to your WhatsApp.

---

## 7. Send and Verify a Live Test Message

1. Start OpsPilot backend:
   ```bash
   npm --prefix backend run dev
   ```
2. Open WhatsApp on your phone.
3. Send a message to the Meta test number:
   > *"Hi, can I check available appointments for General Consultation next Monday?"*
4. What happens:
   - Meta posts the message event to `/api/webhook/whatsapp`.
   - OpsPilot verifies the `X-Hub-Signature-256` HMAC-SHA-256 signature.
   - The message is recorded in `WebhookInbox` with unique `wamid` deduplication.
   - `AgentOrchestrator` invokes the `check_availability` tool.
   - OpsPilot sends an outbound response via Meta Graph API v26.0 listing available slots directly to your phone.

---

## 8. Troubleshooting Checklist

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **GET Challenge 403 Forbidden** | `hub.verify_token` mismatch | Ensure `WHATSAPP_VERIFY_TOKEN` in `.env` exactly matches the token entered in the Meta dashboard. |
| **POST Signature 401 Unauthorized** | `X-Hub-Signature-256` mismatch | Check `WHATSAPP_APP_SECRET`. Ensure the tunnel preserves raw JSON payloads without modification. |
| **Error 131030 / Outside 24h Window** | Customer service messaging window closed | Business-initiated messages sent >24h after customer's last message require an approved Template Message (`client.sendTemplateMessage`). Inbound replies within 24h are free-form text. |
| **Error 190 / Invalid OAuth Token** | Access token expired | Temporary access tokens expire after 24 hours. Generate a permanent System User token in Meta Business Manager for long-running deployments. |
| **Duplicate Responses** | Webhook acknowledgment delay | If your server takes >15s to respond, Meta retries delivery. OpsPilot's `WebhookInbox` catches duplicate `wamid`s and returns 200 without duplicate agent processing. |
