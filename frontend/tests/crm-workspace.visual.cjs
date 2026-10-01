// Mocked UI acceptance test. No request reaches a real CRM or POS backend.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const origin = process.env.CRM_UI_URL || 'http://127.0.0.1:5175';
const output = process.env.CRM_QA_OUTPUT || '/tmp/crm-workspace-qa';
const profile = {
  contact: { id: 'customer-1', name: 'Hương · Chuỗi Trà Hoa', phone: '0901234567', avatarUrl: null },
  workspace: { segment: 'chain', potential: 'hot', potentialNotes: 'Đang mở thêm quán', careStatus: 'active', accountantUserId: '' },
  assignedUser: { id: 'sale', fullName: 'Lan' }, accountant: { id: 'accountant', fullName: 'Mai' },
  accounts: [
    { posId: 1, code: 'KH001', name: 'Trà Hoa · Quán Nguyễn Trãi', phone: '0901234567', address: '12 Nguyễn Trãi' },
    { posId: 2, code: 'KH002', name: 'Trà Hoa · Quán Bình Thạnh', phone: '0901234567', address: '36 Điện Biên Phủ' },
  ],
  debt: { amount: 12500000, state: 'available', updatedAt: '2026-09-21T04:00:00Z' },
  purchase: { state: 'purchased', validInvoiceCount: 7 },
  orders: [{ id: 'order-1', code: 'DH001', posCustomerId: 1, status: 'Phiếu tạm', orderStatus: 'Phiếu tạm', finalAmount: 3500000, orderDate: '2026-09-21T03:00:00Z' }],
  invoices: [{ id: 'invoice-1', invoiceCode: 'HD001', posCustomerId: 2, status: 'Hoàn thành', totalAmount: 12500000, invoiceDate: '2026-09-20T03:00:00Z' }],
  tasks: [{ id: 'task-1', title: 'Gửi báo giá cho quán mới', status: 'open', dueAt: '2026-09-22T03:00:00Z' }],
  appointments: [],
  interests: [{ id: 'interest-1', productName: 'Trà lài', notes: 'Khách hỏi cho quán mới', posCustomerId: null, status: 'inquiring' }],
  conversations: [{ id: 'group-1', groupName: 'Hương · Đặt hàng và công nợ', lastMessageAt: '2026-09-21T04:00:00Z', deletedAt: null, dissolvedAt: null }],
  meta: { draftWritesEnabled: false, invoicesMayBeTruncated: false },
};
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(() => localStorage.setItem('token', 'mock-ui-token'));
      await context.routeWebSocket('**/socket.io/**', socket => {
        socket.send('0{"sid":"fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
        socket.onMessage(message => {
          if (String(message).startsWith('40')) socket.send('40{"sid":"fixture"}');
          if (message === '2') socket.send('3');
        });
      });
      await context.route('**/socket.io/**', route => route.abort());
      const apiRequests = [];
      let failCustomer = false;
      await context.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()), p = url.pathname.replace('/api/v1', '');
        apiRequests.push({ path: p, method: route.request().method() });
        let body = {};
        if (p === '/profile') body = { id: 'owner', orgId: 'org', fullName: 'Quản lý', role: 'owner', passwordChangedAt: '2026-01-01', onboardingDismissedAt: '2026-01-01', permissionGroup: { workspaceId: 'sales' }, org: { name: 'HiSweetie', timezone: '+07:00' } };
        else if (p === '/setup/status') body = { needsSetup: false };
        else if (p === '/crm/customers/customer-1') {
          if (failCustomer) return route.fulfill({ status: 503, json: { error: 'Kết nối tạm thời gián đoạn' } });
          body = { ...profile, debt: url.searchParams.has('posCustomerId') ? { amount: null, state: 'unknown', updatedAt: null } : profile.debt };
        } else if (p === '/crm/customers') body = {
          items: [{ id: 'customer-1', fullName: profile.contact.name, phone: profile.contact.phone, workspace: profile.workspace, assignedUser: profile.assignedUser, _count: { posLinks: 2 } }], total: 1,
        };
        else if (p === '/crm/staff') body = { items: [{ id: 'accountant', fullName: 'Mai' }] };
        else if (p === '/crm/summary') body = { total: 1, retail: 0, chain: 1, wholesale: 0, hot: 1, overdue: 0 };
        else if (p.endsWith('/journey')) body = { items: [{ key: 'invoice:1', title: 'HD001 · Hoàn thành', source: 'POS', occurredAt: '2026-09-20T03:00:00Z', posCustomerId: 2 }], nextOffset: null, until: '2026-09-21T04:00:00Z' };
        else if (p.endsWith('/ledger/1')) body = { data: [{ code: 'HD001', type: 'invoice', amount: 3500000, runningDebt: 3500000 }], total: 1 };
        else if (p === '/pos/customers/search') body = { items: [{ id: 3, code: 'KH003', name: 'Quán mới', phone: '0901234567' }] };
        else if (p === '/user-preferences') body = { preferences: {} };
        else if (p.includes('notifications')) body = { notifications: [], items: [], unreadCount: 0 };
        else if (p.includes('zalo-accounts')) body = { accounts: [] };
        return route.fulfill({ json: body });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${origin}/customers/customer-1`);
      try { await page.getByRole('heading', { name: profile.contact.name }).waitFor({ timeout: 12000 }); }
      catch (error) {
        await page.screenshot({ path: path.join(output, `failure-${viewport.width}.png`), fullPage: true });
        console.error('URL', page.url(), 'ERRORS', errors, 'REQUESTS', apiRequests, 'BODY', await page.locator('body').innerText());
        throw error;
      }
      await page.getByRole('button', { name: 'Quán / POS', exact: true }).click();
      await page.getByPlaceholder('Tên quán, mã POS, điện thoại').fill('quán');
      await page.getByRole('button', { name: 'Tìm POS', exact: true }).click();
      await page.locator('.cw-pick').filter({ hasText: 'Quán mới' }).waitFor();
      await page.screenshot({ path: path.join(output, `accounts-${viewport.width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Mua hàng & nợ', exact: true }).click();
      await page.getByLabel('Phạm vi hồ sơ').selectOption('1');
      await page.getByText('Chưa xác định', { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Xem sổ công nợ quán đã chọn', exact: true }).click();
      await page.getByText('Dư nợ', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Hành trình', exact: true }).click();
      await page.getByText('HD001 · Hoàn thành', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `journey-${viewport.width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `page overflow at ${viewport.width}`);
      await page.getByLabel('Nội dung hồ sơ').getByRole('button', { name: 'Tổng quan', exact: true }).click();
      await page.screenshot({ path: path.join(output, `overview-${viewport.width}.png`), fullPage: true });
      assert.equal(await page.getByRole('button', { name: 'Tạo phiếu tạm', exact: true }).isDisabled(), true);
      failCustomer = true;
      await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
      await page.getByText('Kết nối tạm thời gián đoạn', { exact: false }).first().waitFor();
      await page.goto(`${origin}/customers`);
      await page.getByRole('link', { name: profile.contact.name }).waitFor();
      await page.screenshot({ path: path.join(output, `list-${viewport.width}.png`), fullPage: true });
      assert.deepEqual(errors, [], errors.join('\n'));
      assert.equal(apiRequests.some(r => r.path === '/pos/orders' && r.method === 'POST'), false);
      console.log(`PASS ${viewport.width}: profile, shops, ledger, journey, disabled writes, error, list; no page overflow.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
