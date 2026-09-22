import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { logger } from '../../shared/utils/logger.js';
import { extractCustomer } from './hisweetie-customer-mapper.js';
import {
  collectInvoiceBackedCustomerCohort,
  POS_CUSTOMER_COHORT_RULE,
  type CollectCustomerCohortOptions,
  type CustomerCohortResult,
  type CustomerCohortStats,
} from './hisweetie-customer-cohort.js';
import {
  batchUpsertCustomers,
  batchUpsertInvoices,
} from '../../shared/mcp/pos-sync-service.js';

const STATE_KEY = 'pos_customer_cohort_state';
const PREVIEW_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CustomerImportStatus =
  | 'not_started'
  | 'archiving'
  | 'projecting'
  | 'completed'
  | 'failed';

export interface CustomerCohortState {
  rule: string;
  preview?: {
    completedAt: string;
    stats: CustomerCohortStats;
    invoiceTimestamp: string | null;
    customerTimestamp: string | null;
  };
  import: {
    status: CustomerImportStatus;
    archiveActorId?: string;
    archiveTimestamp?: string;
    activePreflightCount?: number;
    archivedCount?: number;
    createdCount?: number;
    updatedCount?: number;
    restoredCount?: number;
    completedAt?: string;
    lastError?: string;
  };
}

export interface CustomerProjectionStats {
  selected: number;
  created: number;
  updated: number;
  restored: number;
  unchanged: number;
  skippedMalformed: number;
}

export interface InitialCustomerImportResult {
  cohort: CustomerCohortResult;
  archive: {
    timestamp: Date;
    activePreflightCount: number;
    archivedCount: number;
  };
  projection: CustomerProjectionStats;
}

interface ExistingContact {
  id: string;
  posCustomerId: number | null;
  posCustomerCode: string | null;
  phoneNormalized: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  archivedAt: Date | null;
}

function initialState(): CustomerCohortState {
  return {
    rule: POS_CUSTOMER_COHORT_RULE,
    import: { status: 'not_started' },
  };
}

function parseState(value: string | null | undefined): CustomerCohortState {
  if (!value) return initialState();
  try {
    const parsed = JSON.parse(value) as Partial<CustomerCohortState>;
    if (parsed.rule !== POS_CUSTOMER_COHORT_RULE || !parsed.import) {
      return initialState();
    }
    return parsed as CustomerCohortState;
  } catch {
    return initialState();
  }
}

async function saveState(orgId: string, state: CustomerCohortState): Promise<void> {
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey: STATE_KEY } },
    create: {
      orgId,
      settingKey: STATE_KEY,
      valuePlain: JSON.stringify(state),
    },
    update: { valuePlain: JSON.stringify(state) },
  });
}

export async function getCustomerCohortState(orgId: string): Promise<CustomerCohortState> {
  const row = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: STATE_KEY } },
    select: { valuePlain: true },
  });
  return parseState(row?.valuePlain);
}

function previewFrom(result: CustomerCohortResult): NonNullable<CustomerCohortState['preview']> {
  return {
    completedAt: new Date().toISOString(),
    stats: result.stats,
    invoiceTimestamp: result.invoiceTimestamp?.toISOString() ?? null,
    customerTimestamp: result.customerTimestamp?.toISOString() ?? null,
  };
}

export async function previewCustomerCohort(
  orgId: string,
  options: CollectCustomerCohortOptions = {},
): Promise<CustomerCohortResult> {
  const result = await collectInvoiceBackedCustomerCohort(options);
  const state = await getCustomerCohortState(orgId);
  state.preview = previewFrom(result);
  await saveState(orgId, state);
  return result;
}

function requireFreshPreview(state: CustomerCohortState): void {
  if (!state.preview) {
    throw new Error('Hãy chạy xem trước tập khách hàng trước khi nhập lần đầu.');
  }
  const completedAt = new Date(state.preview.completedAt).getTime();
  if (!Number.isFinite(completedAt) || Date.now() - completedAt > PREVIEW_MAX_AGE_MS) {
    throw new Error('Kết quả xem trước đã quá 24 giờ. Hãy chạy xem trước lại trước khi nhập.');
  }
  if (state.preview.stats.eligibleCustomers <= 0) {
    throw new Error('Kết quả xem trước không có khách hàng hợp lệ; dừng nhập để bảo vệ dữ liệu CRM.');
  }
}

async function markImportFailure(orgId: string, error: unknown): Promise<void> {
  const state = await getCustomerCohortState(orgId);
  state.import = {
    ...state.import,
    status: 'failed',
    lastError: error instanceof Error ? error.message : String(error),
  };
  await saveState(orgId, state);
}

export async function projectCustomerCohort(
  orgId: string,
  customers: Array<Record<string, unknown>>,
): Promise<CustomerProjectionStats> {
  const existingRows = await prisma.contact.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      posCustomerId: true,
      posCustomerCode: true,
      phoneNormalized: true,
      fullName: true,
      phone: true,
      email: true,
      addressLine: true,
      archivedAt: true,
    },
  });
  const byPosId = new Map<number, ExistingContact>();
  const byPhone = new Map<string, ExistingContact>();
  for (const row of existingRows) {
    if (row.posCustomerId != null && !byPosId.has(row.posCustomerId)) {
      byPosId.set(row.posCustomerId, row);
    }
    if (row.phoneNormalized && !byPhone.has(row.phoneNormalized)) {
      byPhone.set(row.phoneNormalized, row);
    }
  }

  const stats: CustomerProjectionStats = {
    selected: customers.length,
    created: 0,
    updated: 0,
    restored: 0,
    unchanged: 0,
    skippedMalformed: 0,
  };
  const syncedAt = new Date();

  for (const raw of customers) {
    const mapped = extractCustomer(raw);
    if (mapped.posCustomerId == null || !mapped.phone) {
      stats.skippedMalformed++;
      continue;
    }
    const phoneNormalized = normalizePhone(mapped.phone);
    const existing = byPosId.get(mapped.posCustomerId)
      ?? (phoneNormalized ? byPhone.get(phoneNormalized) : undefined);

    if (!existing) {
      const created = await prisma.contact.create({
        data: {
          orgId,
          source: 'POS',
          posCustomerId: mapped.posCustomerId,
          posCustomerCode: mapped.posCustomerCode,
          posSyncedAt: syncedAt,
          fullName: mapped.name,
          phone: mapped.phone,
          email: mapped.email,
          addressLine: mapped.address,
        },
        select: {
          id: true,
          posCustomerId: true,
          posCustomerCode: true,
          phoneNormalized: true,
          fullName: true,
          phone: true,
          email: true,
          addressLine: true,
          archivedAt: true,
        },
      });
      byPosId.set(mapped.posCustomerId, created);
      if (created.phoneNormalized) byPhone.set(created.phoneNormalized, created);
      stats.created++;
      continue;
    }

    const patch: Record<string, unknown> = { posSyncedAt: syncedAt };
    if (existing.archivedAt) {
      patch.archivedAt = null;
      patch.archivedById = null;
    }
    if (existing.posCustomerId == null) patch.posCustomerId = mapped.posCustomerId;
    if (existing.posCustomerCode == null && mapped.posCustomerCode) {
      patch.posCustomerCode = mapped.posCustomerCode;
    }
    if (!existing.fullName && mapped.name) patch.fullName = mapped.name;
    if (!existing.phone && mapped.phone) patch.phone = mapped.phone;
    if (!existing.email && mapped.email) patch.email = mapped.email;
    if (!existing.addressLine && mapped.address) patch.addressLine = mapped.address;

    const changedFields = Object.keys(patch).filter((key) => key !== 'posSyncedAt');
    await prisma.contact.update({ where: { id: existing.id }, data: patch });
    Object.assign(existing, patch, { phoneNormalized: existing.phoneNormalized ?? phoneNormalized });
    byPosId.set(mapped.posCustomerId, existing);
    if (phoneNormalized) byPhone.set(phoneNormalized, existing);
    if (changedFields.includes('archivedAt')) stats.restored++;
    if (changedFields.length > 0) stats.updated++;
    else stats.unchanged++;
  }

  return stats;
}

export async function runInitialCustomerImport(
  orgId: string,
  ownerUserId: string,
  options: CollectCustomerCohortOptions = {},
): Promise<InitialCustomerImportResult> {
  const state = await getCustomerCohortState(orgId);
  requireFreshPreview(state);
  if (state.import.status === 'completed') {
    throw new Error('Nhập khách hàng POS lần đầu đã hoàn tất cho tổ chức này.');
  }
  if (state.import.status === 'archiving' || state.import.status === 'projecting') {
    throw new Error('Nhập khách hàng POS lần đầu đang chạy.');
  }

  try {
    const cohort = await collectInvoiceBackedCustomerCohort(options);
    if (cohort.stats.eligibleCustomers !== state.preview!.stats.eligibleCustomers) {
      throw new Error(
        `Tập khách hàng đã đổi từ ${state.preview!.stats.eligibleCustomers} sang ${cohort.stats.eligibleCustomers}. `
        + 'Hãy xem trước lại trước khi nhập.',
      );
    }

    const archiveTimestamp = new Date();
    const archiveResult = await tenantTransaction(async (tx) => {
      const activePreflightCount = await tx.contact.count({
        where: { orgId, archivedAt: null },
      });
      const archivingState: CustomerCohortState = {
        ...state,
        preview: previewFrom(cohort),
        import: {
          status: 'archiving',
          archiveActorId: ownerUserId,
          archiveTimestamp: archiveTimestamp.toISOString(),
          activePreflightCount,
        },
      };
      await tx.appSetting.upsert({
        where: { orgId_settingKey: { orgId, settingKey: STATE_KEY } },
        create: { orgId, settingKey: STATE_KEY, valuePlain: JSON.stringify(archivingState) },
        update: { valuePlain: JSON.stringify(archivingState) },
      });
      const archived = await tx.contact.updateMany({
        where: { orgId, archivedAt: null },
        data: { archivedAt: archiveTimestamp, archivedById: ownerUserId },
      });
      if (archived.count !== activePreflightCount) {
        throw new Error(
          `Archive verification failed: expected ${activePreflightCount}, archived ${archived.count}.`,
        );
      }
      archivingState.import.status = 'projecting';
      archivingState.import.archivedCount = archived.count;
      await tx.appSetting.update({
        where: { orgId_settingKey: { orgId, settingKey: STATE_KEY } },
        data: { valuePlain: JSON.stringify(archivingState) },
      });
      await tx.activityLog.create({
        data: {
          orgId,
          userId: ownerUserId,
          actorType: 'user',
          category: 'system',
          action: 'data_import',
          entityType: 'pos_customer_initial_archive',
          details: {
            rule: POS_CUSTOMER_COHORT_RULE,
            archiveTimestamp: archiveTimestamp.toISOString(),
            activePreflightCount,
            archivedCount: archived.count,
          },
        },
      });
      return { activePreflightCount, archivedCount: archived.count };
    }, { timeout: 60_000 });

    await batchUpsertInvoices(orgId, cohort.invoices);
    await batchUpsertCustomers(orgId, cohort.customers);
    const projection = await projectCustomerCohort(orgId, cohort.customers);
    const completedState = await getCustomerCohortState(orgId);
    completedState.preview = previewFrom(cohort);
    completedState.import = {
      ...completedState.import,
      status: 'completed',
      createdCount: projection.created,
      updatedCount: projection.updated,
      restoredCount: projection.restored,
      completedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await saveState(orgId, completedState);

    await prisma.activityLog.create({
      data: {
        orgId,
        userId: ownerUserId,
        actorType: 'user',
        category: 'system',
        action: 'data_import',
        entityType: 'pos_customer_initial_import',
        details: {
          rule: POS_CUSTOMER_COHORT_RULE,
          ...projection,
        },
      },
    });

    return {
      cohort,
      archive: { timestamp: archiveTimestamp, ...archiveResult },
      projection,
    };
  } catch (error) {
    logger.error('[pos-customer-import] Initial import failed:', error);
    await markImportFailure(orgId, error);
    throw error;
  }
}

export async function syncCustomerCohort(
  orgId: string,
  options: CollectCustomerCohortOptions = {},
): Promise<{ cohort: CustomerCohortResult; projection: CustomerProjectionStats }> {
  const state = await getCustomerCohortState(orgId);
  if (state.import.status !== 'completed') {
    throw new Error('Hãy hoàn tất nhập khách hàng POS lần đầu trước khi chạy đồng bộ định kỳ.');
  }
  const cohort = await collectInvoiceBackedCustomerCohort(options);
  await batchUpsertInvoices(orgId, cohort.invoices);
  await batchUpsertCustomers(orgId, cohort.customers);
  const projection = await projectCustomerCohort(orgId, cohort.customers);
  state.preview = previewFrom(cohort);
  await saveState(orgId, state);
  return { cohort, projection };
}
