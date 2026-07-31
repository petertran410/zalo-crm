# Friends ("Bạn bè") + Contacts ("Khách hàng") — Full Frontend/Backend Inventory

Compiled 2026-07-29 ahead of a planned UI merge of the two tabs into a single "Contact" view
with a friend/non-friend filter. Nothing in the codebase has been changed to produce this
document — it's read-only research.

**Risk key:**
🟢 Low — self-contained, no outside references found; safe to remove/change freely
🟡 Medium — 1–2 outside consumers, or a persisted key/type used narrowly; needs a small coordinated update
🔴 High — shared realtime contract, shared dialog, or shared composable/type used across ≥3 outside modules
⚫ Flag only — pre-existing bug/inconsistency noted in passing, not a removal candidate

---

## 1. Pages / Views

| Feature | Location | Depends on | Risk if removed/reshaped |
|---|---|---|---|
| Friends page | `views/FriendsView.vue` | 6 friends components, `use-friends.ts`, `use-friends-state.ts`, `use-friend-socket.ts`, `use-zalo-accounts.ts`, `CustomerProfileDialog` | 🟢 route-local; nothing deep-links *into* internal state, only into the `/friends` path itself |
| Contacts page | `views/ContactsView.vue` | 6 contacts components, `use-contacts.ts`, `use-friend-socket.ts`, `MobileContactView` (conditional) | 🟢 route-local; the `/contacts` path itself is referenced externally (see §7) |
| Mobile contacts fallback | `views/MobileContactView.vue` | `useContacts()`, `ContactDetailDialog` | 🟡 only consumer of the legacy `ContactDetailDialog`; cutting the mobile view makes that dialog fully dead too |
| Contact profile (separate route) | `views/ContactProfileView.vue` + `composables/use-contact-profile.ts` | **Not deeply inventoried — out of scope of this pass.** Exists at `/contacts/:id/profile` (`router/index.ts:431`). | ⚠️ Unknown — needs its own follow-up pass before finalizing merge scope; may be a third UI surface touching the same data |

---

## 2. Friends-tab components

| Component | Location | Depends on | Used outside Friends tab? | Risk if removed |
|---|---|---|---|---|
| `FriendDetailPanel` | `components/friends/` | `use-friend-display.ts`, `use-org-timezone` | No | 🟢 |
| `FriendsBulkBar` | `components/friends/` | none (pure emits) | No | 🟢 — 3 of its 4 actions are unwired `console.log` stubs in the parent anyway |
| `FriendsFilterBar` | `components/friends/` | `GET /settings/statuses` directly | No | 🟢 |
| `FriendsSmartHints` | `components/friends/` | client-derived only | No | 🟢 — 3 of 4 hints are unwired stubs (only `hotPending` is actually wired) |
| `FriendsTable` | `components/friends/` (977 lines, largest friends-side file) | none external | No | 🟢, but **duplicates its own `displayName()`/avatar-hash/tag-color logic** instead of reusing `use-friend-display.ts` — an inconsistency to fix during the rewrite, not a coupling risk |
| `NickSidebar` | `components/friends/` | `use-zalo-accounts.ts` (type only) | No | 🟢 |

## 3. Friends-tab composables

| Composable | Location | API endpoints | Used outside Friends tab? | Risk if removed |
|---|---|---|---|---|
| `use-friends.ts` (`DbFriend` type, `useFriends()`) | `composables/` | `/zalo-accounts/:id/friends-db`, `/friends-db/all-nicks`, `/friends-db/sync`, plus ~15 legacy live-Zalo endpoints (find/requests/block/etc.) | No | 🟢, **but ~16 of its 20 exported functions/state fields are dead** — `FriendsView` only uses 7 (`friendsDb`, `friendsDbTotal`, `friendCounts`, `loadingDb`, `syncing`, `fetchFriendsDb`, `fetchFriendsDbAllNicks`, `syncFriendsDb`). Legacy pre-DB implementation; safe to prune. |
| `use-friends-state.ts` | `composables/` | none — localStorage `zalocrm.friends.state.v1` + URL params `nick`/`kind`/`care` | No — confirmed exclusive via repo-wide grep | 🟢 |
| `use-friend-socket.ts` | `composables/` | socket only, module-level singleton | **Yes** — `ContactsView.vue`, `MessageThread.vue`, `TagCrmBar.vue` | 🔴 **The single biggest coupling point in this whole inventory.** The `friend:updated` event contract it wraps has **7 total consumer sites**: 4 via this composable (`FriendsView`, `ContactsView`, `MessageThread`, `TagCrmBar`) + 3 more that listen to the raw event independently, bypassing the composable, in `ChatView.vue`, `CsChatView.vue`, `SalesChatView.vue`. Payload shape must stay backward-compatible across any merge. |
| `use-friend-display.ts` | `composables/` | none, pure functions | No — only `FriendDetailPanel` | 🟢 (ironically underused — `FriendsTable` should use it but doesn't) |
| `use-zalo-accounts.ts` | `composables/` | 6 zalo-account CRUD/login endpoints + 9 socket events | FriendsView only consumes `accounts`/`fetchAccounts` — the QR-login state machine is dead weight from Friends' perspective (presumably backs a separate Zalo-accounts admin screen) | 🟡 — don't touch the composable itself, just note Friends only needs a 2-field slice of it |

---

## 4. Contacts-tab components

| Component | Location | Depends on | Used outside Contacts tab? | Risk if removed |
|---|---|---|---|---|
| `ContactDetailDialog` | `components/contacts/` (1256 lines, legacy Vuetify tabbed editor) | `use-contacts.ts`, `AppointmentEditor`, 5 endpoints | Only `MobileContactView.vue` | 🟡 sole editor mobile has; can't delete without replacing mobile's edit flow |
| `ContactDetailPanel` | `components/contacts/` (818 lines, the "Chi tiết" side panel) | 5 endpoints directly, `PrivateBlur` | No | 🟢 |
| `CustomerProfileDialog` | `components/contacts/` (1110 lines, the *current* profile modal) | `use-contacts.ts`, `TagCrmBar` (cross-import from chat!), `TEMPLATE_VARIABLES`, 6 endpoints | **Yes — `FriendsView.vue`** mounts it directly (`initial-tab="nicks"`, `friend-id` prop) | 🔴 This is the "Hồ sơ" dialog already opened from *both* tabs today — the natural anchor to build the merged view around, not a removal candidate |
| `AddCustomerQuickDialog` | `components/contacts/` | `POST /contacts/quick-create`, `POST /contacts/:id/virtual-conversation` | **Yes — `components/chat/NewMessageDialog.vue`** (quick-add when a typed phone doesn't resolve to a contact) | 🔴 breaking its props (`autoOpenVirtualChat`, whose `false` default exists specifically to prevent a double-POST race with the chat caller) breaks chat compose |
| `DuplicateReviewDialog` | `components/contacts/` (889 lines) | `useContactIntelligence()`, own render-fn subcomponents | No | 🟢 |
| `ParentCandidateDialog` | `components/contacts/` | 3 endpoints directly | No | 🟢 |

## 5. Contacts-tab composables

| Composable | Location | Notes | Used outside Contacts tab? | Risk |
|---|---|---|---|---|
| `use-contacts.ts` — `Contact` type (~90 fields) | `composables/` | de facto shared type | **Yes — 3 chat files**: `use-chat.ts` (type-only), `use-chat-contact-panel.ts` (type + runtime), `MediaTabPanel.vue` (type-only) | 🔴 reshaping `Contact`'s fields ripples into chat's CRM sidebar |
| `use-contacts.ts` — `useContacts()` CRUD (`updateContact`, `fetchContact`, etc.) | same file | | **Yes — `use-chat-contact-panel.ts`** destructures `updateContact`/`fetchContact` directly, backing `ChatContactPanel.vue`'s inline edit | 🔴 |
| `use-contacts.ts` — pure helpers (`formatRecentDateTime`, `cleanPreview`, `linkedNicksOf`) + constants | same file | | Internal to contacts + `CustomerProfileDialog` | 🟢 |
| `useContactIntelligence()` (duplicates/candidates) | same file | 4 endpoints | Only `DuplicateReviewDialog` | 🟢 |

---

## 6. Backend routes

### Friend routes — `backend/src/modules/zalo/friend-routes.ts`
All under `/zalo-accounts/:accountId/friends*`, behind `authMiddleware` + `checkAccess`/`requireGrant('friend', …)`. ~19 endpoints (live Zalo list/find/online/recommendations/requests/alias/block + the DB-backed `friends-db` / `friends-db/sync` / `friends-db/all-nicks` trio that the current UI actually uses). No cron/queue registered in this file itself.

### Contact routes — `backend/src/modules/contacts/contact-routes.ts` (2947 lines)
Contact CRUD (`GET/POST/PUT/DELETE /contacts`, stats, quick-create, archive/restore/purge, duplicates, parent-candidates, backfills) — **plus** the friend-namespace routes physically live in this same file: `PATCH /friends/:id`, `POST /friends/:id/ensure-conversation`, `POST /friends/:id/promote-to-parent`.

🟡 **Backend-side coupling**: the two "tabs'" backend logic isn't even split into separate files today.

| Item | Detail |
|---|---|
| ⚫ Pre-existing bug, not a removal target | `contact-routes.ts:1312` does a **bare `io.emit('contact:updated', …)`** with no org-room scoping and no privacy redaction — violates this repo's own CLAUDE.md rule ("Never `io.emit` bare"). It broadcasts contact edits to every connected socket in every org. Worth fixing regardless of the merge, and don't copy this pattern into new merged-tab socket wiring. |

### Supporting backend modules (not routes, but load-bearing)
- **`contact-scope.ts`** — the Contact-side visibility/edit authority (`getContactScope`, `assertContactVisible/Editable`). Parallel to `zalo-scope.ts` on the Friend side — **two separate scoping systems** (`ContactAccess` table vs Zalo-account ACL) that a merged UI still has to reconcile.
- **`contact-aggregate.ts` / `contact-aggregate-display.ts`** — rolls up N `Friend` rows into 1 `Contact`'s "KH Cha" display fields; `applyFriendAggregate` emits `friend:updated` after first message creates a Friend row. Core Contact↔Friend aggregation model the merge must preserve semantically.
- **`friend-sync-service.ts` / `friend-sync-cron.ts`** — 15-min cron (standard mutex pattern), diff-then-emit sync shared by cron, on-connect, and the manual "Làm mới ngay" button.
- **`friend-event-handler.ts`** — single state-machine writer for `Friend.friendshipStatus`, fed by live Zalo events, sync, and the accept/reject routes alike; triggers automation, sequence cancellation, conversation reconciliation on accept/block.

---

## 7. Cross-cutting hidden coupling

| Shared thing | Consumers outside Friends/Contacts | Break scenario |
|---|---|---|
| `friend:updated` socket event | `ContactsView`, `MessageThread`, `TagCrmBar` (via composable) + `ChatView`, `CsChatView`, `SalesChatView` (raw listeners, 3 separate reimplementations of the join-room logic) | Payload/shape change breaks 6 files outside the two tabs being merged |
| `Contact` type + `useContacts()` CRUD | `use-chat.ts`, `use-chat-contact-panel.ts`, `MediaTabPanel.vue`, and transitively `ChatContactPanel.vue` | Chat's whole CRM sidebar tab compiles/renders against this |
| `CustomerProfileDialog` | `FriendsView.vue` | Already the de facto shared profile modal between the two tabs — natural anchor for the merge |
| `AddCustomerQuickDialog` | `components/chat/NewMessageDialog.vue` | Chat's "phone doesn't match a contact" quick-add flow breaks if props reshape |
| `contactId`/`friendId` props threaded through ~13 other components/composables | `WorkItemEditor`/`WorkSection` (tasks/tickets), `PosCustomerForm` (POS linking), `VisualOrderModal`/`CreateOrderModal` (orders), `use-notes.ts`, `use-timeline.ts` (hits `/customers/:id/timeline` — a different URL namespace, pre-existing inconsistency), `use-appointments.ts`, `use-customer-lists.ts`, `use-dashboard-action-hub.ts`, `AutomationCardList.vue`, `ZaloUserInfoDialog.vue`, `LeadDetailPanel.vue` (deep-link only) | None of these call into Friends/Contacts *components* — they call the *identity* (`contact.id`, `friend.id`). If the merge changes what a "row" identifies (e.g. collapses Friend into Contact, or vice versa), every one of these needs the id-mapping worked out: Contact is the addressable entity for orders/tasks/notes/POS, while Friend is the addressable entity for per-nick chat/score data. |
| `/contacts` and `/friends` path strings | `BottomNav.vue`, `DefaultLayout.vue` sidebar, `AddCustomerQuickDialog`, `MobileQuickActions.vue`, `DashboardView.vue`, `marketing/ListDetailView.vue`, `SalesChatView.vue` (reads `?contactId=` as a documented deep-link target) | All hardcoded literal strings, no route-name constant — a URL rename means grepping and updating 6+ call sites by hand |
| Backend friend-namespace routes living inside `contact-routes.ts` | n/a (backend-internal) | Confirms the backend already treats these as one coupled surface, even though the frontend presents them as two tabs |

---

## 8. Dead code (safe to delete regardless of the merge)

Carried over from the earlier removal-candidates pass, confirmed by this deeper audit:

| File | Location | Confirmed unused by |
|---|---|---|
| `friend-list.vue`, `friend-request-panel.vue`, `friend-search-panel.vue` | `components/friends/` | zero imports anywhere |
| `ContactFilters.vue` | `components/contacts/` | zero imports anywhere |
| `ContactColumnToggle.vue` | `components/contacts/` | zero imports anywhere |
| ~16 of 20 exports from `use-friends.ts` | `composables/` | not consumed by `FriendsView.vue`; legacy pre-DB live-Zalo API surface |

---

## Bottom line for planning the merge

The pieces genuinely safe to gut freely are the Friends-side legacy live-Zalo API surface in
`use-friends.ts` (16 unused exports) and the several unwired stub buttons (`FriendsBulkBar`,
half of `FriendsSmartHints`, CSV export placeholders in both tabs).

Everything touching `friend:updated`, `Contact`/`useContacts()`, `CustomerProfileDialog`, or
`AddCustomerQuickDialog` needs a coordinated update across the chat, POS, orders, and work
modules — not a Friends/Contacts-only change.

`ContactProfileView.vue` (`/contacts/:id/profile`) is an unresolved gap in this inventory and
should get its own pass before finalizing merge scope.
