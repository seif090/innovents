# Sprint 6 Implementation Plan — B2B Portal, Business Accounts, Admin Approval & Organizer Invitation Foundation

## 1. Executive Summary & Findings

### 1.1 Context & Baseline
- Baseline verified:
  - 32 Unit Test Suites, 216 Unit Tests (100% pass)
  - 6 E2E Test Suites, 99 E2E Tests (100% pass)
  - Strict TypeScript check (`tsc --noEmit`), ESLint (0 errors/warnings), Prettier formatting (100%), NestJS production build (`nest build`), and Prisma validation (`prisma validate`) all pass cleanly.
- Current State Analysis:
  - Identity & Roles: System supports `ADMIN`, `ATTENDEE`, `SPONSOR`, `VENDOR`, `PROVIDER`, `EVENT_OWNER`, `ORGANIZER`, `MEDIA`.
  - Account Statuses: `PENDING`, `ACTIVE`, `REJECTED`, `SUSPENDED`, `DEACTIVATED`.
  - Self-Registration: Attendees become `ACTIVE` upon OTP email verification. Business roles (`SPONSOR`, `VENDOR`, `PROVIDER`, `MEDIA`) verify email but remain `PENDING` awaiting administrative approval. `ORGANIZER` self-registration is explicitly blocked.
  - Event Management: `EventOrganizer` junction table exists. `EventAuthorizationService` enforces `ADMIN` override, `EVENT_OWNER` ownership, and assigned `ORGANIZER` scope.
  - Communication Platform: Sprint 5 established transactional Outbox (`ACCOUNT_APPROVED`, `ACCOUNT_REJECTED`, `ACCOUNT_SUSPENDED`), BullMQ queues, localized email templates (`EmailTemplateService`), and real-time Socket.IO notifications.

### 1.2 Sprint 6 Objectives
1. **Business Profile Foundation**:
   - Create profile entities for `AttendeeProfile`, `SponsorProfile`, `VendorProfile`, `ProviderProfile`, `EventOwnerProfile`, `OrganizerProfile`, `MediaProfile`.
   - Maintain 1-to-1 relations to `User` with UUID primary keys, proper indexes, and timestamps.
   - Enforce strict separation between private own profiles, business details, public safe profiles, and administrative inspection.
2. **Admin Approval Workflow**:
   - Administrative endpoints (`/api/v1/admin/approvals`) to view pending applications, inspect complete profile graphs, approve, reject (with mandatory reason), suspend, and reactivate accounts.
   - Atomic database transactions with row-level locks to guarantee concurrency safety and eliminate race conditions.
   - Full audit logging (`BUSINESS_ACCOUNT_APPROVED`, `BUSINESS_ACCOUNT_REJECTED`, etc.) and transactional outbox event emission (`ACCOUNT_APPROVED`, `ACCOUNT_REJECTED`, `ACCOUNT_SUSPENDED`).
3. **Organizer Invitation Foundation**:
   - Organizers cannot self-register; they must be invited by an authorized `EVENT_OWNER` (or `ADMIN`) for a specific event.
   - Secure invitation model: cryptographically random 256-bit token, hashed at rest (`SHA-256`), single-use, time-limited, revocable.
   - Invitation email dispatched through transactional outbox and `EmailTemplateService` (English LTR and Arabic RTL).
   - Atomic acceptance endpoint (`/api/v1/organizer-invitations/accept`): verifies token hash, verifies event validity, creates/links user, assigns `ORGANIZER` role, establishes `EventOrganizer` junction record, and marks invitation `ACCEPTED`.
4. **Public Profile Safety & Anti-Enumeration**:
   - Public business profile endpoint (`/api/v1/public/businesses/:id`): strictly returns active, approved businesses without leaking email, phone, authentication metadata, or internal review notes. Non-active or non-existent accounts return 404 to prevent enumeration.

---

## 2. Architecture & Affected Modules

```
src/
├── database/
│   └── prisma/
│       ├── schema.prisma                  # Add profile models & OrganizerInvitation
│       └── migrations/                    # New Sprint 6 migration
├── modules/
│   ├── admin-approvals/                   # [NEW MODULE]
│   │   ├── admin-approvals.module.ts
│   │   ├── controllers/
│   │   │   └── admin-approvals.controller.ts
│   │   ├── services/
│   │   │   └── admin-approvals.service.ts
│   │   └── dto/
│   │       ├── approval-query.dto.ts
│   │       ├── reject-account.dto.ts
│   │       ├── suspend-account.dto.ts
│   │       └── approval-response.dto.ts
│   ├── business-profiles/                 # [NEW MODULE]
│   │   ├── business-profiles.module.ts
│   │   ├── controllers/
│   │   │   ├── business-profiles.controller.ts
│   │   │   └── public-profiles.controller.ts
│   │   ├── services/
│   │   │   └── business-profiles.service.ts
│   │   └── dto/
│   │       ├── update-profile.dto.ts
│   │       ├── own-profile.dto.ts
│   │       ├── public-profile.dto.ts
│   │       └── admin-profile.dto.ts
│   ├── organizer-invitations/             # [NEW MODULE]
│   │   ├── organizer-invitations.module.ts
│   │   ├── controllers/
│   │   │   └── organizer-invitations.controller.ts
│   │   ├── services/
│   │   │   └── organizer-invitations.service.ts
│   │   └── dto/
│   │       ├── create-invitation.dto.ts
│   │       ├── accept-invitation.dto.ts
│   │       └── invitation-response.dto.ts
│   ├── notifications/
│   │   └── providers/email/
│   │       └── email-template.service.ts  # Add organizer invitation template (EN + AR)
│   ├── events/
│   │   └── services/
│   │       └── event-authorization.service.ts # Invitation ownership helper
│   └── app.module.ts                      # Register new modules
```

---

## 3. Database Schema Design (Prisma)

### 3.1 New Enums
```prisma
enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED

  @@map("invitation_status")
}
```

### 3.2 User Approval Metadata
Extend `User` model:
- `approvedAt`: `DateTime? @map("approved_at") @db.Timestamptz(6)`
- `approvedByUserId`: `String? @map("approved_by_user_id") @db.Uuid`
- `rejectedAt`: `DateTime? @map("rejected_at") @db.Timestamptz(6)`
- `rejectionReason`: `String? @map("rejection_reason") @db.Text`
- `suspendedAt`: `DateTime? @map("suspended_at") @db.Timestamptz(6)`
- `suspensionReason`: `String? @map("suspension_reason") @db.Text`
- Relations to profile models and invitations.

### 3.3 Profile Models
- `AttendeeProfile`: `firstName`, `lastName`, `avatarUrl`, `bio`, `jobTitle`, `company`, `interests`, `city`, `country`, `socialLinks`.
- `SponsorProfile`: `companyName`, `logoUrl`, `website`, `description`, `industry`, `tier`, `contactName`, `contactEmail`, `contactPhone`, `address`, `city`, `country`, `documents`.
- `VendorProfile`: `companyName`, `logoUrl`, `website`, `description`, `serviceCategory`, `contactName`, `contactEmail`, `contactPhone`, `crNumber`, `taxNumber`, `documents`, `address`, `city`, `country`.
- `ProviderProfile`: `businessName`, `logoUrl`, `website`, `description`, `providerType`, `skills`, `contactName`, `contactEmail`, `contactPhone`, `portfolioUrl`, `city`, `country`.
- `EventOwnerProfile`: `organizationName`, `logoUrl`, `website`, `description`, `contactName`, `contactEmail`, `contactPhone`, `city`, `country`.
- `OrganizerProfile`: `firstName`, `lastName`, `avatarUrl`, `jobTitle`, `organization`, `phone`.
- `MediaProfile`: `mediaOutlet`, `outletType`, `logoUrl`, `website`, `pressCardNumber`, `contactName`, `contactEmail`, `contactPhone`, `coverageInterests`.

### 3.4 OrganizerInvitation Model
```prisma
model OrganizerInvitation {
  id               String           @id @default(uuid()) @db.Uuid
  eventId          String           @map("event_id") @db.Uuid
  eventOwnerId     String           @map("event_owner_id") @db.Uuid
  email            String           @db.VarChar(255)
  tokenHash        String           @unique @map("token_hash") @db.VarChar(64)
  status           InvitationStatus @default(PENDING)
  expiresAt        DateTime         @map("expires_at") @db.Timestamptz(6)
  acceptedAt       DateTime?        @map("accepted_at") @db.Timestamptz(6)
  revokedAt        DateTime?        @map("revoked_at") @db.Timestamptz(6)
  acceptedByUserId String?          @map("accepted_by_user_id") @db.Uuid
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  event            Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventOwner       User             @relation("CreatedOrganizerInvitations", fields: [eventOwnerId], references: [id], onDelete: Restrict)
  acceptedByUser   User?            @relation("AcceptedOrganizerInvitations", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([eventId, status])
  @@index([email])
  @@index([tokenHash])
  @@index([expiresAt])
  @@map("organizer_invitations")
}
```

---

## 4. State Machines

### 4.1 Account Approval State Machine
```
[Registration] ──► PENDING (Email unverified)
                      │
                      ▼ (Email OTP Verified)
                   PENDING (Email verified)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
     ACTIVE                      REJECTED
   (Approved)                   (With Reason)
        │                            │
        ▼ (Violation)                ▼ (Re-review)
    SUSPENDED ─────────────────► ACTIVE
  (Tokens Revoked)             (Reactivated)
```

### 4.2 Organizer Invitation State Machine
```
[Event Owner invites] ──► PENDING (Expires in 7 days)
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
        ACCEPTED          EXPIRED          REVOKED
    (Role assigned +    (Now > expiresAt)  (By Owner/Admin)
   EventOrganizer added)
```

---

## 5. Authorization Matrix

| Endpoint | Role Required | Resource Ownership Rule |
|:---|:---|:---|
| `GET /api/v1/profile` | Any Authenticated | Own profile (`userId = currentUser.sub`) |
| `PATCH /api/v1/profile` | Any Authenticated | Own profile (`userId = currentUser.sub`) |
| `GET /api/v1/public/businesses/:id` | Public (No auth required) | Account must be `ACTIVE` |
| `GET /api/v1/public/users/:id` | Public (No auth required) | Account must be `ACTIVE` |
| `GET /api/v1/admin/approvals` | `ADMIN` | Global |
| `GET /api/v1/admin/approvals/:id` | `ADMIN` | Global |
| `POST /api/v1/admin/approvals/:id/approve` | `ADMIN` | Global |
| `POST /api/v1/admin/approvals/:id/reject` | `ADMIN` | Global |
| `POST /api/v1/admin/approvals/:id/suspend` | `ADMIN` | Global |
| `POST /api/v1/admin/approvals/:id/reactivate`| `ADMIN` | Global |
| `POST /api/v1/events/:eventId/organizer-invitations` | `ADMIN`, `EVENT_OWNER` | Must be owner of `eventId` |
| `GET /api/v1/events/:eventId/organizer-invitations` | `ADMIN`, `EVENT_OWNER` | Must be owner of `eventId` |
| `POST /api/v1/organizer-invitations/:id/revoke` | `ADMIN`, `EVENT_OWNER` | Must be owner of the invitation's event |
| `POST /api/v1/organizer-invitations/accept` | Public / Invitee | Must provide valid, unexpired token |

---

## 6. Notification & Outbox Integration

1. `ACCOUNT_APPROVED`:
   - Enqueued in outbox upon approval or reactivation.
   - Outbox processor delivers email and push notification to user.
2. `ACCOUNT_REJECTED`:
   - Enqueued in outbox upon rejection with sanitized rejection reason.
3. `ACCOUNT_SUSPENDED`:
   - Enqueued in outbox upon suspension; simultaneously revokes active refresh tokens.
4. `ORGANIZER_INVITATION_CREATED`:
   - Outbox event enqueued atomically when invitation is created.
   - Dispatches bilingual invitation email (Arabic RTL / English LTR) containing invitation link.

---

## 7. Security Hardening & Concurrency Protection

1. **Invitation Token Security**:
   - Generated with `CryptoUtil.generateRandomToken(32)` (256-bit entropy).
   - Only `SHA-256` token hash is persisted in the database.
   - Token is never logged, never exposed in subsequent GET requests, and invalidated immediately upon acceptance.
2. **Double-Acceptance & Race Conditions**:
   - `prisma.$transaction` with row-level lock ensures concurrent acceptance attempts result in exactly 1 winner; all other concurrent calls receive `ConflictException` or `BadRequestException`.
3. **Double-Approval Concurrency**:
   - Idempotent approval: repeated approve requests return current active state without duplicate notifications or audit entries.
4. **Data Leakage Elimination**:
   - Public DTOs explicitly strip `email`, `phone`, `passwordHash`, `isEmailVerified`, internal status metadata, and audit records.
5. **Anti-Enumeration**:
   - Non-active business profiles return generic 404.

---

## 8. Migration & Verification Strategy

1. Add models to `prisma/schema.prisma`.
2. Generate migration via Prisma migrate.
3. Implement services, DTOs, controllers, and modules.
4. Write comprehensive unit test suites:
   - `admin-approvals.service.spec.ts`
   - `business-profiles.service.spec.ts`
   - `organizer-invitations.service.spec.ts`
5. Write end-to-end integration test suite `test/b2b-portal.e2e-spec.ts`.
6. Run full verification gates (`typecheck`, `lint`, `format:check`, `test`, `test:e2e`, `build`).
7. Generate `docs/sprints/sprint-6-final-report.md`.
