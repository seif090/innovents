# INOVENT — Smart Event Ecosystem Backend

**Enterprise Modular Monolith REST API & Real-time Platform**  
*Built strictly according to `INOVENT_MVP_BRD_v2.docx` and `INOVENT_DataReq_AR_v2.docx`.*

---

## 1. Project Overview

INOVENT is a production-grade, highly scalable smart event ecosystem backend connecting Attendees, Sponsors, Vendors, C2B Service Providers, Event Owners, Organizers, and Press/Media. 

The architecture is implemented as a **Modular Monolith** using NestJS, TypeScript (strict mode), PostgreSQL 16, Prisma ORM, Redis, BullMQ, and Socket.IO. Each domain module encapsulates its own business logic, authorization rules, and data access, ensuring seamless future extraction into microservices if needed without architectural rewrites.

---

## 2. Technology Stack

- **Runtime:** Node.js (LTS v24.x)
- **Framework:** NestJS 10.x
- **Language:** TypeScript 5.x (Strict compilation: `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`)
- **Database:** PostgreSQL 16
- **ORM:** Prisma ORM 6.x
- **Cache & Message Broker:** Redis 7.x
- **Asynchronous Queue:** BullMQ
- **Real-Time:** Socket.IO with Redis Adapter foundation
- **Object Storage:** S3-compatible storage abstraction (MinIO for local dev, AWS S3 / Cloudflare R2 for production)
- **Documentation:** OpenAPI 3.0 / Swagger (`/api/docs`)
- **Observability:** `@nestjs/terminus` health probes (`/health`, `/health/live`, `/health/ready`), structured JSON logging with `x-request-id` tracing
- **Containerization:** Multi-stage production `Dockerfile` (non-root execution), `docker-compose.yml`, `docker-compose.dev.yml`
- **Testing:** Jest, Supertest

---

## 3. Getting Started

### Prerequisites
- Node.js >= 20.x (Recommended: v22+ or v24 LTS)
- npm >= 10.x
- Docker & Docker Compose (Optional for containerized services)

### Installation

```bash
# Clone and enter directory
cd innovents

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Local Development Services via Docker

To spin up PostgreSQL, Redis, and MinIO for local development:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### Database Setup & Migrations

```bash
# Generate Prisma Client
npm run prisma:generate

# Apply migrations
npm run prisma:migrate

# Seed baseline roles and permissions
npm run prisma:seed
```

### Running the Application

```bash
# Development mode with hot-reload
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The API will be running at: `http://localhost:3000`  
Swagger Documentation is available at: `http://localhost:3000/api/docs`

---

## 4. Verification & Testing Commands

```bash
# Code style and formatting check
npm run format:check
npm run lint

# TypeScript strict type checking
npm run typecheck

# Unit tests
npm test

# End-to-end integration tests
npm run test:e2e

# Production build check
npm run build

# Validate Prisma schema
npx prisma validate
```

---

## 5. Architecture Documentation

Detailed architectural and operational documentation is available in the `docs/` directory:

- [Initial Repository Audit](docs/SPRINT-1-INITIAL-AUDIT.md)
- [Architecture Blueprint](docs/ARCHITECTURE.md)
- [Database & Schema Guide](docs/DATABASE.md)
- [Security & Governance](docs/SECURITY.md)
- [Environment Variables](docs/ENVIRONMENT.md)
- [Sprint 1 Execution Report](docs/INOVENT_SPRINT_1_REPORT.md)
