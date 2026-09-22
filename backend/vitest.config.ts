import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Phần lớn test nằm ở tests/. Riêng POS webhook có test đặt cạnh source nên
  // include thêm src/controllers. Các test co-located khác chưa xanh, chưa gom vào đây.
  include: ['tests/**/*.test.ts', 'src/controllers/**/*.test.ts'],
    // 2026-06-11 — DATABASE_URL giả để test UNIT (hàm thuần) import được prisma-client
    // mà không cần DB thật (prisma init lazy, không connect). Test cần DB thật override
    // qua env runtime. Đảm bảo privacy-redact-regression chạy ở mọi máy/CI.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
      POS_WEBHOOK_SECRET: process.env.POS_WEBHOOK_SECRET ?? 'test-pos-webhook-secret',
      POS_WEBHOOK_ORG_ID: process.env.POS_WEBHOOK_ORG_ID ?? 'org-test-123',
    },
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/shared/**/*.ts'],
    },
  },
});
