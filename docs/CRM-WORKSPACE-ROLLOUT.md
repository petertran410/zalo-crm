# CRM customer workspace rollout

## Source changes

- `/customers`: scoped customer directory, manual segment/potential filters, debt/purchase/task filters, and drill-down summaries.
- `/customers/:id`: shared profile used by desktop chat, mobile chat, and the full profile page.
- `ContactPosLink`: multiple POS shops per CRM customer, unique ownership per organization/POS ID.
- `CustomerConversationLink`: group context independent of the sender's identity.
- `CustomerWorkspace`: manual retail/chain/wholesale segment, potential, care state, accountant assignment.
- Tasks and internal notes accept an optional POS shop and conversation, checked against the customer context.
- POS snapshots apply transactionally by source `updatedAt`. Older versions cannot replace newer data.
- Balances come only from a numeric POS customer `totalDebt`, not invoices or draft orders. Missing data is unknown; negative balances are retained.
- Purchases require valid, synchronized invoices. Draft orders do not qualify.
- POS customer creation and draft order creation use persisted idempotency operations. Customer update/deactivation, order cancellation, and the legacy billing dispatch are disabled.
- AI interest scanning is disabled. Existing AI data remains; interests are entered manually.
- Group dissolution requires confirmation, preserves conversations/messages, and blocks sending to groups recorded as dissolved.

## Deployment gate

The SQL file has NOT been applied by the coding agent. Do not start this backend revision against the old schema.

1. Back up the intended database. Inspect `backend/prisma/migrations-manual/20260921_customer_workspace.sql`.
2. Confirm ID column types, foreign keys, existing RLS mode, and the target database with the operator. The additive SQL follows the current Prisma string-ID schema.
3. An operator applies the reviewed SQL. It creates new tables/columns, preserves legacy fields, and backfills only unambiguous POS links.
4. Review the conflict query at the end of the SQL. Resolve conflicting customer ownership manually; never infer it from phone/name. Existing groups are linked manually to their CRM customer.
5. Generate the Prisma client, build, and restart the actual backend serving `/api/v1`. No migration/reset/seed command is part of application startup.
6. Verify CRM access for a sale, an accountant, and a manager before enabling POS writes.

The schema adds no automatically assigned permission groups. Existing `contact.access` and `contact.edit` grants are reused. Assigning an accountant explicitly adds a collaborator entry; changing that assignment only removes a collaborator entry created specifically by this feature. Membership in a Zalo group is not a CRM grant.

## Operator-controlled flags

```dotenv
CRM_POS_SYNC_ENABLED=false
CRM_POS_WRITE_ENABLED=false
CRM_POS_DRAFT_CONTRACT_VERIFIED=false
CRM_ZALO_DISSOLVE_EVENT_ACT=
```

- Set `POS_WEBHOOK_ORG_ID` to the organization owning the configured POS connection. Do not reuse one POS credential set for an unrelated organization.
- Enable `CRM_POS_SYNC_ENABLED` after the schema is installed and the POS read connection is verified. The five-minute reconciliation pulls customers, orders, invoices, returns, and cashflows. Resource cursors advance only after successful pages.
- Customer directory sync no longer archives CRM contacts, creates people automatically, or matches ownership by phone.
- Register signed POS webhooks through the existing integration setup. This implementation does not remotely register or change subscriptions.
- Enable `CRM_POS_WRITE_ENABLED` only with an authorized test/production connection after acceptance. Customer creation requires `salePicId` and a real address.
- `CRM_POS_DRAFT_CONTRACT_VERIFIED` must remain false until a test proves `POST /orders` always returns numeric `status=1` and `statusValue="Phiếu tạm"`. No undocumented request fields are sent to force that state.
- The documented order write shape cannot select an address. The current form requires the chosen address to match the POS default. A different address must be configured at POS first; support for explicit address selection requires a documented POS contract extension.
- Verify that customer balances are returned as numeric `totalDebt`. If the API does not supply it, CRM intentionally shows an unknown balance; extend/verify the POS contract instead of calculating a substitute.
- No code path creates invoices. Confirming an order, recording payments, and editing customer details stay in POS.

## Zalo dissolution

The installed SDK exposes raw `group_event.act` and `threadId`, but does not define a documented dissolution enum. `CRM_ZALO_DISSOLVE_EVENT_ACT` therefore has NO default.

Capture and verify the exact raw action using an authorized test group before configuring it. The listener logs `rawAction` and group ID without message contents. `leave`, `remove_member`, `update`, `unknown`, an empty setting, and a missing group are never accepted as proof of dissolution.

CRM-initiated dissolution is recorded after the SDK call succeeds. If Zalo succeeds but the database write fails, reconcile manually; do not delete the saved messages. Groups not known to be dissolved are labeled as followed in CRM, not guaranteed live on Zalo.

## Retry and reconciliation

- Keep the same form and operation key after a timeout or uncertain response. The backend persists status and reuses its POS idempotency key.
- Keys are bound to actor, organization, request content, POS URL, and client identity.
- Completed operations replay locally. Concurrent pending operations are rejected rather than duplicated.
- An explicit POS 400/422 rejection permits correcting the form with a new key. Unknown errors, authentication failures, and conflicts do not.
- Unknown operations older than 23 hours are not resent because POS only documents a 24-hour key retention period.
- A process that dies while an operation is pending requires operator reconciliation against POS logs using `pos_write_operations.id`. Never clear a pending operation or local form merely to try a new key.
- Migration rollback should revert application binaries while retaining the additive schema and operation history. Do not drop the new tables or reset customer data.

## Acceptance

Automated verification covers manual linking/conflicts, organization boundaries, unknown/negative balances, invoice-based purchase states, disabled writes, idempotency/retries, preserved POST on token refresh, and group success/failure.

`frontend/tests/crm-workspace.visual.cjs` uses fake HTTP and WebSocket responses. It checks 1440px/390px profiles, shop selection, ledger, timeline, disabled write controls, error states, and the customer list. It does NOT prove live Zalo/POS behavior.

Before production acceptance, run the complete authorized path with real test data: group -> CRM customer -> selected POS shop -> default address -> draft -> confirm at POS -> invoice/balance synchronization. Also verify live RLS, ambiguous legacy links, cancelled/replaced invoices, returns, unallocated payments, both group-dissolution paths, and archived-history access.

Frontend production build still reports pre-existing global `:deep` CSS and bundle-size warnings; these are not runtime acceptance.
