// Unit test cho phần bóc media + dựng bản chép của Lưu Hội Thoại (hàm thuần, không DB).
import { describe, it, expect } from 'vitest';
import {
  extractMediaUrls, readableContent, buildArchiveLines, countMediaLines,
  type ArchivableMessage,
} from '../src/modules/chat-archive/chat-archive-extract.js';

function msg(over: Partial<ArchivableMessage> = {}): ArchivableMessage {
  return {
    id: 'm1', senderType: 'contact', senderName: 'Khách A',
    content: 'xin chào', contentType: 'text', attachments: [],
    sentAt: new Date('2026-07-20T03:00:00Z'), isDeleted: false,
    ...over,
  };
}

describe('extractMediaUrls', () => {
  it('tin chữ thường → không có media, KHÔNG nổ khi content không phải JSON', () => {
    expect(extractMediaUrls(msg())).toEqual([]);
  });

  it('bóc URL ảnh từ content JSON của zca-js', () => {
    const m = msg({
      contentType: 'image',
      content: JSON.stringify({ href: 'https://cdn/a.jpg', thumbUrl: 'https://cdn/a-thumb.jpg' }),
    });
    expect(extractMediaUrls(m)).toContain('https://cdn/a.jpg');
  });

  it('ưu tiên bản nét (hdUrl) đứng trước bản thường', () => {
    const m = msg({
      contentType: 'image',
      content: JSON.stringify({ normalUrl: 'https://cdn/small.jpg', hdUrl: 'https://cdn/big.jpg' }),
    });
    expect(extractMediaUrls(m)[0]).toBe('https://cdn/big.jpg');
  });

  it('bóc được URL nằm trong params LỒNG dạng chuỗi JSON', () => {
    const m = msg({
      contentType: 'file',
      content: JSON.stringify({ params: JSON.stringify({ fileUrl: 'https://cdn/bao-gia.pdf' }) }),
    });
    expect(extractMediaUrls(m)).toEqual(['https://cdn/bao-gia.pdf']);
  });

  it('bóc từ mảng attachments (cả chuỗi trần lẫn object)', () => {
    const m = msg({
      attachments: ['https://cdn/x.png', { url: 'https://cdn/y.png' }],
    });
    expect(extractMediaUrls(m)).toEqual(['https://cdn/x.png', 'https://cdn/y.png']);
  });

  it('khử trùng URL lặp ở nhiều nguồn', () => {
    const m = msg({
      contentType: 'image',
      content: JSON.stringify({ href: 'https://cdn/same.jpg' }),
      attachments: [{ url: 'https://cdn/same.jpg' }],
    });
    expect(extractMediaUrls(m)).toEqual(['https://cdn/same.jpg']);
  });

  it('bỏ qua giá trị không phải URL http(s)', () => {
    const m = msg({
      contentType: 'image',
      content: JSON.stringify({ href: 'file:///etc/passwd', url: '   ', hdUrl: 42 }),
    });
    expect(extractMediaUrls(m)).toEqual([]);
  });

  it('content JSON hỏng giữa chừng → trả rỗng, không throw', () => {
    expect(() => extractMediaUrls(msg({ content: '{"href": "https://a.jpg"' }))).not.toThrow();
    expect(extractMediaUrls(msg({ content: '{"href": "https://a.jpg"' }))).toEqual([]);
  });
});

describe('readableContent', () => {
  it('tin chữ giữ nguyên', () => {
    expect(readableContent(msg())).toBe('xin chào');
  });

  it('tin tệp trả TÊN TỆP chứ không phải chuỗi JSON thô', () => {
    const m = msg({ contentType: 'file', content: JSON.stringify({ fileName: 'Bảng giá.xlsx' }) });
    expect(readableContent(m)).toBe('Bảng giá.xlsx');
  });

  it('tin ảnh không có tiêu đề → nhãn loại tin', () => {
    const m = msg({ contentType: 'image', content: JSON.stringify({ href: 'https://cdn/a.jpg' }) });
    expect(readableContent(m)).toBe('[Ảnh]');
  });

  it('loại tin lạ → nhãn theo tên loại, không trả JSON', () => {
    const m = msg({ contentType: 'poll', content: JSON.stringify({ x: 1 }) });
    expect(readableContent(m)).toBe('[poll]');
  });
});

describe('buildArchiveLines', () => {
  it('đánh số seq liên tiếp theo thứ tự đầu vào', () => {
    const lines = buildArchiveLines([msg({ id: 'a' }), msg({ id: 'b' }), msg({ id: 'c' })]);
    expect(lines.map((l) => l.seq)).toEqual([0, 1, 2]);
    expect(lines.map((l) => l.sourceMessageId)).toEqual(['a', 'b', 'c']);
  });

  it('tin đã thu hồi VẪN được chép nhưng thay bằng nhãn + bỏ media', () => {
    const m = msg({
      isDeleted: true, contentType: 'image',
      content: JSON.stringify({ href: 'https://cdn/a.jpg' }),
    });
    const [line] = buildArchiveLines([m]);
    expect(line.content).toBe('[Tin đã thu hồi]');
    expect(line.mediaUrls).toEqual([]);
  });

  it('giữ nguyên người gửi và mốc thời gian', () => {
    const at = new Date('2026-07-21T09:30:00Z');
    const [line] = buildArchiveLines([msg({ senderType: 'self', senderName: 'Sale B', sentAt: at })]);
    expect(line.senderType).toBe('self');
    expect(line.senderName).toBe('Sale B');
    expect(line.sentAt).toEqual(at);
  });

  it('danh sách rỗng → mảng rỗng', () => {
    expect(buildArchiveLines([])).toEqual([]);
  });
});

describe('countMediaLines', () => {
  it('đếm số DÒNG có media, không phải tổng số URL', () => {
    const lines = buildArchiveLines([
      msg({ id: '1', contentType: 'image', content: JSON.stringify({ hdUrl: 'https://c/1.jpg', normalUrl: 'https://c/1s.jpg' }) }),
      msg({ id: '2' }),
      msg({ id: '3', contentType: 'file', content: JSON.stringify({ fileUrl: 'https://c/d.pdf' }) }),
    ]);
    expect(countMediaLines(lines)).toBe(2);
  });
});
