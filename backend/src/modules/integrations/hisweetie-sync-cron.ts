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

const CRON_SCHEDULE = '0 1 * * *';
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
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) {
    logger.warn('[hisweetie-sync] No organization found, skip cycle');
    return;
  }
  await withPosSyncLock(org.id, 'Customer', async () => {
    const state = await getCustomerCohortState(org.id);
    if (state.import.status !== 'completed') {
      logger.info('[hisweetie-sync] Initial customer import is not complete; skip nightly cohort sync');
      return;
    }
    const result = await syncCustomerCohort(org.id);
    logger.info(
      `[hisweetie-sync] Cohort sync selected=${result.cohort.stats.eligibleCustomers} `
      + `created=${result.projection.created} updated=${result.projection.updated} `
      + `restored=${result.projection.restored}`,
    );
  });
}

/** Exported for a manual scheduler/test trigger; maxPages is retained for API compatibility. */
export async function runHisweetieSyncNow(_opts: { maxPages?: number } = {}): Promise<void> {
  return runCycle();
}
