/**
 * use-grants-diff.ts — Diff giữa 2 grants object (before vs after).
 * Trả về danh sách resource name added/removed + tổng số action true.
 */
import { computed, type Ref } from 'vue';
import { resourceLabel } from '@/constants/permission-meta';

export interface DiffSummary {
  added: string[];
  removed: string[];
  totalBefore: number;
  totalAfter: number;
}

export function useGrantsDiff(
  beforeRef: Ref<string>,
  afterRef: Ref<Record<string, Record<string, boolean>>>
) {
  return computed<DiffSummary>(() => {
    const before: Record<string, Record<string, boolean>> =
      JSON.parse(beforeRef.value || '{}');
    const after = afterRef.value;

    const countTrue = (o: Record<string, Record<string, boolean>>) =>
      Object.values(o).reduce(
        (sum, row) => sum + Object.values(row).filter(Boolean).length,
        0
      );

    const beforeKeys = new Set(Object.keys(before));
    const afterKeys = new Set(Object.keys(after));
    const added: string[] = [];
    const removed: string[] = [];

    for (const k of afterKeys) {
      if (!beforeKeys.has(k)) {
        added.push(resourceLabel(k));
      } else {
        const bCount = Object.values(before[k] ?? {}).filter(Boolean).length;
        const aCount = Object.values(after[k] ?? {}).filter(Boolean).length;
        if (aCount > bCount) added.push(resourceLabel(k));
        else if (aCount < bCount) removed.push(resourceLabel(k));
      }
    }
    for (const k of beforeKeys) {
      if (!afterKeys.has(k)) removed.push(resourceLabel(k));
    }

    return {
      added,
      removed,
      totalBefore: countTrue(before),
      totalAfter: countTrue(after),
    };
  });
}
