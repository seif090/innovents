# Sprint 10 Implementation Plan

## Admin Operations, Moderation, Reporting & Platform Hardening

### 1. Discovered Architecture & Existing Capabilities
- **Monolith Baseline**: NestJS modular monolith with strict TypeScript, PostgreSQL, Prisma ORM, Redis caching/locks, BullMQ queues, Socket.IO, and comprehensive event-driven outbox pattern.
- **Existing Admin Capabilities**:
  - `AdminApprovalsModule`: Handles business account applications (`/api/v1/admin/approvals`) with approve, reject, suspend, and reactivate workflows.
  - `PaymentsModule`: Admin revenue endpoint (`GET /api/v1/admin/revenue`), admin refunds (`POST /api/v1/admin/payments/:id/refund`), and payment reconciliation (`POST /api/v1/admin/payments/reconcile`).
  - `SponsorAdsModule`: Admin ad moderation (`GET /api/v1/admin/ads`, `POST /api/v1/admin/ads/:id/approve`, `POST /api/v1/admin/ads/:id/reject`).
  - `SubscriptionsModule`: Admin subscription directory (`GET /api/v1/admin/subscriptions`) and cancellation.
- **Identified Gaps to Address in Sprint 10**:
  - **No Unified Operational Dashboard**: Missing high-level system-wide operational KPIs and aggregate statistics across all domains.
  - **No Generic User Administration**: No `/api/v1/admin/users` to inspect, search, filter, activate, suspend, or reactivate arbitrary users.
  - **No Unified Content Moderation Endpoint**: Community posts, replies, meetups, services lack a centralized admin moderation interface.
  - **No User Flagging / Reporting System**: No mechanism for users to report abusive or violating content, and no admin workflow to resolve reports.
  - **Inaccessible Audit Logs**: `AuditLog` table exists and is populated, but lacks Admin query APIs (`/api/v1/admin/audit-logs`).
  - **No Operational Reporting**: Domain-level operational reporting (users, events, communities, marketplace) is missing.
  - **No Secure CSV Export Mechanism**: No sanitization or bounded streaming/export of platform operational data.

---

### 2. Design Decisions & Architectural Invariants

1. **Dedicated `AdminModule` and `ReportsModule`**:
   - Create a clean `src/modules/admin/` containing controllers and services for dashboard, users, moderation, audit logs, operational reports, and CSV exports.
   - Create `src/modules/reports/` for user-facing content reporting (`POST /api/v1/reports`) and admin report review/resolution (`/api/v1/admin/reports`).
2. **Reuse Existing Authoritative Domain Services**:
   - Operational revenue reports and financial figures will directly call `RevenueService` in `PaymentsModule`. Zero duplication of financial calculation logic.
   - User suspension will reuse `RefreshToken` revocation logic and audit logging.
3. **Database Schema Enhancements**:
   - Add `Report` model and enums (`ReportStatus`, `ReportTargetType`) to `prisma/schema.prisma`.
   - Add foreign keys to `User` as `reporter` and `resolvedBy`.
   - Add performance indexes on `[targetType, targetId]`, `reporterId`, `status`, and `createdAt`.
4. **CSV Formula Injection Defense**:
   - Implement `CsvExportUtil` enforcing RFC 4180 compliance while prefixing cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` with a single quote (`'`) to neutralize formula injection attacks in Microsoft Excel / Google Sheets.
   - Bound export sizes (default 1,000, max 5,000) to protect Node.js heap against memory exhaustion.
5. **Strict Admin Security & Self-Action Guard**:
   - Protect all admin endpoints with `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('ADMIN')`.
   - Prevent Admin self-suspension or self-deactivation to avoid accidental platform lockouts.
   - Protect against duplicate reporting abuse (rejecting new reports if user already has an active open report on the same target).
6. **Immutable Audit Trail**:
   - Provide read-only query access to audit logs. Mutation (UPDATE/DELETE) endpoints for audit logs are strictly forbidden.
   - Sanitize metadata in audit responses to prevent accidental leakage of sensitive tokens, secrets, or passwords.

---

### 3. Database Changes (`prisma/schema.prisma`)

#### New Enums
```prisma
enum ReportStatus {
  OPEN
  IN_REVIEW
  RESOLVED
  DISMISSED

  @@map("report_status")
}

enum ReportTargetType {
  COMMUNITY_POST
  COMMUNITY_REPLY
  COMMUNITY_MEETUP
  COMMUNITY_CHAT_MESSAGE
  EVENT
  COMMUNITY
  SPONSOR_AD
  C2B_SERVICE
  VENDOR_SERVICE
  USER

  @@map("report_target_type")
}
```

#### New Model
```prisma
model Report {
  id               String           @id @default(uuid()) @db.Uuid
  reporterId       String           @map("reporter_id") @db.Uuid
  targetType       ReportTargetType @map("target_type")
  targetId         String           @map("target_id") @db.Uuid
  reason           String           @db.VarChar(100)
  description      String?          @db.VarChar(1000)
  status           ReportStatus     @default(OPEN)
  resolvedByUserId String?          @map("resolved_by_user_id") @db.Uuid
  resolvedAt       DateTime?        @map("resolved_at") @db.Timestamptz(6)
  resolutionNote   String?          @map("resolution_note") @db.VarChar(1000)
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  reporter         User             @relation("UserReports", fields: [reporterId], references: [id], onDelete: Cascade)
  resolvedBy       User?            @relation("ResolvedReports", fields: [resolvedByUserId], references: [id], onDelete: SetNull)

  @@index([reporterId])
  @@index([targetType, targetId])
  @@index([status])
  @@index([createdAt])
  @@map("reports")
}
```

Migration: `prisma/migrations/20260913000000_sprint_10_admin_operations/migration.sql`

---

### 4. API Endpoints Specification

#### A. Admin Platform Overview (`AdminDashboardController`)
- `GET /api/v1/admin/dashboard`: Operational KPIs across Users, Events, Communities, Marketplace, Subscriptions, Finance, and recent Audit activity.

#### B. User Administration (`AdminUsersController`)
- `GET /api/v1/admin/users`: Paginated search and filtering by email, phone, role, status, email verification.
- `GET /api/v1/admin/users/:id`: Sanitized complete user details with profile attachments.
- `POST /api/v1/admin/users/:id/activate`: Activate user with audit log and outbox event.
- `POST /api/v1/admin/users/:id/suspend`: Suspend user with reason, revoke active refresh tokens, audit log, outbox event.
- `POST /api/v1/admin/users/:id/reactivate`: Reactivate suspended user.
- `POST /api/v1/admin/users/:id/deactivate`: Soft-deactivate user account.

#### C. Admin Content Moderation (`AdminModerationController`)
- `POST /api/v1/admin/moderation`: Generic content moderation across posts, replies, meetups, sponsor ads, c2b services, and vendor services. Actions: `HIDE`, `RESTORE`, `REJECT`, `DELETE`. Logs immutable audit record.

#### D. Content Reporting & Flagging (`ReportsController` & `AdminReportsController`)
- `POST /api/v1/reports`: Authenticated user reports content (with target validation, rate limiting, and anti-duplicate defense).
- `GET /api/v1/reports/my`: Authenticated user views their submitted reports.
- `GET /api/v1/admin/reports`: Admin paginated list of reports filterable by status, targetType, date.
- `GET /api/v1/admin/reports/:id`: Admin views report details.
- `PATCH /api/v1/admin/reports/:id`: Admin updates status (`IN_REVIEW`, `RESOLVED`, `DISMISSED`) with resolution note.

#### E. Audit Log Querying (`AdminAuditLogsController`)
- `GET /api/v1/admin/audit-logs`: Paginated audit log search by actor, action, resourceType, resourceId, date range.
- `GET /api/v1/admin/audit-logs/:id`: View single audit log with sanitized metadata. (Read-only; zero mutation endpoints).

#### F. Operational Reporting (`AdminOperationalReportsController`)
- `GET /api/v1/admin/reports/users`: User registration trends, status distributions, role breakdowns.
- `GET /api/v1/admin/reports/events`: Event status breakdown, upcoming counts, registration metrics.
- `GET /api/v1/admin/reports/communities`: Community counts, active/expired sponsorships, post/reply activity.
- `GET /api/v1/admin/reports/marketplace`: Vendor services, C2B services, RFQs, quotations, bookings summary.
- `GET /api/v1/admin/reports/financial`: Reuses authoritative `RevenueService`.

#### G. Secure CSV Exports (`AdminExportsController`)
- `GET /api/v1/admin/exports/users`: Stream sanitized CSV of users.
- `GET /api/v1/admin/exports/events`: Stream sanitized CSV of events.
- `GET /api/v1/admin/exports/transactions`: Stream sanitized CSV of financial transactions.
- `GET /api/v1/admin/exports/audit-logs`: Stream sanitized CSV of audit logs.
- `GET /api/v1/admin/exports/reports`: Stream sanitized CSV of reports.

---

### 5. Verification & Testing Strategy
1. **Unit Tests**:
   - `admin-dashboard.service.spec.ts`
   - `admin-users.service.spec.ts`
   - `admin-moderation.service.spec.ts`
   - `reports.service.spec.ts`
   - `admin-audit-logs.service.spec.ts`
   - `admin-operational-reports.service.spec.ts`
   - `admin-exports.service.spec.ts`
2. **E2E Integration Test Suite (`test/admin-operations.e2e-spec.ts`)**:
   - Hermetic mock test covering all 34+ required scenarios across Dashboard, User Administration, Moderation, Flagging/Reporting, Audit Operations, Operational Reports, CSV Exports, Security/IDOR, and Health.
3. **Full Regression Suite**:
   - Verify all 51 existing unit test suites and 10 E2E test suites pass with zero regressions.
