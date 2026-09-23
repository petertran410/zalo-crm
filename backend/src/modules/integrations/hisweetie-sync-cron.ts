/**
 * Nightly POS customer sync.
 *
 * The cohort collector and projection service are the single source of truth for
 * eligibility; this scheduler only resolves the organization and starts the job.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { withPosSyncLock } from '../pos/pos-sync-lock.js';
import { syncCustomerCohort, getCustomerCohortState } from './pos-customer-import-service.js';
import { syncCrmCommerce } from '../pos/crm-commerce-sync.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { config } from '../../config/index.js';

const CRON_SCHEDULE = '*/5 * * * *';
let cronRunning = false;
let cronTask: ReturnType<typeof cron.schedule> | null = null;

export function startHisweetieSyncCron(): void {
  if (cronTask) {
    logger.info('[hisweetie-sync] Already started, skipping');
    return;
  }
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) {
      logger.warn('[hisweetie-sync] Previous cycle still running, skip tick');
      return;
    }
    cronRunning = true;
    try {
      await runCycle();
    } catch (error) {
      logger.error('[hisweetie-sync] Cycle error:', error);
    } finally {
      cronRunning = false;
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });
  logger.info(`[hisweetie-sync] Started, schedule="${CRON_SCHEDULE}" (Asia/Ho_Chi_Minh)`);
}

export function stopHisweetieSyncCron(): void {
  if (!cronTask) return;
  cronTask.stop();
  cronTask = null;
  logger.info('[hisweetie-sync] Stopped');
}

async function runCycle(): Promise<void> {
  if (process.env.CRM_POS_SYNC_ENABLED !== 'true' || !config.posWebhookOrgId) return;
  const org = await prisma.organization.findUnique({ where: { id: config.posWebhookOrgId }, select: { id: true } });
  if (!org) {
    logger.warn('[hisweetie-sync] No organization found, skip cycle');
    return;
  }
  await withTenant(org.id, () => syncCrmCommerce(org.id));
}

/** Exported for a manual scheduler/test trigger; maxPages is retained for API compatibility. */
export async function runHisweetieSyncNow(_opts: { maxPages?: number } = {}): Promise<void> {
  return runCycle();
}
