import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';

export interface LinkerResult {
  linkedOrders: number;
  linkedInvoices: number;
  linkedDebts: number;
}

/**
 * 2-Stage Automatic Contact Linker for POS Records.
 * Stage 1: Exact pos_customer_id match
 * Stage 2: Fallback normalized phone number match (comparing last 9 digits and excluding dummy numbers)
 */
export async function linkPosCustomersToContacts(orgId: string): Promise<LinkerResult> {
  logger.info(`[pos-customer-linker] Starting 2-stage customer linking for org ${orgId}`);

  // Stage 1: Exact pos_customer_id match for pos_orders, pos_invoices, pos_customer_debts
  const stage1Orders = await prisma.$executeRawUnsafe(`
    UPDATE pos_orders o
    SET contact_id = c.id
    FROM contacts c
    WHERE o.org_id = $1
      AND o.pos_customer_id IS NOT NULL
      AND c.pos_customer_id = o.pos_customer_id
      AND c.org_id = $1
      AND (o.contact_id IS NULL OR o.contact_id != c.id);
  `, orgId);

  const stage1Invoices = await prisma.$executeRawUnsafe(`
    UPDATE pos_invoices i
    SET contact_id = c.id
    FROM contacts c
    WHERE i.org_id = $1
      AND i.pos_customer_id IS NOT NULL
      AND c.pos_customer_id = i.pos_customer_id
      AND c.org_id = $1
      AND (i.contact_id IS NULL OR i.contact_id != c.id);
  `, orgId);

  const stage1Debts = await prisma.$executeRawUnsafe(`
    UPDATE pos_customer_debts d
    SET contact_id = c.id
    FROM contacts c
    WHERE d.org_id = $1
      AND d.pos_customer_id IS NOT NULL
      AND c.pos_customer_id = d.pos_customer_id
      AND c.org_id = $1
      AND (d.contact_id IS NULL OR d.contact_id != c.id);
  `, orgId);

  // Stage 2: Fallback normalized phone number match for unlinked records.
  // We use a subquery with DISTINCT ON to select candidate contacts deterministically (ORDER BY created_at ASC).
  // Phone numbers are normalized by extracting digits and comparing the last 9 digits (so +84912345678 matches 0912345678).
  // Dummy/placeholder numbers (e.g., '0000000000', '1111111111', '9999999999', '0900000000') are excluded.
  const stage2Orders = await prisma.$executeRawUnsafe(`
    UPDATE pos_orders o
    SET contact_id = c.id
    FROM (
      SELECT DISTINCT ON (RIGHT(REGEXP_REPLACE(COALESCE(phone_normalized, phone), '\\D', '', 'g'), 9))
        id,
        org_id,
        created_at,
        RIGHT(REGEXP_REPLACE(COALESCE(phone_normalized, phone), '\\D', '', 'g'), 9) AS phone_key
      FROM contacts
      WHERE org_id = $1
        AND (
          (phone IS NOT NULL AND LENGTH(REGEXP_REPLACE(phone, '\\D', '', 'g')) >= 9)
          OR (phone_normalized IS NOT NULL AND LENGTH(REGEXP_REPLACE(phone_normalized, '\\D', '', 'g')) >= 9)
        )
      ORDER BY RIGHT(REGEXP_REPLACE(COALESCE(phone_normalized, phone), '\\D', '', 'g'), 9), created_at ASC
    ) c
    WHERE o.org_id = $1
      AND o.contact_id IS NULL
      AND o.customer_phone IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(o.customer_phone, '\\D', '', 'g')) >= 9
      AND REGEXP_REPLACE(o.customer_phone, '\\D', '', 'g') NOT IN ('0000000000', '1111111111', '9999999999', '0900000000')
      AND RIGHT(REGEXP_REPLACE(o.customer_phone, '\\D', '', 'g'), 9) NOT IN ('000000000', '111111111', '999999999', '900000000')
      AND c.phone_key NOT IN ('000000000', '111111111', '999999999', '900000000')
      AND RIGHT(REGEXP_REPLACE(o.customer_phone, '\\D', '', 'g'), 9) = c.phone_key;
  `, orgId);

  // Stage 2 for invoices: link qua pos_order_id → lấy contact_id của order đã link.
  // pos_invoices không có cột customer_phone, nên không dùng phone fallback.
  const stage2Invoices = await prisma.$executeRawUnsafe(`
    UPDATE pos_invoices i
    SET contact_id = o.contact_id
    FROM pos_orders o
    WHERE i.org_id = $1
      AND i.contact_id IS NULL
      AND i.pos_order_id IS NOT NULL
      AND o.org_id = $1
      AND o.pos_order_id = i.pos_order_id
      AND o.contact_id IS NOT NULL;
  `, orgId);

  const stage2Debts = await prisma.$executeRawUnsafe(`
    UPDATE pos_customer_debts d
    SET contact_id = c.id
    FROM (
      SELECT DISTINCT ON (RIGHT(REGEXP_REPLACE(COALESCE(phone_normalized, phone), '\\D', '', 'g'), 9))
        id,
        org_id,
        created_at,
        RIGHT(REGEXP_REPLACE(COALESCE(phone_normalized, phone), '\\D', '', 'g'), 9) AS phone_key
      FROM contacts
      WHERE org_id = $1
        AND (
          (phone IS NOT NULL AND LENGTH(REGEXP_REPLACE(phone, '\\D', '', 'g')) >= 9)
          OR (phone_normalized IS NOT NULL AND LENGTH(REGEXP_REPLACE(phone_normalized, '\\D', '', 'g')) >= 9)
        )
      ORDER BY RIGHT(REGEXP_REPLACE(COALESCE(phone_normalized, phone), '\\D', '', 'g'), 9), created_at ASC
    ) c
    WHERE d.org_id = $1
      AND d.contact_id IS NULL
      AND d.customer_phone IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(d.customer_phone, '\\D', '', 'g')) >= 9
      AND REGEXP_REPLACE(d.customer_phone, '\\D', '', 'g') NOT IN ('0000000000', '1111111111', '9999999999', '0900000000')
      AND RIGHT(REGEXP_REPLACE(d.customer_phone, '\\D', '', 'g'), 9) NOT IN ('000000000', '111111111', '999999999', '900000000')
      AND c.phone_key NOT IN ('000000000', '111111111', '999999999', '900000000')
      AND RIGHT(REGEXP_REPLACE(d.customer_phone, '\\D', '', 'g'), 9) = c.phone_key;
  `, orgId);

  // Backfill contact.pos_customer_id for contacts linked via phone match if pos_customer_id was missing
  await prisma.$executeRawUnsafe(`
    UPDATE contacts c
    SET pos_customer_id = o.pos_customer_id,
        pos_customer_code = COALESCE(c.pos_customer_code, o.pos_customer_code)
    FROM (
      SELECT DISTINCT ON (contact_id) contact_id, pos_customer_id, pos_customer_code
      FROM pos_orders
      WHERE org_id = $1 AND contact_id IS NOT NULL AND pos_customer_id IS NOT NULL
      ORDER BY contact_id, created_at ASC
    ) o
    WHERE c.org_id = $1
      AND c.pos_customer_id IS NULL
      AND o.contact_id = c.id;
  `, orgId);

  const linkedOrders = Number(stage1Orders || 0) + Number(stage2Orders || 0);
  const linkedInvoices = Number(stage1Invoices || 0) + Number(stage2Invoices || 0);
  const linkedDebts = Number(stage1Debts || 0) + Number(stage2Debts || 0);

  logger.info(`[pos-customer-linker] Finished linking for org ${orgId}: Orders=${linkedOrders}, Invoices=${linkedInvoices}, Debts=${linkedDebts}`);

  return { linkedOrders, linkedInvoices, linkedDebts };
}

export async function runPosCustomerLinker(orgId: string): Promise<LinkerResult> {
  return linkPosCustomersToContacts(orgId);
}

