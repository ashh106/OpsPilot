# OpsPilot — Project Context & Knowledge Base

## 1. Product Overview & Core Problem

OpsPilot is an AI-powered business operations platform designed for appointment-based businesses (clinics, salons, wellness practices, tutors, and consultants).

### The Problem
Small service businesses lose significant revenue and administrative time manually answering inquiries, checking schedules across disjointed tools, and handling booking, rescheduling, and cancellation requests. Outside business hours, customer inquiries go unanswered, leading to lost client acquisition.

### The Solution
A unified platform with two complementary interfaces:
1. **Business Owner Dashboard (Next.js 16 App Router):** Enables business owners to register, configure their profile, service catalog (duration, pricing), weekly operating hours, customer directory, and live appointments calendar with booking, reschedule, and cancellation capabilities.
2. **Official WhatsApp Business Cloud API Assistant:** An automated WhatsApp customer assistant connected via Meta Graph API v26.0 allowing patients and clients to inquire about services, check real-time availability in the business's timezone, book appointments, reschedule, and cancel.
3. **AI Customer Chat:** A conversational assistant allowing customers to ask service-related questions, check real-time availability in the business's timezone, book appointments, reschedule, and cancel.

### Golden Architecture Principle: Deterministic Database Authority
The Large Language Model (LLM) is strictly an **untrusted conversational translator**. It parses natural language intent and arguments into structured tool calls. The **PostgreSQL database and Express backend services remain the authoritative source of truth**. An appointment is only confirmed to the user after trusted backend business logic validates business hours, service duration, and commits the booking via PostgreSQL exclusion constraints.

---

## 2. Target Users & Core Workflows

### Primary Personas
- **Business Owner:** Authenticates via secure HttpOnly JWT proxy, manages service offerings, defines operating hours, views live schedules, books/reschedules/cancels appointments, and monitors AI tool activity logs.
- **Customer:** Interacts via web chat using an ephemeral session token. Inquires about services and completes bookings without needing an account or password.

### Key End-to-End Workflows
1. **Onboarding & Configuration:** Owner registers &rarr; logs in &rarr; creates Business profile &rarr; configures Services &rarr; sets BusinessHours.
2. **Availability Inquiry:** Customer or Owner requests open slots &rarr; `AvailabilityService` queries weekly opening hours minus existing active bookings in the business's IANA timezone &rarr; returns candidate slots with exact start and end times.
3. **Atomic Booking:** User selects slot &rarr; backend verifies service existence and availability within business hours &rarr; inserts record into PostgreSQL &rarr; `Appointment_no_overlap` exclusion constraint physically blocks double bookings &rarr; returns confirmed appointment.
4. **Rescheduling / Cancellation:** User reschedules/cancels &rarr; backend validates cancellation notice hours (`cancellationNoticeHours`) &rarr; updates appointment status or slot &rarr; when status becomes `CANCELLED`, slot is immediately released for rebooking.

---

## 3. Repository Structure & Subsystems

```
OpsPilot/
├── docs/                      # Architectural specs, context, roadmap, progress
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   └── PROGRESS.md
├── docker-compose.yml         # Containerized PostgreSQL service (mapped to 5433:5432)
├── CHANGES.md                 # Permanent session changelog
├── LICENSE                    # MIT License
├── README.md                  # Project overview and run commands
├── backend/                   # Express 5 + TypeScript + Prisma API
│   ├── .env.example
│   ├── prisma/schema.prisma  # 11 core data models and relationships
│   ├── src/
│   │   ├── app.ts            # Express application factory with raw body capture
│   │   ├── server.ts         # Process entrypoint
│   │   ├── middleware/       # requireAuth, assertBusinessMembership, rateLimit, errorHandler
│   │   ├── routes/           # /api/health, /api/auth, /api/businesses, /api/webhook
│   │   ├── controllers/      # auth, business, appointment controllers
│   │   ├── services/         # auth, business, availability, appointment services
│   │   ├── agents/           # provider.ts, mock-provider.ts, ollama-provider.ts, orchestrator.ts
│   │   ├── tools/            # registry.ts, check_availability, book_appointment, etc.
│   │   ├── integrations/     # whatsapp/client.ts, whatsapp/service.ts, whatsapp/security.ts
│   │   └── utils/            # timezone.ts, auth.ts, errors.ts, logger.ts
│   └── tests/
│       ├── foundation.test.ts # Health, error handling, env validation, exclusion constraint
│       ├── auth.test.ts       # Bcrypt, JWT verification, route guards
│       ├── appointment.test.ts # Availability, booking, conflict 409, reschedule, cancellation
│       ├── agent.test.ts      # Agent tools, mock provider FIFO, bounded loop, exclusion recovery
│       └── whatsapp.test.ts   # Meta challenge, HMAC-SHA-256 signatures, deduplication, outbound
└── web/
    └── web/                   # Next.js 16 App Router application
        ├── app/
        │   ├── api/auth/      # Next.js HttpOnly cookie route handler
        │   ├── api/proxy/     # Next.js reverse-proxy route handler to Express API
        │   ├── components/    # AppShell, PageHeader, EmptyState, ComingSoon
        │   ├── appointments/  # Live appointment calendar, book, reschedule, cancel
        │   ├── customers/     # Live customer directory and visit counts
        │   ├── services/      # Live service catalog manager
        │   ├── working-hours/ # Live weekly schedule manager
        │   ├── settings/      # Live business profile manager
        │   ├── login/         # Owner login
        │   └── register/      # Owner registration
        ├── lib/
        │   ├── api/client.ts  # Typed API client with custom ApiError
        │   └── auth-context.tsx # React Auth & Business state context
        └── package.json
```

---

## 4. Current Database Schema & Constraints

The database runs PostgreSQL 16 on port `5433` (via Docker Compose) with `btree_gist` extension:
- **`Appointment_no_overlap` Exclusion Constraint:**
  ```sql
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap"
    EXCLUDE USING gist (
      "businessId" WITH =,
      tsrange("startTime", "endTime") WITH &&
    ) WHERE ("status" IN ('PENDING', 'CONFIRMED'));
  ```
- **Integrity Invariants Tested and Verified:**
  - Active appointments overlapping in time for the same business are rejected at the database engine level.
  - Adjacent appointments (e.g. 10:00-10:30 and 10:30-11:00) succeed.
  - Cancelled appointments do not block the slot.
  - Violations are mapped to application `APPOINTMENT_CONFLICT` errors with HTTP status 409.

---

## 5. Security & Isolation Requirements

- **Tenant Boundary:** Every appointment and customer query filters by `businessId`. Users can only access businesses for which they hold a `BusinessMember` record.
- **Stateless Authentication with HttpOnly Cookies:** Next.js manages an `HttpOnly`, `SameSite=Lax`, `Secure` cookie (`opspilot_token`), injecting Bearer JWTs to the Express backend.
- **Authoritative Durations:** Appointment end times are computed authoritatively on the server from the service record duration; client-submitted end times are never trusted.
- **Cancellation Notice Protection:** Reschedules and cancellations are prohibited within the business's `cancellationNoticeHours` window.
