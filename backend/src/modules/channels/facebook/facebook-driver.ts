/**
 * facebook-driver.ts — Driver Facebook Messenger (Meta Graph API).
 *
 * SKELETON phase 1 (2026-07-10): định hình contract để tsc kiểm + registry gắn được,
 * CHƯA gọi Graph API thật. Triển khai ở phase 2 (cần Meta app + Page access token).
 *
 * Tái dùng schema có sẵn (chưa có code): FacebookPageAccount (encryptedAccessToken +
 * webhookVerifyToken) làm nơi lưu Page; shared/crypto/aes-gcm.ts để decrypt token.
 * Send dùng Human Agent tag (cửa sổ 7 ngày) — xem plan multi-channel.
 */
import type {
  ChannelDriver, ChannelAccountRef, OutboundMessage, SendResult, NormalizedInboundMessage,
} from '../channel-driver.js';

const NOT_IMPLEMENTED = 'FacebookDriver chưa triển khai (phase 2 — cần Meta app + Page token)';

class FacebookDriver implements ChannelDriver {
  readonly channel = 'facebook' as const;

  async sendMessage(_account: ChannelAccountRef, _threadId: string, _msg: OutboundMessage): Promise<SendResult> {
    // Phase 2: POST https://graph.facebook.com/v21.0/me/messages
    //   { recipient:{ id: threadId }, message:{ text }, messaging_type:'MESSAGE_TAG', tag:'HUMAN_AGENT' }
    throw new Error(NOT_IMPLEMENTED);
  }

  async fetchHistory(_account: ChannelAccountRef, _threadId: string, _since?: Date | null): Promise<NormalizedInboundMessage[]> {
    // Phase 2: GET /{page-id}/conversations → /{thread-id}/messages (phân trang, không giới hạn 24h)
    throw new Error(NOT_IMPLEMENTED);
  }

  normalizeWebhook(_rawBody: unknown): NormalizedInboundMessage[] {
    // Phase 2: parse entry[].messaging[] → NormalizedInboundMessage[]
    throw new Error(NOT_IMPLEMENTED);
  }
}

export const facebookDriver = new FacebookDriver();
