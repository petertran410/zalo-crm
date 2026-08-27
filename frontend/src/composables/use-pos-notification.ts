/**
 * use-pos-notification.ts — ĐÃ TẮT.
 *
 * Trước đây lắng `pos:data:updated` rồi bắn toast "Đã cập nhật dữ liệu POS từ
 * Webhook (Sản phẩm)" kèm nút "XEM SẢN PHẨM" trên mọi trang. Mỗi lần POS đẩy
 * webhook (thường theo lô, nhiều lần/phút) là một toast chồng lên — che luôn
 * Trung tâm đồng bộ POS.
 *
 * Bảng POS vẫn tự làm mới qua `usePosSocket` / listener `pos:data:updated` ở
 * từng view. Không cần toast toàn cục.
 */
export function usePosNotification(): void {
  // no-op — giữ export để caller cũ / test cũ không vỡ import.
}
