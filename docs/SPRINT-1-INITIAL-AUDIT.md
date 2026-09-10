# INOVENT — Sprint 1 Initial Repository Audit

**Date:** 2026-09-10  
**Inspector:** Lead Backend Architect, DevOps Engineer, QA Engineer  
**Workspace:** `c:\Users\seaif\Desktop\innovents`  
**Authoritative Documents:** `INOVENT_MVP_BRD_v2.docx`, `INOVENT_DataReq_AR_v2.docx`

---

## 1. Existing Repository State

- **Existing Architecture:** None. The repository is freshly initialized and completely empty.
- **Existing Dependencies:** None (`package.json` does not exist).
- **Existing Source Tree:** None.
- **Existing Database State:** None (`prisma/schema.prisma` and migrations do not exist).
- **Existing Infrastructure:** None (no `docker-compose.yml`, Dockerfile, or configuration files).
- **Existing Tests:** None.
- **Existing CI/CD:** None.
- **Frontend Presence:** No frontend code is present in this repository. The backend is designed according to the explicit specifications in `INOVENT_MVP_BRD_v2.docx` and `INOVENT_DataReq_AR_v2.docx`.

---

## 2. Identified Risks & Technical Constraints

1. **Strict TypeScript & Node 24 Compatibility:**  
   Node.js version is `v24.15.0`. TypeScript compilation and dependencies must be fully compatible with Node LTS / modern V8 runtime. All TypeScript configuration must enforce strict type safety (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`).
2. **PostgreSQL & Redis Availability:**  
   Local PostgreSQL/Redis daemon might not be running as background host services. The application must support Docker Compose for local development while allowing gracefully handled connection probes in testing/mock environments.
3. **Identity vs. Profile Decoupling:**  
   Per requirement #4 and #5, authorization must NOT be a naive `users.role` enum, nor should role-specific profile fields be shoved into `users`. Sprint 1 must lay the RBAC database foundation (`users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `audit_logs`, `outbox_events`) without prematurely bloating the schema with later sprint domain entities.
4. **Resilience & Transactional Reliability:**  
   To prevent asynchronous state divergence (e.g. database commit succeeds but message emission or notification fails), a transactional `outbox_events` table and an idempotency foundation are required from day one.

---

## 3. Proposed Changes & Architecture

- **Runtime & Framework:** Node.js LTS, NestJS 10.x, TypeScript strict mode.
- **Database & ORM:** PostgreSQL 16, Prisma ORM with UUID primary keys, snake_case table mappings, UTC timestamps, and normalized relations.
- **Cache & Message Broker:** Redis (via `ioredis`), BullMQ foundation for queue abstractions.
- **Real-time:** Socket.IO foundation with Redis adapter extension point.
- **Storage Abstraction:** `StorageService` interface with S3-compatible provider (MinIO for dev, AWS S3/Cloudflare R2 for production).
- **Email Abstraction:** `EmailProvider` interface with Nodemailer/SMTP implementation.
- **Payment Abstraction:** `PaymentProvider` interface ready for Sprint 9 Stripe integration.
- **Security & Pipeline:** Helmet, CORS, custom Request ID (`x-request-id`), global NestJS ValidationPipe, global HttpExceptionFilter, global TransformInterceptor, Winston structured logger.
- **Operations & Observability:** `@nestjs/terminus` health checks (`/health`, `/health/live`, `/health/ready`), Swagger/OpenAPI documentation (`/api/docs`).
- **Containerization:** Multi-stage production `Dockerfile` (non-root execution), `docker-compose.yml`, `docker-compose.dev.yml`.

---

## 4. Manifest of Files to Be Created in Sprint 1

### Configuration & Tooling
- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `nest-cli.json`
- `.eslintrc.js`
- `.prettierrc`
- `.gitignore`
- `.dockerignore`
- `.env.example`
- `.env`

### Prisma Database
- `prisma/schema.prisma`
- `prisma/seed.ts`

### Source Tree (`src/`)
- `src/main.ts`
- `src/app.module.ts`
- `src/config/configuration.ts`
- `src/config/env.validation.ts`
- `src/database/prisma.service.ts`
- `src/database/database.module.ts`

### Common Layer (`src/common/`)
- `src/common/constants/system.constants.ts`
- `src/common/enums/account-status.enum.ts`
- `src/common/enums/role.enum.ts`
- `src/common/enums/permission.enum.ts`
- `src/common/middleware/request-id.middleware.ts`
- `src/common/filters/http-exception.filter.ts`
- `src/common/interceptors/transform.interceptor.ts`
- `src/common/interceptors/logging.interceptor.ts`
- `src/common/pipes/validation.pipe.ts`
- `src/common/dto/api-response.dto.ts`
- `src/common/dto/error-response.dto.ts`
- `src/common/utils/crypto.util.ts`

### Infrastructure Layer (`src/infrastructure/`)
- `src/infrastructure/cache/redis.service.ts`
- `src/infrastructure/cache/cache.module.ts`
- `src/infrastructure/queue/queue.service.ts`
- `src/infrastructure/queue/queue.module.ts`
- `src/infrastructure/queue/queue.constants.ts`
- `src/infrastructure/storage/storage.interface.ts`
- `src/infrastructure/storage/s3-storage.service.ts`
- `src/infrastructure/storage/storage.module.ts`
- `src/infrastructure/email/email.interface.ts`
- `src/infrastructure/email/smtp-email.service.ts`
- `src/infrastructure/email/email.module.ts`
- `src/infrastructure/payments/payment.interface.ts`
- `src/infrastructure/payments/payments.module.ts`
- `src/infrastructure/realtime/realtime.gateway.ts`
- `src/infrastructure/realtime/realtime.module.ts`

### Core Modules (`src/modules/`)
- `src/modules/health/health.controller.ts`
- `src/modules/health/health.module.ts`
- `src/modules/health/indicators/prisma-health.indicator.ts`
- `src/modules/health/indicators/redis-health.indicator.ts`
- `src/modules/audit/audit.service.ts`
- `src/modules/audit/audit.module.ts`
- `src/modules/outbox/outbox.service.ts`
- `src/modules/outbox/outbox.module.ts`

### DevOps & CI
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `.github/workflows/ci.yml`

### Tests
- `test/jest-e2e.json`
- `test/app.e2e-spec.ts`
- `test/health.e2e-spec.ts`
- `src/modules/health/health.controller.spec.ts`
- `src/common/filters/http-exception.filter.spec.ts`
- `src/common/middleware/request-id.middleware.spec.ts`
- `src/config/env.validation.spec.ts`

### Documentation (`docs/`)
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/SECURITY.md`
- `docs/ENVIRONMENT.md`
- `docs/INOVENT_SPRINT_1_REPORT.md`
