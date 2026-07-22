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
// Graph API version — env override, fallback ổn định.
const GRAPH_VERSION = process.env.FB_GRAPH_API_VERSION || 'v21.0';

class FacebookDriver implements ChannelDriver {
  readonly channel = 'facebook' as const;

  // Gửi tin qua Graph API. account.accessToken = Page token ĐÃ decrypt. threadId = PSID KH.
  // messaging_type RESPONSE (cửa sổ 24h — đủ cho test). Ngoài 24h cần MESSAGE_TAG/HUMAN_AGENT
  // (yêu cầu app review) — thêm sau. Chỉ text ở v1 (attachments để sau).
  async sendMessage(account: ChannelAccountRef, threadId: string, msg: OutboundMessage): Promise<SendResult> {
    if (!msg.text?.trim()) throw new Error('FacebookDriver.sendMessage: chỉ hỗ trợ text (v1) — thiếu text');
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(account.accessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: threadId },
        messaging_type: 'RESPONSE',
        message: { text: msg.text },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
    if (!res.ok || !data.message_id) {
      throw new Error(`FB send failed (${res.status}): ${data.error?.message ?? JSON.stringify(data)}`);
    }
    return { externalMsgId: data.message_id, sentAt: new Date() };
  }

  // Lấy tên hiển thị KH từ PSID (User Profile API — cần pages_messaging). Trả null nếu lỗi/không có
  // (KHÔNG throw — chỉ để enrich tên, thất bại thì fallback PSID). psid page-scoped.
  async getUserProfileName(account: ChannelAccountRef, psid: string): Promise<string | null> {
    try {
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(psid)}?fields=first_name,last_name&access_token=${encodeURIComponent(account.accessToken)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = (await res.json().catch(() => ({}))) as { first_name?: string; last_name?: string };
      const name = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
      return name || null;
    } catch {
      return null;
    }
  }

  /**
   * Tên KH qua Conversations API — GET /{page-id}/conversations?user_id={psid}&fields=participants.
   * QUAN TRỌNG: endpoint này trả tên cho MỌI người đã nhắn Page, kể cả người KHÔNG có app role
   * (User Profile API ở trên chỉ trả cho người có role khi app còn Development mode).
   * account.externalId phải là Page ID. Trả null nếu lỗi.
   */
  async getUserNameViaConversations(account: ChannelAccountRef, psid: string): Promise<string | null> {
    try {
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(account.externalId)}/conversations`
        + `?user_id=${encodeURIComponent(psid)}&fields=participants&access_token=${encodeURIComponent(account.accessToken)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = (await res.json().catch(() => ({}))) as {
        data?: Array<{ participants?: { data?: Array<{ id?: string; name?: string }> } }>;
      };
      for (const conv of d.data ?? []) {
        // Participant KHÁC Page chính là KH.
        const who = (conv.participants?.data ?? []).find((x) => x.id && x.id !== account.externalId);
        if (who?.name?.trim()) return who.name.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Resolve tên KH: thử User Profile API trước, fallback Conversations API. */
  async resolveUserName(account: ChannelAccountRef, psid: string): Promise<string | null> {
    return (await this.getUserProfileName(account, psid))
      ?? (await this.getUserNameViaConversations(account, psid));
  }

  async fetchHistory(_account: ChannelAccountRef, _threadId: string, _since?: Date | null): Promise<NormalizedInboundMessage[]> {
    // Phase 2: GET /{page-id}/conversations → /{thread-id}/messages (phân trang, không giới hạn 24h)
    throw new Error(NOT_IMPLEMENTED);
  }

  normalizeWebhook(rawBody: unknown): NormalizedInboundMessage[] {
    return normalizeMessengerWebhook(rawBody);
  }
}

// ── Chuẩn hoá payload webhook Messenger (pure — unit-test được, không DB) ──────────
// Shape Meta: { object:'page', entry:[{ id:<pageId>, messaging:[{ sender:{id}, recipient:{id},
//   timestamp, message:{ mid, text?, attachments?, is_echo? } }] }] }.
// externalThreadId = PSID phía KH (participant KHÔNG phải page). is_echo → outbound (page gửi).
interface FbAttachment { type?: string; payload?: { url?: string } }
interface FbMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: FbAttachment[] };
}
interface FbEntry { id?: string; messaging?: FbMessaging[] }
interface FbWebhookBody { object?: string; entry?: FbEntry[] }

export function normalizeMessengerWebhook(rawBody: unknown): NormalizedInboundMessage[] {
  const body = rawBody as FbWebhookBody | null;
  if (!body || body.object !== 'page' || !Array.isArray(body.entry)) return [];

  const out: NormalizedInboundMessage[] = [];
  for (const entry of body.entry) {
    const pageId = entry.id;
    if (!Array.isArray(entry.messaging)) continue;
    for (const ev of entry.messaging) {
      const msg = ev.message;
      if (!msg || !msg.mid) continue; // bỏ qua delivery/read/postback ở v1
      const senderId = ev.sender?.id;
      const recipientId = ev.recipient?.id;
      if (!senderId || !recipientId) continue;

      const isEcho = msg.is_echo === true;
      // Thread theo participant phía KH: echo → recipient là KH; inbound → sender là KH.
      const externalThreadId = senderId === pageId ? recipientId : senderId;
      const attachments = Array.isArray(msg.attachments)
        ? msg.attachments
            .filter((a) => a?.payload?.url)
            .map((a) => ({ type: a.type ?? 'file', url: a.payload!.url! }))
        : [];

      out.push({
        externalThreadId,
        externalMsgId: msg.mid,
        direction: isEcho ? 'outbound' : 'inbound',
        senderExternalId: senderId,
        text: msg.text ?? null,
        attachments,
        sentAt: ev.timestamp ? new Date(ev.timestamp) : new Date(),
      });
    }
  }
  return out;
}

export const facebookDriver = new FacebookDriver();
