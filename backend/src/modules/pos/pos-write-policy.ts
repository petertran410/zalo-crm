import { config } from '../../config/index.js';

export function assertPosOrganization(orgId: string) {
  if (!config.posWebhookOrgId || config.posWebhookOrgId !== orgId) {
    throw Object.assign(new Error('Tổ chức chưa được gắn với kết nối POS này.'), { statusCode: 403 });
  }
}

export function assertPosWritesEnabled() {
  if (process.env.CRM_POS_WRITE_ENABLED !== 'true') {
    throw Object.assign(new Error('Ghi POS đang tắt. Chỉ bật sau khi nghiệm thu môi trường được cho phép.'), { statusCode: 503 });
  }
}

export function assertDraftContractVerified() {
  assertPosWritesEnabled();
  if (process.env.CRM_POS_DRAFT_CONTRACT_VERIFIED !== 'true') {
    throw Object.assign(new Error('Chưa kiểm chứng POS luôn tạo Phiếu tạm (status=1). Không gửi yêu cầu.'), { statusCode: 503 });
  }
}

export function verifiedDraftResponse(response: Record<string, unknown>): Record<string, unknown> {
  const data = (response.data ?? response.order ?? response) as Record<string, unknown>;
  const row = (data.order ?? data) as Record<string, unknown>;
  if (!Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0
    || row.status !== 1 || row.statusValue !== 'Phiếu tạm') {
    throw Object.assign(new Error('POS đã phản hồi nhưng chưa xác nhận được Phiếu tạm. Cần đối soát, không tạo phiếu khác.'), { statusCode: 409 });
  }
  return row;
}
