# INOVENT — Environment Variables Specification

This document defines all environment variables utilized across the INOVENT backend.

---

## Variable Reference Table

| Variable Name | Required? | Default / Example | Purpose | Environment |
|---|---|---|---|---|
| `NODE_ENV` | Optional | `development` | Runtime mode (`development`, `test`, `production`) | All |
| `PORT` | Optional | `3000` | HTTP port the application listens on | All |
| `API_PREFIX` | Optional | `api/v1` | Global URI version prefix for REST endpoints | All |
| `DATABASE_URL` | **Required** | `postgresql://user:pass@host:5432/db?schema=public` | PostgreSQL connection string | All |
| `REDIS_HOST` | Optional | `localhost` | Redis server hostname | All |
| `REDIS_PORT` | Optional | `6379` | Redis port number | All |
| `REDIS_PASSWORD` | Optional | *(empty)* | Redis authentication password if required | Staging, Prod |
| `REDIS_URL` | Optional | `redis://localhost:6379` | Redis connection URL | All |
| `JWT_ACCESS_SECRET` | **Required** | `(random 32+ character string)` | Secret key for signing access JWT tokens | All |
| `JWT_REFRESH_SECRET` | **Required** | `(random 32+ character string)` | Secret key for signing refresh tokens | All |
| `JWT_ACCESS_EXPIRES_IN` | Optional | `15m` | Lifetime of access JWT | All |
| `JWT_REFRESH_EXPIRES_IN`| Optional | `7d` | Lifetime of refresh token | All |
| `OTP_EXPIRES_IN_MINUTES`| Optional | `5` | Minutes before numeric OTP code expires | All |
| `OTP_MAX_ATTEMPTS` | Optional | `5` | Max verification attempts before OTP lock | All |
| `OTP_COOLDOWN_SECONDS` | Optional | `60` | Cooldown period before resending OTP | All |
| `SMTP_HOST` | Optional | `localhost` | SMTP email gateway server hostname | All |
| `SMTP_PORT` | Optional | `1025` | SMTP port (1025 for MailHog, 587/465 in prod) | All |
| `SMTP_USER` | Optional | *(empty)* | SMTP username | Prod |
| `SMTP_PASSWORD` | Optional | *(empty)* | SMTP password | Prod |
| `SMTP_FROM` | Optional | `"INOVENT" <noreply@innovent.app>` | Standard default sender address | All |
| `STORAGE_ENDPOINT` | Optional | `http://localhost:9000` | S3-compatible API endpoint | All |
| `STORAGE_REGION` | Optional | `us-east-1` | S3 storage region | All |
| `STORAGE_BUCKET` | Optional | `innovent-media` | Default storage bucket name | All |
| `STORAGE_ACCESS_KEY` | Optional | `minioadmin` | S3 storage access key ID | All |
| `STORAGE_SECRET_KEY` | Optional | `minioadmin` | S3 storage secret access key | All |
| `STORAGE_FORCE_PATH_STYLE`| Optional| `true` | Required for MinIO path-style bucket URLs | Dev |
| `STRIPE_SECRET_KEY` | Optional | `sk_test_...` | Stripe API secret key (Sprint 9) | Staging, Prod |
| `STRIPE_WEBHOOK_SECRET` | Optional | `whsec_...` | Stripe webhook signing secret (Sprint 9) | Staging, Prod |
| `GOOGLE_CLIENT_ID` | Optional | *(empty)* | Google OAuth client ID | All |
| `GOOGLE_CLIENT_SECRET` | Optional | *(empty)* | Google OAuth client secret | All |
| `LINKEDIN_CLIENT_ID` | Optional | *(empty)* | LinkedIn OAuth client ID | All |
| `LINKEDIN_CLIENT_SECRET` | Optional | *(empty)* | LinkedIn OAuth client secret | All |
| `CORS_ORIGINS` | Optional | `http://localhost:3000,http://localhost:5173` | Comma-separated list of allowed origins | All |
| `LOG_LEVEL` | Optional | `debug` | Structured logging verbosity level | All |
| `ENABLE_SWAGGER` | Optional | `true` | Toggles OpenAPI `/api/docs` endpoint | Dev, Staging |
