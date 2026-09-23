import type { Worker } from 'bullmq';

// Compatibility exports: CRM profile edits are local. POS customer edits happen in POS.
export async function scheduleHisweetiePush(_contactId: string): Promise<void> {}
export async function pushContactToPos(
  _contactId: string, _idempotencyKey: string,
): Promise<{ pushed: boolean; reason?: string; posCustomerId?: number }> {
  return { pushed: false, reason: 'pos_customer_edit_disabled' };
}
export function startHisweetiePushWorker(): Worker | null { return null; }
export async function stopHisweetiePushQueue(): Promise<void> {}
