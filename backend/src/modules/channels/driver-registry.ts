/**
 * driver-registry.ts — resolve ChannelDriver theo kênh (multi-channel V1, 2026-07-10).
 *
 * Zalo CỐ TÌNH không đăng ký: giữ nguyên đường gửi/nhận trực tiếp đã ổn định trong
 * chat-routes/zalo-pool (không rip logic phức tạp ra driver ở giai đoạn này). Registry
 * chỉ phục vụ kênh MỚI. tiktok_shop sẽ thêm ở phase sau.
 */
import type { ChannelDriver, ChannelKind } from './channel-driver.js';
import { facebookDriver } from './facebook/facebook-driver.js';

const drivers: Partial<Record<ChannelKind, ChannelDriver>> = {
  facebook: facebookDriver,
};

/** Có driver cho kênh này không (Zalo → false, đi đường trực tiếp). */
export function hasChannelDriver(channel: string): boolean {
  return channel in drivers;
}

/** Lấy driver; ném lỗi nếu kênh chưa có driver (gọi sai chỗ). */
export function getChannelDriver(channel: ChannelKind): ChannelDriver {
  const driver = drivers[channel];
  if (!driver) throw new Error(`Chưa có driver cho kênh '${channel}'`);
  return driver;
}
