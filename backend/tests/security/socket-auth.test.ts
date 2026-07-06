/**
 * socket-auth.test.ts — Phase 1b Socket.IO auth (Bảo mật xác thực 2026-06-07)
 *
 * Verify io.use() middleware: reject khi thiếu/sai/hết hạn token; set authCtx
 * + auto-join org room TỪ TOKEN (không nhận orgId client) — vá P0 IDOR WS.
 *
 * Dùng fake io/app để test thuần logic, không cần socket thật / prisma.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerSocketAuth, getSocketAuth } from '../../src/shared/realtime/socket-auth.js';
import { config } from '../../src/config/index.js';

type MwFn = (socket: any, next: (err?: Error) => void) => void;
type ConnFn = (socket: any) => void;

function makeIo() {
  let mw: MwFn | undefined;
  let conn: ConnFn | undefined;
  const io = {
    use: (fn: MwFn) => { mw = fn; },
    on: (ev: string, fn: ConnFn) => { if (ev === 'connection') conn = fn; },
  } as any;
  return { io, getMw: () => mw!, getConn: () => conn! };
}

function makeApp(verifyImpl: (t: string) => any) {
  return { jwt: { verify: verifyImpl } } as any;
}

function makeSocket(token?: string) {
  return {
    id: 's1',
    handshake: { auth: token ? { token } : {}, headers: {} },
    data: {} as Record<string, any>,
    join: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
  };
}

describe('socket-auth io.use()', () => {
  it('reject khi KHÔNG có token', () => {
    const { io, getMw } = makeIo();
    registerSocketAuth(io, makeApp(() => ({})));
    const next = vi.fn();
    getMw()(makeSocket(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('reject khi token SAI (verify throw)', () => {
    const { io, getMw } = makeIo();
    registerSocketAuth(io, makeApp(() => { throw new Error('bad'); }));
    const next = vi.fn();
    getMw()(makeSocket('garbage'), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('token hợp lệ → set authCtx từ token, next() không lỗi', () => {
    const { io, getMw } = makeIo();
    registerSocketAuth(
      io,
      makeApp(() => ({ id: 'u1', orgId: 'org-A', role: 'sale' })),
    );
    const socket = makeSocket('valid');
    const next = vi.fn();
    getMw()(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(getSocketAuth(socket)).toEqual({ userId: 'u1', orgId: 'org-A', role: 'sale' });
  });

  it('reject khi token đã hết hạn (exp quá khứ)', () => {
    const { io, getMw } = makeIo();
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    registerSocketAuth(
      io,
      makeApp(() => ({ id: 'u1', orgId: 'org-A', role: 'sale', exp: pastExp })),
    );
    const next = vi.fn();
    getMw()(makeSocket('valid'), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('connection → join org room LẤY TỪ TOKEN (không nhận orgId client)', () => {
    const { io, getMw, getConn } = makeIo();
    registerSocketAuth(
      io,
      makeApp(() => ({ id: 'u1', orgId: 'org-A', role: 'sale' })),
    );
    const socket = makeSocket('valid');
    getMw()(socket, vi.fn());
    getConn()(socket);
    expect(socket.join).toHaveBeenCalledWith('org:org-A');
    // KHÔNG bao giờ join theo giá trị client gửi (vd org-EVIL).
    expect(socket.join).not.toHaveBeenCalledWith('org:org-EVIL');
  });
});

describe('socket-auth C2 — gate legacy token', () => {
  afterEach(() => {
    config.socketRequireAccessTyp = false;
  });

  it('gate OFF (mặc định): legacy token (không typ) -> CHẤP NHẬN', () => {
    config.socketRequireAccessTyp = false;
    const { io, getMw } = makeIo();
    registerSocketAuth(io, makeApp(() => ({ id: 'u1', orgId: 'org-A', role: 'sale' })));
    const next = vi.fn();
    getMw()(makeSocket('legacy'), next);
    expect(next).toHaveBeenCalledWith(); // không lỗi
  });

  it('gate ON: legacy token (không typ) -> TỪ CHỐI', () => {
    config.socketRequireAccessTyp = true;
    const { io, getMw } = makeIo();
    registerSocketAuth(io, makeApp(() => ({ id: 'u1', orgId: 'org-A', role: 'sale' })));
    const next = vi.fn();
    getMw()(makeSocket('legacy'), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('gate ON: access token (typ:access) -> CHẤP NHẬN', () => {
    config.socketRequireAccessTyp = true;
    const { io, getMw } = makeIo();
    registerSocketAuth(io, makeApp(() => ({ id: 'u1', orgId: 'org-A', role: 'sale', typ: 'access' })));
    const next = vi.fn();
    getMw()(makeSocket('valid'), next);
    expect(next).toHaveBeenCalledWith();
  });
});
