/**
 * check-pos-order.ts — Tra cứu 1 đơn hàng bên POS SANDBOX từ posOrderId (goal 4, 2026-07-18).
 *
 * Dùng để đối soát: draft bên CRM (PosBillingDraft.posOrderId) có thật sự tồn tại + đúng
 * dữ liệu bên POS không, sau khi bấm "Gửi POS". KHÔNG ghi gì — chỉ đọc (orders.get).
 *
 * Chỉ đọc sandbox (HISWEETIE_MCP_URL trong .env) — không có cách nào chạm production
 * qua script này (client dùng chung config, sandbox guard chỉ áp cho WRITE nên GET không
 * bị chặn thêm, nhưng URL vẫn luôn là URL cấu hình trong .env — không có override).
 *
 * Dùng:
 *   Theo posOrderId (nhanh nhất — lấy từ Prisma Studio hoặc chip "Đơn POS #..." trên UI):
 *     npx tsx scripts/check-pos-order.ts --order=100305
 *
 *   Theo draftId CRM (script tự đọc posOrderId từ PosBillingDraft rồi tra POS):
 *     npx tsx scripts/check-pos-order.ts --draft=c165c4f1-87a4-407a-a31f-c820aad4810a
 *
 * Chạy từ thư mục backend/.
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { getHisweetieClient, isHisweetieMcpConfigured } from '../src/modules/integrations/hisweetie-mcp-client.js';

function argValue(flag: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.slice(flag.length + 3) : null;
}

async function main() {
  const orderArg = argValue('order');
  const draftArg = argValue('draft');

  if (!orderArg && !draftArg) {
    console.error('Thiếu tham số. Dùng --order=<posOrderId> hoặc --draft=<draftId>.');
    process.exit(1);
  }
  if (!isHisweetieMcpConfigured()) {
    console.error('Hisweetie MCP chưa cấu hình (thiếu HISWEETIE_MCP_URL/CLIENT_ID/SECRET trong .env).');
    process.exit(1);
  }

  let posOrderId: number;

  if (draftArg) {
    const draft = await prisma.posBillingDraft.findUnique({
      where: { id: draftArg },
      select: {
        id: true, status: true, posOrderId: true, posCustomerId: true, posCustomerName: true,
        totalAmount: true, dispatchedAt: true, dispatchError: true,
      },
    });
    if (!draft) {
      console.error(`Không tìm thấy draft ${draftArg} trong CRM.`);
      process.exit(1);
    }
    console.log('── Draft bên CRM ──');
    console.log(JSON.stringify(draft, null, 2));
    if (draft.posOrderId == null) {
      console.log(`\nDraft này chưa có posOrderId (status=${draft.status}) — chưa gửi POS thành công, không có gì để tra.`);
      await prisma.$disconnect();
      return;
    }
    posOrderId = draft.posOrderId;
  } else {
    posOrderId = Number(orderArg);
    if (!Number.isInteger(posOrderId) || posOrderId <= 0) {
      console.error(`--order phải là số nguyên dương, nhận: "${orderArg}"`);
      process.exit(1);
    }
  }

  console.log(`\n── Tra POS sandbox: order #${posOrderId} ──`);
  const raw = await getHisweetieClient().orders.get(posOrderId);
  console.log(JSON.stringify(raw, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Lỗi:', err instanceof Error ? err.message : err);
  process.exit(1);
});
