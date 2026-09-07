/**
 * product-interest-prompt.ts
 *
 * Chuyên trách quản lý mẫu Prompt và parser JSON trích xuất sản phẩm khách hàng quan tâm.
 * Tuân thủ Single Responsibility Principle (SOLID):
 * - Không chứa thông tin định danh công ty cụ thể
 * - Định vị ngành hàng chung: nguyên liệu, máy móc và thiết bị pha chế đồ uống (F&B)
 */

export interface ExtractedProductItem {
  product_name: string;
  intent?: string;
  notes?: string;
}

export interface ExtractedProductResult {
  has_product_inquiry: boolean;
  products: ExtractedProductItem[];
  relevant_message_numbers?: number[];
}

/**
 * Xây dựng prompt phân tích hội thoại chat
 * Không chứa thông tin định danh công ty cụ thể
 */
export function buildProductInterestPrompt(chatTranscript: string): string {
  return `Bạn là chuyên gia phân tích hội thoại bán hàng (CRM AI Assistant) cho ngành nguyên liệu, máy móc và thiết bị pha chế đồ uống (F&B).

Dưới đây là đoạn hội thoại chat gần đây giữa Nhân viên bán hàng (Sale) và Khách hàng (Customer) (mỗi tin nhắn được đánh số thứ tự [#1], [#2]...):

--- BẮT ĐẦU ĐOẠN CHAT ---
${chatTranscript}
--- KẾT THÚC ĐOẠN CHAT ---

NHIỆM VỤ CỦA BẠN:
Phân tích đoạn chat trên và trích xuất danh sách tất cả các sản phẩm mà KHÁCH HÀNG đang thật sự quan tâm, hỏi giá, xin mẫu thử hoặc tìm hiểu.

QUY TẮC PHÂN TÍCH:
1. Chỉ trích xuất sản phẩm do KHÁCH HÀNG hỏi hoặc quan tâm (không trích xuất sản phẩm Sale tự chào mà khách từ chối hoặc không phản hồi).
2. Chuẩn hóa tên sản phẩm (bỏ đại từ, từ cảm thán, viết hoa tên riêng sản phẩm nếu có).
3. Xác định rõ ý định (intent): "Hỏi giá", "Xin mẫu thử", "Hỏi thông số/tư vấn", "Hỏi tồn kho", "Đặt hàng"...
4. Tóm tắt ngắn gọn ngữ cảnh của câu hỏi vào trường "notes" (tối đa 1-2 câu).
5. Trong trường "relevant_message_numbers", liệt kê mảng số thứ tự [#1], [#2]... của các tin nhắn do KHÁCH HÀNG gửi chứa thông tin hỏi/yêu cầu về sản phẩm. TUYỆT ĐỐI KHÔNG lấy các tin nhắn chào hỏi xã giao, cảm ơn, dạ/vâng và KHÔNG lấy tin nhắn của Sale.
6. BẮT BUỘC trả về định dạng JSON thuần túy, KHÔNG viết thêm bất kỳ lời dẫn hay giải thích nào ngoài JSON.

ĐỊNH DẠNG JSON ĐẦU RA BẮT BUỘC:
{
  "has_product_inquiry": true,
  "products": [
    {
      "product_name": "Tên sản phẩm",
      "intent": "Hỏi giá / Xin mẫu thử...",
      "notes": "Tóm tắt ngắn gọn câu hỏi"
    }
  ],
  "relevant_message_numbers": [1, 3]
}

Nếu trong đoạn chat không có sản phẩm nào khách quan tâm, trả về:
{
  "has_product_inquiry": false,
  "products": [],
  "relevant_message_numbers": []
}`;
}

/**
 * Parse an toàn kết quả trả về từ LLM (bóc tách JSON kể cả khi có bọc markdown \`\`\`json ... \`\`\`)
 */
export function parseLlmProductJson(rawText: string): ExtractedProductResult {
  if (!rawText || !rawText.trim()) {
    return { has_product_inquiry: false, products: [], relevant_message_numbers: [] };
  }

  const clean = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const extractResult = (parsed: any): ExtractedProductResult => {
    const rawNumbers = Array.isArray(parsed.relevant_message_numbers)
      ? parsed.relevant_message_numbers
      : [];
    const relevantMessageNumbers = rawNumbers
      .map((n: any) => (typeof n === 'string' ? parseInt(n.replace(/\D/g, ''), 10) : Number(n)))
      .filter((n: number) => !isNaN(n) && n > 0);

    return {
      has_product_inquiry: Boolean(parsed.has_product_inquiry),
      products: Array.isArray(parsed.products) ? parsed.products : [],
      relevant_message_numbers: relevantMessageNumbers,
    };
  };

  try {
    const parsed = JSON.parse(clean);
    return extractResult(parsed);
  } catch {
    // Regex fallback để tìm khối {...} đầu tiên nếu model thêm text thừa
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return extractResult(parsed);
      } catch (err) {
        throw new Error(`Failed to parse extracted JSON from LLM: ${String(err)}`);
      }
    }
    throw new Error(`Failed to parse LLM response as JSON: ${rawText}`);
  }
}
