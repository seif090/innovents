# Sprint 7 Implementation Plan — B2B Marketplace, Vendor Services, RFQ & Quotation Workflow

Implement the complete **B2B Marketplace foundation and RFQ/Quotation workflow** for the INOVENT Smart Event Ecosystem.

The workflow enables approved Sponsors to discover active Vendors and services, create and submit RFQs with line items, engage in clarification rounds, receive versioned quotations with server-side Decimal financial calculations, and accept/reject quotations atomically with transactional consistency and anti-tampering defenses.

---

## User Review Required

> [!IMPORTANT]
> **Strict MVP Scope Boundaries**: In accordance with the prompt directives, all payment gateways (Stripe, escrow, online payment settlement), contractual signatures, invoices, and C2B matchmaking are strictly out of scope for Sprint 7. The platform manages the business workflow from Discovery &rarr; RFQ &rarr; Clarification &rarr; Quotation &rarr; Decision.

> [!IMPORTANT]
> **Account Status Enforcement**: Only `ACTIVE` accounts (`deletedAt: null`) with the `VENDOR` role may create/publish services and submit quotations. Only `ACTIVE` accounts with the `SPONSOR` role may create/send RFQs and accept quotations. Suspended, pending, or rejected accounts are strictly blocked.

---

## Proposed Architecture & Changes

```text
====================================================================================================
B2B MARKETPLACE ARCHITECTURE
====================================================================================================

[SPONSOR] (ACTIVE)                                                   [VENDOR] (ACTIVE)
    |                                                                        |
    | 1. Search Vendors & Services (GET /api/v1/b2b/services)                | 0. Manage Services
    |                                                                        |    (POST/PATCH /api/v1/vendor/services)
    | 2. Create & Send RFQ (POST /api/v1/b2b/rfqs)                           |
    +--------------------------------- RFQ: SENT --------------------------->|
    |                                                                        | 3. View RFQ (GET /api/v1/b2b/rfqs/:id)
    |                                                                        |    (Transitions to VIEWED)
    |                                                                        |
    |<-------------------- CLARIFICATION_REQUESTED -------------------------+ 4. Clarification Request
    |  (POST /api/v1/b2b/rfqs/:id/clarification)                             |
    |                                                                        |
    |<------------------------- RFQ: QUOTED ---------------------------------+ 5. Submit Quotation v1, v2...
    |  (POST /api/v1/b2b/quotations)                                         |    (Decimal arithmetic, versioned)
    |                                                                        |
    | 6. Review & Accept Quotation                                           |
    |    (POST /api/v1/b2b/quotations/:id/accept)                            |
    +-------------------------- RFQ: ACCEPTED ------------------------------>|
                                (Atomically locked)
```

---

### Component 1: Database & Prisma Schema (`prisma/schema.prisma`)

#### [MODIFY] [`prisma/schema.prisma`](file:///c:/Users/seaif/Desktop/innovents/prisma/schema.prisma)
1. **New Enums**:
   - `PricingModel`: `FIXED`, `HOURLY`, `DAILY`, `PER_UNIT`, `CUSTOM`
   - `RfqStatus`: `DRAFT`, `SENT`, `VIEWED`, `CLARIFICATION_REQUESTED`, `QUOTED`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`
   - `QuotationStatus`: `PENDING`, `ACCEPTED`, `REJECTED`, `SUPERSEDED`, `EXPIRED`
2. **Updated Enum**:
   - `NotificationType`: Add `RFQ_SENT`, `RFQ_VIEWED`, `RFQ_CLARIFICATION_REQUESTED`, `RFQ_QUOTED`, `RFQ_ACCEPTED`, `RFQ_REJECTED`, `RFQ_CANCELLED`, `RFQ_EXPIRED`.
3. **New Models**:
   - `VendorService`:
     - Fields: `id`, `vendorId` (UUID FK to `User`), `name`, `description`, `category`, `pricingModel`, `price` (`Decimal(12, 2)`), `currency` (`VarChar(3)` default `'SAR'`), `deliveryDuration`, `serviceAreas` (`String[]`), `tags` (`String[]`), `minimumOrder` (`Int` default 1), `isActive` (`Boolean` default true), `createdAt`, `updatedAt`, `deletedAt`.
     - Indexes: `@@index([vendorId, isActive])`, `@@index([category, isActive])`, `@@index([createdAt])`, `@@index([deletedAt])`.
   - `Rfq`:
     - Fields: `id`, `sponsorId` (UUID FK to `User`), `vendorId` (UUID FK to `User`), `eventId` (UUID FK to `Event`, optional), `title`, `description`, `requirements` (Text?), `status` (`RfqStatus`), `expiresAt`, `sentAt`, `viewedAt`, `cancelledAt`, `acceptedAt`, `rejectedAt`, `cancellationReason`, `rejectionReason`, `createdAt`, `updatedAt`.
     - Indexes: `@@index([sponsorId, createdAt])`, `@@index([vendorId, status, createdAt])`, `@@index([status, expiresAt])`.
   - `RfqItem`:
     - Fields: `id`, `rfqId` (UUID FK to `Rfq`), `vendorServiceId` (UUID FK to `VendorService`, optional), `description`, `quantity` (`Int` >= 1), `unit` (String?), `targetPrice` (`Decimal(12, 2)`?), `notes` (Text?), `createdAt`, `updatedAt`.
     - Indexes: `@@index([rfqId])`.
   - `RfqClarification`:
     - Fields: `id`, `rfqId` (UUID FK to `Rfq`), `senderId` (UUID FK to `User`), `message` (Text), `createdAt`.
     - Indexes: `@@index([rfqId, createdAt])`.
   - `Quotation`:
     - Fields: `id`, `rfqId` (UUID FK to `Rfq`), `vendorId` (UUID FK to `User`), `version` (`Int` >= 1), `status` (`QuotationStatus`), `subtotal` (`Decimal(12, 2)`), `tax` (`Decimal(12, 2)` default 0), `discount` (`Decimal(12, 2)` default 0), `total` (`Decimal(12, 2)`), `currency` (`VarChar(3)` default `'SAR'`), `validUntil`, `notes`, `acceptedAt`, `rejectedAt`, `rejectionReason`, `createdAt`, `updatedAt`.
     - Constraints: `@@unique([rfqId, version])`.
     - Indexes: `@@index([rfqId, status])`, `@@index([vendorId, createdAt])`.
   - `QuotationItem`:
     - Fields: `id`, `quotationId` (UUID FK to `Quotation`), `rfqItemId` (UUID FK to `RfqItem`, optional), `description`, `quantity` (`Int`), `unitPrice` (`Decimal(12, 2)`), `total` (`Decimal(12, 2)`), `notes` (Text?).
     - Indexes: `@@index([quotationId])`.
4. **Relations on Existing Models**:
   - `User`: Add reciprocal relations `vendorServices`, `sentRfqs`, `receivedRfqs`, `quotations`, `rfqClarifications`.
   - `Event`: Add reciprocal relation `rfqs`.
5. **Database Migration**:
   - Create `prisma/migrations/20260912140000_sprint_7_b2b_marketplace/migration.sql`.
   - Extend `prisma/seed.ts` with Sprint 7 permissions (`b2b:services:manage`, `b2b:rfq:create`, `b2b:rfq:manage`, `b2b:quotation:create`, `b2b:quotation:manage`).

---

### Component 2: B2B Marketplace Module (`src/modules/b2b-marketplace/`)

#### [NEW] `src/modules/b2b-marketplace/`
1. **DTO Layer**:
   - `create-vendor-service.dto.ts` & `update-vendor-service.dto.ts`: Strict validation (positive price, valid currency, bounded tags/areas, length limits).
   - `vendor-service-response.dto.ts`: Output projections with Decimal formatted as string/number.
   - `marketplace-search-query.dto.ts`: Bounded pagination (`page`, `limit <= 100`), category filter, search keywords, pricing filters.
   - `create-rfq.dto.ts`: Title, description, target vendor ID, optional event ID, items array (description, quantity >= 1, vendorServiceId), expiration date (`expiresAt > NOW`).
   - `rfq-clarification.dto.ts`: Message content validation.
   - `create-quotation.dto.ts`: Subtotal/tax/discount server-side calculation, items array (unitPrice, quantity, description), `validUntil > NOW`.
   - `quotation-action.dto.ts`: Rejection reason, cancellation reason.
   - `rfq-response.dto.ts` & `quotation-response.dto.ts`: Clean DTOs excluding private metadata.
2. **Services Layer**:
   - `VendorServicesService`:
     - `createService`: Checks caller has `role === VENDOR` and `status === ACTIVE`. Enforces ownership.
     - `updateService`, `deleteService`, `activateService`, `deactivateService`: Validates ownership (IDOR defense) and active account status.
     - `getVendorServices`: Lists vendor's own services with soft-delete filter.
   - `B2bMarketplaceService`:
     - `discoverServices`: Searches active services where `service.isActive === true` and `vendor.status === ACTIVE` and `vendor.deletedAt === null`. Uses selective projections (no vendor password/private fields).
     - `discoverVendors`: Searches approved active vendors with pagination and city/category filters.
     - `getServiceDetails`: Safe public projection with public vendor card.
   - `RfqService`:
     - `createRfq`: Sponsor creates RFQ (in `DRAFT` or `SENT` state). Enforces active Sponsor account, verifies target vendor is active, verifies any referenced `vendorServiceId` belongs to target vendor and is active.
     - `sendRfq`: Atomically transitions `DRAFT -> SENT`, records audit, enqueues `RFQ_SENT` outbox event, schedules delayed expiration job.
     - `viewRfq`: When recipient vendor fetches RFQ, atomically transitions `SENT -> VIEWED` (idempotent, records `viewedAt`).
     - `requestClarification`: Target vendor requests clarification, transitions `SENT/VIEWED -> CLARIFICATION_REQUESTED`, stores message, enqueues `RFQ_CLARIFICATION_REQUESTED` outbox event.
     - `cancelRfq`: Sponsor cancels active RFQ, transitions to `CANCELLED`, records audit and outbox event.
     - `getSponsorRfqs` & `getVendorRfqs`: Scoped to caller's identity (Sponsor or Vendor).
   - `QuotationService`:
     - `createQuotation`: Target vendor creates quotation for an RFQ in `[SENT, VIEWED, CLARIFICATION_REQUESTED, QUOTED]`. Computes server-side decimal totals. Automatically assigns incremented version number (`version = max(version) + 1`), sets previous versions to `SUPERSEDED`, transitions RFQ to `QUOTED`, emits `RFQ_QUOTED` outbox event.
     - `acceptQuotation`: Sponsor atomically accepts quotation. Uses PostgreSQL row locking on RFQ, verifies RFQ is still `QUOTED`, validates `validUntil > NOW`, transitions RFQ to `ACCEPTED`, quotation to `ACCEPTED`, records audit and outbox `RFQ_ACCEPTED`. Protects against concurrent double-acceptance.
     - `rejectQuotation`: Sponsor rejects quotation with optional reason, transitions quotation to `REJECTED`, emits `RFQ_REJECTED`.
   - `RfqExpirationService`:
     - Processes delayed jobs or sweeps overdue RFQs (`expiresAt < NOW`). Atomically transitions non-terminal RFQs to `EXPIRED`, marks active quotations `EXPIRED`, emits `RFQ_EXPIRED`.
3. **Controllers Layer**:
   - `VendorServicesController` (`/api/v1/vendor/services`): Owner CRUD for services.
   - `B2bMarketplaceController` (`/api/v1/b2b/vendors`, `/api/v1/b2b/services`): Public discovery.
   - `RfqController` (`/api/v1/b2b/rfqs`): RFQ lifecycle endpoints.
   - `QuotationController` (`/api/v1/b2b/quotations`): Quotation submission and acceptance.

---

### Component 3: Notifications & Email Templates Integration

#### [MODIFY] [`src/modules/notifications/providers/email/email-template.service.ts`](file:///c:/Users/seaif/Desktop/innovents/src/modules/notifications/providers/email/email-template.service.ts)
- Add localized responsive HTML and text templates (Arabic RTL & English LTR) for:
  - `RFQ_SENT` (Vendor receives RFQ alert)
  - `RFQ_CLARIFICATION_REQUESTED` (Sponsor receives clarification request)
  - `RFQ_QUOTED` (Sponsor receives quotation alert)
  - `RFQ_ACCEPTED` (Vendor receives acceptance notification)
  - `RFQ_REJECTED` (Vendor receives rejection notice)
  - `RFQ_CANCELLED` (Vendor receives cancellation notice)
  - `RFQ_EXPIRED` (Both parties receive expiration alert)

#### [MODIFY] [`src/modules/notifications/processors/outbox.processor.ts`](file:///c:/Users/seaif/Desktop/innovents/src/modules/notifications/processors/outbox.processor.ts)
- Add outbox handlers for all RFQ and Quotation events, orchestrating in-app notifications and localized email delivery.

---

## Verification Plan

### Automated Unit Tests
- **`vendor-services.service.spec.ts`**:
  - Service creation, update, deactivation, deletion.
  - Ownership enforcement (Vendor A cannot edit Vendor B service).
  - Rejection of service creation for inactive/suspended vendor.
- **`b2b-marketplace.service.spec.ts`**:
  - Search filtering by category, tags, keywords.
  - Exclusion of inactive services and suspended/pending vendors.
  - Pagination limits (`limit <= 100`).
- **`rfq.service.spec.ts`**:
  - RFQ creation and validation (prevent referencing another vendor's service).
  - State machine transitions (`DRAFT -> SENT -> VIEWED -> CLARIFICATION_REQUESTED -> CANCELLED -> EXPIRED`).
  - Rejection of invalid status transitions (`409 Conflict`).
  - Authorization & IDOR checks (Sponsor A cannot view Sponsor B RFQ).
- **`quotation.service.spec.ts`**:
  - Quotation creation, server-side Decimal math (`subtotal + tax - discount = total`).
  - Version increments (`v1 -> v2`) and previous version superseding.
  - Quotation acceptance with atomic lock.
  - Concurrency test (simulated double-acceptance race condition).
  - Rejection of quotation on expired RFQ.

### End-to-End Tests (`test/b2b-marketplace.e2e-spec.ts`)
- **Full Happy Path**:
  1. Vendor creates and activates service.
  2. Sponsor discovers service via marketplace.
  3. Sponsor creates and sends RFQ to Vendor.
  4. Vendor views RFQ (status changes to `VIEWED`).
  5. Vendor requests clarification (`CLARIFICATION_REQUESTED`).
  6. Vendor submits quotation (`QUOTED`).
  7. Vendor submits revised quotation v2 (`SUPERSEDED` for v1).
  8. Sponsor accepts quotation v2 (`ACCEPTED`).
- **Security & IDOR Tests**:
  - Vendor A attempts to edit Vendor B service &rarr; `403 Forbidden`.
  - Vendor A attempts to quote Sponsor B's RFQ directed to Vendor B &rarr; `403 Forbidden`.
  - Sponsor A attempts to read Sponsor B RFQ &rarr; `403/404 Forbidden`.
  - Suspended Vendor cannot create service or quote &rarr; `403 Forbidden`.
  - Suspended Sponsor cannot create RFQ or accept &rarr; `403 Forbidden`.
  - Concurrent acceptance simulation &rarr; Exactly 1 succeeds, 2nd fails with `409 Conflict`.

### Quality Gates
```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run build
npx prisma validate
```
