import { HisweetieError, HisweetieRateLimitError, HisweetieAuthenticationError } from '@dieptra/mcp-client';
import { logger } from '../utils/logger.js';

export function handleMcpError(err: any): string {
  if (err instanceof HisweetieRateLimitError) {
    return `Yêu cầu quá nhanh từ POS. Vui lòng thử lại sau ${err.retryAfterSeconds} giây.`;
  }
  if (err instanceof HisweetieAuthenticationError) {
    return 'Lỗi xác thực với cổng POS. Vui lòng liên hệ quản trị viên kiểm tra lại cấu hình kết nối.';
  }
  if (err instanceof HisweetieError) {
    // Log toàn bộ error data dưới dạng JSON để không mất thông tin
    logger.error('[handleMcpError] Detailed MCP error:', {
      message: err.message,
      code: err.code,
      data: Array.isArray(err.data)
        ? err.data.map((d: any) => (typeof d === 'object' ? JSON.stringify(d) : d))
        : err.data,
    });

    const msg = err.message || '';

    // Nếu có data chi tiết từ MCP tool — serialize an toàn
    if (Array.isArray(err.data) && err.data.length > 0) {
      const firstItem = err.data[0];
      const detailedText = typeof firstItem === 'object'
        ? (firstItem.text && firstItem.text !== '[object Object]'
            ? firstItem.text
            : JSON.stringify(firstItem))
        : String(firstItem);
      if (detailedText && detailedText !== '[object Object]') {
        logger.error(`[handleMcpError] MCP error detail: ${detailedText}`);
        // Không forward raw error ra user vì có thể chứa thông tin kỹ thuật nhạy cảm
      }
    }

    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists') || msg.includes('tồn tại')) {
      return 'Số điện thoại hoặc mã khách hàng này đã tồn tại trên hệ thống POS.';
    }
    if (msg.toLowerCase().includes('required') || msg.includes('bắt buộc')) {
      return 'Thiếu các thông tin bắt buộc yêu cầu từ hệ thống POS.';
    }
    return `Lỗi từ POS: ${msg}`;
  }

  // Phân tích lỗi HTTP/Network thông thường
  const errMsg = err.message || String(err);
  if (errMsg.toLowerCase().includes('timeout') || errMsg.includes('quá thời gian')) {
    return 'Kết nối tới cổng POS bị quá thời gian (Timeout). Vui lòng thử lại sau.';
  }
  if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND')) {
    return 'Không thể kết nối tới máy chủ POS MCP (Cổng dịch vụ đang ngoại tuyến).';
  }

  return errMsg;
}
