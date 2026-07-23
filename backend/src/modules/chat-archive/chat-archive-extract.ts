/**
 * chat-archive-extract.ts — Phase Lưu Hội Thoại 2026-07-22.
 *
 * Logic THUẦN (không Prisma/Redis/env) để test được không cần dựng môi trường:
 * bóc URL ảnh/tệp ra khỏi 1 tin nhắn, và dựng bản chép từng dòng.
 *
 * Vì sao cần bóc: Message.content của tin media là chuỗi JSON của zca-js, không phải
 * chữ người đọc. Mỗi loại tin nhét URL vào một field khác nhau (href/hdUrl/normalUrl/
 * url/fileUrl) — cùng bộ field mà save-from-chat-helper.ts đang dùng.
 */

/** Các field zca-js nhét URL media vào, xếp theo ĐỘ ƯU TIÊN (nét nhất trước). */
const MEDIA_URL_FIELDS = ['hdUrl', 'href', 'normalUrl', 'url', 'fileUrl', 'thumbUrl'] as const;

export interface ArchivableMessage {
  id: string;
  senderType: string;
  senderName: string | null;
  content: string | null;
  contentType: string;
  attachments: unknown;
  sentAt: Date;
  isDeleted?: boolean;
}

export interface ArchiveLine {
  seq: number;
  sourceMessageId: string;
  senderType: string;
  senderName: string | null;
  content: string | null;
  contentType: string;
  mediaUrls: string[];
  sentAt: Date;
}

/** Chuỗi có phải URL http(s) dùng được không. */
function isHttpUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length < 8) return false;
  return /^https?:\/\//i.test(v);
}

/**
 * Bóc mọi URL media của 1 tin nhắn (đã khử trùng, giữ thứ tự ưu tiên).
 *
 * Nguồn quét:
 *   1. content — chuỗi JSON zca-js (tin ảnh/tệp/video)
 *   2. content.params — JSON LỒNG (Zalo hay nhét URL tệp vào đây)
 *   3. attachments — mảng Json trên Message
 *
 * Tin CHỮ (content không phải JSON) → trả mảng rỗng, không nổ.
 */
export function extractMediaUrls(msg: Pick<ArchivableMessage, 'content' | 'attachments'>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    if (isHttpUrl(v) && !seen.has(v)) { seen.add(v); out.push(v); }
  };

  // 1 + 2. content JSON (+ params lồng bên trong).
  let parsed: Record<string, unknown> | null = null;
  try {
    const raw = JSON.parse(msg.content || 'null');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw as Record<string, unknown>;
  } catch { /* tin chữ thường — không phải JSON, bỏ qua */ }

  if (parsed) {
    for (const f of MEDIA_URL_FIELDS) push(parsed[f]);
    let params: Record<string, unknown> | null = null;
    try {
      const p = typeof parsed.params === 'string' ? JSON.parse(parsed.params) : parsed.params;
      if (p && typeof p === 'object' && !Array.isArray(p)) params = p as Record<string, unknown>;
    } catch { /* params hỏng — bỏ qua */ }
    if (params) for (const f of MEDIA_URL_FIELDS) push(params[f]);
  }

  // 3. attachments (mảng Json).
  if (Array.isArray(msg.attachments)) {
    for (const att of msg.attachments) {
      if (isHttpUrl(att)) { push(att); continue; }
      if (att && typeof att === 'object') {
        for (const f of MEDIA_URL_FIELDS) push((att as Record<string, unknown>)[f]);
      }
    }
  }

  return out;
}

/**
 * Chữ NGƯỜI ĐỌC ĐƯỢC của 1 tin — dùng cho bản chép và cho ngữ cảnh AI tóm tắt.
 * Tin media: content là JSON → trả tiêu đề/tên tệp nếu có, không thì nhãn theo loại
 * ("[Ảnh]", "[Tệp]"). Không bao giờ trả nguyên chuỗi JSON thô cho người đọc.
 */
export function readableContent(msg: Pick<ArchivableMessage, 'content' | 'contentType'>): string | null {
  const ct = msg.contentType;
  if (ct === 'text' || !msg.content) return msg.content;

  let parsed: Record<string, unknown> | null = null;
  try {
    const raw = JSON.parse(msg.content);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw as Record<string, unknown>;
  } catch { /* không phải JSON → chính là chữ */ }
  if (!parsed) return msg.content;

  const title = parsed.title ?? parsed.fileName ?? parsed.name ?? parsed.description;
  if (typeof title === 'string' && title.trim()) return title.trim();

  const label: Record<string, string> = {
    image: '[Ảnh]', video: '[Video]', file: '[Tệp]', sticker: '[Nhãn dán]',
    voice: '[Tin thoại]', link: '[Liên kết]', gif: '[Ảnh động]',
  };
  return label[ct] ?? `[${ct}]`;
}

/**
 * Dựng bản chép TỪNG DÒNG từ danh sách tin (đã sort theo thời gian ở tầng gọi).
 * Tin đã thu hồi (isDeleted) VẪN được chép, nhưng nội dung thay bằng nhãn — bản lưu
 * phản ánh đúng "có 1 tin ở đây và nó đã bị thu hồi", không giả vờ như chưa từng có.
 */
export function buildArchiveLines(messages: ArchivableMessage[]): ArchiveLine[] {
  return messages.map((m, i) => ({
    seq: i,
    sourceMessageId: m.id,
    senderType: m.senderType,
    senderName: m.senderName,
    content: m.isDeleted ? '[Tin đã thu hồi]' : readableContent(m),
    contentType: m.contentType,
    mediaUrls: m.isDeleted ? [] : extractMediaUrls(m),
    sentAt: m.sentAt,
  }));
}

/** Đếm số dòng CÓ media — hiện ở danh sách bản lưu ("12 ảnh/tệp"). */
export function countMediaLines(lines: ArchiveLine[]): number {
  return lines.reduce((n, l) => n + (l.mediaUrls.length > 0 ? 1 : 0), 0);
}
