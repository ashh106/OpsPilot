# OpsPilot — Development Progress

## Current State Summary
- **Workspace:** `D:\VsCode\Projects\OpsPilot`
- **Branch:** `main` (HEAD: `6099092`)
- **Active Phase:** Milestone D.1 (Security, Concurrency & Phone Verification Hardening) Completed
- **Automated Tests:** 97 passing tests across 10 test suites (`npm test`)
- **Backend Quality:** 0 type errors (`npm run typecheck`), 0 lint warnings (`npm run lint`)
- **Frontend Quality:** 0 type errors (`npm run typecheck`), production build succeeded (15 static & dynamic routes compiled)

---

## Completed Items

### Milestone D.1: Security, Concurrency & Phone Verification Hardening
- [x] **Safe Phone Verification Default:**
  - Added migration `20261029013000_correct_phone_verification_default`: `User.phoneVerified` altered to `@default(false)`.
  - Existing unverified user accounts safely reset to `phoneVerified = false` to prevent unproven privilege escalation.
  - New user registrations default to `phoneVerified: false`.
  - `SellerAuthService` strictly enforces `phoneVerified === true`, barring unverified users from inventory mutations.
  - Proposals revalidate seller identity and assert caller phone matches `proposal.performedBy`.
- [x] **Inventory Concurrency & Mutation Idempotency:**
  - Added `idempotencyKey` unique constraint on `InventoryAudit`.
  - Transactional pre-flight check, in-lock re-check (`SELECT ... FOR UPDATE`), and `P2002`/`P2034` conflict recovery.
  - Payload mismatch defense: Reusing an idempotency key with a different business, product, delta, or price throws `IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH` (409 Conflict).
  - Atomic transactions guarantee no orphaned stock updates without corresponding audit records.
  - Concurrent adjustments with distinct keys preserve all deltas without lost updates.
- [x] **Voice Pipeline Safety & Production Truthfulness:**
  - Barred mock transcription from running when `NODE_ENV === "production"`.
  - Implemented `DisabledTranscriptionProvider` which safely raises an unsupported error when speech-to-text credentials are unset.
  - Low-confidence audio (< 0.70) prompts the user for text clarification instead of mutating inventory.
- [x] **Strict Tenant Isolation:**
  - Verified and tested that cross-business product lookups, adjustments, price updates, and audit queries are rejected (404 / 403).
  - Raw SQL row locks enforce business ID boundaries in SQL WHERE clauses.
- [x] **Automated Regression Test Suite:**
  - 15 comprehensive security regression tests in `backend/tests/security-regression.test.ts`.
  - Total backend tests: 97 of 97 passing across 10 test suites.

### Milestone D: Multilingual, Voice-Enabled, Multi-Business WhatsApp Platform (Inventory Vertical)
- [x] **Database Migration & Domain Modeling:**
  - Added `BusinessCategory` enum (`CLINIC`, `GROCERY`, `RESTAURANT`, `RETAIL`, `GYM`, `PHYSIOTHERAPY`, `RENTAL`, `GENERAL`).
  - Added `InventoryChangeType` enum (`MANUAL_TEXT`, `VOICE_NOTE`, `WEB_DASHBOARD`, `SALE`, `RESTOCK`, `ADJUSTMENT`).
  - Added `category`, `defaultLanguage`, and `supportedLanguages` to `Business`.
  - Added `language` to `Conversation`.
  - Added `phone` with unique constraint to `User` for verified WhatsApp seller identity resolution.
  - Added `Product` model with tenant-scoped SKU uniqueness, decimal pricing, stock quantity, and unit.
  - Added `InventoryAudit` model for immutable transactional change tracking.
  - Successfully deployed migration `20261029000000_add_multilingual_and_inventory` without resets or data loss.
- [x] **Multilingual Localization Foundation (`backend/src/i18n/`):**
  - English (`en`), Hindi (`hi`), Marathi (`mr`) dictionaries.
  - Fallback resolution chain: requested -> business default -> `"en"`.
  - Unicode-safe affirmative regex parser (`isAffirmativeInput`) supporting English, Hindi, and Marathi.
  - Unicode-safe rejection regex parser (`isRejectionInput`) supporting English, Hindi, and Marathi.
  - Localized seller menus and instructions.
- [x] **Secure Inventory Domain (`backend/src/services/product.service.ts` & `seller-auth.service.ts`):**
  - Product CRUD with tenant isolation.
  - Row-level locking via PostgreSQL `SELECT ... FOR UPDATE` inside transactions to prevent lost updates under concurrency.
  - Non-negative stock enforcement.
  - WhatsApp phone number variant normalization and seller membership authorization checks.
  - REST endpoints mounted under `/api/businesses/:id/products` with auth and membership middleware.
- [x] **AI Tools for Inventory (`backend/src/tools/inventory.tools.ts`):**
  - Implemented and registered: `list_products`, `get_product`, `create_product`, `update_product_price`, `adjust_inventory`, `get_inventory_summary`.
  - Enforced server-side `isSellerAuthorized` checks on all mutation tools.
  - Integrated into domain-grounded system prompts and agent orchestration loop.
- [x] **WhatsApp Menus, Interactive Messaging & Voice Note Processing:**
  - Localized interactive seller menus (options 1-8) and language switching (`english`, `hindi`, `marathi`).
  - Provider-independent `AudioTranscriptionProvider` interface and `MockTranscriptionProvider`.
  - Meta Graph API media downloading (`fetchMedia`) and validation (MIME check, < 16MB limit).
  - Two-phase proposal & affirmative confirmation lifecycle for stock and price updates (never mutates directly from unconfirmed voice or text).
- [x] **Next.js Web Dashboard Inventory Management (`web/web/app/products/page.tsx`):**
  - New `/products` route added to `AppShell` sidebar.
  - Real-time KPI summary cards (Total Products, Low Stock Alert, Total Units, Inventory Value).
  - Search and filter bar.
  - Products table with stock status badges.
  - Modals for Product Creation, Stock Adjustment, Price Updates, and Audit History logs.
- [x] **Automated Testing & Verification:**
  - 82 passing tests across 9 test suites in `backend` (`tests/i18n.test.ts`, `tests/inventory.test.ts`, `tests/whatsapp-multilingual-voice.test.ts`, etc.).
  - Backend typecheck and linting passed with 0 errors.
  - Frontend typecheck and production build passed with 0 errors.

---

### Milestone 1: Foundation, Auth & Business Management
- [x] Full codebase audit and file inspection.
- [x] Fixed syntax error in `backend/src/db/client.ts`.
- [x] Bcrypt password hashing (12 rounds) and JWT authentication.
- [x] Business membership guard (`assertBusinessMembership`).
- [x] Business CRUD, service catalog, and weekly business hours.
- [x] Connected Next.js frontend with HttpOnly cookie route handlers and proxy.

### Milestone 2: Availability Engine & Appointment Lifecycle
- [x] Verified running PostgreSQL 16 container (`opspilot-postgres`) on port `5433` with `btree_gist` extension active.
- [x] Verified `opspilot` and `opspilot_test` database isolation and schema migrations.
- [x] Verified PostgreSQL exclusion constraint `Appointment_no_overlap` physically rejects overlapping active appointments while permitting adjacent and cancelled slots.
- [x] Implemented Timezone Conversion & Arithmetic utilities (`backend/src/utils/timezone.ts`).
- [x] Implemented Timezone-Aware Availability Engine (`backend/src/services/availability.service.ts`).
- [x] Implemented Appointment Lifecycle Service (`backend/src/services/appointment.service.ts`).
- [x] Connected Next.js Appointments screen (`web/web/app/appointments/page.tsx`) and Customer Directory (`web/web/app/customers/page.tsx`).

### Milestone A: AI Agent Architecture & Validated Tool Subsystem
- [x] Generic provider abstraction (`AiProvider`), message protocols, and error hierarchy (`AiProviderError`).
- [x] Deterministic Mock Provider with FIFO queue scripting and heuristic rule-based tool dispatching.
- [x] Local Ollama Provider for Llama 3.1 supporting native JSON function-calling schema and abort timeouts.
- [x] Dynamic provider factory resolving via `env.AI_PROVIDER`.
- [x] Zod-validated Tool Registry with context-injected tenant isolation (`check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `get_business_information`).
- [x] Domain-grounded system prompt builder injecting business timezone, current date/time, and anti-fabrication guidelines.
- [x] Bounded Agent Orchestrator (max 5 iterations), timeout safety, tool call execution, conversation persistence, and audit logging to Prisma `ToolExecution`.
- [x] 9 automated tests in `backend/tests/agent.test.ts`.

### Milestone B: Official WhatsApp Business Cloud API Integration
- [x] Meta Graph API v26.0 compliance and centralized configurable versioning.
- [x] Outbound WhatsApp Client (`backend/src/integrations/whatsapp/client.ts`) with text and approved template messaging.
- [x] Webhook verification (`GET /api/webhook/whatsapp` challenge and `POST /api/webhook/whatsapp` HMAC-SHA-256 signatures).
- [x] Durable event ingestion and deduplication via PostgreSQL `WebhookInbox` model.
- [x] Message delivery status correlation.
- [x] 11 automated tests in `backend/tests/whatsapp.test.ts`.

### Milestone C: Reliable WhatsApp Processing & Persistent Conversation State
- [x] **Database Schema & Migrations:**
  - Prisma migration `20261028174500_add_conversation_workflow_and_idempotency` deployed to dev (`opspilot`) and test (`opspilot_test`) databases.
  - Added `ConversationWorkflowState` enum (`IDLE`, `SELECTING_SERVICE`, `SELECTING_DATE`, `OFFERING_SLOTS`, `COLLECTING_DETAILS`, `AWAITING_CONFIRMATION`, `BOOKED`, `RESCHEDULING`, `CANCELLING`, `ESCALATION_REQUIRED`).
  - Added `idempotencyKey` column with unique constraint and index to `Appointment` model.
  - Added `workflowState`, `pendingProposal`, and `stateVersion` (for optimistic concurrency control) to `Conversation` model.
  - Added `lockedAt`, `lockedBy`, and `nextRetryAt` columns to `WebhookInbox` for atomic job claiming.
- [x] **PostgreSQL-Backed Asynchronous Inbox Worker (`backend/src/queue/inbox-worker.ts`):**
  - Concurrency-safe job claiming using raw SQL `FOR UPDATE SKIP LOCKED`.
  - Multiple concurrent workers cannot claim the same job.
  - Automatic crash recovery: claims abandoned jobs (`status: PROCESSING` with `lockedAt < now - 2 min`).
  - Bounded retries with exponential backoff (`delay = 2^attempts * 10s`, max 5 attempts).
  - Terminal failure recording (`status: FAILED`, `lastError`).
- [x] **Business Operation Idempotency:**
  - `AppointmentService.createAppointment`: Recovers existing appointment on duplicate execution with the same `idempotencyKey`. Prevents duplicate appointments even during concurrent racing requests.
- [x] **Server-Managed Conversation State Machine (`backend/src/services/conversation-state.service.ts`):**
  - Manages booking proposals with explicit 15-minute TTL expiration.
  - Explicit confirmation: A customer replying "yes" executes the booking only if the proposal has not expired and the slot is still open.
  - Interim conflict detection: If the slot was taken while awaiting confirmation, catches conflict, transitions to `OFFERING_SLOTS`, and offers alternative slots.
  - Rejection / abort: Customer replying "no" cancels the proposal and resets to `IDLE`.
  - Tenant and ownership security: Prevents cross-customer inspection, rescheduling, or cancellation of appointments.
- [x] **Automated Tests:**
  - `backend/tests/reliability.test.ts` (9 tests passed).
  - Total backend tests passing: **56 of 56 across 6 test suites** (`foundation.test.ts`, `auth.test.ts`, `appointment.test.ts`, `agent.test.ts`, `whatsapp.test.ts`, `reliability.test.ts`).
  - Backend typecheck: `npm run typecheck` passed (0 errors).
  - Backend lint: `npm run lint` passed (0 errors).
  - Frontend build: `npm run build` in `web/web` passed (14 routes compiled and optimized).

---

## Active Tasks (Milestone D: Durable Appointment Reminders & Background Queue)
- [ ] Scheduled background cron/worker to scan for appointments requiring pre-visit reminders (e.g., 24 hours and 2 hours before).
- [ ] WhatsApp template message dispatch for reminders outside the 24-hour customer service window.
- [ ] Delivery status tracking and failure alerts for reminders.

---

## Operational Notes
- Docker container `opspilot-postgres` is active on port `5433:5432`.
- Backend Vitest test suite runs 56 tests in ~7.2 seconds.
