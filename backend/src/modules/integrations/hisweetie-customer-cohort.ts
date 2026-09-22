import type {
  PublicApiListParams,
  PublicApiListResponse,
} from './hisweetie-public-api-client.js';
import {
  getHisweetiePublicApiClient,
  PublicApiRateLimitError,
} from './hisweetie-public-api-client.js';
import type { ShouldCancel } from '../pos/pos-sync-lock.js';
import { SyncCancelledError } from '../pos/pos-sync-lock.js';

export const POS_CUSTOMER_COHORT_RULE = 'active_phone_invoice_v1';
const PAGE_SIZE = 100;
const MAX_PAGES = 2_000;
const MAX_RATE_LIMIT_RETRIES = 6;

type PosRow = Record<string, unknown>;

export interface CustomerCohortStats {
  invoiceRows: number;
  invoiceCustomerIds: number;
  invoiceRowsWithoutCustomerId: number;
  customerRows: number;
  activeCustomers: number;
  activeWithPhone: number;
  eligibleCustomers: number;
  debtPositive: number;
  debtNotPositive: number;
}

export interface CustomerCohortResult {
  customers: PosRow[];
  invoices: PosRow[];
  stats: CustomerCohortStats;
  invoiceTimestamp: Date | null;
  customerTimestamp: Date | null;
}

export interface CustomerCohortProgress {
  phase: 'invoices' | 'customers';
  processed: number;
  total: number;
}

export interface CustomerCohortClient {
  listInvoices(
    params?: PublicApiListParams,
  ): Promise<PublicApiListResponse<PosRow>>;
  listCustomers(
    params?: PublicApiListParams,
  ): Promise<PublicApiListResponse<PosRow>>;
}

export interface CollectCustomerCohortOptions {
  client?: CustomerCohortClient;
  shouldCancel?: ShouldCancel;
  onProgress?: (
    progress: CustomerCohortProgress,
  ) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function serverTimestamp(response: unknown): Date | null {
  const value = (response as { timestamp?: unknown } | null)?.timestamp;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function customerPhone(raw: PosRow): string | null {
  for (const value of [raw.contactNumber, raw.phone, raw.phoneNumber]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** The approved cohort is strict: explicit active status, a real phone, and invoice history. */
export function isInvoiceBackedCustomer(
  raw: PosRow,
  invoiceCustomerIds: ReadonlySet<number>,
): boolean {
  const id = positiveInt(raw.id ?? raw.customerId);
  return raw.isActive === true
    && customerPhone(raw) !== null
    && id !== null
    && invoiceCustomerIds.has(id);
}

async function checkCancelled(shouldCancel?: ShouldCancel): Promise<void> {
  if (await shouldCancel?.()) throw new SyncCancelledError();
}

function isRateLimitError(error: unknown): error is PublicApiRateLimitError {
  return error instanceof PublicApiRateLimitError
    || (error instanceof Error
      && (error.message.includes('rate_limit') || error.message.includes('429')));
}

async function listWithRetry<T>(
  request: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
  attempt = 0,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isRateLimitError(error) || attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw error;
    }
    const retryAfterMs = error instanceof PublicApiRateLimitError
      ? error.retryAfterMs
      : 2_000 * 2 ** attempt;
    await sleep(Math.max(1_000, retryAfterMs));
    return listWithRetry(request, sleep, attempt + 1);
  }
}

/**
 * Build a read-only, snapshot-bounded cohort from POS. No method in this service writes to POS or CRM.
 */
export async function collectInvoiceBackedCustomerCohort(
  options: CollectCustomerCohortOptions = {},
): Promise<CustomerCohortResult> {
  const client = options.client ?? getHisweetiePublicApiClient();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const invoiceCustomerIds = new Set<number>();
  const seenInvoiceIds = new Set<number>();
  const invoices: PosRow[] = [];
  let invoiceTimestamp: Date | null = null;
  let invoiceUpperBound: string | undefined;
  let invoiceRows = 0;
  let invoiceRowsWithoutCustomerId = 0;
  let invoiceTotal = 0;

  for (let currentItem = 0; ; currentItem += PAGE_SIZE) {
    if (currentItem / PAGE_SIZE >= MAX_PAGES) {
      throw new Error('POS invoice pagination exceeded the safety limit');
    }
    await checkCancelled(options.shouldCancel);
    const response = await listWithRetry(
      () => client.listInvoices({
        currentItem,
        pageSize: PAGE_SIZE,
        ...(invoiceUpperBound ? { toDate: invoiceUpperBound } : {}),
      }),
      sleep,
    );
    const rows = Array.isArray(response.data) ? response.data : [];
    if (invoiceTimestamp === null) {
      invoiceTimestamp = serverTimestamp(response);
      invoiceUpperBound = invoiceTimestamp?.toISOString();
      invoiceTotal = Number(response.total ?? 0);
    }

    for (const row of rows) {
      const invoiceId = positiveInt(row.id ?? row.invoiceId ?? row.posInvoiceId);
      if (invoiceId !== null && seenInvoiceIds.has(invoiceId)) continue;
      if (invoiceId !== null) seenInvoiceIds.add(invoiceId);
      invoices.push(row);
      invoiceRows++;
      const customerId = positiveInt(row.customerId ?? row.posCustomerId);
      if (customerId === null) invoiceRowsWithoutCustomerId++;
      else invoiceCustomerIds.add(customerId);
    }

    await options.onProgress?.({ phase: 'invoices', processed: invoiceRows, total: invoiceTotal });
    if (rows.length < PAGE_SIZE) break;
  }

  const customers: PosRow[] = [];
  const seenCustomerIds = new Set<number>();
  let customerTimestamp: Date | null = null;
  let customerUpperBound: string | undefined;
  let customerRows = 0;
  let customerTotal = 0;
  let activeCustomers = 0;
  let activeWithPhone = 0;
  let debtPositive = 0;

  for (let currentItem = 0; ; currentItem += PAGE_SIZE) {
    if (currentItem / PAGE_SIZE >= MAX_PAGES) {
      throw new Error('POS customer pagination exceeded the safety limit');
    }
    await checkCancelled(options.shouldCancel);
    const response = await listWithRetry(
      () => client.listCustomers({
        currentItem,
        pageSize: PAGE_SIZE,
        ...(customerUpperBound ? { toDate: customerUpperBound } : {}),
      }),
      sleep,
    );
    const rows = Array.isArray(response.data) ? response.data : [];
    if (customerTimestamp === null) {
      customerTimestamp = serverTimestamp(response);
      customerUpperBound = customerTimestamp?.toISOString();
      customerTotal = Number(response.total ?? 0);
    }

    for (const row of rows) {
      const id = positiveInt(row.id ?? row.customerId);
      if (id === null || seenCustomerIds.has(id)) continue;
      seenCustomerIds.add(id);
      customerRows++;
      if (row.isActive !== true) continue;
      activeCustomers++;
      if (customerPhone(row) === null) continue;
      activeWithPhone++;
      if (!isInvoiceBackedCustomer(row, invoiceCustomerIds)) continue;
      customers.push(row);
      if (Number(row.totalDebt ?? 0) > 0) debtPositive++;
    }

    await options.onProgress?.({ phase: 'customers', processed: customerRows, total: customerTotal });
    if (rows.length < PAGE_SIZE) break;
  }

  return {
    customers,
    invoices,
    invoiceTimestamp,
    customerTimestamp,
    stats: {
      invoiceRows,
      invoiceCustomerIds: invoiceCustomerIds.size,
      invoiceRowsWithoutCustomerId,
      customerRows,
      activeCustomers,
      activeWithPhone,
      eligibleCustomers: customers.length,
      debtPositive,
      debtNotPositive: customers.length - debtPositive,
    },
  };
}
