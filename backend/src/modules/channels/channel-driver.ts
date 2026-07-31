/**
 * channel-driver.ts — Giao diện driver kênh nhắn tin (multi-channel V1, 2026-07-10).
 *
 * Trừu tượng hoá ở TẦNG TIN NHẮN (gửi / chuẩn hoá inbound / kéo lịch sử), KHÔNG ở
 * tầng vòng đời kết nối — mỗi kênh giữ luồng connect riêng (Zalo = QR qua zalo-pool,
 * Facebook = OAuth Page token). Zalo hiện KHÔNG đi qua driver (giữ nguyên đường trực
 * tiếp đã ổn định + phức tạp trong chat-routes: privacy, rate-limit, echo idempotency,
 * quote/styles/mentions, phân loại lỗi zca-js). Driver dành cho kênh MỚI: Facebook,
 * TikTok Shop — nơi ta viết từ đầu nên khớp abstraction ngay.
 */

export type ChannelKind = 'zalo' | 'facebook' | 'tiktok_shop';

/** Tham chiếu account tối giản driver cần để gọi API — decouple driver khỏi Prisma model.
 *  accessToken đã được caller GIẢI MÃ (shared/crypto/aes-gcm) trước khi truyền vào. */
export interface ChannelAccountRef {
  id: string;          // id nội bộ (vd FacebookPageAccount.id)
  externalId: string;  // FB Page ID / TikTok shop id
  accessToken: string; // token PLAIN (đã decrypt)
}

export interface OutboundAttachment {
  type: 'image' | 'file' | 'video';
  url: string;
}

export interface OutboundMessage {
  text?: string;
  attachments?: OutboundAttachment[];
  /** id tin gốc (external id của kênh) khi reply — optional, kênh nào không hỗ trợ thì bỏ qua. */
  replyToExternalMsgId?: string | null;
}

export interface SendResult {
  externalMsgId: string;
  sentAt: Date;
}

/** Tin nhắn đã chuẩn hoá về shape chung để ghi vào bảng Message (bất kể kênh nào).
 *  direction: inbound = KH gửi tới page; outbound = page gửi đi (echo từ webhook). */
export interface NormalizedInboundMessage {
  externalThreadId: string; // thread theo id của kênh (với FB là PSID người gửi, page-scoped)
  externalMsgId: string;
  direction: 'inbound' | 'outbound';
  senderExternalId: string;
  text: string | null;
  attachments: Array<{ type: string; url: string }>;
  sentAt: Date;
}

export interface ChannelDriver {
  readonly channel: ChannelKind;

  /** Gửi tin. Trả id tin theo kênh để dedup với webhook echo sau đó. */
  sendMessage(account: ChannelAccountRef, threadId: string, msg: OutboundMessage): Promise<SendResult>;

  /** Kéo lịch sử 1 thread (backfill khi mới connect). since=null → kéo toàn bộ. */
  fetchHistory(account: ChannelAccountRef, threadId: string, since?: Date | null): Promise<NormalizedInboundMessage[]>;

  /** Chuẩn hoá payload webhook thô của kênh → danh sách tin đã chuẩn hoá. */
  normalizeWebhook(rawBody: unknown): NormalizedInboundMessage[];
}
