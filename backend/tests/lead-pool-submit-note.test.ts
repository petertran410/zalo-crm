/**
 * lead-pool-submit-note.test.ts — submitNote (Lead Pool) sau khi đổi sang ghi status PER-NICK.
 *
 * Bao phủ các nhánh:
 *   1. nick + Friend row tồn tại  → ghi Friend.statusId + gọi updateContactAggregate (KHÔNG ghi Contact.statusId).
 *   2. nick nhưng KHÔNG có Friend  → fallback ghi Contact.statusId (KHÔNG gọi aggregate).
 *   3. không nick                  → fallback ghi Contact.statusId.
 *   4. idempotent: lead đã noted   → KHÔNG tạo Note lại, vẫn áp status, trả ok.
 *   5. not_owner / already_released → ném lỗi.
 *   6. note_too_short chỉ chặn khi lần đầu (chưa noted).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  leadRequest: { findUnique: vi.fn() },
  leadPoolConfig: { findUnique: vi.fn() },
  status: { findFirst: vi.fn() },
  friend: { findFirst: vi.fn() },
};

// tx mock — tenantTransaction(cb) gọi cb(txMock)
const txMock = {
  leadRequest: { updateMany: vi.fn() },
  note: { create: vi.fn() },
  friend: { update: vi.fn() },
  contact: { update: vi.fn() },
};
const tenantTransactionMock = vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
const updateContactAggregateMock = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: prismaMock,
  tenantTransaction: tenantTransactionMock,
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/activity/activity-logger.js', () => ({ logActivity: vi.fn() }));
vi.mock('../src/modules/scoring/aggregate-contact.js', () => ({
  updateContactAggregate: updateContactAggregateMock,
}));

const { submitNote } = await import('../src/modules/lead-pool/lead-pool-service.js');

const ORG = 'org-1';
const SALE = 'user-sale-1';
const CONTACT = 'contact-1';
const NICK = 'nick-1';

function leadRow(over: Record<string, unknown> = {}) {
  return {
    id: 'lr-1',
    requestedByUserId: SALE,
    noteSubmittedAt: null,
    releaseReason: null,
    contactId: CONTACT,
    contact: { id: CONTACT, orgId: ORG },
    ...over,
  };
}

function configRow(noteMinLength = 20) {
  return {
    orgId: ORG, enabled: true, maxRequestsPerDay: 20, cooldownMinutes: 0,
    forgottenThresholdDays: 30, excludedStatuses: [], autoReturnAfterMinutes: 1440,
    requirePhoneInPool: false, forceNoteBeforeNext: true, enabledSources: [],
    noteMinLength, cooldownAfterNoteDays: 0, selfReclaimLockDays: 7, greetingTemplates: [],
  };
}

const VALID_NOTE = 'Đã gọi điện, KH bận hẹn lại 16h chiều mai nhé';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.leadPoolConfig.findUnique.mockResolvedValue(configRow());
  prismaMock.status.findFirst.mockResolvedValue({ id: 'st-1' });
  txMock.leadRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe('submitNote — ghi status PER-NICK vào Friend row', () => {
  it('có nick + Friend row → ghi Friend.statusId + aggregate, KHÔNG ghi Contact.statusId', async () => {
    prismaMock.leadRequest.findUnique.mockResolvedValue(leadRow());
    prismaMock.friend.findFirst.mockResolvedValue({ id: 'friend-1' });

    const res = await submitNote({ userId: SALE, leadRequestId: 'lr-1', noteContent: VALID_NOTE, statusId: 'st-1', nickId: NICK });

    expect(res).toMatchObject({ ok: true, statusId: 'st-1', target: 'friend' });
    expect(txMock.friend.update).toHaveBeenCalledWith({ where: { id: 'friend-1' }, data: { statusId: 'st-1' } });
    expect(updateContactAggregateMock).toHaveBeenCalledWith(CONTACT);
    // Contact.update chỉ bump lastActivity, KHÔNG set statusId
    expect(txMock.contact.update).toHaveBeenCalledWith({ where: { id: CONTACT }, data: { lastActivity: expect.any(Date) } });
    expect(txMock.note.create).toHaveBeenCalledTimes(1);
  });

  it('có nick nhưng KHÔNG có Friend row → fallback Contact.statusId, KHÔNG aggregate', async () => {
    prismaMock.leadRequest.findUnique.mockResolvedValue(leadRow());
    prismaMock.friend.findFirst.mockResolvedValue(null);

    const res = await submitNote({ userId: SALE, leadRequestId: 'lr-1', noteContent: VALID_NOTE, statusId: 'st-1', nickId: NICK });

    expect(res).toMatchObject({ ok: true, target: 'contact' });
    expect(txMock.friend.update).not.toHaveBeenCalled();
    expect(updateContactAggregateMock).not.toHaveBeenCalled();
    expect(txMock.contact.update).toHaveBeenCalledWith({ where: { id: CONTACT }, data: { lastActivity: expect.any(Date), statusId: 'st-1' } });
  });

  it('không nick → fallback Contact.statusId', async () => {
    prismaMock.leadRequest.findUnique.mockResolvedValue(leadRow());

    const res = await submitNote({ userId: SALE, leadRequestId: 'lr-1', noteContent: VALID_NOTE, statusId: 'st-1', nickId: null });

    expect(res).toMatchObject({ ok: true, target: 'contact' });
    expect(prismaMock.friend.findFirst).not.toHaveBeenCalled();
    expect(txMock.contact.update).toHaveBeenCalledWith({ where: { id: CONTACT }, data: { lastActivity: expect.any(Date), statusId: 'st-1' } });
  });
});

describe('submitNote — idempotent + guard', () => {
  it('lead đã noted bởi cùng sale → KHÔNG tạo Note lại, vẫn áp status, trả ok', async () => {
    prismaMock.leadRequest.findUnique.mockResolvedValue(leadRow({ noteSubmittedAt: new Date() }));
    prismaMock.friend.findFirst.mockResolvedValue({ id: 'friend-1' });

    const res = await submitNote({ userId: SALE, leadRequestId: 'lr-1', noteContent: VALID_NOTE, statusId: 'st-1', nickId: NICK });

    expect(res).toMatchObject({ ok: true });
    expect(txMock.leadRequest.updateMany).not.toHaveBeenCalled();
    expect(txMock.note.create).not.toHaveBeenCalled();
    expect(txMock.friend.update).toHaveBeenCalledWith({ where: { id: 'friend-1' }, data: { statusId: 'st-1' } });
  });

  it('note toàn khoảng trắng (trim < min) → ném note_too_short ở lần đầu', async () => {
    prismaMock.leadRequest.findUnique.mockResolvedValue(leadRow());
    await expect(
      submitNote({ userId: SALE, leadRequestId: 'lr-1', noteContent: '                     ', statusId: 'st-1', nickId: NICK }),
    ).rejects.toMatchObject({ errorCode: 'note_too_short' });
  });

  it('không phải chủ lead → ném not_owner', async () => {
    prismaMock.leadRequest.findUnique.mockResolvedValue(leadRow({ requestedByUserId: 'someone-else' }));
    await expect(
      submitNote({ userId: SALE, leadRequestId: 'lr-1', noteContent: VALID_NOTE, statusId: 'st-1', nickId: NICK }),
    ).rejects.toMatchObject({ errorCode: 'not_owner' });
  });

  it('lead đã trả về pool → ném already_released', async () => {
    prismaMock.leadRequest.findUnique.mockResolvedValue(leadRow({ releaseReason: 'manual_return' }));
    await expect(
      submitNote({ userId: SALE, leadRequestId: 'lr-1', noteContent: VALID_NOTE, statusId: 'st-1', nickId: NICK }),
    ).rejects.toMatchObject({ errorCode: 'already_released' });
  });
});
