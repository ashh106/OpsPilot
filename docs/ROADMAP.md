# OpsPilot — Phased Implementation Roadmap

## Milestone 1: Backend Foundation Stabilization, Auth & Business Management
- **Status:** Completed
- **Delivered:**
  1. Working tree syntax error in `backend/src/db/client.ts` fixed.
  2. Owner Authentication with bcrypt hashing (12 rounds) and JWT signing/verification.
  3. Multi-tenant business management (`assertBusinessMembership` OWNER guard).
  4. Service catalog CRUD and weekly operating hours replacement.
  5. Next.js App Router frontend integrated with HttpOnly cookie proxy pattern.

## Milestone 2: Database Verification, Availability Engine & Appointment Lifecycle
- **Status:** Completed
- **Delivered:**
  1. PostgreSQL 16 container verified on port `5433` with `btree_gist` extension.
  2. Exclusion constraint `Appointment_no_overlap` verified and tested against concurrent double-booking races.
  3. Dedicated timezone arithmetic utility (`backend/src/utils/timezone.ts`) converting between local wall-clock times and UTC instants with DST handling.
  4. Availability Calculation Engine (`backend/src/services/availability.service.ts`) computing open slots against operating hours and active bookings.
  5. Appointment Lifecycle Service (`backend/src/services/appointment.service.ts`) with duration enforcement, operating hours checks, 409 conflict translation, transactional rescheduling, and immediate slot release on cancellation.
  6. Scoped appointment and customer REST routes mounted under `/api/businesses/:id`.
  7. Automated test suite (`backend/tests/appointment.test.ts`) with 10 passed tests.
  8. Interactive Next.js appointment calendar, slot picker, booking dialog, reschedule modal, and customer directory.

## Milestone A: Provider-Independent AI Agent & Validated Tools Subsystem
- **Status:** Completed
- **Delivered:**
  1. Generic provider abstraction (`AiProvider`), message protocols, and error hierarchy.
  2. Deterministic Mock Provider with FIFO queue scripting and heuristic rule-based tool dispatching.
  3. Local Ollama Provider for Llama 3.1 supporting native JSON function-calling schema and abort timeouts.
  4. Zod-validated Tool Registry with context-injected tenant isolation (`check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `get_business_information`).
  5. Domain-grounded system prompt builder injecting business timezone, current date/time, and anti-fabrication guidelines.
  6. Bounded ReAct Agent Orchestrator with database persistence and tool audit logging (`ToolExecution`).
  7. Automated test suite (`backend/tests/agent.test.ts`) with 9 tests.

## Milestone B: Official WhatsApp Business Cloud API Integration
- **Status:** Completed
- **Delivered:**
  1. Meta Graph API v26.0 compliance and centralized configurable versioning.
  2. Outbound WhatsApp Client (`backend/src/integrations/whatsapp/client.ts`) with text and approved template messaging.
  3. Webhook GET subscription challenge verification (`hub.mode`, `hub.verify_token`, `hub.challenge`).
  4. Webhook POST signature verification using HMAC-SHA-256 over raw request bytes (`X-Hub-Signature-256`) with constant-time comparison.
  5. Durable event persistence and idempotent deduplication via PostgreSQL `WebhookInbox` model.
  6. Automated test suite (`backend/tests/whatsapp.test.ts`) with 11 tests.

## Milestone C: Reliable WhatsApp Processing & Persistent Conversation State
- **Status:** Completed
- **Delivered:**
  1. Prisma migration `20261028174500_add_conversation_workflow_and_idempotency` for workflow states, idempotency keys, and lock fields.
  2. PostgreSQL-backed asynchronous worker (`backend/src/queue/inbox-worker.ts`) using `FOR UPDATE SKIP LOCKED` for concurrent-safe job claiming and crash recovery.
  3. Bounded retries with exponential backoff (`delay = 2^attempts * 10s`) and terminal failure handling.
  4. Business-operation idempotency on `Appointment.idempotencyKey`, preventing double-booking during worker crashes and concurrent races.
  5. Server-managed conversation state machine (`backend/src/services/conversation-state.service.ts`) handling booking proposals, 15-minute TTL expirations, explicit affirmative confirmations, interim conflict detection, and aborts.
  6. Tenant and customer ownership security preventing unauthorized cross-customer appointment access or cancellation.
  7. Automated test suite (`backend/tests/reliability.test.ts`) with 9 tests. Total 56/56 tests passing across backend.

## Milestone D: Multilingual, Voice-Enabled, Multi-Business WhatsApp Platform (Inventory Vertical)
- **Status:** Completed
- **Delivered:**
  1. Prisma migration `20261029000000_add_multilingual_and_inventory` with `BusinessCategory`, `InventoryChangeType`, `Product`, `InventoryAudit`, and verified phone identity on `User`.
  2. Full Multilingual Localization (`backend/src/i18n/`): English, Hindi, and Marathi dictionaries, fallback chain, and regional affirmative/rejection regexes.
  3. Secure Inventory Domain (`backend/src/services/product.service.ts` & `seller-auth.service.ts`) with tenant isolation, non-negative stock validation, and PostgreSQL row-level locking via `SELECT ... FOR UPDATE` eliminating lost updates under concurrency.
  4. WhatsApp Phone Seller Authorization rejecting unauthorized customers from mutating inventory.
  5. Validated AI Tool Registry for inventory: `list_products`, `get_product`, `create_product`, `update_product_price`, `adjust_inventory`, `get_inventory_summary`.
  6. Provider-independent voice transcription abstraction (`backend/src/integrations/voice/`) with deterministic mock provider.
  7. WhatsApp Cloud API media binary downloading and validation (<16MB, supported audio formats).
  8. Two-phase proposal & affirmative confirmation lifecycle for natural language / voice note stock and price updates.
  9. Interactive Next.js Inventory Dashboard (`web/web/app/products/page.tsx`) with real-time KPI cards, stock status badges, search, creation, stock adjustment, price revision, and audit history modals.
  10. Automated test suite (`backend/tests/i18n.test.ts`, `backend/tests/inventory.test.ts`, `backend/tests/whatsapp-multilingual-voice.test.ts`). Total **82 of 82 backend tests passing**.

## Milestone E: Durable Reminders, Order Checkout & Production Deployment
- **Status:** Next Up
- **Objectives:**
  1. Durable background job scheduler for appointment reminders (24h and 2h prior).
  2. WhatsApp shopping cart and order placement workflows.
  3. Indian payment gateway integration evaluation (e.g. Razorpay webhook & order verification).
  4. Production Docker packaging, structured telemetry, and health check monitoring.
  3. Status tracking for dispatched reminders.

## Milestone E: Analytics, Funnel Metrics & Evaluation
- **Status:** Planned
- **Objectives:**
  1. Booking conversion funnel tracking.
  2. Tool execution latency and failure rate monitoring.
  3. Prompt regression testing suite.

## Milestone F: Cloud Deployment & Live Meta Verification
- **Status:** Planned
- **Objectives:**
  1. Docker multi-stage containerization.
  2. Cloud hosting deployment (e.g. Render/Fly.io/AWS).
  3. Production Meta Developer App webhook verification with live WhatsApp number.
