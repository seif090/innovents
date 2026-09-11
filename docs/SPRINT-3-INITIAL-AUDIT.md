# INOVENT — Sprint 3 Initial Audit

**Date:** 2026-09-11  
**Auditors:** Lead Backend Architect, Security Engineer, Database Architect, QA Engineer  
**Scope:** Pre-execution audit of Sprint 1 & Sprint 2 foundations and domain readiness for Sprint 3 (Events, Agenda & Sessions Management)  
**Authoritative Specifications:** `INOVENT_MVP_BRD_v2.docx`, `INOVENT_DataReq_AR_v2.docx`

---

## 1. Current Repository State

- **Monolith Baseline:** NestJS 10.4.15, TypeScript 5.8.2 (strict mode), PostgreSQL 16 via Prisma ORM 6.4.1, Redis 7 (ioredis 5.6.0), BullMQ 5.41.6, Helmet, Winston logger, class-validator/class-transformer.
- **Sprint 1 Infrastructure:** Fully operational (`DatabaseModule`, `CacheModule`, `QueueModule`, `StorageModule`, `EmailModule`, `PaymentsModule`, `RealtimeModule`, `AuditModule`, `OutboxModule`, `HealthModule`).
- **Sprint 2 Identity Foundation:** Fully verified and committed (`354c4e6`):
  - `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshToken`, `OtpChallenge`.
  - Password hashing with bcryptjs (12 salt rounds).
  - Short-lived JWT access tokens (15m) and single-use rotating refresh tokens (48-byte) with token family reuse detection.
  - Global `JwtAuthGuard` (respects `@Public()`).
  - `RolesGuard` with administrative override.
  - `PermissionsGuard` and `ResourceOwnerGuard`.
  - Clean test suites (9 unit suites / 47 tests; 2 E2E suites / 15 tests; 100% passing).
- **Git Branch:** `main` (clean working directory, root commit `a845afb` + Sprint 2 `354c4e6`).

---

## 2. Sprint 1 Capabilities Available for Reuse

| Capability | Location | Reuse in Sprint 3 |
|---|---|---|
| **`PrismaService`** | `src/database/prisma.service.ts` | Database queries and interactive transactions (`$transaction`) |
| **`AuditService`** | `src/modules/audit/audit.service.ts` | Audit logging for all Event, Registration, Session, Speaker, and Venue mutations |
| **`OutboxService`** | `src/modules/outbox/outbox.service.ts` | Transactional event publishing (`EVENT_CREATED`, `EVENT_PUBLISHED`, `REGISTRATION_CREATED`, etc.) |
| **`QueueService`** | `src/infrastructure/queue/queue.service.ts` | Scheduling 15-minute session reminders on `QUEUE_NAMES.REMINDERS` |
| **`RedisService`** | `src/infrastructure/cache/redis.service.ts` | Rate-limiting storage and query caching if needed |
| **`StorageService`** | `src/infrastructure/storage/storage.interface.ts` | Presigned URL generation and asset reference handling for event banners and logos |
| **Global Pipeline** | `src/common/` | `HttpExceptionFilter`, `TransformInterceptor`, `createGlobalValidationPipe`, `RequestIdMiddleware` |

---

## 3. Sprint 2 Capabilities Available for Reuse

| Capability | Location | Reuse in Sprint 3 |
|---|---|---|
| **`JwtAuthGuard`** | `src/modules/auth/guards/jwt-auth.guard.ts` | Secures non-public endpoints; populates `request.user` with `sub`, `email`, `roles`, `permissions` |
| **`@CurrentUser`** | `src/modules/auth/decorators/current-user.decorator.ts` | Extracts authenticated userId (`sub`) in controllers without trusting route parameters |
| **`@Roles` & `RolesGuard`** | `src/modules/auth/guards/roles.guard.ts` | Restricts Event creation to `EVENT_OWNER` and `ADMIN` |
| **`@Public`** | `src/modules/auth/decorators/public.decorator.ts` | Allows unauthenticated public discovery of published events and agendas |
| **`AccountStatus`** | `prisma/schema.prisma` | Verifies event owners are in `ACTIVE` status (rejects `PENDING`, `SUSPENDED`, `DEACTIVATED`) |

---

## 4. Existing Prisma Conventions & Alignment

- **Primary Keys:** UUID v4 `@id @default(uuid()) @db.Uuid`.
- **Foreign Keys:** `@db.Uuid` mapped to snake_case column names (e.g. `@map("event_id")`).
- **Table Names:** Plural snake_case via `@@map("table_names")` (e.g. `events`, `event_registrations`, `sessions`, `speakers`, `venues`).
- **Timestamps:** UTC with microsecond precision `@db.Timestamptz(6)`.
- **Soft Deletion:** Nullable `deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)`.
- **Indexes:** Explicit indexes on lookup columns, foreign keys, and query filters (`@@index`).

---

## 5. Existing Authorization Mechanisms & Extension to Events

- **Role Guard (`RolesGuard`):** Confirms caller has `EVENT_OWNER` or `ADMIN` role.
- **Resource Authorization Gap:** A user with role `EVENT_OWNER` must only manage their *own* events. An `ORGANIZER` must only manage events to which they are explicitly assigned via `EventOrganizer`.
- **Solution:** Implement `EventAuthorizationService` (and supporting guard) that verifies:
  1. `ADMIN` has universal management override.
  2. `EVENT_OWNER` is the event's `ownerId`.
  3. `ORGANIZER` has an active record in `event_organizers` for that `eventId`.
  4. Non-managers receive HTTP 403 Forbidden (or HTTP 404 for drafts/private events to prevent enumeration).

---

## 6. Registration Concurrency Strategy & Capacity Correctness

- **Challenge:** Two or more simultaneous registration requests when capacity = 1 must not both succeed.
- **Strategy:** PostgreSQL row-level exclusive lock (`FOR UPDATE`) within a Prisma interactive transaction (`tx.$queryRaw` or serializable isolation):
  ```sql
  SELECT id, capacity, status FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE;
  ```
- **Atomicity:**
  1. Lock Event row exclusively.
  2. Validate event status (`PUBLISHED`), dates (not ended), and visibility.
  3. Count active registrations (`status = 'REGISTERED'`).
  4. If `count >= capacity`, throw HTTP 409 Conflict ("Event capacity reached").
  5. Check existing registration for user:
     - If active -> throw HTTP 409 Conflict ("Already registered").
     - If cancelled -> update status to `REGISTERED`, clear `cancelledAt`.
     - Else -> create registration.
  6. Enqueue Outbox event `EVENT_REGISTRATION_CREATED` within same transaction.
  7. Commit transaction.

---

## 7. Agenda, Sessions, Speakers & Venues Architecture

- **Event Aggregate Boundary:**
  - `Session`, `Speaker`, `Venue` are child entities scoped strictly to an `Event`.
  - A session can only reference a venue from the *same* event (`session.venue.eventId === session.eventId`).
  - A speaker assigned to a session must belong to the *same* event.
  - Cross-event IDOR attempts (e.g. `/events/A/sessions/session-from-event-B`) are strictly rejected.
- **Attendee Schedule & Notes:**
  - `UserSessionSchedule`: Unique `(userId, sessionId)`.
  - `UserSessionNote`: Unique `(userId, sessionId)`. Private to author; never exposed to other attendees.
- **Reminder Queue:**
  - BullMQ job scheduled on `reminders-queue` with delay `startsAt - 15 minutes`.
  - Idempotent job ID: `session-reminder-${userId}-${sessionId}`.

---

## 8. Identified Inconsistencies & Pre-Implementation Decisions

1. **Event Types:** BRD / DataReq specify 6 event types: Conference, Exhibition, Summit, Workshop, Festival, Networking. Implemented as Prisma enum `EventType`.
2. **Event Visibility:** `PUBLIC` vs `PRIVATE`. Implemented as Prisma enum `EventVisibility`.
3. **Event Status:** Explicit state machine: `DRAFT` -> `PUBLISHED` -> `ONGOING` -> `COMPLETED` / `CANCELLED`.
4. **Session Overlap Policy:** Parallel tracks are permitted (standard for multi-track conferences), but a single venue cannot host two overlapping sessions.
5. **Soft Delete Policy:** Queries in services must filter `deletedAt: null`.

---

## 9. Implementation Plan & Phases

- **Phase 1:** Complete initial audit documentation (this document).
- **Phase 2:** Database schema design and Prisma migration for Events, Registrations, Sessions, Speakers, Venues, Organizers, Schedules, Notes.
- **Phase 3:** Create `src/modules/events/` module structure:
  - DTOs (validation with class-validator).
  - `EventAuthorizationService` & `EventOwnerGuard`.
  - `EventsService` & `EventsController`.
  - `EventRegistrationService` & `EventRegistrationController`.
  - `SessionsService` & `SessionsController`.
  - `SpeakersService` & `SpeakersController`.
  - `VenuesService` & `VenuesController`.
  - `AttendeeScheduleService` & `AttendeeScheduleController`.
- **Phase 4:** BullMQ 15-minute session reminder integration and Outbox events.
- **Phase 5:** Comprehensive automated testing:
  - Unit tests for all services.
  - Concurrency tests for capacity and duplicate registrations.
  - Integration/E2E test suite (`test/events.e2e-spec.ts`) covering all 42 required scenarios.
- **Phase 6:** Full verification gates (`lint`, `format:check`, `typecheck`, `test`, `test:e2e`, `build`, `prisma validate`).
- **Phase 7:** Documentation: `docs/INOVENT_SPRINT_3_REPORT.md` and `walkthrough.md`.
