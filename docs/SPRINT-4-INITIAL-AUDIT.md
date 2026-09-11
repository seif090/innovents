# INOVENT — Sprint 4 Initial Audit: Communities, Meetups & Social Interaction

**Date:** 2026-09-11  
**Auditors:** Lead Enterprise NestJS Architect, PostgreSQL/Prisma Architect, Security Engineer, Realtime Systems Engineer, QA Lead  
**Scope:** Pre-execution audit of Sprint 1, 2, and 3 baselines and architectural readiness for Sprint 4 (Communities, Meetups, Posts & Social Interaction)  
**Authoritative Specifications:** `INOVENT_MVP_BRD_v2.docx` (Sections 2.2, 4.3, 4.4, 6.2), `INOVENT_DataReq_AR_v2.docx` (Sections 2.2, 2.3, 2.4)

---

## 1. Executive Summary & Repository Baseline

The INOVENT backend has successfully established and verified the core monolith infrastructure (Sprint 1), Identity & RBAC foundation (Sprint 2), and Event/Agenda management domain (Sprint 3). All 16 unit test suites (121 tests) pass cleanly in strict mode.

Sprint 4 introduces the social and engagement layer of INOVENT: **Communities & Meetups**. Communities are event-scoped social spaces operating in a hybrid Threads/Reddit discussion model and realtime chat room, with member-organized Mini Events (Meetups), role-based moderation, and granular access control.

---

## 2. Inventory of Reusable Infrastructure & Services

Sprint 4 builds directly upon existing core enterprise services without introducing redundant architectural mechanisms:

| Existing Component | Source Location | Application in Sprint 4 |
|---|---|---|
| **`PrismaService`** | `src/database/prisma.service.ts` | Relational persistence, complex joins, interactive transactions (`$transaction`), row-locking (`FOR UPDATE`) |
| **`JwtAuthGuard`** | `src/modules/auth/guards/jwt-auth.guard.ts` | Authenticating REST API requests via Bearer JWT access tokens |
| **`@CurrentUser`** | `src/modules/auth/decorators/current-user.decorator.ts` | Secure extraction of authenticated `userId` (`sub`) in controllers |
| **`RolesGuard` & `@Roles`** | `src/modules/auth/guards/roles.guard.ts` | Enforcing platform roles (e.g., `SPONSOR` or `ADMIN` required for sponsored communities) |
| **`AuditService`** | `src/modules/audit/audit.service.ts` | Immutable structured audit trail for community lifecycle events, member bans, and moderation |
| **`OutboxService`** | `src/modules/outbox/outbox.service.ts` | Reliable transactional event publishing for notifications (`COMMUNITY_MENTION_CREATED`, `COMMUNITY_MEETUP_CREATED`, etc.) |
| **`RedisService`** | `src/infrastructure/cache/redis.service.ts` | Distributed locking, socket session tracking, and cache management |
| **`RealtimeModule` / Socket.IO** | `src/infrastructure/realtime/` | Socket.IO server with Redis pub/sub adapter ready for `community:${communityId}` chat rooms |
| **Global Pipeline** | `src/common/` | Consistent API responses (`TransformInterceptor`), centralized exception handling (`HttpExceptionFilter`), strict validation pipes |

---

## 3. Detailed Requirements Breakdown & Domain Mapping

### 3.1 Community Entity (تجمع — Threads Style)
- **Scope:** Every community is strictly scoped to an `eventId`. Communities persist before, during, and after the event.
- **Types:**
  - `FREE`: Created by any active registered user/attendee. Max capacity strictly limited to **20 members** (`FREE_COMMUNITY_MAX_MEMBERS = 20`).
  - `SPONSORED`: Created by a `SPONSOR` or `ADMIN`. Features sponsored badge (`isSponsored = true`), pinned priority positioning in feeds, custom visual branding (sponsor logo, cover image), and configurable member capacity (default 500+).
- **Visibility:**
  - `PUBLIC`: Open discovery in event feeds; any registered user can browse and join.
  - `PRIVATE`: Hidden from unauthenticated public feeds; access restricted to direct invitees/approved members. Non-members attempting to view private communities receive `404 Not Found` (anti-enumeration).
- **Attributes (from DataReq 2.2):**
  - Name: 1-80 characters.
  - Bio: 1-150 characters.
  - Description: 1-1000 characters.
  - Category / Topic: Tech, Business, Creative, Health, Culture, Entrepreneurship, etc.
  - Cover Image URL: Optional (recommended 1200x628).
  - Language: Optional (AR, EN, BILINGUAL).

### 3.2 Community Membership & Roles
- **Roles within a Community:**
  - `OWNER`: Community creator. Full administrative and moderation control. Cannot leave without deleting the community or transferring ownership.
  - `MODERATOR`: Appointed by Owner. Can pin posts, hide/delete posts, and ban members.
  - `SPEAKER`: Designated member highlighted with speaker badge in discussion feeds.
  - `MEMBER`: Regular participant with posting, replying, liking, and chat privileges.
- **Statuses:** `ACTIVE`, `LEFT`, `BANNED`.

### 3.3 Community Posts, Threaded Replies, Likes & Mentions
- **Posts (DataReq 2.3):**
  - Content: 10 to 2000 characters.
  - Attachments: Optional, max 4 image URLs or 1 short video URL.
  - External Link: Optional URL with preview metadata.
  - Pinning: Owner and Moderator can pin significant posts to the top of the feed.
- **Threaded Replies:**
  - Nested replies (`parentReplyId`) enabling arbitrary tree depth discussion.
  - Content: 1 to 2000 characters.
- **Likes:**
  - Idempotent toggle or like/unlike for posts and replies.
  - User can like a post or reply once.
- **Mentions:**
  - `@username` or explicit `mentionedUserIds` parsing.
  - Generates `COMMUNITY_MENTION_CREATED` outbox notifications for target users.

### 3.4 Mini Events / Meetups (الحدث داخل التجمع)
- **Concept (DataReq 2.4):** Real-world gatherings organized by community members to bridge digital interaction into physical meetups.
- **Attributes:**
  - Title: 1-100 characters.
  - Description: 1-500 characters.
  - Starts At: DateTime, must fall within event timeframe or shortly after (`startsAt >= event.startsAt` and `startsAt <= event.endsAt + 7 days`).
  - Ends At: DateTime, optional (`endsAt > startsAt`).
  - Location: 1-255 characters (e.g. "Hall B - Lounge XYZ").
  - Map URL: Optional Google Maps URL.
  - Participant Limit: Optional integer (null = unlimited).
  - Auto-pinned: Automatically highlighted at the top of the community page.
  - Status: `SCHEDULED`, `COMPLETED`, `CANCELLED`.

### 3.5 Realtime Chat (Socket.IO + Redis)
- **Room Topology:** `community:${communityId}`.
- **Handshake Authentication:** JWT verification on connection handshake.
- **Authorization Guard:** Must verify that socket client is an `ACTIVE` member of `communityId` before allowing room subscription or message broadcast.
- **Persistence:** All messages stored in `CommunityChatMessage` table and broadcast to active room participants.

---

## 4. Concurrency & Integrity Architecture

### 4.1 Free Community Member Cap (20 Members) & Meetup Limits
- **Race Condition Risk:** Multiple users simultaneously joining a free community with 19 members could breach the 20-member cap if reads and writes are not serialized.
- **Mitigation Strategy:**
  - Execute join logic inside a Prisma interactive transaction.
  - Acquire a row-level exclusive lock on the `Community` record:
    ```sql
    SELECT id, type, member_capacity, member_count, status FROM communities WHERE id = $1 FOR UPDATE;
    ```
  - Validate active member count against `member_capacity`. If `member_count >= member_capacity`, abort with `409 Conflict` ("Community capacity reached").
  - The same row-locking pattern applies to `CommunityMeetup` join operations enforcing `participantLimit`.

### 4.2 Membership Re-joining & State Transitions
- If a user previously `LEFT` the community, rejoining atomically updates `status = ACTIVE`, `leftAt = null`, `joinedAt = now()` and increments `member_count`.
- If a user is `BANNED`, rejoining is strictly rejected with `409 Conflict` ("User is banned from this community").

---

## 5. Security & Authorization Matrix

| Operation | Allowed Actors | Forbidden Responses |
|---|---|---|
| **Create Free Community** | Any `ACTIVE` registered user | 401 Unauthorized, 403 Suspended |
| **Create Sponsored Community** | `SPONSOR`, `ADMIN` | 403 Forbidden (if regular user) |
| **Update / Delete Community** | Community `OWNER`, Platform `ADMIN` | 403 Forbidden |
| **View Private Community** | Active Members, Community Owner, `ADMIN` | 404 Not Found (Anti-enumeration) |
| **Join Community** | Registered users not banned | 409 Conflict (Cap reached / Banned / Already Member) |
| **Leave Community** | Active Members (except Owner) | 400 Bad Request (Owner cannot leave without transfer) |
| **Create Post / Reply / Like** | `ACTIVE` Community Members | 403 Forbidden |
| **Pin / Unpin Post** | `OWNER`, `MODERATOR`, `ADMIN` | 403 Forbidden |
| **Delete / Hide Post** | Post Author, `OWNER`, `MODERATOR`, `ADMIN` | 403 Forbidden |
| **Create Meetup** | `ACTIVE` Community Members | 403 Forbidden |
| **Join Meetup** | `ACTIVE` Community Members | 409 Conflict (Limit reached / Already joined) |
| **Assign Speaker / Moderator** | Community `OWNER`, `ADMIN` | 403 Forbidden |
| **Ban / Unban Member** | Community `OWNER`, `MODERATOR`, `ADMIN` | 403 Forbidden |

---

## 6. Execution Roadmap

1. **Phase 1: Prisma Schema & Database Migration:** Add enums, models (`Community`, `CommunityMember`, `CommunityPost`, `CommunityPostReply`, `CommunityPostLike`, `CommunityMention`, `CommunityMeetup`, `CommunityMeetupParticipant`, `CommunityChatMessage`), update reciprocal relations on `User` and `Event`. Validate schema and generate Prisma client.
2. **Phase 2: Core Community Domain & Authorization:** Implement `CommunityAuthorizationService`, DTOs, `CommunitiesService`, and `CommunitiesController`.
3. **Phase 3: Community Membership & Capacity Locking:** Implement `CommunityMembersService`, member status lifecycle, concurrency-safe joining, and `CommunityMembersController`.
4. **Phase 4: Posts, Threaded Replies & Moderation:** Implement `CommunityPostsService`, `CommunityRepliesService`, pinning, deletion, and moderation.
5. **Phase 5: Likes & @Mentions:** Implement idempotent liking and mention extraction with outbox notifications.
6. **Phase 6: Mini Events / Meetups:** Implement `CommunityMeetupsService`, participation locking, date validation, and meetups controller.
7. **Phase 7: Realtime Chat Gateway:** Implement `CommunityGateway` and `CommunityChatService` with JWT handshake validation and database membership authorization.
8. **Phase 8: Comprehensive Verification & Testing:** Author unit tests for all domain services and comprehensive E2E test suite (`test/communities.e2e-spec.ts`). Ensure 100% test pass rate, strict TypeScript, lint, and build validation.
