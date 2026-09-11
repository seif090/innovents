# INOVENT — Architecture Blueprint

**Version:** 1.0 (Sprint 1 Baseline)  
**System Type:** Modular Monolith  
**Author:** Lead Backend Architect

---

## 1. Architectural Philosophy: Modular Monolith

INOVENT is implemented as a **Modular Monolith**. Rather than introducing premature distributed systems complexity (microservices network hops, distributed transactions, service discovery overhead) before product-market fit, the system achieves isolation through rigorous modular boundaries inside a unified NestJS application.

### Key Rules
1. **Module Self-Containment:** Every module owns its controllers, DTOs, business logic, data access, and domain-level authorization rules.
2. **No Cross-Module Database Manipulation:** Modules must not directly modify or query other modules' private data stores.
3. **Decoupled Infrastructure Abstractions:** External systems (SMTP, S3, Stripe, Redis) are accessed strictly through interfaces (`EmailProvider`, `StorageService`, `PaymentProvider`).
4. **Future Microservices Extraction:** When high-load domains (e.g. Chat or In-App Ads) warrant independent scaling, they can be extracted as standalone services with minimal refactoring.

---

## 2. Layered Organization

```text
src/
  common/             # Cross-cutting primitives: DTOs, Enums, Filters, Guards, Interceptors, Pipes
  config/             # Strongly typed environment configuration and validation
  database/           # Prisma ORM client service, connection management, lifecycle
  infrastructure/     # Concrete adapter implementations for external services
    cache/            # Redis connection, caching, distributed locks
    email/            # SMTP/Nodemailer provider
    queue/            # BullMQ worker and queue managers
    realtime/         # Socket.IO gateway with Redis horizontal adapter
    storage/          # S3/MinIO signed URL and upload provider
    payments/         # PaymentProvider interface & checkout abstraction
  modules/            # Business domain modules
    health/           # Liveness & readiness probes
    audit/            # Immutable audit logging service
    outbox/           # Transactional outbox event service
  jobs/               # Scheduled cron tasks and background processors
```

---

## 3. Infrastructure Abstractions

### 3.1 Caching & Message Broker (Redis 7)
- Encapsulated in `RedisService`.
- Used for ephemeral state: session tokens, OTP verification limits, rate limit tracking, Socket.IO adapter scaling, and BullMQ backing store.
- Never serves as the primary source of truth for persistent business entities.

### 3.2 Asynchronous Queues (BullMQ)
- Handled through `QueueService`.
- Core queues established in Sprint 1:
  - `email-queue`: Asynchronous OTP, verification, and alert emails.
  - `notifications-queue`: In-app and push notification distribution.
  - `reminders-queue`: Session reminders (15m prior to start).
  - `analytics-queue`: Asynchronous view/click metrics rollups.
  - `cleanup-queue`: Expired tokens and abandoned drafts garbage collection.
  - `payments-queue`: Idempotent webhook event settlement.

### 3.3 Object Storage (`StorageService`)
- Encapsulates S3-compatible APIs.
- Local development utilizes **MinIO**; staging/production utilizes **AWS S3** or **Cloudflare R2**.
- Private assets (commercial registrations, press cards) are restricted and accessible only via time-bounded signed URLs.

### 3.4 Payment Provider (`PaymentProvider`)
- Sprint 1 establishes the interface abstraction for checkout sessions and webhook verification.
- Sprint 9 integrates Stripe through this interface without domain coupling.

---

## 4. Resilience & Reliability Patterns

### 4.1 Transactional Outbox Pattern
To prevent dual-write failure (e.g. a database transaction succeeds but an external notification fails), domain mutations write events to `outbox_events` in the same ACID transaction. Asynchronous workers consume from this table with idempotency guarantees.

### 4.2 Correlation & Request Tracing
Every request is stamped with a UUID v4 `x-request-id` via `RequestIdMiddleware`. This identifier is:
- Bound to the request lifecycle.
- Propagated to response headers.
- Emitted in structured JSON logs.
- Included in all error responses for client-side support reporting.

---

## 5. Future Extraction Strategy

When traffic justifies extracting a domain (e.g. Chat & Real-time in Sprint 5):
1. The module's internal services become an independent NestJS application or microservice.
2. In-process calls are migrated to gRPC or BullMQ event publishing.
3. Database schemas remain normalized and can be partitioned to separate databases without redesigning business domain models.

---

## 6. Communities, Meetups & Social Layer Architecture (Sprint 4)

### 6.1 Community Aggregate Design
The Communities module (`src/modules/communities/`) provides an event-scoped social networking and mini-event layer:
- **Free vs. Sponsored Communities:** Free communities are strictly capped at 20 members (`FREE_COMMUNITY_MAX_MEMBERS`), while Sponsored communities support enterprise scale with configurable capacity (default 100).
- **Sub-domains:**
  - **Memberships:** Role-based membership (`OWNER`, `MODERATOR`, `SPEAKER`, `MEMBER`) with status tracking (`ACTIVE`, `BANNED`, `LEFT`).
  - **Posts & Feeds:** Rich content posts (10–2,000 characters) with media attachments and pinning support.
  - **Threaded Nested Replies:** Self-referential reply tree structure (`parentId`) supporting arbitrary hierarchy.
  - **Likes:** Idempotent toggle operations on posts and replies with atomic counter maintenance.
  - **@Mentions:** Regex-extracted username mentions persisted for asynchronous notification triggers.
  - **Mini Events / Meetups:** Localized community gatherings with date boundary checks against parent events and participant capacity controls.
  - **Realtime Room Chat:** Ephemeral and persisted chat messaging scoped per community.

### 6.2 Concurrency Locking Patterns
To eliminate race conditions and prevent over-subscription under high concurrency:
- **Member Join Serialization:** Row-level exclusive lock (`SELECT id, status, visibility, member_capacity, member_count FROM communities WHERE id = $1::uuid FOR UPDATE`) ensures member count checks and join actions are serialized.
- **Meetup Attendance Serialization:** Row-level exclusive lock (`SELECT id, status, max_participants FROM community_meetups WHERE id = $1::uuid FOR UPDATE`) ensures meetup participant capacity limits are strictly enforced.

### 6.3 Realtime WebSocket Gateway Architecture
- **Namespace:** `/communities` powered by `@nestjs/websockets` and Socket.IO.
- **Authentication:** Bearer JWT validated during connection handshake using `TokenService`. Unauthenticated sockets are rejected immediately (`disconnect(true)`).
- **Room Authorization:** Socket joins (`join_community`) verify that the authenticated user is an active member of the target community before binding them to room `community:${communityId}`.
- **Message Dispatch:** Chat messages received over WebSockets are validated, persisted to PostgreSQL via `CommunityChatService`, and broadcast in realtime to the community room (`new_message`).

