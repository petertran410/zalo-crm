import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { workspaceError } from '../contacts/customer-workspace-service.js';
import { config } from '../../config/index.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]),
  );
  return value;
}
export function writeFingerprint(kind: string, payload: unknown) {
  return createHash('sha256').update(JSON.stringify({ kind, payload: canonical(payload) })).digest('hex');
}

export async function runPosWrite<T extends Record<string, unknown>>(
  context: { orgId: string; userId: string }, key: string, kind: string, payload: unknown,
  execute: (remoteKey: string) => Promise<T>,
): Promise<T> {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) {
    throw workspaceError('Thiếu mã thao tác ổn định. Hãy mở lại biểu mẫu phiên bản mới.');
  }
  const fingerprint = writeFingerprint(kind, {
    payload, integration: { url: config.hisweetiePublicApiUrl, clientId: config.hisweetiePublicApiClientId },
  });
  const where = { orgId_operationKey: { orgId: context.orgId, operationKey: key } };
  let operation = await prisma.posWriteOperation.findUnique({ where });
  if (!operation) {
    try {
      operation = await prisma.posWriteOperation.create({
        data: { id: randomUUID(), orgId: context.orgId, userId: context.userId, operationKey: key, fingerprint, status: 'ready' },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      operation = await prisma.posWriteOperation.findUnique({ where });
    }
  }
  if (!operation || operation.fingerprint !== fingerprint || operation.userId !== context.userId) {
    throw workspaceError('Mã thao tác đã dùng cho nội dung khác hoặc người khác.', 409);
  }
  if (operation.status === 'completed') return operation.result as T;
  if (operation.status === 'rejected') {
    throw Object.assign(workspaceError('POS đã từ chối yêu cầu. Sửa thông tin và tạo mã thao tác mới.'), { code: 'POS_REJECTED' });
  }
  // POS only retains idempotency keys for 24h. Never replay after that window.
  if (Date.now() - operation.createdAt.getTime() > 23 * 60 * 60_000) {
    throw workspaceError('Phiếu chờ đối soát quá 23 giờ. Kiểm tra tại POS trước, không gửi lại tự động.', 409);
  }
  const claimed = await prisma.posWriteOperation.updateMany({
    where: { id: operation.id, orgId: context.orgId, status: { in: ['ready', 'reconciliation'] } },
    data: { status: 'pending', error: null },
  });
  if (!claimed.count) throw workspaceError('Yêu cầu đang xử lý hoặc cần quản trị đối soát tại POS.', 409);
  try {
    const result = await execute(operation.id);
    await prisma.posWriteOperation.update({
      where: { id: operation.id }, data: { status: 'completed', result: result as Prisma.InputJsonValue },
    });
    return result;
  } catch (error) {
    const httpStatus = (error as { status?: number }).status;
    const rejected = httpStatus === 400 || httpStatus === 422;
    await prisma.posWriteOperation.update({
      where: { id: operation.id }, data: { status: rejected ? 'rejected' : 'reconciliation', error: error instanceof Error ? error.message : 'POS error' },
    });
    if (rejected) throw Object.assign(workspaceError(error instanceof Error ? error.message : 'POS từ chối dữ liệu.'), { code: 'POS_REJECTED' });
    throw workspaceError('Chưa xác định kết quả POS. Giữ nguyên biểu mẫu và mã thao tác để thử lại/đối soát; không tạo yêu cầu mới.', 409);
  }
}
