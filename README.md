# OpsPilot

> **AI-Powered Multi-Business Operations Platform** — Automated appointment scheduling, multilingual inventory management, and persistent conversational workflows powered by WhatsApp Business Cloud API and Next.js.

OpsPilot is a production-oriented business operations platform designed for appointment-based service businesses (clinics, salons, consultants) and small retail merchants (kirana stores, grocers). It pairs an official Meta WhatsApp Business Cloud API assistant with an authenticated Next.js merchant dashboard, backed by a PostgreSQL database with database-level concurrency and double-booking prevention.

---

## Architecture & System Overview

```
                               ┌──────────────────────────────────────────────┐
                               │             WhatsApp User / Client           │
                               └──────────────────────┬───────────────────────┘
                                                      │ (HTTPS Webhook)
                                                      ▼
┌────────────────────────┐     ┌──────────────────────────────────────────────┐
│  Next.js 16 Dashboard  │     │             Express / Node.js API            │
│ (Merchant Web Console) │◄───►│ - HMAC-SHA256 Signature Verification         │
│  - Appointments & Cal  │     │ - Async Worker (FOR UPDATE SKIP LOCKED)      │
│  - Inventory & Audits  │     │ - Multilingual Dictionaries (en, hi, mr)     │
│  - Business Settings   │     │ - Conversation State Machine (TTL Proposals) │
└────────────────────────┘     └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │           AI Orchestration Layer             │
                               │ - AiProvider (Ollama / Deterministic Mock)   │
                               │ - Bounded Execution Loop (maxTurns = 5)      │
                               │ - Strict Zod-Validated Tool Registry         │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │             PostgreSQL 16 Engine             │
                               │ - GiST Exclusion (no appointment overlaps)   │
                               │ - SELECT FOR UPDATE Row-Level Locking        │
                               │ - Transactional Idempotency & Audit Trails   │
                               └──────────────────────────────────────────────┘
```

---

## Key Capabilities

### 1. WhatsApp Appointment Assistant (Clinics & Services)
- **Zero-Overlap Booking Engine:** Uses PostgreSQL `tstzrange` GiST exclusion constraints (`Appointment_no_overlap`) to prevent double-booking at the database storage layer.
- **Operating Hours Enforcement:** Authoritative timezone calculations (Asia/Kolkata default) validating appointment intervals against weekly schedules.
- **Stateful Two-Phase Confirmation:** Proposes bookings with a 15-minute TTL. Confirms only upon explicit client affirmation ("yes", "confirm", "हाँ", "होय").
- **Durable Webhook Ingestion:** Inbound webhooks are deduplicated via PostgreSQL unique provider message IDs (`wamid`) and claimed asynchronously with `SELECT ... FOR UPDATE SKIP LOCKED`.

### 2. Multilingual Inventory Management (Retail & Kirana)
- **Natural Language & Voice Note Updates:** Store owners can update stock or change prices via WhatsApp text or voice notes (e.g., *"Add 20 packets of Wheat Flour"*, *"10 किलो चीनी जोड़ो"*).
- **Trilingual Localization:** Built-in dictionaries for English (`en`), Hindi (`hi`), and Marathi (`mr`) with Unicode Devanagari and romanized transliteration parsing.
- **Strict Seller Authorization:** Only verified phone numbers (`phoneVerified === true`) with active `OWNER` business roles can access inventory tools.
- **Lost-Update Prevention:** Stock adjustments use `SELECT ... FOR UPDATE` row locks inside atomic transactions.
- **Full Mutation Idempotency:** Requests carrying an `idempotencyKey` cannot apply stock or price changes twice. Cross-tenant or cross-operation key reuses are rejected with HTTP 409.

### 3. Merchant Web Dashboard (Next.js)
- Responsive management console with live KPI metrics (Total Inventory Value, Low Stock Alerts, Active Products).
- Modals for Product Catalog Creation, Stock Adjustments, Price Updates, and Audit History.
- HttpOnly cookie authentication and tenant-isolated API proxies.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend Runtime** | Node.js (v20+), TypeScript, Express 5 |
| **Database & ORM** | PostgreSQL 16, Prisma ORM 6 |
| **Frontend Dashboard**| Next.js 16 (App Router), React 19, Tailwind CSS |
| **AI & LLM** | Provider-independent abstraction (`AiProvider`), Ollama (`llama3.1`), Deterministic Mock Provider |
| **Messaging & Voice** | Meta WhatsApp Business Cloud API (Graph API v26.0), Webhooks (HMAC-SHA256) |
| **Concurrency & Queues**| PostgreSQL Row Locks (`FOR UPDATE`), Asynchronous Queue Worker (`SKIP LOCKED`), GiST Range Indexes |
| **Validation & Security**| Zod schemas, Argon2id password hashing, JWT authentication, Rate Limiting |
| **Testing** | Vitest, Supertest, isolated test databases |

---

## Repository Structure

```
OpsPilot/
├── backend/                        # Express + TypeScript API Service
│   ├── prisma/
│   │   ├── schema.prisma           # Authoritative database schema
│   │   └── migrations/             # 6 reproducible SQL migrations
│   ├── src/
│   │   ├── agents/                 # AiProvider, Ollama provider, orchestrator, prompts
│   │   ├── config/                 # Zod-validated environment config
│   │   ├── controllers/            # REST API controllers (Auth, Business, Appointment, Product)
│   │   ├── i18n/                   # Multilingual dictionaries (en, hi, mr) & parsers
│   │   ├── integrations/
│   │   │   ├── voice/              # Audio transcription abstraction & safety guards
│   │   │   └── whatsapp/           # Meta Cloud API client, security, webhook handler
│   │   ├── middleware/             # JWT auth, tenant membership check, rate limiters
│   │   ├── queue/                  # PostgreSQL SKIP LOCKED inbox worker
│   │   ├── routes/                 # Express route definitions
│   │   ├── services/               # Core business services (Appointment, Availability, Product, SellerAuth)
│   │   ├── tools/                  # Strict Zod-validated agent tool registry
│   │   └── utils/                  # Cryptography, timezone math, structured errors
│   └── tests/                      # 10 automated test suites (101 unit & integration tests)
├── web/
│   └── web/                        # Next.js 16 Merchant Dashboard application
│       ├── app/                    # App Router pages (/products, /appointments, /login, etc.)
│       ├── components/             # Reusable UI components & dialogs
│       └── lib/                    # API client, types, auth context
├── docs/                           # Architecture, roadmap, setup guides, progress records
├── docker-compose.yml              # Local PostgreSQL 16 container definition
└── .gitignore                      # Comprehensive exclusion rules
```

---

## Quickstart & Local Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **Docker & Docker Compose**: For running PostgreSQL locally
- **Ollama** *(Optional)*: If running local LLM inference (`llama3.1`)

### 1. Clone & Start Database
```bash
git clone https://github.com/ashh106/OpsPilot.git
cd OpsPilot

# Start PostgreSQL 16 on port 5433
docker compose up -d
```

### 2. Configure & Run Backend
```bash
cd backend
cp .env.example .env

# Edit .env and ensure DATABASE_URL points to port 5433:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5433/opspilot

npm install

# Deploy Prisma migrations
npm run db:deploy

# Start backend development server (Port 4000)
npm run dev
```

### 3. Configure & Run Frontend Dashboard
```bash
cd ../web/web
cp .env.example .env.local

npm install

# Start Next.js development server (Port 3000)
npm run dev
```

Visit `http://localhost:3000` to register an account and access the dashboard.

---

## Running Verification & Tests

OpsPilot includes a comprehensive suite of 101 automated tests executing against an isolated PostgreSQL test database (`opspilot_test`).

### Run Backend Tests
```bash
cd backend
npm test
```

### Run Static Analysis & Linter
```bash
cd backend
npm run typecheck
npm run lint
```

### Run Frontend Production Build
```bash
cd web/web
npm run typecheck
npm run build
```

---

## WhatsApp Webhook & Security Setup

1. **Webhook Verification (GET):** Responds to Meta subscription challenge parameter `hub.challenge` after validating `WHATSAPP_VERIFY_TOKEN`.
2. **Signature Verification (POST):** Validates Meta's `X-Hub-Signature-256` header using constant-time HMAC-SHA256 (`crypto.timingSafeEqual`) over raw request buffers.
3. **Delivery Status Correlation:** Inbound delivery events (`sent`, `delivered`, `read`) update message states in real time.

For full webhook setup and tunneling details via ngrok / cloudflared, see [`docs/WHATSAPP_SETUP.md`](docs/WHATSAPP_SETUP.md).

---

## Security & Phone Verification Architecture

To protect merchant inventory from unauthorized takeover, phone verification enforces a strict security policy:
- **Default Status:** Newly registered user accounts default to `phoneVerified = false`.
- **Automatic Revocation:** Updating an account's phone number via `PATCH /api/auth/profile` automatically revokes `phoneVerified` to `false`.
- **Seller Authorization:** WhatsApp seller workflows (`/menu`, stock adjustments, price changes) strictly require `phoneVerified === true` and active business membership.
- **Pilot Administrative Verification:** During pilot deployments, administrators can verify a merchant's phone number via a secured internal endpoint requiring `ADMIN_API_KEY`:
  ```http
  POST /api/auth/admin/verify-phone HTTP/1.1
  Host: localhost:4000
  x-admin-key: <ADMIN_API_KEY>
  Content-Type: application/json

  {
    "userId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  }
  ```
- **Production Roadmap:** Self-serve verification will integrate directly with an SMS/WhatsApp OTP delivery provider (such as Meta WhatsApp Authentication Templates or Twilio Verify).

---

## Current Status & Production Readiness

| Component | Status | Implementation Details |
| :--- | :---: | :--- |
| **Appointment Booking** | **Production-Ready** | GiST exclusion constraints, operating hours validation, timezone calculations. |
| **Inventory Management** | **Production-Ready** | Row-level locking (`SELECT FOR UPDATE`), audit logging, multi-tenant isolation. |
| **Idempotency Engine** | **Production-Ready** | Prevents duplicate stock mutations and double-bookings under concurrent race conditions. |
| **Multilingual Support**| **Production-Ready** | English, Hindi, and Marathi dictionaries and Devanagari regex parsers. |
| **Voice Processing** | **Fail-Safe Guarded** | `DisabledTranscriptionProvider` safely blocks unauthenticated voice notes in production; real STT requires external provider credentials. |
| **Phone Verification** | **Controlled Pilot** | Accounts default to `phoneVerified = false`. Automated self-verification requires an SMS/WhatsApp OTP delivery gateway. |

---

## License

MIT License. See [LICENSE](LICENSE) for details.
