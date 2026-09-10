# INOVENT — Sprint 2 Initial Audit

**Date:** 2026-09-10  
**Inspector:** Lead Backend Architect, Security Engineer, QA Engineer  
**Scope:** Verification of Sprint 1 foundation prior to Sprint 2 Auth & Identity execution  
**Authoritative Documents:** `INOVENT_MVP_BRD_v2.docx`, `INOVENT_DataReq_AR_v2.docx`

---

## 1. Verification of Sprint 1 Deliverables

| Component | Status in Codebase | Reusability in Sprint 2 |
|---|---|---|
| **`User` Model** | Implemented with UUID, email, phone, passwordHash, status, timestamps, soft delete | Fully reusable; needs relations to `RefreshToken` and `OtpChallenge` |
| **`Role` & `Permission` Models** | Implemented with normalized `UserRole` and `RolePermission` tables | Ready for RBAC guards (`RolesGuard`, `PermissionsGuard`) |
| **`AccountStatus` Enum** | `PENDING`, `ACTIVE`, `REJECTED`, `SUSPENDED`, `DEACTIVATED` | Fully aligned with account lifecycle rules |
| **`AuditLog` Model & Service** | Immutable audit log with sensitive metadata redaction | Reusable for security events (`LOGIN_SUCCESS`, `TOKEN_REUSE_DETECTED`, etc.) |
| **`OutboxEvent` Model & Service** | ACID transactional event logging | Directly utilized for atomic user registration + verification email |
| **`RedisService`** | Connection management, ping, get, set (with TTL), del | Reusable for token blacklist, OTP cooldown, and rate limiting |
| **`QueueService` (BullMQ)** | 6 core queues (`email-queue`, `notifications-queue`, etc.) | Used to process transactional email dispatch asynchronously |
| **`EmailProvider`** | SmtpEmailService implementation | Used by email worker to deliver OTP and reset links |
| **Global API Pipeline** | `x-request-id`, `HttpExceptionFilter`, `TransformInterceptor`, `ValidationPipe` | Fully reusable; guarantees consistent error contracts |
| **Test Foundation** | Jest unit test suite (13 passing tests) and E2E pipeline | Reusable baseline for Sprint 2 auth tests |

---

## 2. Identified Incompleteness & Additions Needed for Sprint 2

1. **Missing Session & Refresh Token Persistence:**  
   Sprint 1 defined the `User` identity but did not store refresh tokens. Sprint 2 requires a dedicated `RefreshToken` model supporting family tracking (`familyId`), rotation, and reuse detection.
2. **Missing OTP Challenge Persistence:**  
   Sprint 1 provided cryptographic utility for random codes, but did not define the `OtpChallenge` model (with `purpose`, `codeHash`, `expiresAt`, `attempts`, `maxAttempts`, and `resendAfter`).
3. **Password Hashing Library:**  
   Sprint 1 defined `passwordHash` string in Prisma; Sprint 2 must integrate high-security hashing (bcrypt/Argon2) and prevent plaintext exposure.
4. **JWT Signing & Rotation Engine:**  
   `@nestjs/jwt` and token issuing/validation service need to be wired with typed access/refresh secrets.
5. **Authorization Guards:**  
   `RolesGuard`, `PermissionsGuard`, and resource-level policy abstraction (`ResourceOwnerGuard` / policy handler) must be implemented.

---

## 3. Security Risks Evaluated for Sprint 2

1. **Account Enumeration:**  
   Registration and password reset requests must not leak whether an email exists. Generic status responses must be returned.
2. **Refresh Token Replay Attacks:**  
   If an old refresh token is reused, the entire token family must be immediately invalidated and an audit event (`TOKEN_REUSE_DETECTED`) recorded.
3. **OTP Brute Force & Flooding:**  
   Enforce max attempts (5) and resend cooldown (60s), hashing stored codes to prevent plaintext exposure in database dumps.
4. **Privilege Escalation:**  
   Organizer and Admin accounts must not be open to public self-registration. Public registration supports only Attendee, Sponsor, Vendor, C2B Provider, Event Owner, and Media.

---

## 4. Required Migrations & Schema Changes

- Add `RefreshToken` model to `prisma/schema.prisma`.
- Add `OtpChallenge` model and `OtpPurpose` enum to `prisma/schema.prisma`.
- Add relation fields on `User` model (`refreshTokens`, `otpChallenges`).

---

## 5. Proposed Sprint 2 Modules & Files

### Auth Module (`src/modules/auth/`)
- `auth.module.ts`
- `controllers/auth.controller.ts`
- `services/auth.service.ts`
- `services/token.service.ts`
- `services/otp.service.ts`
- `services/password.service.ts`
- `guards/jwt-auth.guard.ts`
- `guards/roles.guard.ts`
- `guards/permissions.guard.ts`
- `guards/resource-owner.guard.ts`
- `decorators/current-user.decorator.ts`
- `decorators/roles.decorator.ts`
- `decorators/permissions.decorator.ts`
- `decorators/public.decorator.ts`
- `dto/register.dto.ts`
- `dto/login.dto.ts`
- `dto/otp.dto.ts`
- `dto/refresh.dto.ts`
- `dto/password-reset.dto.ts`
- `dto/auth-response.dto.ts`

### Users Module (`src/modules/users/`)
- `users.module.ts`
- `controllers/users.controller.ts`
- `services/users.service.ts`
- `dto/user-response.dto.ts`
- `dto/update-user.dto.ts`

### Testing
- `src/modules/auth/services/auth.service.spec.ts`
- `src/modules/auth/services/token.service.spec.ts`
- `src/modules/auth/services/otp.service.spec.ts`
- `test/auth.e2e-spec.ts`
