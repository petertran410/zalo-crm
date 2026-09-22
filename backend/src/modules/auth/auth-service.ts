/**
 * Auth service — handles setup, login, and profile operations.
 * Uses bcryptjs for password hashing and Fastify JWT for token signing.
 *
 * Phase Onboarding v1 2026-05-24 — login(identifier) accept cả email vừa phone.
 * - Có '@' → tìm theo email (lowercase)
 * - Toàn chữ số → tìm theo phone (normalize 84xxx)
 * - Sale VN ít/không có email → admin tạo user chỉ với phone.
 */
import bcrypt from 'bcryptjs';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { getOwnerScope } from '../rbac/owner-scope.js';
import { seedDefaultPermissionGroups } from '../rbac/seed-default-groups.js';
import { RESOURCES } from '../rbac/permission-types.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  orgId: string;
  // Phase Onboarding v1 2026-05-24 — token version, bump khi đổi password → revoke JWT cũ
  tv: number;
}

/**
 * Phase 2 2026-06-08 — dựng JwtPayload từ userId, dùng cho /auth/refresh (sau khi
 * xoay refresh token thì cấp access token mới). Throw nếu user không tồn tại / bị khoá.
 */
export async function buildAccessPayload(userId: string): Promise<JwtPayload> {
  const user = await runSystemQuery(() =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, role: true, orgId: true, jwtTokenVersion: true, isActive: true },
    }),
  );
  if (!user || !user.isActive) {
    const err = new Error('Tài khoản không tồn tại hoặc đã bị khoá') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return {
    id: user.id,
    email: user.email ?? user.phone ?? user.id,
    role: user.role,
    orgId: user.orgId,
    tv: user.jwtTokenVersion,
  };
}

// Check if any users exist — true means first-run setup is needed
export async function checkSetupStatus(): Promise<{ needsSetup: boolean }> {
  // runSystemQuery: chạy trước khi có org nào → bypass tenant-guard (Phase 1a).
  const count = await runSystemQuery(() => prisma.user.count());
  return { needsSetup: count === 0 };
}

// Create the initial organization + owner user, return JWT payload
export async function setup(
  orgName: string,
  fullName: string,
  email: string,
  password: string,
  phone?: string,
): Promise<JwtPayload> {
  // runSystemQuery: setup tạo org đầu tiên → chưa có tenant context (Phase 1a).
  const existing = await runSystemQuery(() => prisma.user.count());
  if (existing > 0) {
    const err = new Error('Setup already completed') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // SĐT chủ tổ chức (owner): normalize 84xxx để đồng nhất + cho phép login bằng SĐT.
  const phoneNorm = normalizePhone(phone);

  const result = await runSystemQuery(() =>
    tenantTransaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: orgName } });

      // 2026-08-06 — SEED 7 nhóm quyền hệ thống NGAY trong transaction tạo org.
      // Trước đây org mới ra đời với 0 nhóm quyền: endpoint seed thủ công lại đòi
      // grant `permission_group.create`, mà grant đó nằm trong nhóm Admin chưa tồn
      // tại → chỉ lọt được nhờ fallback legacy role='owner'. Bỏ cột role như kế
      // hoạch là tạo org thành ngõ cụt. Seed ở đây cắt hẳn vòng lặp đó.
      await seedDefaultPermissionGroups(org.id, tx);
      const adminGroup = await tx.permissionGroup.findFirst({
        where: { orgId: org.id, name: 'Admin', isSystem: true },
        select: { id: true },
      });

      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email: email.toLowerCase().trim(),
          phone: phoneNorm,
          passwordHash,
          fullName,
          role: 'owner',
          // Gán luôn nhóm Admin để owner không phụ thuộc riêng vào fallback legacy.
          permissionGroupId: adminGroup?.id ?? null,
        },
      });
      return { org, user };
    }),
  );

  logger.info(`Setup complete — org=${result.org.id}, user=${result.user.id}`);

  return {
    id: result.user.id,
    // Setup là owner đầu tiên → luôn có email
    email: result.user.email ?? result.user.id,
    role: result.user.role,
    orgId: result.org.id,
    tv: result.user.jwtTokenVersion,
  };
}

// Verify credentials, return JWT payload.
// identifier accept cả email vừa phone — auto-detect:
//   - Có '@' → email lookup (lowercase)
//   - Toàn chữ số / + → phone lookup (normalize 84xxx)
//   - Đảm bảo phone match ≥ 9 chữ số để tránh nhầm số nhà
export async function login(identifier: string, password: string): Promise<JwtPayload> {
  const trimmed = (identifier || '').trim();
  if (!trimmed) {
    const err = new Error('Email hoặc SĐT không được để trống') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  // runSystemQuery: login tìm user theo email/phone KHI CHƯA biết org →
  // bypass tenant-guard hợp lệ (Phase 1a).
  const user: Awaited<ReturnType<typeof prisma.user.findUnique>> = await runSystemQuery(
    async () => {
      if (trimmed.includes('@')) {
        return prisma.user.findUnique({ where: { email: trimmed.toLowerCase() } });
      }
      // Thử parse phone
      const normalized = normalizePhone(trimmed);
      let u = normalized
        ? await prisma.user.findUnique({ where: { phone: normalized } })
        : null;
      // Fallback: chuỗi nguyên gốc dạng email không '@' (vd 'admin') — tìm theo email
      if (!u) {
        u = await prisma.user.findUnique({ where: { email: trimmed.toLowerCase() } });
      }
      return u;
    },
  );

  if (!user || !user.isActive) {
    const err = new Error('Email/SĐT hoặc mật khẩu không đúng') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Email/SĐT hoặc mật khẩu không đúng') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  // Phase status 4-state 2026-05-27 — set lastLoginAt async (fire-and-forget) cho status compute.
  // KHÔNG block login response — nếu update fail thì im lặng (status compute sẽ thấy null vẫn OK).
  runSystemQuery(() =>
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ).catch(() => {});

  return {
    id: user.id,
    // Email có thể null cho sale chỉ có phone → fallback phone vào claim email cho legacy code đọc
    email: user.email ?? user.phone ?? user.id,
    role: user.role,
    orgId: user.orgId,
    tv: user.jwtTokenVersion,
  };
}

// Return safe user profile (no password hash). Phase Onboarding v1 — expose
      // Giữ metadata tương thích cho client và báo cáo trạng thái tài khoản.
// + checklist hay không.
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      role: true,
      orgId: true,
      teamId: true,
      // Module Cá nhân 2026-06-13 — avatar ảnh thật của user (cột có sẵn schema:241,
      // trước đây getProfile quên select → FE luôn fallback chữ cái). Trả để top nav +
      // trang Tài khoản hiện ảnh.
      avatarUrl: true,
      isActive: true,
      createdAt: true,
      passwordChangedAt: true,
      onboardingDismissedAt: true,
      onboardingStepsCompleted: true,
      customGrants: true,
      org: { select: { id: true, name: true, timezone: true } },
      // RBAC enforce 2026-06-08 — trả grants để frontend biết user hiện tại được vào màn nào.
      // Workspace 2026-07-22 — kèm workspaceId để resolver không phải đoán từ tên nhóm.
      permissionGroup: { select: { id: true, name: true, grants: true, archivedAt: true, workspaceId: true } },
      // Dashboard v4 2026-06-11 — vai trò phòng ban để FE quyết hiện mấy tab dashboard
      // (sale 1 tab / trưởng phòng 2 / admin 3).
      departmentMember: { select: { deptRole: true, departmentId: true } },
    },
  });

  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // Flatten grants cho frontend đọc trực tiếp qua canAccess(resource, action).
  // Nhóm đã archive → coi như không có quyền (khớp logic userHasGrant).
  const pg = user.permissionGroup && !user.permissionGroup.archivedAt ? user.permissionGroup : null;
  const roleGrants = (pg?.grants ?? {}) as Record<string, Record<string, boolean>>;
  const customGrants = (user.customGrants ?? {}) as Record<string, Record<string, boolean>>;

  // Merge custom overrides vào quyền nhóm. 2026-08-06 — trong `mergedGrants`
  // trả về FE, mỗi ô có đúng 3 nghĩa (khớp userHasGrant):
  //   true      = được phép
  //   false     = BỊ TỪ CHỐI tường minh (chỉ customGrants tạo ra được)
  //   thiếu key = kế thừa → admin legacy vẫn qua
  //
  // Vì vậy KHÔNG clone thẳng roleGrants: matrix editor ghi cả `false` xuống grants
  // của nhóm khi admin bỏ tick (PermissionGroupEditPanel.toggleGrant), mà `false`
  // của NHÓM chỉ nghĩa là "nhóm không cấp" — backend cho admin đi tiếp ở fallback.
  // Bê nguyên xuống thì FE đọc thành deny và khoá nhầm admin. Lọc lấy true trước.
  const mergedGrants: Record<string, Record<string, boolean>> = {};
  for (const resource of Object.keys(roleGrants)) {
    for (const action of Object.keys(roleGrants[resource] ?? {})) {
      if (roleGrants[resource][action] === true) {
        (mergedGrants[resource] ??= {})[action] = true;
      }
    }
  }
  for (const resource of Object.keys(customGrants)) {
    for (const action of Object.keys(customGrants[resource] ?? {})) {
      const v = customGrants[resource][action];
      if (typeof v === 'boolean') {
        (mergedGrants[resource] ??= {})[action] = v;
      }
    }
  }

  // owner + admin = toàn quyền (anh chốt 2026-06-08) — khớp fallback trong userHasGrant.
  // owner KHÔNG deny được; admin thì có (deny đứng trước fallback admin) → chỉ owner
  // mới thực sự "full access" vô điều kiện.
  const isFullAccess = user.role === 'owner' || user.role === 'admin';

  // Dashboard v4 — deptRole + canViewAll cho role-tab. canViewAll gồm cả grant
  // view_all (vd Marketing/CEO không phải leader nhưng được xem team). getOwnerScope:
  // admin/owner short-circuit 0 query; member thường +1 query; leader/deputy +2 query.
  // /profile gọi 1 lần/load app → chấp nhận được.
  const deptRole = user.departmentMember?.deptRole ?? null;
  const departmentId = user.departmentMember?.departmentId ?? null;
  const ownerScope = await getOwnerScope({ userId: user.id, orgId: user.orgId, legacyRole: user.role });

  // 2026-08-06 — `canViewAll` ở trên là MỘT cờ toàn cục, mà view_all vốn là quyền
  // THEO TỪNG resource → không thể đúng. getOwnerScope gọi ở đây không truyền
  // `resource` nên nhánh check grant bị bỏ qua hoàn toàn (owner-scope.ts: `if (resource)`),
  // trong khi các endpoint list ĐỀU truyền → hai bên trả lời khác nhau cho cùng
  // một người. Ví dụ: Marketing có broadcast.view_all → /profile nói false, còn
  // GET /blocks nói true và trả về toàn org ⇒ UI đếm một đằng, list một nẻo.
  //
  // Sửa: trả thêm map theo resource, tính thẳng từ mergedGrants (0 query thêm).
  // GIỮ NGUYÊN `canViewAll` cũ để không đổi hành vi isManager của FE — cờ đó giờ
  // chỉ nên hiểu là "xem được toàn org", còn hỏi theo màn thì đọc map này.
  const viewAllByResource: Record<string, boolean> = {};
  for (const r of RESOURCES) {
    viewAllByResource[r] =
      user.role === 'owner' || user.role === 'admin' || mergedGrants[r]?.view_all === true;
  }

  // Bỏ departmentMember thô khỏi payload (đã rút ra deptRole/departmentId).
  const { departmentMember: _dm, ...rest } = user;

  return {
    ...rest,
    permissionGroup: pg ? { id: pg.id, name: pg.name, grants: roleGrants, workspaceId: pg.workspaceId ?? null } : null,
    grants: mergedGrants,
    isFullAccess,
    deptRole,
    departmentId,
    canViewAll: ownerScope.canViewAll,
    viewAllByResource,
  };
}
