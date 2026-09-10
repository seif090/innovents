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
- Strongly typed environment loading fails fast during startup if required secrets (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) are missing.

### 3.2 Password Hashing (Upcoming in Sprint 2)
- Passwords will be hashed using Argon2id or bcrypt with appropriate salt rounds.
- Passwords are never stored or compared in plaintext.

### 3.3 Token Security
- Ephemeral access tokens (15m expiration).
- Refresh tokens rotated on every use with family reuse detection to automatically invalidate compromised token lineages.

---

## 4. Privacy & Data Protection (PDPL / GDPR Foundations)

1. **Data Minimization:** Registration collects only data essential for the event ecosystem.
2. **Access Control:** Role-based and resource-level authorization ensure users only access resources they own or have explicit rights to.
3. **Sensitive Logs Sanitization:** Passwords, OTP codes, authentication headers, credit card details, and private document tokens are strictly masked (`[REDACTED]`) in structured logs and audit records.
4. **Private Documents:** Business registration documents and press credentials are saved with private ACLs and accessible exclusively through expiring signed URLs.
