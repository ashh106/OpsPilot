# OpsPilot — Architecture Specification

## 1. Full-Stack Architecture & Integration

```
                               OPSPILOT FULL-STACK ARCHITECTURE

   Browser Client (React 19)
        │
        │ Calls same-origin Next.js Route Handlers
        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │                    Next.js 16 (App Router) — :3001                     │
   │                                                                        │
   │   Components: AppShell, Appointments, Services, Hours, Settings        │
   │   State: React AuthContext (user, activeBusiness, businesses)          │
   │                                                                        │
   │   Route Handlers:                                                      │
   │   • /api/auth/[action]  ──> Manages `opspilot_token` HttpOnly cookie    │
   │   • /api/proxy/[...path] ──> Injects `Bearer <token>` & proxies        │
   └────────────────────────────────────┬───────────────────────────────────┘
                                        │ HTTP Proxy (Server-to-Server)
                                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │                       Express 5 Web API — :4000                        │
   │                                                                        │
   │   [Helmet] ──> [CORS] ──> [Rate Limiter] ──> [requireAuth Middleware]   │
   │                                                        │               │
   │   ┌────────────────────┬───────────────────────────────┴──────────┐    │
   │   ▼                    ▼                                          ▼    │
   │ Auth Routes       Business Routes                             Health   │
   │ (/api/auth)       (/api/businesses)                         (/api/health)
   │   │                    │                                          │    │
   │   ▼                    ▼                                          │    │
   │ AuthService       BusinessService                                 │    │
   │                   ├── AvailabilityService (Timezone, slots)       │    │
   │                   └── AppointmentService (Lifecycle, 409 guard)   │    │
   │                        │                                          │    │
   │                        ▼                                          │    │
   │                   Prisma Client (PrismaPg adapter)                │    │
   └────────────────────────┼──────────────────────────────────────────┘    │
                            │                                               │
                            ▼                                               ▼
               PostgreSQL 16 Engine (:5433)                    PostgreSQL Test DB
               • btree_gist extension                          (opspilot_test)
               • EXCLUDE USING gist (Appointment_no_overlap)
```

---

## 2. Timezone & Availability Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend / AI Agent
    participant Route as Express Appointment Route
    participant Avail as AvailabilityService
    participant Timezone as Timezone Utility
    participant DB as PostgreSQL

    Client->>Route: GET /businesses/:id/appointments/availability?serviceId=S1&date=2026-10-29
    Route->>Avail: calculateAvailability({ businessId, serviceId, date })
    Avail->>DB: Fetch business.timezone & service.durationMinutes
    Avail->>Timezone: getWeekdayForDate("2026-10-29", timezone)
    Avail->>DB: Fetch BusinessHours for weekday
    Avail->>Timezone: parseZonedTime(date, openTime) & parseZonedTime(date, closeTime)
    Avail->>DB: Fetch active appointments overlapping (openUtc, closeUtc)
    loop Every candidate slot interval
        Avail->>Timezone: isOverlapping(candidateSlot, bookedAppointment)
        alt No overlap & slot > now
            Avail->>Avail: Add to available slots
        end
    end
    Avail-->>Client: 200 { date, timezone, slots: [{ localStartTime, localEndTime, startTime, endTime }] }
```

---

## 3. Concurrency Protection & Conflict Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User1 as Customer A
    actor User2 as Customer B
    participant API as Express API
    participant PG as PostgreSQL (btree_gist)

    Note over User1,User2: Both see 10:00 AM slot open and book simultaneously
    User1->>API: POST /appointments { startTime: 10:00 }
    User2->>API: POST /appointments { startTime: 10:00 }

    API->>PG: INSERT INTO "Appointment" (User 1)
    PG-->>API: 201 Created (Transaction A commits)

    API->>PG: INSERT INTO "Appointment" (User 2)
    Note over PG: Exclusion constraint detects tsrange overlap!
    PG-->>API: Postgres Error 23P01 (Exclusion violation)
    API-->>User2: 409 Conflict { error: { code: "APPOINTMENT_CONFLICT", message: "Slot already booked" } }
```

---

## 4. Frontend / Backend Contract Alignment

| Next.js Screen | Express Backend Endpoint | Method | Status |
| :--- | :--- | :--- | :--- |
| **Login / Register** | `/api/auth/login`, `/api/auth/register` | `POST` | Verified & Active |
| **User Session** | `/api/auth/me` | `GET` | Verified & Active |
| **Business Selection** | `/api/businesses` | `GET`, `POST` | Verified & Active |
| **Business Settings** | `/api/businesses/:id` | `GET`, `PATCH` | Verified & Active |
| **Services Catalog** | `/api/businesses/:id/services` | `GET`, `POST` | Verified & Active |
| **Working Hours** | `/api/businesses/:id/hours` | `GET`, `PUT` | Verified & Active |
| **Availability Lookup** | `/api/businesses/:id/appointments/availability` | `GET` | Verified & Active (Milestone 2) |
| **Appointments List** | `/api/businesses/:id/appointments` | `GET` | Verified & Active (Milestone 2) |
| **Book Appointment** | `/api/businesses/:id/appointments` | `POST` | Verified & Active (Milestone 2) |
| **Reschedule Appointment**| `/api/businesses/:id/appointments/:id` | `PATCH` | Verified & Active (Milestone 2) |
| **Cancel Appointment** | `/api/businesses/:id/appointments/:id/cancel` | `POST` | Verified & Active (Milestone 2) |
| **Customer Directory** | `/api/businesses/:id/customers` | `GET` | Verified & Active (Milestone 2) |
| **AI Conversations** | `/api/businesses/:id/conversations` | `GET` | Milestone 3 & 4 |
| **Approvals** | `/api/businesses/:id/approvals` | `GET` | Milestone 3 |
| **Activity Feed** | `/api/businesses/:id/activity` | `GET` | Milestone 4 |

---

## 5. WhatsApp Business Cloud API & Agent Orchestration Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Customer as WhatsApp User
    participant Meta as Meta Graph API / Cloud API
    participant Webhook as Express Webhook (/api/webhook/whatsapp)
    participant Sec as Security Verifier (HMAC-SHA-256)
    participant Inbox as PostgreSQL WebhookInbox
    participant Orchestrator as AgentOrchestrator
    participant Tool as Tool Registry
    participant WhatsAppClient as WhatsApp Outbound Client

    Customer->>Meta: "Can I book a checkup tomorrow at 10 AM?"
    Meta->>Webhook: POST /api/webhook/whatsapp (X-Hub-Signature-256)
    Webhook->>Sec: verifyWebhookSignature(req.rawBody, signature, secret)
    alt Signature Invalid
        Sec-->>Webhook: false
        Webhook-->>Meta: 401 Unauthorized
    else Signature Valid
        Sec-->>Webhook: true
        Webhook->>Inbox: INSERT INTO "WebhookInbox" (providerMessageId = wamid)
        alt Duplicate wamid (P2002)
            Inbox-->>Webhook: Unique violation (Already processed)
            Webhook-->>Meta: 200 OK (Duplicate ignored)
        else New Message
            Webhook->>Orchestrator: processMessage({ businessId, customerMessage, customerPhone })
            loop Bounded Loop (max 5 iterations)
                Orchestrator->>Tool: execute("check_availability" / "book_appointment")
                Tool-->>Orchestrator: Tool Result (slots / appointment created)
            end
            Orchestrator-->>Webhook: { reply: "Your appointment is confirmed for tomorrow 10:00 AM." }
            Webhook->>WhatsAppClient: sendTextMessage(to, reply)
            WhatsAppClient->>Meta: POST /v26.0/{phone_number_id}/messages
            Meta-->>WhatsAppClient: 200 { messages: [{ id: "wamid.OUT..." }] }
            Webhook->>Inbox: UPDATE status = 'PROCESSED'
            Webhook-->>Meta: 200 OK { success: true }
        end
    end
```
