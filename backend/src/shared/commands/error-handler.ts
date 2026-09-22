/**
 * error-handler.ts — Map lỗi POS → thông báo người dùng.
 *
 * 2026-08-25: MCP đã loại bỏ, CRM nói chuyện với POS qua Public API thuần
 * (hisweetie-public-api-client.ts). Lỗi từ đó là Error thuần với message dạng
 * `Hisweetie Public API {status}: {body}` — phân loại theo status, không còn
 * instanceof các error class của SDK MCP.
 */
import { logger } from '../utils/logger.js';
import { PublicApiRateLimitError } from '../../modules/integrations/hisweetie-public-api-client.js';

/**
 * Client throw `Hisweetie Public API {status}: {JSON body}` — body lồng nhau
 * nên chuỗi chứa `\"` (backslash-quote). Regex trên chuỗi thô sẽ hụt; phải
 * JSON.parse phần body để lấy message sạch.
 */
export function parsePosPublicApiError(err: any): { status: number | null; detail: string } {
  const msg = err?.message || String(err ?? '');
  const m = msg.match(/^Hisweetie Public API (\d{3}): (.*)$/s);
  if (!m) return { status: null, detail: msg };
  const status = Number(m[1]);
  try {
    const body = JSON.parse(m[2]);
    const inner = body?.message;
    const detail = typeof inner === 'string'
      ? inner
      : Array.isArray(inner?.message)
        ? inner.message.join('; ')
        : (inner?.message ?? m[2]);
    return { status, detail: String(detail) };
  } catch {
    return { status, detail: m[2] };
  }
}

export function handleMcpError(err: any): string {
  if (err instanceof PublicApiRateLimitError) {
    return `Yêu cầu quá nhanh từ POS. Vui lòng thử lại sau ${Math.ceil(err.retryAfterMs / 1000)} giây.`;
  }

  const { status, detail } = parsePosPublicApiError(err);
  if (status !== null) {
    logger.error(`[handleMcpError] POS ${status}:`, detail.slice(0, 2000));

    if (status === 401) {
      return 'Lỗi xác thực với cổng POS. Vui lòng liên hệ quản trị viên kiểm tra lại cấu hình kết nối.';
    }
    if (status === 429) {
      return 'Yêu cầu quá nhanh từ POS. Vui lòng thử lại sau ít phút.';
    }

    // POS strict validation trả message kèm tên trường vi phạm.
    const lower = detail.toLowerCase();
    if (lower.includes('duplicate') || lower.includes('already exists') || detail.includes('tồn tại')) {
      return 'Số điện thoại hoặc mã khách hàng này đã tồn tại trên hệ thống POS.';
    }
    if (lower.includes('required') || detail.includes('bắt buộc') || lower.includes('should not exist')) {
      return 'Dữ liệu gửi sang POS không hợp lệ (thiếu trường bắt buộc hoặc thừa trường không được phép). Vui lòng liên hệ quản trị viên.';
    }
    return `Lỗi từ POS: ${detail.slice(0, 300)}`;
  }

  // Lỗi tầng mạng (fetchWithNetworkRetry bọc thành PublicApiUnreachableError).
  const errMsg = detail;
  if (errMsg.toLowerCase().includes('timeout') || errMsg.includes('quá thời gian')) {
    return 'Kết nối tới cổng POS bị quá thời gian (Timeout). Vui lòng thử lại sau.';
  }
  if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND') || errMsg.includes('Không nối được POS')) {
    return 'Không thể kết nối tới máy chủ POS (Cổng dịch vụ đang ngoại tuyến). Vui lòng thử lại sau.';
  }

  return errMsg;
}
