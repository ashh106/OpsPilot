# Changelog

All notable changes to the OpsPilot project will be documented in this file.

## [Unreleased] - 2026-10-29

### Session: Milestone D.1 — Security, Concurrency & Phone Verification Hardening

#### Added & Corrected
- **Phone Verification Security & Identity Integrity**:
  - `backend/prisma/schema.prisma`: Changed `phoneVerified` default from `true` to `false` on `User` model. New registrations and imported profiles default to unverified.
  - `backend/prisma/migrations/20261029013000_correct_phone_verification_default/migration.sql`:
    - Safely deployed migration altering column default to `false` and resetting existing accounts to `phoneVerified = false` to prevent unproven phone claims.
    - Successfully deployed to dev (`opspilot`) and test (`opspilot_test`) databases on port 5433 with zero data loss.
  - `backend/src/services/auth.service.ts`: Returns `phone` and `phoneVerified` on registration, login, and `/me`. New registrations explicitly set `phoneVerified: false`.
  - `backend/src/services/seller-auth.service.ts`: Strictly enforces `user.phoneVerified === true` before granting seller access. Unverified users receive `PHONE_NOT_VERIFIED` and are barred from executing inventory mutations.
  - `backend/src/services/conversation-state.service.ts`: Re-validates seller authorization and asserts caller phone matches the proposer (`proposal.performedBy`) before applying inventory proposals (`ADJUST_STOCK`, `UPDATE_PRICE`, `CREATE_PRODUCT`).
- **Inventory Idempotency & Database Concurrency Under Races**:
  - `backend/src/services/product.service.ts`:
    - Full transaction idempotency on `adjustStock` and `updatePrice`: pre-flight lookup, in-lock verification (`FOR UPDATE`), and conflict recovery on Prisma `P2002` / `P2034`.
    - Payload mismatch defense (`IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH`): Reusing an existing idempotency key with a different business, product, quantity delta, or price is rejected with a 409 conflict error.
    - ACID atomicity: Database updates and `InventoryAudit` insertions execute inside a single transaction, guaranteeing that failed transactions leave stock completely untouched without partial audits.
    - Row-level locking via PostgreSQL `SELECT ... FOR UPDATE` prevents lost updates when concurrent requests execute with different idempotency keys.
  - `backend/src/services/appointment.service.ts`:
    - Added retry/polling recovery on concurrent booking races (`P2034` deadlock / write conflict from PostgreSQL exclusion constraint checking).
- **Voice Pipeline Safety & Truthfulness**:
  - `backend/src/integrations/voice/index.ts`: Barred `MockTranscriptionProvider` when `NODE_ENV === "production"`. Implemented `DisabledTranscriptionProvider` raising explicit errors when external STT credentials are missing.
  - `backend/src/integrations/whatsapp/service.ts`: Added low-confidence threshold guard (< 0.70) prompting for text clarification instead of mutating inventory.
- **Tenant Isolation**:
  - `backend/src/controllers/product.controller.ts`: Explicitly verifies product ownership against tenant business ID in `getAudits`, returning 404 for cross-tenant product inquiries.
- **Regression Testing**:
  - `backend/tests/security-regression.test.ts`: Expanded to 15 comprehensive tests covering unverified user rejection, confirmation hijacking prevention, deactivated seller revocation, 2 simultaneous adjustments with same key, 5 parallel retries with same key, quantity mismatch rejection, product mismatch rejection, rollback on transaction failure, concurrent adjustments with distinct keys without lost updates, concurrent price updates with same key, and tenant boundary enforcement.
  - Total backend tests passing: **97 of 97 across 10 test suites**.

#### Verified
- Prisma schema validation: `npx prisma validate` passed.
- Migration status: `npx prisma migrate status` passed (6 migrations deployed).
- Backend typecheck: `npm run typecheck` passed (0 errors).
- Backend lint: `npm run lint` passed (0 errors).
- Backend tests: `npm test` passed (97 of 97 tests passing in 12.18s).
- Frontend typecheck: `npm run typecheck` in `web/web` passed (0 errors).
- Frontend production build: `npm run build` in `web/web` passed (15 static and dynamic routes compiled).

## [Unreleased] - 2026-10-28

### Session: Milestone D — Multilingual, Voice-Enabled, Multi-Business WhatsApp Platform (Inventory Vertical)

#### Added
- **Database Schema & Migrations**:
  - `backend/prisma/migrations/20261029000000_add_multilingual_and_inventory/migration.sql`:
    - Added `BusinessCategory` enum (`CLINIC`, `GROCERY`, `RESTAURANT`, `RETAIL`, `GYM`, `PHYSIOTHERAPY`, `RENTAL`, `GENERAL`).
    - Added `InventoryChangeType` enum (`MANUAL_TEXT`, `VOICE_NOTE`, `WEB_DASHBOARD`, `SALE`, `RESTOCK`, `ADJUSTMENT`).
    - Added to `Business`: `category` (default `CLINIC`), `defaultLanguage` (default `en`), `supportedLanguages` (`en`, `hi`, `mr`).
    - Added to `Conversation`: `language` (default `en`).
    - Added `phone` with unique constraint to `User` for verified WhatsApp seller identity resolution.
    - Added tenant-scoped `Product` model with `businessId`, `name`, `description`, `sku`, `price`, `currency`, `stockQuantity`, `unit`, `active`, and indexes `[businessId, sku]`, `[businessId, active]`, `[businessId, name]`.
    - Added `InventoryAudit` model with `quantityDelta`, `previousQuantity`, `newQuantity`, `previousPrice`, `newPrice`, `performedBy`, `reason`, and indexes `[businessId, createdAt]`, `[productId, createdAt]`.
    - Successfully deployed to `opspilot` (dev) and `opspilot_test` (test) databases on port 5433 with zero data loss.
- **Multilingual Localization Foundation (`backend/src/i18n/`)**:
  - English (`en`), Hindi (`hi`), Marathi (`mr`) dictionaries covering greetings, seller menus, product list headers, stock updates, price changes, inventory summaries, audio tutorials, confirmation prompts, and error fallbacks.
  - Safe fallback resolution chain: `requestedLanguage` -> `businessDefaultLanguage` -> `"en"`.
  - Multilingual affirmative regex parser (`isAffirmativeInput`): English ("yes", "confirm", "proceed"), Hindi ("हाँ", "हा", "सही है", "कर दो", "haan"), Marathi ("होय", "हो", "बरोबर", "नक्की", "hoy").
  - Multilingual rejection regex parser (`isRejectionInput`): English ("no", "cancel"), Hindi ("नहीं", "नही", "रद्द", "nahi"), Marathi ("नाही", "नको", "radd kara").
- **Secure Inventory Domain (`backend/src/services/product.service.ts` & `seller-auth.service.ts`)**:
  - Full CRUD operations: `listProducts`, `getProduct`, `findProductByNameOrQuery`, `createProduct`, `updatePrice`, `adjustStock`, `getInventorySummary`, `getInventoryAudits`.
  - Transactional consistency and concurrency: Implemented PostgreSQL row-level locking via `SELECT ... FOR UPDATE` inside `prisma.$transaction` for stock adjustments and price updates, eliminating lost updates.
  - Non-negative stock enforcement: Prevents stock reduction below zero unless explicitly overridden.
  - WhatsApp Seller Authorization (`SellerAuthService`): Maps incoming phone numbers across national/international formats (`+91`, `91`, 10-digit) to verified `User` accounts and verifies active `BusinessMember` role (`OWNER`), rejecting unauthorized senders from mutating inventory.
  - REST endpoints mounted in `backend/src/routes/business.ts` under `/:id/products/...` with membership middleware guards.
- **AI Tools for Inventory (`backend/src/tools/inventory.tools.ts`)**:
  - `list_products`: Catalog queries with optional keyword search.
  - `get_product`: Detailed product retrieval by name, SKU, or UUID.
  - `create_product`: Seller-authenticated product creation with initial stock audit.
  - `update_product_price`: Seller-authenticated price updates with previous/new price audit records.
  - `adjust_inventory`: Seller-authenticated atomic stock increments/decrements.
  - `get_inventory_summary`: Seller-authenticated inventory metrics and valuation.
  - Category-aware system prompt grounding in `backend/src/agents/prompts/booking-agent.ts` and `orchestrator.ts`.
- **WhatsApp Menus, Interactive Messaging & Voice Notes**:
  - `backend/src/integrations/voice/`: Provider-independent `AudioTranscriptionProvider` interface and `MockTranscriptionProvider` deterministic fixture.
  - `backend/src/integrations/whatsapp/client.ts`: Added `fetchMedia` for downloading audio binaries from Meta Graph API, `sendInteractiveButtons`, and `sendInteractiveList`.
  - `backend/src/integrations/whatsapp/service.ts`:
    - Handles incoming audio messages (`msg.type === "audio"`): downloads media, validates MIME (`audio/ogg; codecs=opus`, `audio/mp4`, `audio/amr`) and size (< 16MB), transcribes via configured provider.
    - Two-phase proposal confirmation for natural language / voice inventory updates (e.g. "Add 10 kg potatoes" / "10 किलो आलू जोड़ो"): generates proposal, prompts seller for affirmative confirmation in their preferred language, and never mutates inventory directly without explicit confirmation.
    - Multilingual seller menu (options 1-8) and language switching (`english`, `hindi`, `marathi`).
- **Next.js Web Dashboard Inventory Management (`web/web/app/products/page.tsx`)**:
  - Added "Inventory" tab to navigation sidebar in `AppShell.tsx`.
  - Real-time KPI summary cards: Total Products, Low Stock Alerts (<5), Total Stock Units, Total Valuation (₹).
  - Search and filter bar for quick product/SKU lookups.
  - Products table with live stock status badges (In Stock, Low Stock, Out of Stock).
  - Modals for Adding Products, Adjusting Stock (+/-), Updating Prices, and viewing Audit History logs.
- **Testing**:
  - `backend/tests/i18n.test.ts`: 8 unit tests for language resolution, interpolation, fallback, and multilingual affirmation/rejection parsing.
  - `backend/tests/inventory.test.ts`: 9 tests covering tenant isolation, scoped SKU uniqueness, atomic adjustments with audit records, negative stock prevention, concurrent adjustments with `FOR UPDATE` row locking, summary calculation, and phone-based seller authorization.
  - `backend/tests/whatsapp-multilingual-voice.test.ts`: 9 integration tests covering localized seller menus, option routing, language switching, proposal & affirmative confirmation lifecycle, rejection aborts, voice note audio transcription to proposal/confirmation, oversized audio rejection, and unauthorized customer access prevention.
  - Total backend tests passing: **82 of 82 across 9 test suites**.

#### Verified
- Backend typecheck: `npm run typecheck` passed (0 errors).
- Backend lint: `npm run lint` passed (0 errors).
- Backend tests: `npm test` passed (82 of 82 tests passing in 9.88s).
- Frontend typecheck: `npm run typecheck` in `web/web` passed (0 errors).
- Frontend production build: `npm run build` in `web/web` passed (15 static and dynamic routes compiled).

#### Added
- **Database Schema & Migrations**:
  - `backend/prisma/migrations/20261028174500_add_conversation_workflow_and_idempotency/migration.sql`:
    - Added `ConversationWorkflowState` enum (`IDLE`, `SELECTING_SERVICE`, `SELECTING_DATE`, `OFFERING_SLOTS`, `COLLECTING_DETAILS`, `AWAITING_CONFIRMATION`, `BOOKED`, `RESCHEDULING`, `CANCELLING`, `ESCALATION_REQUIRED`).
    - Added `idempotencyKey` column with unique constraint and index to `Appointment` model.
    - Added `workflowState`, `pendingProposal` JSON, and `stateVersion` integer (for optimistic concurrency control) to `Conversation` model.
    - Added `lockedAt`, `lockedBy`, and `nextRetryAt` columns to `WebhookInbox` for concurrency-safe worker claiming.
    - Successfully deployed to dev (`opspilot`) and test (`opspilot_test`) databases.
- **PostgreSQL-Backed Asynchronous Inbox Worker**:
  - `backend/src/queue/inbox-worker.ts`:
    - Implemented concurrency-safe job claiming using raw SQL `FOR UPDATE SKIP LOCKED`. Multiple concurrent workers cannot claim the same job.
    - Automatic crash recovery: Automatically reclaims abandoned jobs (`status: PROCESSING` with `lockedAt < now - 2 min`).
    - Bounded retries with exponential backoff (`delay = 2^attempts * 10s`, max 5 attempts) and terminal failure recording (`status: FAILED`).
    - Graceful worker start/stop and manual single-job execution (`processNext`).
- **Business Operation Idempotency**:
  - `backend/src/services/appointment.service.ts`:
    - Enhanced `createAppointment` with `idempotencyKey` lookup and collision recovery.
    - Concurrent workers or retried webhook events attempting to book with the same `idempotencyKey` return the existing appointment without double-booking or failing with a slot conflict.
- **Server-Managed Persistent Conversation State Machine**:
  - `backend/src/services/conversation-state.service.ts`:
    - Manages pending proposals (`BOOK`, `RESCHEDULE`, `CANCEL`) with explicit 15-minute TTL expiration.
    - Explicit confirmation: A customer replying "yes" executes the booking only if the proposal has not expired and the slot is still open.
    - Interim conflict detection: If the slot was taken while awaiting confirmation, catches conflict, transitions to `OFFERING_SLOTS`, and offers alternative slots.
    - Rejection / abort: Customer replying "no" cancels the proposal and resets to `IDLE`.
    - Tenant and ownership security: Prevents cross-customer inspection, rescheduling, or cancellation of appointments.
- **Testing**:
  - `backend/tests/reliability.test.ts`: 9 automated tests covering idempotency recovery, concurrent creation race prevention, atomic worker claiming with `FOR UPDATE SKIP LOCKED`, exponential backoff on failure, booking proposal transitions, affirmative confirmation, rejection abort, TTL expiration, and cross-customer unauthorized mutation prevention.
  - Total backend tests passing: **56 of 56 across 6 test suites** (`foundation.test.ts`, `auth.test.ts`, `appointment.test.ts`, `agent.test.ts`, `whatsapp.test.ts`, `reliability.test.ts`).

#### Verified
- Backend typecheck: `npm run typecheck` passed (0 errors).
- Backend lint: `npm run lint` passed (0 errors).
- Backend tests: `npm test` passed (56 of 56 tests passing).
- Frontend build: `npm run build` in `web/web` passed (14 routes generated).

### Session: Milestone B — Official WhatsApp Business Cloud API Integration

#### Added
- **Database Schema & Migrations**:
  - `backend/prisma/migrations/20261028171709_add_webhook_inbox_and_message_status/migration.sql`:
    - Created `InboxStatus` enum (`PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`).
    - Created `WebhookInbox` table with unique constraint on `providerMessageId` (`wamid`) for physical deduplication, payload storage, and retry counters.
    - Added `providerMessageId` and `status` columns to `Message` table for delivery-status correlation.
    - Successfully deployed to dev (`opspilot`) and test (`opspilot_test`) databases.
- **WhatsApp Configuration & Client Subsystem**:
  - `backend/src/config/env.ts`: Centralized validation for `WHATSAPP_GRAPH_API_VERSION` (default `v26.0`, regex format `^v\d+\.\d+$`), `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_BUSINESS_ID`.
  - `backend/src/integrations/whatsapp/client.ts`: Official Cloud API client supporting `sendTextMessage`, `sendTemplateMessage`, configurable timeouts via `AbortController`, and normalized error classification (`AUTH_FAILED`, `RATE_LIMITED`, `BAD_REQUEST`, `TIMEOUT`, `NETWORK_ERROR`). Provides mockable `fetchFn` boundary for offline testing.
- **Webhook Security & Verification**:
  - `backend/src/integrations/whatsapp/security.ts`:
    - `verifyWebhookChallenge`: Validates Meta's subscription challenge parameters (`hub.mode === "subscribe"`, `hub.verify_token`), echoing `hub.challenge`.
    - `verifyWebhookSignature`: Computes HMAC-SHA-256 over raw request buffer with constant-time equality check (`crypto.timingSafeEqual`) against `X-Hub-Signature-256`.
  - `backend/src/app.ts`: Configured `express.json` with a custom `verify` callback to preserve raw request buffer (`req.rawBody`) without middleware conflicts.
  - `backend/src/routes/webhook.ts`: Mounted `GET /api/webhook/whatsapp` and `POST /api/webhook/whatsapp` routes with injectable service hook for unit and integration testing.
- **Durable Ingestion & Inbound Processing**:
  - `backend/src/integrations/whatsapp/types.ts`: TypeScript contracts for Meta webhook events, inbound messages, contacts, and delivery statuses.
  - `backend/src/integrations/whatsapp/service.ts`:
    - Idempotent deduplication: Catches Prisma `P2002` collisions on `providerMessageId` to prevent duplicate customer replies or double-bookings.
    - Destination resolution: Resolves receiving phone number to business tenant.
    - Customer resolution: Finds or creates customer by phone number.
    - Conversation resolution: Finds active or creates new conversation.
    - Orchestration: Dispatches inbound text to `AgentOrchestrator.processMessage`, sends outbound response via `WhatsAppClient`, and correlates assistant message with outbound `wamid`.
    - Delivery receipts: Tracks `sent`, `delivered`, `read`, and `failed` receipts in database.
- **Testing**:
  - `backend/tests/whatsapp.test.ts`: 11 comprehensive automated tests covering GET challenge verification, invalid verification tokens, missing signatures, tampered payloads, valid payload acceptance, inbound message agent reply turn, duplicate delivery idempotency, delivery-status updates, and outbound client unit invariants.
  - Total backend tests passing: **47 of 47 across 5 test suites** (`foundation.test.ts`, `auth.test.ts`, `appointment.test.ts`, `agent.test.ts`, `whatsapp.test.ts`).

#### Verified
- Backend typecheck: `npm run typecheck` passed (0 errors).
- Backend lint: `npm run lint` passed (0 errors).
- Backend tests: `npm test` passed (47 of 47 tests passing).
- Frontend build: `npm run build` in `web/web` passed (14 routes generated).

### Session: Milestone A — AI Agent Architecture, Validated Tool Registry & Bounded Execution Loop

#### Added
- **AI Provider Abstraction Layer**:
  - `backend/src/agents/provider.ts`: Generic `AiProvider` interface, message protocols (`AgentMessage`), tool definition and call contracts (`ToolDefinition`, `ToolCall`), response structures (`AgentResponse`), and typed error hierarchy (`AiProviderError`).
  - `backend/src/agents/mock-provider.ts`: Deterministic, scriptable mock provider supporting FIFO queued responses for predictable test assertions and heuristic rule-based tool dispatching for conversational simulation without external LLM dependencies.
  - `backend/src/agents/ollama-provider.ts`: Local Ollama chat API integration formatting tool calling schemas (`type: "function"`), parsing native model tool calls, managing request abort timeouts, and translating failures to structured errors.
  - `backend/src/agents/factory.ts`: Dynamic provider resolver reading `AI_PROVIDER` ("ollama" | "mock") with test-override hooks.
- **Validated Tool Registry & Subsystems**:
  - `backend/src/tools/types.ts`: `ToolContext` (enforces tenant isolation by passing verified `businessId`, `conversationId`, and customer metadata), `ToolResult`, and `AgentTool` contract.
  - `backend/src/tools/registry.ts`:
    - `check_availability`: Zod schema validation, service ID or name resolution, multi-day availability query delegation.
    - `book_appointment`: Transactional booking via `AppointmentService`, customer resolution, and graceful translation of PostgreSQL exclusion conflicts (`APPOINTMENT_CONFLICT`) into structured error feedback.
    - `reschedule_appointment`: Notice policy verification and reschedule execution.
    - `cancel_appointment`: Slot release and cancellation.
    - `get_business_information`: Real-time business profile, operating hours, and active service catalog retrieval.
    - `ToolRegistry` singleton with tool discovery and unified execution.
  - `backend/src/tools/index.ts`: Unified export barrel.
- **Domain-Grounded Prompting**:
  - `backend/src/agents/prompts/booking-agent.ts`: Dynamic system prompt builder injecting business name, timezone, current wall-clock date/time, service duration and pricing, cancellation policy, and strict anti-fabrication guidelines (forcing tools for availability verification).
- **Bounded Agent Orchestrator**:
  - `backend/src/agents/orchestrator.ts`: Multi-turn conversational loop bounded to `maxIterations` (default 5) to prevent infinite execution and runaway token spend. Persists inbound messages, executes tools with context-injected tenant security, records executions to Prisma `ToolExecution`, handles tool errors, and saves final assistant replies.
- **Testing**:
  - `backend/tests/agent.test.ts`: 9 automated tests verifying tool schema validation, mock provider FIFO queuing and heuristic fallback, full availability inquiry turn with DB persistence, appointment booking turn, PostgreSQL exclusion constraint conflict recovery (`APPOINTMENT_CONFLICT`), and bounded loop iteration limiting.
  - Total backend tests passing: **36 of 36 across 4 test suites** (`foundation.test.ts`, `auth.test.ts`, `appointment.test.ts`, `agent.test.ts`).

#### Verified
- Backend typecheck: `npm run typecheck` passed (0 errors).
- Backend lint: `npm run lint` passed (0 errors).
- Backend tests: `npm test` passed (36 of 36 tests passing).
- Frontend build: `npm run build` in `web/web` passed (14 routes generated).

### Session: Milestone 2 — Database Verification, Availability Engine & Appointment Lifecycle

#### Added
- **Database & Environment Verification**:
  - Confirmed active Docker PostgreSQL 16 container (`opspilot-postgres`) listening on port `5433` with `btree_gist` extension installed.
  - Confirmed test database `opspilot_test` and development database `opspilot`.
  - Re-verified database-level exclusion constraint `Appointment_no_overlap` in live PostgreSQL engine.
- **Backend Timezone & Availability Subsystems**:
  - `src/utils/timezone.ts`: IANA timezone conversion utility (`parseZonedTime`, `formatZonedTime`, `getWeekdayForDate`, `isOverlapping`) handling wall-clock time parsing and daylight saving time shifts without server-local timezone bias.
  - `src/services/availability.service.ts`: Timezone-aware availability calculator matching requested dates and service durations against weekly `BusinessHours` intervals, filtering out booked appointments and past times.
- **Backend Appointment Lifecycle Subsystem**:
  - `src/services/appointment.service.ts`:
    - `createAppointment`: Computes authoritative `endTime` from service duration, verifies slot fits within weekly `BusinessHours`, auto-resolves customer records, and catches PostgreSQL exclusion violations translating them to HTTP 409 `APPOINTMENT_CONFLICT`.
    - `listAppointments`: Filters by date, customer, and status (`CONFIRMED`, `CANCELLED`).
    - `getAppointmentById`: Scoped retrieval ensuring strict tenant boundary.
    - `rescheduleAppointment`: Validates `cancellationNoticeHours` policy, updates time slot transactionally, and catches conflict violations.
    - `cancelAppointment`: Validates notice window, marks status as `CANCELLED`, and releases the slot immediately for other bookings.
    - `listCustomers`: Customer directory with booking counts.
  - `src/controllers/appointment.controller.ts`: Zod schema validation for availability queries, appointment bookings, filters, and reschedules.
  - `src/routes/business.ts`: Mounted nested routes under `/api/businesses/:id`:
    - `GET /appointments/availability`
    - `GET /appointments`
    - `POST /appointments`
    - `GET /appointments/:appointmentId`
    - `PATCH /appointments/:appointmentId`
    - `POST /appointments/:appointmentId/cancel`
    - `GET /customers`
- **Frontend Real Data Integration (`web/web`)**:
  - `app/appointments/page.tsx`: Replaced placeholder with interactive calendar view, date and status filters, live availability slot picker querying the backend in the business's timezone, new booking form, in-place reschedule modal, and cancellation confirmation.
  - `app/customers/page.tsx`: Live searchable customer directory displaying appointment visit counts.
  - `app/page.tsx`: Dashboard overview updated with live confirmed appointments metric card and updated engineering status checklist.
  - `lib/api/types.ts`: Added `Appointment`, `Customer`, `AvailableSlot`, and `AvailabilityResult` TypeScript contracts.
- **Testing**:
  - `backend/tests/appointment.test.ts`: 10 comprehensive tests covering availability calculations, operating boundary rejections, concurrent double-booking races caught by PostgreSQL exclusion constraint, adjacent bookings, safe rescheduling, cancellation slot release, and tenant boundary enforcement.
  - All 27 tests across all 3 test files (`foundation.test.ts`, `auth.test.ts`, `appointment.test.ts`) passing.

#### Verified
- Backend typecheck: `npm run typecheck` passed (0 errors).
- Backend lint: `npm run lint` passed (0 errors).
- Backend tests: `npm test` passed (27 of 27 tests passing).
- Frontend typecheck: `npm run typecheck` in `web/web` passed (0 errors).
- Frontend build: `npm run build` in `web/web` passed (14 routes generated).
