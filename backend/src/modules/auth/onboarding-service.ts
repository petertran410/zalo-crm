/**
 * onboarding-service.ts — Phase Onboarding v1 2026-05-24.
 *
 * Track bước PIN bảo mật tuỳ chọn cho sale mới.
 *
 * Spec đầy đủ: docs/DESIGN-ONBOARDING-V1.md
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export type OnboardingStep = 'pin';

interface StepStatus {
  step: OnboardingStep;
  completed: boolean;
  completedAt: string | null;
  skipped: boolean;
  detail?: string;
}

interface OnboardingState {
  steps: StepStatus[];
  completedCount: number;
  totalCount: number;
  percent: number;
  dismissed: boolean;
  dismissedAt: string | null;
  canDismiss: boolean;
}

const PASSWORD_STRENGTH_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export class OnboardingError extends Error {
  constructor(public statusCode: number, public errorCode: string, message: string) {
    super(message);
  }
}

/**
 * Detect step completion từ DB state. Single query optimized.
 */
export async function getOnboardingState(userId: string, _orgId: string): Promise<OnboardingState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordChangedAt: true,
      onboardingStepsCompleted: true,
      onboardingDismissedAt: true,
      privacyPinHash: true,
    },
  });
  if (!user) {
    throw new OnboardingError(404, 'user_not_found', 'User không tồn tại');
  }

  const stepsJson = (user.onboardingStepsCompleted as Record<string, string> | null) ?? {};

  // Mật khẩu do tổ chức cấp → không còn bước "đổi mật khẩu" trong onboarding.
  // Step duy nhất: pin — đã đặt PIN hoặc sale chủ động skip
  const pinSkipped = stepsJson.pin === 'skipped';
  const pinDone = user.privacyPinHash !== null || pinSkipped;

  const steps: StepStatus[] = [
    {
      step: 'pin',
      completed: pinDone,
      completedAt: pinSkipped ? null : (user.privacyPinHash ? (stepsJson.pin ?? null) : null),
      skipped: pinSkipped,
      detail: pinSkipped
        ? 'Bạn đã bỏ qua bước này'
        : (user.privacyPinHash ? 'Đã đặt PIN bảo mật' : 'Tuỳ chọn — bảo mật nick cá nhân'),
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const percent = Math.round((completedCount / steps.length) * 100);

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    percent,
    dismissed: user.onboardingDismissedAt !== null,
    dismissedAt: user.onboardingDismissedAt?.toISOString() ?? null,
    // Bước PIN là tuỳ chọn → luôn cho phép ẩn checklist.
    canDismiss: true,
  };
}

/**
 * Force change password (lần đầu hoặc admin reset).
 * - Validate strength: 8+ ký tự, có chữ hoa + thường + số
 * - Reject nếu newPassword === currentPassword
 * - Bump jwtTokenVersion → revoke JWT cũ → force relogin
 */
export async function changePassword(args: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) {
  if (!PASSWORD_STRENGTH_REGEX.test(args.newPassword)) {
    throw new OnboardingError(400, 'weak_password', 'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số');
  }
  if (args.currentPassword === args.newPassword) {
    throw new OnboardingError(400, 'same_password', 'Mật khẩu mới phải khác mật khẩu cũ');
  }

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { id: true, passwordHash: true, jwtTokenVersion: true, onboardingStepsCompleted: true },
  });
  if (!user) {
    throw new OnboardingError(404, 'user_not_found', 'User không tồn tại');
  }

  const valid = await bcrypt.compare(args.currentPassword, user.passwordHash);
  if (!valid) {
    throw new OnboardingError(401, 'wrong_current_password', 'Mật khẩu hiện tại không đúng');
  }

  const newHash = await bcrypt.hash(args.newPassword, 12);
  const now = new Date();

  // Update steps JSON với change_password = now
  const stepsJson = (user.onboardingStepsCompleted as Record<string, string> | null) ?? {};
  stepsJson.change_password = now.toISOString();

  await prisma.user.update({
    where: { id: args.userId },
    data: {
      passwordHash: newHash,
      passwordChangedAt: now,
      jwtTokenVersion: { increment: 1 },
      onboardingStepsCompleted: stepsJson as object,
    },
  });

  logger.info(`[onboarding] user=${args.userId} changed password, jwt revoked`);
  return { ok: true, requireRelogin: true };
}

/**
 * Sale chủ động skip 1 step (chỉ PIN được skip).
 */
export async function skipStep(args: { userId: string; step: OnboardingStep }) {
  if (args.step !== 'pin') {
    throw new OnboardingError(400, 'cannot_skip', `Bước "${args.step}" không cho phép bỏ qua`);
  }
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { onboardingStepsCompleted: true },
  });
  if (!user) throw new OnboardingError(404, 'user_not_found', 'User không tồn tại');

  const stepsJson = (user.onboardingStepsCompleted as Record<string, string> | null) ?? {};
  stepsJson[args.step] = 'skipped';

  await prisma.user.update({
    where: { id: args.userId },
    data: { onboardingStepsCompleted: stepsJson as object },
  });
  return { ok: true };
}

/**
 * Sale ẩn checklist (collapse thành mini indicator).
 */
export async function dismissOnboarding(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingDismissedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Re-expand checklist (sale bấm mini indicator).
 */
export async function reopenOnboarding(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingDismissedAt: null },
  });
  return { ok: true };
}

export interface OnboardingSummary {
  userId: string;
  completedCount: number;
  totalCount: number;
  percent: number;
  pendingSteps: OnboardingStep[];   // các step CHƯA done (loại pin nếu skipped)
  pin: boolean;                     // true nếu đặt PIN hoặc đã skip
  pinSkipped: boolean;
  dismissed: boolean;
}

/**
 * Bulk summary cho RBAC users list.
 * Dùng cho admin xem cột "Onboarding %" của toàn org.
 */
export async function getOnboardingSummariesForOrg(orgId: string): Promise<Record<string, OnboardingSummary>> {
  const users = await prisma.user.findMany({
    where: { orgId },
    select: {
      id: true,
      onboardingStepsCompleted: true,
      onboardingDismissedAt: true,
      privacyPinHash: true,
    },
  });
  if (users.length === 0) return {};

  const result: Record<string, OnboardingSummary> = {};
  for (const u of users) {
    const stepsJson = (u.onboardingStepsCompleted as Record<string, string> | null) ?? {};
    const pinSkipped = stepsJson.pin === 'skipped';
    const pin = u.privacyPinHash !== null || pinSkipped;

    const completedCount = pin ? 1 : 0;
    const totalCount = 1;

    const pendingSteps: OnboardingStep[] = [];
    if (!pin) pendingSteps.push('pin');

    result[u.id] = {
      userId: u.id,
      completedCount,
      totalCount,
      percent: Math.round((completedCount / totalCount) * 100),
      pendingSteps,
      pin,
      pinSkipped,
      dismissed: u.onboardingDismissedAt !== null,
    };
  }
  return result;
}
