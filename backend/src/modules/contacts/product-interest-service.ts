/**
 * product-interest-service.ts
 *
 * Service điều phối nghiệp vụ trích xuất và quản lý sản phẩm khách hàng quan tâm.
 * Phụ trách:
 * 1. Thu thập tin nhắn từ database cho contactId
 * 2. Gọi LLM Client thông qua prompt chuẩn
 * 3. Lưu trữ và quản lý bảng độc lập customer_product_interests
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { Prisma } from '@prisma/client';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import { buildProductInterestPrompt, parseLlmProductJson } from './prompts/product-interest-prompt.js';
import { GeminiInteractionsClient, IProductInterestLlmClient } from './clients/gemini-interactions-client.js';

export interface ScanParams {
  contactId: string;
  orgId: string;
  userId: string;
  userName: string;
  llmClient?: IProductInterestLlmClient;
}

export interface UpdateInterestParams {
  productName?: string;
  intent?: string;
  notes?: string;
  status?: string;
}

export class ProductInterestService {
  /**
   * Quét và trích xuất nhu cầu sản phẩm từ hội thoại chat của khách hàng
   */
  async scanProductInterests(params: ScanParams) {
    const { contactId, orgId, userId, userName } = params;

    // 1. Kiểm tra sự tồn tại của Contact
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId },
      select: { id: true, fullName: true, crmName: true },
    });
    if (!contact) {
      throw new Error('Không tìm thấy thông tin khách hàng.');
    }

    const customerDisplayName = contact.fullName || contact.crmName || 'Khách hàng';

    // 2. Tìm các hội thoại thuộc contact này
    const conversations = await prisma.conversation.findMany({
      where: { contactId, orgId },
      select: { id: true },
    });

    if (conversations.length === 0) {
      return {
        success: false,
        message: 'Khách hàng này chưa có đoạn hội thoại chat nào trong hệ thống.',
        newCount: 0,
        scannedMessageIds: [],
        data: await this.listProductInterests(contactId, orgId),
      };
    }

    const conversationIds = conversations.map((c) => c.id);

    // 3. Lấy tối đa 80 tin nhắn gần nhất chưa xóa của hội thoại
    const messages = await prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        isDeleted: false,
      },
      orderBy: { sentAt: 'desc' },
      take: 80,
    });

    // Lọc các tin nhắn có nội dung văn bản
    const textMessages = messages.filter((m) => m.content && m.content.trim().length > 0);
    if (textMessages.length === 0) {
      return {
        success: false,
        message: 'Chưa có nội dung tin nhắn văn bản nào để phân tích.',
        newCount: 0,
        scannedMessageIds: [],
        data: await this.listProductInterests(contactId, orgId),
      };
    }

    // 4. Sắp xếp lại theo trình tự thời gian tăng dần để LLM hiểu dòng hội thoại
    const chronologicalMessages = [...textMessages].reverse();

    // Reset cờ aiScanned cũ trong các hội thoại của contact
    try {
      if (conversationIds.length > 0) {
        await prisma.$executeRaw`
          UPDATE messages
          SET metadata = metadata - 'aiScanned'
          WHERE conversation_id IN (${Prisma.join(conversationIds.map((id) => Prisma.sql`${id}`))})
            AND metadata ? 'aiScanned'
        `;
      }
    } catch (err: any) {
      logger.warn(`[ProductInterest] Không thể reset metadata aiScanned cho tin nhắn cũ: ${err.message}`);
    }

    // Đánh số thứ tự [#1], [#2]... để Gemini chỉ định chính xác tin nhắn liên quan
    const chatTranscript = chronologicalMessages
      .map((m, index) => {
        const msgNum = index + 1;
        const role = m.senderType === 'self' ? `Sale (${m.senderName || 'Sale'})` : `Khách (${customerDisplayName})`;
        const timeStr = m.sentAt ? new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
        return `[#${msgNum}] [${timeStr}] ${role}: ${m.content?.trim()}`;
      })
      .join('\n');

    // 5. Chuẩn bị prompt
    const prompt = buildProductInterestPrompt(chatTranscript);

    // 6. Khởi tạo LLM Client (cho phép DI khi cần test hoặc đổi provider)
    let client: IProductInterestLlmClient;
    if (params.llmClient) {
      client = params.llmClient;
    } else {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || '';
      const model = (config as any).geminiModel || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const baseUrl = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';

      if (!apiKey) {
        throw new Error('Hệ thống chưa được cấu hình GEMINI_API_KEY trong file .env');
      }
      client = new GeminiInteractionsClient(apiKey, model, baseUrl);
    }

    logger.info(`[ProductInterest] Analyzing chat for contact=${contactId}, msgCount=${chronologicalMessages.length}`);
    const rawLlmResponse = await client.analyzeChat(prompt);

    // 7. Parse kết quả trả về từ LLM
    const extractedResult = parseLlmProductJson(rawLlmResponse);

    // Lấy chính xác các tin nhắn của KHÁCH HÀNG chứa thông tin hỏi/yêu cầu sản phẩm do Gemini chỉ định
    const relevantNumbers = Array.isArray(extractedResult.relevant_message_numbers)
      ? extractedResult.relevant_message_numbers
      : [];

    const scannedMessageIds: string[] = [];
    for (const num of relevantNumbers) {
      const msg = chronologicalMessages[Number(num) - 1];
      // CHỈ đánh dấu tin nhắn của Khách hàng hỏi/yêu cầu về sản phẩm
      if (msg && msg.senderType !== 'self' && msg.id && !scannedMessageIds.includes(msg.id)) {
        scannedMessageIds.push(msg.id);
      }
    }

    // Cập nhật cờ aiScanned: true cho ĐÚNG các tin nhắn khách hàng được AI chỉ định
    if (scannedMessageIds.length > 0) {
      try {
        await prisma.$executeRaw`
          UPDATE messages
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{aiScanned}', 'true'::jsonb)
          WHERE id IN (${Prisma.join(scannedMessageIds.map((id) => Prisma.sql`${id}`))})
        `;
      } catch (err: any) {
        logger.warn(`[ProductInterest] Không thể cập nhật metadata aiScanned cho tin nhắn liên quan: ${err.message}`);
      }
    }

    const scanTimestamp = new Date();

    if (!extractedResult.has_product_inquiry || !extractedResult.products || extractedResult.products.length === 0) {
      return {
        success: true,
        message: 'Không phát hiện sản phẩm nào khách hàng quan tâm trong các tin nhắn gần đây.',
        newCount: 0,
        scannedMessageIds,
        data: await this.listProductInterests(contactId, orgId),
      };
    }

    // 8. Lưu kết quả vào cơ sở dữ liệu (dedup theo tên sản phẩm chưa xóa của contact)
    let addedCount = 0;
    for (const item of extractedResult.products) {
      if (!item.product_name || !item.product_name.trim()) continue;

      const trimmedName = item.product_name.trim();

      // Kiểm tra sản phẩm đã có trong danh sách hiện hành chưa
      const existing = await prisma.customerProductInterest.findFirst({
        where: {
          contactId,
          isDeleted: false,
          productName: { equals: trimmedName, mode: 'insensitive' },
        },
      });

      if (existing) {
        // Cập nhật lại ngữ cảnh mới và mốc thời gian quét
        await prisma.customerProductInterest.update({
          where: { id: existing.id },
          data: {
            customerName: customerDisplayName,
            scannedByUserId: userId,
            scannedByName: userName,
            intent: item.intent || existing.intent,
            notes: item.notes || existing.notes,
            scannedAt: scanTimestamp,
          },
        });
      } else {
        // Thêm bản ghi mới
        await prisma.customerProductInterest.create({
          data: {
            orgId,
            contactId,
            customerName: customerDisplayName,
            scannedByUserId: userId,
            scannedByName: userName,
            productName: trimmedName,
            intent: item.intent || 'Hỏi giá',
            notes: item.notes || null,
            status: 'inquiring',
            isDeleted: false,
            scannedAt: scanTimestamp,
          },
        });
        addedCount++;
      }
    }

    const updatedData = await this.listProductInterests(contactId, orgId);

    return {
      success: true,
      message: `Đã quét thành công và cập nhật ${extractedResult.products.length} sản phẩm (${addedCount} sản phẩm mới).`,
      newCount: addedCount,
      scannedMessageIds,
      data: updatedData,
    };
  }

  /**
   * Lấy danh sách sản phẩm đang quan tâm của một khách hàng
   */
  async listProductInterests(contactId: string, orgId?: string) {
    const where: any = {
      contactId,
      isDeleted: false,
    };
    if (orgId) where.orgId = orgId;

    const items = await prisma.customerProductInterest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Lấy thông tin lần quét cuối cùng (kể cả đã xóa) để hiển thị thời gian & người quét
    const lastScan = await prisma.customerProductInterest.findFirst({
      where: orgId ? { contactId, orgId } : { contactId },
      orderBy: { scannedAt: 'desc' },
      select: {
        scannedAt: true,
        scannedByName: true,
        scannedByUserId: true,
      },
    });

    return {
      items,
      total: items.length,
      lastScanInfo: lastScan
        ? {
            scannedAt: lastScan.scannedAt,
            scannedByName: lastScan.scannedByName || 'Sale',
            scannedByUserId: lastScan.scannedByUserId,
          }
        : null,
    };
  }

  /**
   * Cập nhật thông tin hoặc trạng thái sản phẩm
   */
  async updateProductInterest(interestId: string, orgId: string, data: UpdateInterestParams) {
    const existing = await prisma.customerProductInterest.findFirst({
      where: { id: interestId, orgId },
    });
    if (!existing) {
      throw new Error('Không tìm thấy bản ghi sản phẩm quan tâm.');
    }

    const updateData: any = {};
    if (data.productName !== undefined) updateData.productName = data.productName.trim();
    if (data.intent !== undefined) updateData.intent = data.intent.trim();
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;
    if (data.status !== undefined) updateData.status = data.status;

    return await prisma.customerProductInterest.update({
      where: { id: interestId },
      data: updateData,
    });
  }

  /**
   * Xóa sản phẩm quan tâm kèm ghi chú giải trình của Sale (Soft Delete)
   */
  async deleteProductInterest(interestId: string, orgId: string, salesDeleteNote: string) {
    if (!salesDeleteNote || !salesDeleteNote.trim()) {
      throw new Error('Vui lòng nhập lý do xóa để lưu lại lịch sử kiểm toán của Sales.');
    }

    const existing = await prisma.customerProductInterest.findFirst({
      where: { id: interestId, orgId },
    });
    if (!existing) {
      throw new Error('Không tìm thấy bản ghi sản phẩm quan tâm.');
    }

    return await prisma.customerProductInterest.update({
      where: { id: interestId },
      data: {
        isDeleted: true,
        status: 'deleted',
        salesDeleteNote: salesDeleteNote.trim(),
      },
    });
  }
}

export const productInterestService = new ProductInterestService();
