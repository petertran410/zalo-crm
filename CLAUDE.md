# CLAUDE.md

Agent guide for this repo. Recreated 2026-08-11 — this file is gitignored (local-only), so if it's
missing at session start, that's expected on a fresh clone/checkout, not a sign anything was deleted
on purpose. Rebuild it from `git log` and `claude_todo/features/*.md` if it ever goes missing again.

## Stack

- Backend: Node/Fastify + Prisma, **PostgreSQL** (not MySQL), `backend/prisma/schema.prisma`.
- Frontend: Vue 3, workspace-based layouts (`DefaultLayout` for admin + 6 workspaces, `SalesLayout` separate).
- Native dev boot, no Docker: `run.bat` starts Postgres (Windows service) + `npm run dev` in backend/frontend
  directly, plus a separate "Hi-CRM Worker" window for BullMQ (`src/worker.ts`). Docker compose files still
  exist but aren't the dev path on this machine.
- Branch layout: `report_khang` (this branch, primary work), `report_khoa` (POS integration, merged in),
  `test_feature` (shared integration branch, merged in twice — merges have caused silent regressions
  before, see "Merge hygiene" below).

## Where to look first

- `claude_todo/features/*.md` — dated running log of what a session did, what's left, and what to watch
  out for. **Read the most recent one before starting work.** Also gitignored/local-only; write a new
  dated file (e.g. `aug12.md`) at the end of a session that does non-trivial work, don't just edit the
  latest one in place.
- `feature_catalog.md` — full module-by-module feature inventory (25 backend modules), kept current.
- `CHANGELOG.md` — user-facing release notes, Vietnamese, semantic-ish versioning.
- `system_architecture_overview.md`, `docs/architecture/` — system design docs.
- `FRIENDS_CONTACTS_INVENTORY.md`, `APPOINTMENTS_REVAMP_SCOPE.md` — scoping docs for specific past
  revamps (People tab, Appointments tab); useful history, not necessarily current state.

Commit messages on this branch are written as detailed engineering logs (what changed, why, what was
verified, what was deliberately left alone) — `git log` on a touched file is often faster than guessing.

## Working with Khang — learning workflow (added 2026-08-12)

Khang is ~6 weeks into this project and explicitly wants to build real software engineering + CRM
domain understanding, not just ship via a "prompt → tune → commit" loop on autopilot. He asked for this
to be enforced across sessions until it's a habit — treat the points below as active session behavior,
not background trivia.

- **Before implementing anything non-trivial, make him frame it first.** Don't just take a bug report or
  feature ask and start coding. Ask him to state in a couple sentences what's wrong/needed and what
  "done" looks like — if he skips straight to "just fix it," ask the framing question yourself before
  proceeding, don't silently do it for him.
- **For real design decisions, offer 2-3 options with tradeoffs and let him pick**, instead of silently
  choosing the approach. Small/mechanical changes (typo fixes, obvious one-liners) don't need this.
- **When something's broken, explain the root cause before or alongside the fix**, not just "fixed it."
  He wants the "why did this happen" — that's the part that transfers to the next bug.
- **Flag it if he's about to accept a non-trivial diff without having looked at it.** A quick "want to
  read through this before I commit, or should I walk you through the key part?" is enough — don't
  block on it, just don't let review silently get skipped.
- **At the end of a session that did non-trivial work, ask for one line for the session log**: "what's
  one thing you understood today that you didn't before?" This goes in the `claude_todo/features/*.md`
  entry for that session (see below), not just in chat.
- Don't turn this into friction on every single message — small fixes, formatting, routine ops work
  don't need the full ritual. Reserve it for changes that actually touch design, data model, security,
  or recurring bug patterns (the kind of thing already itemized in "Hard rules" and the module sections
  below).
- When writing `claude_todo/features/*.md`, add a short "Learned" line alongside "Đã xong"/"Cần làm
  tiếp" — one sentence, in his own words if he gave one, else your best summary of what the session
  actually taught (a root cause, a tradeoff, a pattern). This is the part of the log that's for him, not
  for reconstructing repo state.

## Hard rules (recovered from history — treat as binding)

- **Never `io.emit(...)` bare.** Always scope to the org room: `io.to(\`org:${orgId}\`).emit(...)`. A bare
  emit broadcasts to every socket in every organization. This was a real bug (`contact-routes.ts:1312`,
  fixed 2026-07-31) — don't reintroduce the pattern in new realtime code.
- **Throttle rapid Zalo SDK calls to ~700ms apart.** Same threshold used in the pending-send queue and
  elsewhere for bulk/sequential Zalo API calls, to stay under Zalo's rate limits.
- **Comment style (actively enforced during Aug 2026 cleanup pass):** comments should answer "why", not
  restate what the code already says. Max ~2 sentences, no decorative long-dash headers, no dates/phase
  numbers/"anh chốt" annotations — `git blame` already carries that. See `claude_todo/features/aug11.md`
  for the file list still pending this pass.

## RBAC state (as of 2026-08-06, commit 7936be3)

- **4 active roles**: Admin, CEO, Sale, Chăm sóc khách hàng (Customer Care).
- **Deprecated but still in code, not seeded for new orgs**: Trưởng phòng (dept head), Sale Senior,
  Marketing, Hành chính - Nhân sự. Existing orgs that already have these keep them; don't delete the
  code paths, they're intentionally dormant.
- Known latent bug if "Trưởng phòng" is ever re-enabled: its `view_all` scope resolves company-wide, not
  department-wide. Moot today (0 users in that group) but not fixed at the code level.
- `customGrants` is 3-state (allow / deny / inherit), not boolean — use `resolveGrant()`, not a raw
  `=== true` check, or per-user overrides silently no-op.
- 5 workspace menus are still stubs (marketing, finance, director, warehouse, call-center) — hidden from
  the workspace switcher, not deleted.

## Kho lưu trữ (Media/Storage) limits — as of 2026-08-10

- 10MB per file, 100MB per upload request, 25 files per request — applies to the **storage/album** upload
  routes only (`request.parts({ limits })`), not chat attachments.
- Chat attachments have their own, much larger limits (images 100MB, video 500MB) — don't conflate the two
  when changing multipart config; a global `fileSize` change affects both.
- **Video is effectively unusable in the storage module right now** — 10MB barely covers a few seconds of
  phone video. There's a `TODO(video)` marker at the limit definition; a real fix needs a separate cap for
  `kind='video'`.
- Images keep their original format and dimensions now (no forced WebP conversion, no downscaling) —
  this was a deliberate reversal of the previous "convert everything to WebP, cap at 2000px" behavior.
  PNG compression is weak as a result (lossless-only); that's an accepted tradeoff, not a bug.

## Merge hygiene

Merges from `test_feature` into `report_khang` have twice produced regressions that didn't show as git
conflicts (silent drops of routes, imports, or fields — see commits `57ab9bd`, `e8a0112`). After merging
another branch in, diff `app.ts` registrations and route imports explicitly rather than trusting a clean
merge; `vite build` and `tsc --noEmit` catch some but not all of this class of bug (missing runtime
registrations don't fail typecheck).

## Test suite baseline

Backend test suite has a pre-existing baseline of failing tests unrelated to feature work — stale mocks
after `tenantTransaction` was introduced (~81 failing entries as of 2026-08-06; storage-module tests
specifically are clean, 53/53 passing as of 2026-08-10). When verifying a change, compare against the
current baseline (stash your diff and re-run) rather than assuming red tests are yours to fix.

## Known dev-only footgun

`backend/prisma/create-sale-user.ts` has a hardcoded dev password (`SaleTest123`), matching the existing
`prisma/seed.ts` convention (`AdminTest123`). It's committed and public in the repo — intentional for a
dev seed script, but don't copy this pattern into anything that touches real user data.
