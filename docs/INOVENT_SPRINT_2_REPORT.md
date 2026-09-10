# INOVENT Backend — Sprint 2 Execution Report

**Sprint:** Sprint 2 — Authentication, Identity, RBAC & Resource Authorization  
**Date:** 2026-09-11  
**Authors:** Lead Backend Architect, Senior Security Engineer, Database Architect, QA Engineer  
**Status:** COMPLETED & FULLY VERIFIED  

---

## 1. Executive Summary

Sprint 2 has successfully designed, implemented, tested, and verified the complete production-grade **Authentication, Identity, Role-Based Access Control (RBAC), and Resource Authorization foundation** for the INOVENT Smart Event Ecosystem Backend.

Operating strictly within the Sprint 2 scope boundaries—and integrating seamlessly with the Sprint 1 Modular Monolith baseline—this sprint provides enterprise-grade identity flows: public self-registration with allowed-role enforcement, secure email OTP challenge generation with SHA-256 storage and brute-force mitigation, account lifecycle validation (active vs pending administrative review), ephemeral JWT access tokens (15 minutes), 48-byte cryptographically secure refresh tokens with automatic single-use rotation, token family tracking with instant reuse detection and compromise revocation, anti-enumeration password reset, RBAC with administrative bypass, resource-level ownership validation, and user profile management endpoints.

Every verification gate—Prisma schema validation, strict TypeScript typechecking, ESLint, Prettier, 47 unit tests across 9 test suites, and 15 end-to-end tests across 2 test suites—has passed with **zero errors and 100% test success**.

---

## 2. Initial Repository Audit

- **Baseline Audit:** Pre-sprint audit was conducted and recorded in `docs/SPRINT-2-INITIAL-AUDIT.md`.
- **Sprint 1 Integrity:** All Sprint 1 infrastructure modules (`DatabaseModule`, `CacheModule`, `QueueModule`, `StorageModule`, `EmailModule`, `PaymentsModule`, `RealtimeModule`, `AuditModule`, `OutboxModule`, `HealthModule`) remained fully functional without breaking changes.
- **Scope Discipline:** No Sprint 3+ functionality (Events, Agenda, Communities, Chat, RFQ, Marketplace, Stripe payments) was implemented.

---

## 3. Architecture & Domain Design

The identity subsystem is implemented as two high-cohesion, loosely coupled NestJS domain modules within the Modular Monolith:

1. **`AuthModule` (`src/modules/auth/`):**
   - **Services:** `PasswordService`, `TokenService`, `OtpService`, `AuthService`.
   - **Guards:** `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `ResourceOwnerGuard`.
   - **Decorators:** `@Public()`, `@Roles(...)`, `@Permissions(...)`, `@CurrentUser(...)`.
   - **Controllers:** `AuthController` (8 REST endpoints).
2. **`UsersModule` (`src/modules/users/`):**
   - **Services:** `UsersService`.
   - **Controllers:** `UsersController` (3 REST endpoints: `GET /me`, `PATCH /me`, `DELETE /me`).

---

## 4. Files Created

1. `docs/SPRINT-2-INITIAL-AUDIT.md`
2. `src/modules/auth/auth.module.ts`
3. `src/modules/auth/constants/auth.constants.ts`
4. `src/modules/auth/controllers/auth.controller.ts`
5. `src/modules/auth/decorators/public.decorator.ts`
6. `src/modules/auth/decorators/roles.decorator.ts`
7. `src/modules/auth/decorators/permissions.decorator.ts`
8. `src/modules/auth/decorators/current-user.decorator.ts`
9. `src/modules/auth/dto/register.dto.ts`
10. `src/modules/auth/dto/login.dto.ts`
11. `src/modules/auth/dto/otp.dto.ts`
12. `src/modules/auth/dto/refresh.dto.ts`
13. `src/modules/auth/dto/password-reset.dto.ts`
14. `src/modules/auth/dto/auth-response.dto.ts`
15. `src/modules/auth/guards/jwt-auth.guard.ts`
16. `src/modules/auth/guards/roles.guard.ts`
17. `src/modules/auth/guards/permissions.guard.ts`
18. `src/modules/auth/guards/resource-owner.guard.ts`
19. `src/modules/auth/guards/guards.spec.ts`
20. `src/modules/auth/services/password.service.ts`
21. `src/modules/auth/services/password.service.spec.ts`
22. `src/modules/auth/services/token.service.ts`
23. `src/modules/auth/services/token.service.spec.ts`
24. `src/modules/auth/services/otp.service.ts`
25. `src/modules/auth/services/otp.service.spec.ts`
26. `src/modules/auth/services/auth.service.ts`
27. `src/modules/auth/services/auth.service.spec.ts`
28. `src/modules/users/users.module.ts`
29. `src/modules/users/dto/user-response.dto.ts`
30. `src/modules/users/dto/update-user.dto.ts`
31. `src/modules/users/services/users.service.ts`
32. `src/modules/users/controllers/users.controller.ts`
33. `test/auth.e2e-spec.ts`
34. `docs/INOVENT_SPRINT_2_REPORT.md`

---

## 5. Files Modified

1. `package.json`: Added `@nestjs/jwt`, `jsonwebtoken`, `bcryptjs`, `@types/bcryptjs`, `@types/jsonwebtoken`.
2. `package-lock.json`: Synchronized dependency lockfile.
3. `prisma/schema.prisma`: Added `RefreshToken` and `OtpChallenge` models; linked foreign relations to `User`.
4. `src/app.module.ts`: Imported `AuthModule` and `UsersModule`.
5. `src/main.ts`: Added Swagger tags for `Authentication` and `Users`.
6. `test/setup.ts`: Configured 30,000ms global timeout for end-to-end integration tests.
7. `docs/SECURITY.md`: Updated with Sprint 2 cryptographic and authorization controls.

---

## 6. Dependencies Added

- `@nestjs/jwt` (`^10.2.0`): Official NestJS module for JWT signing and verification.
- `jsonwebtoken` (`^9.0.3`) & `@types/jsonwebtoken` (`^9.0.10`): Low-level JWT runtime.
- `bcryptjs` (`^2.4.3`) & `@types/bcryptjs` (`^2.4.6`): Zero-native-dependency cryptographic password hashing library compatible across Linux, macOS, and Windows environments without node-gyp or C++ build tools.

---

## 7. Database Schema Updates

The following entities were added to `prisma/schema.prisma`:

### `RefreshToken` Model
```prisma
model RefreshToken {
  id                String    @id @default(uuid()) @db.Uuid
  userId            String    @map("user_id") @db.Uuid
  tokenHash         String    @unique @map("token_hash") @db.VarChar(255)
  familyId          String    @map("family_id") @db.Uuid
  jti               String    @unique @db.VarChar(255)
  expiresAt         DateTime  @map("expires_at") @db.Timestamptz(6)
  revokedAt         DateTime? @map("revoked_at") @db.Timestamptz(6)
  replacedByTokenId String?   @map("replaced_by_token_id") @db.Uuid
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  lastUsedAt        DateTime? @map("last_used_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@index([tokenHash])
  @@map("refresh_tokens")
}
```

### `OtpChallenge` Model
```prisma
enum OtpPurpose {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  LOGIN_VERIFICATION
}

model OtpChallenge {
  id          String     @id @default(uuid()) @db.Uuid
  userId      String?    @map("user_id") @db.Uuid
  identifier  String     @db.VarChar(255)
  purpose     OtpPurpose
  codeHash    String     @map("code_hash") @db.VarChar(255)
  expiresAt   DateTime   @map("expires_at") @db.Timestamptz(6)
  resendAfter DateTime   @map("resend_after") @db.Timestamptz(6)
  attempts    Int        @default(0)
  maxAttempts Int        @default(5) @map("max_attempts")
  consumedAt  DateTime?  @map("consumed_at") @db.Timestamptz(6)
  createdAt   DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)

  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([identifier, purpose])
  @@index([userId])
  @@map("otp_challenges")
}
```

---

## 8. Schema Validation & Prisma Client Generation

- **Command:** `npx prisma validate`
- **Output:**
  ```text
  Environment variables loaded from .env
  Prisma schema loaded from prisma\schema.prisma
  The schema at prisma\schema.prisma is valid 🚀
  ```
- **Prisma Client Generation:** `npx prisma generate` completed with **exit code 0**.

---

## 9. Password Hashing & Complexity Policy

- **Algorithm:** `bcryptjs` with **12 salt rounds**.
- **Enforcement:**
  - Minimum length: 8 characters.
  - Complexity: Requires at least one alphabetic character and one numeric digit.
  - Never stored, compared, or logged in plaintext.
- **Test Coverage:** Unit test suite in `src/modules/auth/services/password.service.spec.ts` verifies valid hashes, mismatched comparisons, complexity passes, and rejection of weak/empty passwords.

---

## 10. OTP Architecture & Security Controls

- **Generation:** 6-digit cryptographically secure numeric OTPs generated via `CryptoUtil.generateNumericOtp(6)`.
- **Hash-Only Storage:** Only SHA-256 hashes (`CryptoUtil.sha256(code)`) are stored in `otp_challenges.code_hash`.
- **TTL:** 5-minute expiration window (`OTP_EXPIRES_IN_MINUTES = 5`).
- **Cooldown:** Strict 60-second cooldown period between successive OTP requests (`resend_after`).
- **Brute-Force Lockout:** Tracks failed attempts (`attempts`). Capped at 5 attempts max (`max_attempts`). Upon the 5th failed attempt, the challenge is permanently locked and consumed.
- **One-Time Use:** Successfully verified OTPs are marked with `consumed_at: new Date()`, preventing replay attacks.
- **Anti-Enumeration:** `requestOtp` and `requestPasswordReset` return identical generic success messages regardless of whether the email exists in the database.

---

## 11. JWT Access & Refresh Token Rotation with Reuse Detection

- **Access Token:** Ephemeral signed HMAC-SHA256 JWT, valid for 15 minutes (`JWT_ACCESS_EXPIRES_IN=15m`). Contains `sub` (userId), `email`, `roles`, `permissions`, and UUID `jti`.
- **Refresh Token:** 48-byte cryptographically secure random string (`CryptoUtil.generateRandomToken(48)`).
- **Single-Use Rotation:**
  - Every call to `POST /api/v1/auth/refresh` revokes the incoming token (`revokedAt: new Date()`).
  - Sets `replacedByTokenId` to the newly issued refresh token.
  - Generates a new access token and refresh token under the identical `familyId`.
- **Compromise / Reuse Detection:**
  - If a client presents a refresh token whose `revokedAt` is already not null, the system recognizes a token replay attack (e.g. token intercepted by an adversary).
  - The system **immediately revokes all tokens within that entire `familyId`**.
  - Logs a high-priority security event (`AUTH_EVENTS.TOKEN_REUSE_DETECTED`) to `AuditLog`.
  - Rejects the request with HTTP 401 Unauthorized ("Security violation: Refresh token reuse detected. All sessions revoked.").
- **Global Invalidation:**
  - `POST /api/v1/auth/logout`: Revokes the refresh token family.
  - Password Reset: Revokes **all** active refresh tokens across all families for the user.

---

## 12. Account Lifecycle & Approval Gate Engine

- **Attendee Registration Flow:**
  1. `POST /api/v1/auth/register` creates user in `PENDING` status.
  2. Dispatches 6-digit email OTP.
  3. `POST /api/v1/auth/otp/verify` verifies email, sets `emailVerifiedAt: new Date()`, and **immediately transitions status to `ACTIVE`**.
  4. `POST /api/v1/auth/login` succeeds.
- **Business Role Registration Flow (`SPONSOR`, `VENDOR`, `PROVIDER`, `MEDIA`):**
  1. `POST /api/v1/auth/register` creates user in `PENDING` status.
  2. Dispatches 6-digit email OTP.
  3. `POST /api/v1/auth/otp/verify` verifies email, sets `emailVerifiedAt: new Date()`, but **status remains `PENDING` awaiting administrator review**.
  4. `POST /api/v1/auth/login` is rejected with HTTP 403 Forbidden ("Your account email is verified, but your profile is currently pending administrative review.").
- **Role Restrictions:** Public registration strictly disallows `ADMIN` and `ORGANIZER` self-assignment; attempts are rejected with HTTP 400 Bad Request.
- **Account Status Guarding:** `SUSPENDED` and `DEACTIVATED` accounts are blocked from authentication with HTTP 403.

---

## 13. Role-Based Access Control (RBAC) & Permissions Guard

- **`RolesGuard`:** Verifies `@Roles(Role.ADMIN, ...)` using the roles array populated inside `request.user`. Includes administrative override allowing `ADMIN` users to access all role-guarded endpoints.
- **`PermissionsGuard`:** Verifies granular capabilities declared via `@Permissions('resource:action')` against user permissions in JWT payload.
- **Decorators:** Strongly typed `@Roles(...)`, `@Permissions(...)`, and `@Public()` decorators.

---

## 14. Resource-Level Authorization (Horizontal Bypass Prevention)

- **`ResourceOwnerGuard`:**
  - Prevents horizontal privilege escalation (IDOR attacks).
  - Inspects incoming request parameters (`req.params.id` or `req.params.userId`).
  - Asserts that `paramUserId === req.user.sub` OR the authenticated user holds the `ADMIN` role.
  - Throws HTTP 403 Forbidden if a user attempts to view, modify, or delete another user's resources.

---

## 15. User Profile Management (`/api/v1/users/me`)

Protected by `JwtAuthGuard`:
- `GET /api/v1/users/me`: Returns sanitized `UserProfileResponseDto` including user ID, email, phone, status, assigned roles, granular permissions, verification status, and creation date.
- `PATCH /api/v1/users/me`: Safely updates identity fields (e.g. phone number).
- `DELETE /api/v1/users/me`: Soft-deletes user account (`deletedAt: new Date()`, `status: DEACTIVATED`), and revokes all active refresh token sessions.

---

## 16. Transactional Outbox Integration

All critical identity events are queued atomically in the `OutboxEvent` table:
- `EMAIL_VERIFICATION_REQUESTED`: Enqueued upon registration and OTP resend.
- `PASSWORD_RESET_REQUESTED`: Enqueued upon password reset initiation.
- Email dispatch jobs are mirrored to BullMQ's `email-queue` for background worker processing.

---

## 17. Rate Limiting & Throttler Configuration

Endpoints are protected by `@Throttle` decorators backed by Redis:
- `POST /api/v1/auth/register`: 10 requests / minute per IP.
- `POST /api/v1/auth/otp/request`: 5 requests / minute per IP.
- `POST /api/v1/auth/otp/verify`: 10 requests / minute per IP.
- `POST /api/v1/auth/login`: 10 attempts / minute per IP.
- `POST /api/v1/auth/refresh`: 30 requests / minute per IP.
- `POST /api/v1/auth/password-reset/*`: 5 requests / minute per IP.

---

## 18. Audit Logging & Security Event Tracing

All identity lifecycle transitions are logged to the immutable `AuditLog` table with actor, action, resource, metadata, IP address, and User-Agent:
- `USER_REGISTERED`
- `USER_LOGGED_IN`
- `OTP_REQUESTED`
- `OTP_VERIFIED`
- `TOKEN_REFRESHED`
- `TOKEN_REUSE_DETECTED` (Critical security alert)
- `USER_LOGGED_OUT`
- `PASSWORD_RESET_REQUESTED`
- `PASSWORD_RESET_COMPLETED`

---

## 19. Swagger / OpenAPI Documentation

All endpoints are fully annotated with `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth('JWT-auth')`, and `@ApiUnauthorizedResponse`.
Swagger UI exposes:
- Tag **`Authentication`**: 8 endpoints.
- Tag **`Users`**: 3 endpoints.
- Tag **`Health`**: 3 endpoints.

---

## 20. Unit Testing Verification Results

- **Command:** `npm test`
- **Output:**
  ```text
  PASS src/common/filters/http-exception.filter.spec.ts
  PASS src/common/middleware/request-id.middleware.spec.ts
  PASS src/config/env.validation.spec.ts
  PASS src/modules/auth/guards/guards.spec.ts
  PASS src/modules/auth/services/otp.service.spec.ts
  PASS src/modules/auth/services/token.service.spec.ts
  PASS src/modules/health/health.controller.spec.ts
  PASS src/modules/auth/services/password.service.spec.ts
  PASS src/modules/auth/services/auth.service.spec.ts

  Test Suites: 9 passed, 9 total
  Tests:       47 passed, 47 total
  Snapshots:   0 total
  Time:        25.954 s
  Ran all test suites.
  ```

---

## 21. End-to-End Testing Verification Results

- **Command:** `npm run test:e2e`
- **Output:**
  ```text
  PASS test/health.e2e-spec.ts (8.514 s)
  PASS test/auth.e2e-spec.ts (10.316 s)
    Auth & Identity End-to-End Suite (e2e)
      √ Step 1: POST /api/v1/auth/register should create user and dispatch OTP code (87 ms)
      √ Step 2: POST /api/v1/auth/login should fail before email verification (15 ms)
      √ Step 3: POST /api/v1/auth/otp/verify should verify email and activate Attendee (9 ms)
      √ Step 4: POST /api/v1/auth/login should succeed and return access + refresh tokens (10 ms)
      √ Step 5: GET /api/v1/users/me should return user profile with valid Bearer token (9 ms)
      √ Step 6: PATCH /api/v1/users/me should update user phone (6 ms)
      √ Step 7: POST /api/v1/auth/refresh should rotate the refresh token (5 ms)
      √ Step 8: Replay of OLD refresh token should trigger reuse detection and revoke family (7 ms)
      √ Step 9: Rotated token from revoked family should now also be rejected (7 ms)
      √ Step 10: Password reset flow should issue OTP, update password, and revoke sessions (32 ms)
      √ Step 11: POST /api/v1/auth/logout should revoke session (22 ms)
      √ Step 12: Business role (SPONSOR) remains PENDING upon OTP verify and cannot login (34 ms)

  Test Suites: 2 passed, 2 total
  Tests:       15 passed, 15 total
  Snapshots:   0 total
  Time:        11.781 s
  Ran all test suites.
  ```

---

## 22. Build & Code Quality Verification Results

- **ESLint:** `npm run lint` -> **0 errors, 0 warnings**.
- **Prettier:** `npm run format:check` -> **All matched files use Prettier code style!**
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`) -> **0 errors, strict mode compilation succeeded**.
- **Nest Build:** `npm run build` -> **Exit code 0, production bundle created in `dist/`**.

---

## 23. Sprint 2 Verdict & Readiness for Sprint 3

**Verdict:** **PASSED & COMPLETE**  
The identity, authentication, RBAC, and resource authorization system is fully verified, robust, and mathematically sound.

The backend is now primed and ready for authorization to begin **Sprint 3 (Events, Agenda & Sessions Management)**.
