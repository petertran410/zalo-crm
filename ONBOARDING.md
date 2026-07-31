# Onboarding — Hi-CRM (Zalo Sales CRM)

> Read-only analysis produced by exploring the repo. Every non-obvious claim cites the file it came from. Where something is inferred rather than documented, it's marked **(inferred)**.
>
> Counts below are the **live** values at time of writing (`grep`/`find` over the tree); the hand-written [`docs/architecture/README.md`](docs/architecture/README.md) quotes older figures (93 models / 23 modules / 25 views, dated 2026-06-16) — the codebase has grown since.

---

## 1. Overview

**What it does.** Hi-CRM is a multi-tenant CRM for running sales over **multiple personal Zalo accounts** ("nicks") from one web app. It connects to Zalo through the unofficial `zca-js` SDK ([`backend/package.json:53`](backend/package.json)), syncs friends and messages per nick, and layers CRM workflows on top: a unified inbox/chat, contact & lead management, lead scoring, appointments, tasks, tag taxonomy, automation/broadcast campaigns, AI assist, lead intake from Facebook/TikTok/Zalo forms, and reporting. Source of the "many Zalo nicks on one web app" framing: [`docs/architecture/README.md`](docs/architecture/README.md).

**Repo layout (top level):**

| Path | Purpose |
|---|---|
| `backend/` | Fastify + Prisma API server (own `package.json`, name `zalo-sales-crm-backend`) |
| `frontend/` | Vue 3 + Vite SPA (own `package.json`, name `frontend`) |
| `docker/`, `docker-compose.yml`, `docker-compose.dev.yml` | Container/orchestration; dev compose starts Postgres only ([`docker-compose.dev.yml`](docker-compose.dev.yml)) |
| `docs/` | Vietnamese setup/deploy guides + `docs/architecture/` (Mermaid + Excalidraw diagrams) |
| `scripts/`, `bin/` | Operational scripts / entrypoints **(inferred from names; not deeply inspected)** |
| `assets/` | Static/brand assets **(inferred)** |
| `CHANGELOG.md`, `SECURITY.md`, `HUONG-DAN-CAI-DAT.md` | Changelog, security policy, install guide (Vietnamese) |

There is **no root `package.json`** — this is a two-package repo, each installed/built independently.

---

## 2. Tech Stack

### Language & runtime
- **TypeScript** throughout, ESM modules (`"type": "module"` in both [`backend/package.json:6`](backend/package.json) and [`frontend/package.json:5`](frontend/package.json)).
- Backend TS `^6.0.2`, run via `tsx` in dev ([`backend/package.json:8,66`](backend/package.json)); frontend TS `~5.9.3` ([`frontend/package.json:41`](frontend/package.json)).
- Node — modern LTS **(inferred; no `engines` field found)**. `@types/node` is v25 backend / v24 frontend.

### Backend frameworks & major libraries — all from [`backend/package.json`](backend/package.json)
- **Fastify 5** (`fastify ^5.8.4`) — web framework, with `@fastify/jwt`, `@fastify/cors`, `@fastify/multipart`, `@fastify/rate-limit`, `@fastify/static`, `@fastify/cookie`.
- **Prisma 7** (`@prisma/client ^7.5.0` + `@prisma/adapter-pg`) — ORM. Prisma 7 requires an explicit adapter ([`backend/src/shared/database/prisma-client.ts:11-12`](backend/src/shared/database/prisma-client.ts)).
- **PostgreSQL** via `pg` (Postgres 16 in dev, [`docker-compose.dev.yml:8`](docker-compose.dev.yml)).
- **Socket.IO 4** — realtime, wired in [`backend/src/app.ts:216`](backend/src/app.ts).
- **BullMQ + ioredis** — job queues (Redis-backed); `@bull-board/*` for a queue dashboard.
- **zca-js** — unofficial Zalo client SDK.
- **bcryptjs** (password hashing), **jsonwebtoken** / `@fastify/jwt` (auth), **node-cron** (schedulers), **firebase-admin** (push), **telegram** (Telegram bridge), **sharp**/`image-size` (media), **@aws-sdk/client-s3** (R2/MinIO storage), **exceljs** (exports).
- **Testing:** Vitest (`vitest ^4.1.4`).

### Frontend frameworks & major libraries — all from [`frontend/package.json`](frontend/package.json)
- **Vue 3** (`vue ^3.5.30`) + **Vite** (`vite ^8`) + **vue-tsc** (build type-check).
- **Vuetify 4** (`vuetify ^4.0.4`) + `@mdi/font` — Material UI kit.
- **Pinia 3** — state; **vue-router 4** — routing; **axios** — HTTP; **socket.io-client** — realtime.
- **TipTap 3** — rich-text editor; **chart.js + vue-chartjs** — charts; **vue-i18n** — i18n scaffolding; **lucide-vue-next** — icons; **vite-plugin-pwa** — PWA.
- **Testing:** Vitest + `@vue/test-utils` + `jsdom`.

### Package manager & local commands
- **npm** (each package has a `package-lock.json`; no pnpm/yarn lockfiles found).

```bash
# --- Backend (from backend/) ---
npm install
docker compose -f ../docker-compose.dev.yml up -d   # start Postgres (dev)
npm run db:migrate        # prisma migrate dev — apply/create migrations
# (after schema changes also: npx prisma generate)
npm run db:seed           # tsx prisma/seed.ts
npm run dev               # tsx watch --env-file=.env src/app.ts   (port 3000)
npm test                  # vitest run
npm run build             # tsc

# --- Frontend (from frontend/) ---
npm install
npm run dev               # vite dev server (port 5173, proxies /api -> :3000)
npm test                  # vitest run
npm run build             # vue-tsc -b && vite build
```
Backend scripts: [`backend/package.json:7-18`](backend/package.json). Frontend scripts: [`frontend/package.json:6-12`](frontend/package.json). Vite dev proxy `/api` → `localhost:3000`: [`frontend/vite.config.ts`](frontend/vite.config.ts).

> ⚠️ **Dev-DB caveat:** [`docker-compose.dev.yml`](docker-compose.dev.yml) exposes Postgres on host port **5433** with user `crmuser`, but a working local setup on this machine used `postgresql://postgres:...@localhost:5432/zalocrm` — i.e. the compose file and an actual dev `.env` diverge. Confirm which Postgres your `DATABASE_URL` points at before running migrations. See §7.

---

## 3. Architecture

**Overall pattern:** a **modular monolith**. One Fastify process ([`backend/src/app.ts`](backend/src/app.ts)) registers ~26 feature modules under [`backend/src/modules/`](backend/src/modules). Each module is a folder owning its routes + services. There is no separate microservice per domain, but background work is offloaded to **BullMQ/Redis** queues and **node-cron** sweepers. The frontend is a separate SPA that talks REST + WebSocket. Framing confirmed by [`docs/architecture/README.md`](docs/architecture/README.md).

### Request flow, layer by layer
1. **Entry point** — [`backend/src/app.ts`](backend/src/app.ts) boots Fastify, registers plugins (JWT, CORS, multipart, rate-limit, static), attaches Socket.IO (`app.decorate('io', io)`, [`app.ts:224`](backend/src/app.ts)), then `await app.register(<module>Routes)` for every module ([`app.ts:257+`](backend/src/app.ts)).
2. **Route module** — e.g. [`backend/src/modules/contacts/notes-routes.ts`](backend/src/modules/contacts/notes-routes.ts). Each exports `async function xRoutes(app: FastifyInstance)` and registers an auth hook: `app.addHook('preHandler', authMiddleware)`.
3. **Auth/tenant layer** — `authMiddleware` ([`backend/src/modules/auth/auth-middleware.ts`](backend/src/modules/auth/auth-middleware.ts)) verifies the JWT and populates `request.user` = `{ id, email, role, orgId }`. Every handler scopes queries by `orgId`.
4. **Visibility scoping** — record-level access is resolved by `getContactScope()` / `assertContactVisible()` ([`backend/src/modules/contacts/contact-scope.ts`](backend/src/modules/contacts/contact-scope.ts)), used by 14+ modules to filter what a non-admin user may see.
5. **Business logic + data access** — handlers call the shared Prisma client ([`backend/src/shared/database/prisma-client.ts`](backend/src/shared/database/prisma-client.ts)). There isn't a strict separate "service layer" everywhere; simple modules put logic inline in route handlers (see notes/tasks), while heavier modules split out `*-service.ts` files (e.g. `modules/analytics/analytics-service.ts`, `modules/ai/ai-service.ts`).
6. **Cross-cutting side-effects** — audit via `logActivity()` ([`backend/src/modules/activity/activity-logger.ts`](backend/src/modules/activity/activity-logger.ts), fire-and-forget), realtime emits via `shared/realtime`, and queue jobs via BullMQ.
7. **Response** — handlers return plain objects (Fastify serializes to JSON; note the global `BigInt.toJSON` shim at [`app.ts:9`](backend/src/app.ts)). Errors are caught per-handler and returned as `reply.status(code).send({ error })`.

**Frontend flow:** `views/*.vue` (routed by [`frontend/src/router/index.ts`](frontend/src/router/index.ts)) call **composables** (`composables/use-*.ts`) that hit the shared axios client [`frontend/src/api/index.ts`](frontend/src/api/index.ts) (`baseURL /api/v1`, JWT interceptor, refresh handling). Feature data lives in composables, **not** Pinia — Pinia is only for cross-cutting state (`stores/auth.ts`, `stores/rbac.ts`, `stores/privacy.ts`). Realtime patches arrive via `frontend/src/api/socket.ts`.

### Key modules (from [`backend/src/modules/`](backend/src/modules) + architecture README)
- **Identity/Access:** `auth`, `rbac`, `privacy`
- **Zalo integration:** `zalo` (pool/socket/listener per nick), `system-notifications`, `devices`, `push`
- **CRM core:** `contacts`, `chat`, `tags`, `lists`, `search`
- **Growth/intelligence:** `scoring`, `engagement`, `campaign`, `ai`
- **Reporting:** `analytics`, `dashboard`
- **Platform/shared:** `api` (public API + webhooks), `integrations` (Google Sheets, Zapier, Telegram), `notifications`, `branding`, `activity`, `media`, `config`

### External integrations
- **Zalo** (`zca-js`), **Redis** (BullMQ queues + cache), **PostgreSQL**, **S3-compatible object storage** — local disk or Cloudflare R2/MinIO, selected by `STORAGE_DRIVER` env ([`backend/src/config/index.ts:54`](backend/src/config/index.ts)).
- **AI providers** — Anthropic (default), Gemini, OpenAI, Qwen, Kimi; configured via env ([`config/index.ts:75-108`](backend/src/config/index.ts)).
- **Lead intake** — Facebook Leadgen, TikTok, Zalo OA forms (`modules/integrations`, plus schema models `FacebookLeadgenForm`, `TiktokAdvertiserConnection`, `ZaloOaConnection`).
- **Push** — Firebase (`firebase-admin`). **Telegram bridge** (`telegram`).

---

## 4. Data Model

- **Where it lives:** single Prisma schema [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) — **109 `model` blocks** (live `grep -c '^model '`). Migrations in [`backend/prisma/migrations/`](backend/prisma/migrations) (111 migration folders). Row-level security policy in [`backend/prisma/rls/tenant-rls.sql`](backend/prisma/rls/tenant-rls.sql).
- **Database:** PostgreSQL 16.
- **Conventions:** UUID PKs (`@default(uuid())`), snake_case columns via `@map`, snake_case tables via `@@map`, string status fields (not enums), `createdAt`/`updatedAt` timestamps, composite `@@index` matching hot queries. Every tenant-owned model carries `orgId` and cascades from `Organization`.

**The core design decision — "two notebooks"** ([`docs/architecture/README.md`](docs/architecture/README.md)):
- **`Contact`** = the parent customer record (manager/list/dashboard view); holds person attributes + aggregate score/status/counters. Visible parents = `contacts WHERE merged_into IS NULL`.
- **`Friend`** = a per-nick care record; one row per `ZaloAccount × identity`. One `Contact` → many `Friend`. The *primary* lead score lives on `Friend`; `Contact.leadScore` is a MAX aggregate.

Multi-tenancy is enforced two ways: an app-layer **tenant guard** Prisma extension (default off) and **Postgres RLS** as the real boundary ([`prisma-client.ts:111-151`](backend/src/shared/database/prisma-client.ts), `ORG_SCOPED_MODELS` in [`backend/src/shared/tenant/org-scoped-models.ts`](backend/src/shared/tenant/org-scoped-models.ts)).

### ER diagram (core CRM entities only — a curated subset of the 109 models)

```mermaid
erDiagram
    Organization ||--o{ User : has
    Organization ||--o{ Team : has
    Organization ||--o{ Department : has
    Organization ||--o{ ZaloAccount : has
    Organization ||--o{ Contact : has
    Organization ||--o{ Status : defines
    Organization ||--o{ CrmTag : defines

    Team ||--o{ User : groups
    Department ||--o{ DepartmentMember : has
    User ||--o{ DepartmentMember : "member of"

    User ||--o{ ZaloAccount : owns
    User ||--o{ ContactAccess : "granted"
    Contact ||--o{ ContactAccess : "shared via"

    Contact ||--o{ Friend : "1 parent : N nicks"
    ZaloAccount ||--o{ Friend : "per-nick care row"
    Contact ||--o{ Conversation : has
    ZaloAccount ||--o{ Conversation : hosts
    Conversation ||--o{ Message : contains

    Contact ||--o{ Appointment : has
    User ||--o{ Appointment : "assigned"
    Contact ||--o{ Note : has
    User ||--o{ Note : authored
    Note ||--o{ Note : "reply thread"

    Contact ||--o{ Task : "linked (optional)"
    User ||--o{ Task : "assignee / creator"
    Contact }o--|| Status : "current care status"
    Contact ||--o{ Contact : "parent / children (merge)"

    Organization {
      string id PK
      string name
      string timezone
    }
    Contact {
      string id PK
      string orgId FK
      string fullName
      string phone
      string phoneNormalized
      int leadScore
      string statusId FK
      datetime archivedAt
    }
    Friend {
      string id PK
      string contactId FK
      string zaloAccountId FK
      int leadScore
      string relationshipKind
    }
    Task {
      string id PK
      string orgId FK
      string assigneeUserId FK
      string contactId FK
      datetime dueAt
      string status
    }
```

> The diagram is a **hand-picked subset** for orientation. Dozens of other models exist (automation/sequences/triggers, lead-pool, media library, Facebook/TikTok/Zalo lead intake, engagement analytics, RBAC permission groups, care sessions). For the full picture use [`docs/architecture/zalocrm-data-model.mmd`](docs/architecture/zalocrm-data-model.mmd) and the schema itself.

---

## 5. Conventions

### Naming
- **Files:** kebab-case for backend TS (`notes-routes.ts`, `contact-scope.ts`, `activity-logger.ts`); route modules end in `-routes.ts`, services in `-service.ts`. Frontend: **PascalCase** for components/views (`TasksView.vue`, `NotificationBell.vue`), **kebab-case** for composables/utility `.ts` (`use-tasks.ts`, `use-org-timezone.ts`).
- **Functions/vars:** `camelCase`. Composables are `useX()`. Prisma models `PascalCase`; DB columns/tables snake_case via `@map`/`@@map`.
- **Comments:** predominantly **Vietnamese**, often dated (e.g. `// Phase … 2026-06-07`). Match the surrounding language/density when editing.

### Code style / linting
- **No ESLint or Prettier config exists** anywhere in `backend/` or `frontend/` (searched for `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*` — none). Style is enforced by convention + TypeScript only. Type-checking is the real gate: `tsc` (backend) and `vue-tsc` (frontend build). **See §7 — this is a gap.**
- TS configs: [`backend/tsconfig.json`](backend/tsconfig.json); frontend split into [`tsconfig.app.json`](frontend/tsconfig.app.json) / [`tsconfig.node.json`](frontend/tsconfig.node.json).

### Folder structure for new features
- **Backend:** one folder per domain under `backend/src/modules/<feature>/`, containing `<feature>-routes.ts` (+ optional `-service.ts`, pure helpers, and co-located `*.test.ts`). Register the route function in [`backend/src/app.ts`](backend/src/app.ts). Add tenant-owned models to `ORG_SCOPED_MODELS`.
- **Frontend:** `views/<Feature>View.vue` (routed in `router/index.ts`), `components/<feature>/*.vue`, `composables/use-<feature>.ts` for data/API. Nav entries live in `layouts/DefaultLayout.vue`.

### Testing
- **Framework:** Vitest both sides.
- **Backend:** tests live in [`backend/tests/`](backend/tests) (63 `*.test.ts` files) and are **pure-logic unit tests** (no live DB — extract pure functions and test those; see `tests/appointment-reminders.test.ts`, `tests/task-time.test.ts`).
- **Frontend:** **co-located** `*.spec.ts` next to source (e.g. `frontend/src/composables/work-scope-logic.spec.ts`, `frontend/src/components/chat/slash-popup-rules.spec.ts`).
- Run with `npm test` (`vitest run`) in each package.
- ⚠️ A large number of backend test files currently **fail on the base branch** due to stale mocks (unrelated to any one feature) — don't assume a red suite means your change broke something; diff against a clean checkout. See §7.

### Git / branch / commit conventions
- No `CONTRIBUTING.md`, no `.github/PULL_REQUEST_TEMPLATE.md`, no CI workflows (`.github/workflows` absent).
- Observable from history: `main` is the integration branch; feature work happens on branches (e.g. `report_khang`). **Commit messages are written in Vietnamese** with a summary line + bulleted body (see recent log). No enforced format tooling.

---

## 6. Adding a New Feature (worked pattern)

Using the existing **Tasks** feature as the reference template, a typical CRUD-ish feature touches:

**Backend**
1. **Schema** — add the model to [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) (uuid id, `orgId` + relation `onDelete: Cascade`, snake_case `@map`, `@@index`, `@@map`); add back-relations on `Organization`/`User`/`Contact` as needed.
2. Add the model name to `ORG_SCOPED_MODELS` ([`backend/src/shared/tenant/org-scoped-models.ts`](backend/src/shared/tenant/org-scoped-models.ts)).
3. Migrate: `npm run db:migrate -- --name <feature>` then `npx prisma generate` (regenerate the client or `tsc` will error `Property 'x' does not exist`).
4. Create `backend/src/modules/<feature>/<feature>-routes.ts` — `export async function <feature>Routes(app)`, `app.addHook('preHandler', authMiddleware)`, per-handler try/catch + `logger.error`, `orgId` scoping, `assertContactVisible` if it links a contact.
5. Register it in [`backend/src/app.ts`](backend/src/app.ts) (import + `await app.register`).
6. Register audit action strings in [`backend/src/modules/activity/action-types.ts`](backend/src/modules/activity/action-types.ts) and call `logActivity()`.
7. Add pure-logic unit tests in `backend/tests/<feature>-*.test.ts`.

**Frontend**
8. `composables/use-<feature>.ts` (interface + axios calls, mirror `use-appointments.ts`).
9. `views/<Feature>View.vue` + `components/<feature>/*.vue`.
10. Route in [`frontend/src/router/index.ts`](frontend/src/router/index.ts) (+ `ROUTE_TITLES`), nav item in [`frontend/src/layouts/DefaultLayout.vue`](frontend/src/layouts/DefaultLayout.vue).
11. Frontend labels for activity/notifications in `frontend/src/constants/activity-types.ts` if applicable.

**Verify:** `cd backend && npm test`; `cd frontend && npm run build` (type-check); manual E2E against both dev servers.

---

## 7. Gaps & Questions (ask your mentor)

1. **Dev database mismatch.** [`docker-compose.dev.yml`](docker-compose.dev.yml) says Postgres on `:5433` / user `crmuser`, but a real local `.env` here used `:5432` / user `postgres`. **Which is the sanctioned dev setup?** Is there a canonical `.env.example`? (`.env*` is gitignored — [`.gitignore:3`](.gitignore).)
2. **No linter/formatter.** There's no ESLint/Prettier config. Is style purely by convention, or is there a shared config I should import? What's the expectation for formatting a PR?
3. **Failing test baseline.** Many `backend/tests/*.test.ts` fail on a clean checkout (stale mocks, e.g. a missing `tenantTransaction` export). Is this known/tolerated, and is there a "known-green" subset I should run before pushing?
4. **No CI.** No `.github/workflows`. Are tests/type-checks run anywhere automatically before merge, or is it all local discipline?
5. **Multi-tenancy rollout state.** Tenant guard and RLS are both gated **off by default** (`TENANT_GUARD_MODE`, `RLS_SET_CONFIG` in [`config/index.ts`](backend/src/config/index.ts)). What are they set to in staging/production today, and should local dev enable them?
6. **Open-core / "EE" split.** There's an extension mechanism (`loadExtension()` in `app.ts`, `frontend/src/_ee-stubs/`, `@ee/*` aliases). Which features are community vs. extension, and how do I run/build with the extension enabled?
7. **Zalo SDK legality/stability.** Integration rides an *unofficial* Zalo SDK (`zca-js`). What are the operational constraints (rate limits, account bans) I should be aware of before touching sync code?
8. **Stale architecture doc.** [`docs/architecture/README.md`](docs/architecture/README.md) is dated 2026-06-16 and undercounts models/modules/views vs. today. Is keeping those diagrams current part of the workflow (`/diagram`), and how often?
9. **Migration hygiene.** There are drift-reconciliation migrations in history (e.g. a `_ini` migration that drops/re-adds constraints), suggesting `prisma db push` was used alongside `migrate`. What's the rule — always `migrate dev`, never `db push` on shared DBs?
```
