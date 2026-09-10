# INOVENT — Security & Governance Architecture

**Document Version:** 1.0 (Sprint 1 Baseline)  
**Security Level:** Production-Oriented Enterprise Baseline

---

## 1. Threat Model & Security Posture

INOVENT is designed with defense-in-depth principles. No single security control is considered sufficient; security checks are enforced across network, application, authorization, database, and operational tiers.

---

## 2. Core Security Controls

### 2.1 HTTP Security Headers (Helmet)
`helmet` is configured globally at application initialization:
- Strict `X-DNS-Prefetch-Control`, `X-Frame-Options: DENY`, `X-Download-Options`.
- Disables `X-Powered-By` header to prevent runtime fingerprinting.
- Production environment enforces strict Content Security Policy (CSP).

### 2.2 Cross-Origin Resource Sharing (CORS)
- Origin validation is driven strictly by the `CORS_ORIGINS` environment variable.
- In production, wildcard `Access-Control-Allow-Origin: *` is forbidden.
- Allowed methods, credentials, and allowed headers (`x-request-id`, `authorization`) are explicitly whitelisted.

### 2.3 Strict Request Validation & Sanitization
- Global NestJS `ValidationPipe` with:
  - `whitelist: true`: Strips undeclared payload properties.
  - `forbidNonWhitelisted: true`: Immediately rejects payloads with unexpected fields with HTTP 400.
  - `transform: true`: Strongly casts parameters into typed DTO instances.
- Body payload size limits are capped at 10MB in `main.ts` to mitigate payload-based Denial-of-Service attacks.

### 2.4 Rate Limiting & Brute-Force Prevention
- Throttler infrastructure configured via `@nestjs/throttler` backed by Redis.
- Default baseline: 100 requests per minute per IP.
- Granular, endpoint-specific tiers will be enforced in subsequent sprints (e.g. 5 req/min on Auth/OTP endpoints).

---

## 3. Secret Management & Cryptography

### 3.1 Secrets Storage
- No production secrets or credentials may be hardcoded or committed into Git.
- Strongly typed environment loading fails fast during startup if required secrets (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) are missing or too short (< 32 characters).

### 3.2 Password Hashing & Complexity Policy
- Passwords are hashed using `bcryptjs` with **12 salt rounds**.
- Passwords are never stored, logged, or compared in plaintext.
- Complexity enforcement: minimum 8 characters, containing at least one alphabetic letter and one numeric digit.
- Safe anti-enumeration password reset flow: returns generic confirmation regardless of email existence.

### 3.3 Token Lifecycle & Family Reuse Detection
- **Access Tokens:** Signed HMAC-SHA256 JWTs with ephemeral 15-minute TTL. Payload includes `sub` (userId), `email`, `roles`, `permissions`, and UUID `jti`.
- **Refresh Tokens:** 48-byte cryptographically secure random tokens (`CryptoUtil.generateRandomToken`).
- **One-Way Hash Storage:** Stored in PostgreSQL exclusively as SHA-256 hashes (`RefreshToken.tokenHash`).
- **Rotation on Every Use:** Every `/auth/refresh` invocation revokes the existing refresh token, links `replacedByTokenId`, and issues a new refresh token under the same `familyId`.
- **Compromise / Replay Invalidation:** If an already-revoked refresh token is replayed, the entire token family is immediately revoked, all active user sessions for that family are invalidated, a security alert is logged in `AuditLog` with `AUTH_EVENTS.TOKEN_REUSE_DETECTED`, and HTTP 401 Unauthorized is returned.
- **Session Revocation:** `/auth/logout` invalidates the token family server-side. Password reset revokes all user sessions globally.

### 3.4 OTP Security Controls
- **Generation:** 6-digit cryptographically secure numeric OTPs generated via `CryptoUtil.generateNumericOtp(6)`.
- **Storage:** Stored exclusively as SHA-256 hashes in `OtpChallenge.codeHash`. Raw codes are never persisted in the database.
- **Expiration:** 5-minute TTL (`OTP_EXPIRES_IN_MINUTES = 5`).
- **Throttling & Cooldown:** Enforced 60-second cooldown between code requests (`resendAfter`).
- **Brute-Force Lockout:** Maximum 5 failed attempts per challenge. Upon the 5th failed attempt, the challenge is permanently locked and marked consumed.
- **One-Time Consumption:** Immediately marked with `consumedAt: new Date()` upon successful verification.

---

## 4. Authorization & Access Control

### 4.1 Global JWT Guard
- `JwtAuthGuard` guards all routes by default, extracting and verifying Bearer JWTs.
- Public endpoints explicitly opted out via `@Public()` decorator.

### 4.2 Role-Based Access Control (RBAC)
- `RolesGuard` verifies that the authenticated user possesses at least one required role from `@Roles(...)`.
- Built-in `ADMIN` override ensures administrative operators can supervise platform resources.

### 4.3 Fine-Grained Permissions
- `PermissionsGuard` verifies specific resource permissions declared via `@Permissions('action:resource')`.

### 4.4 Horizontal Privilege Bypass Prevention (Resource Authorization)
- `ResourceOwnerGuard` validates that request parameters (`:id` or `:userId`) match the authenticated user's ID or entity ownership.
- Administrators retain supervisory access while non-administrative users are strictly contained to their own resources.

---

## 5. Privacy & Data Protection (PDPL / GDPR Foundations)

1. **Data Minimization:** Public registration DTO restricts initial registration strictly to business actors (`ATTENDEE`, `SPONSOR`, `VENDOR`, `PROVIDER`, `EVENT_OWNER`, `MEDIA`). Privileged roles (`ADMIN`, `ORGANIZER`) cannot self-register.
2. **Account Lifecycle & Approval Gate:**
   - Attendee: `PENDING` -> verifies email OTP -> immediately `ACTIVE`.
   - Business roles (`SPONSOR`, `VENDOR`, `PROVIDER`, `MEDIA`): `PENDING` -> verifies email OTP -> `emailVerifiedAt` set, but account status remains `PENDING` awaiting Admin approval (Sprint 6). Login attempts return HTTP 403 Forbidden.
   - Suspended and deactivated accounts are blocked at login with HTTP 403.
3. **Soft Deletion:** Deletion sets `deletedAt: new Date()`, deactivates account status, and revokes all active refresh tokens.
4. **Sensitive Logs Sanitization:** Passwords, OTP codes, authorization tokens, and credentials are strictly excluded from API responses, database queries, and structured logs.

