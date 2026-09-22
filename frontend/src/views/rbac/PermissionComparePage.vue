<template>
  <div class="pgc-page">
    <header class="page-hero">
      <!-- Bỏ hero-sub 2026-08-06: tiêu đề đã nói rõ, số liệu đã có ở thanh lọc
           ("Hiện X / Y chức năng") + số nhóm đếm được ngay trên đầu bảng. -->
      <div class="hero-left">
        <h1 class="hero-title">So sánh nhóm quyền</h1>
      </div>
      <div class="hero-actions">
        <button class="btn-ghost" :disabled="flatGroups.length === 0" @click="exportCsv">
          ⭳ Xuất CSV
        </button>
        <RouterLink class="btn-primary" to="/settings/rbac/permission-groups">
          Sửa quyền →
        </RouterLink>
      </div>
    </header>

    <div v-if="store.loading && flatGroups.length === 0" class="loading-state">
      <div class="skel-card" v-for="i in 3" :key="i" style="height: 60px"></div>
    </div>

    <div v-else-if="flatGroups.length === 0" class="empty-state">
      <div class="empty-icon">🛡</div>
      <h3>Chưa có nhóm quyền nào để so sánh</h3>
      <p>Seed 7 nhóm mặc định ở màn Phân quyền trước, rồi quay lại đây.</p>
      <RouterLink class="btn-primary" to="/settings/rbac/permission-groups">Tới màn Phân quyền</RouterLink>
    </div>

    <template v-else>
      <!-- ── Bộ lọc ── -->
      <section class="pgc-toolbar">
        <div class="search-box at-search">
          <span class="search-icon">🔍</span>
          <input v-model="searchQ" placeholder="Tìm chức năng..." />
        </div>

        <label class="pgc-toggle" :class="{ on: diffOnly }">
          <input type="checkbox" v-model="diffOnly" />
          <span>Chỉ hiện dòng khác biệt</span>
          <span class="pgc-toggle-count">{{ diffRowCount }}</span>
        </label>

        <label class="pgc-toggle" :class="{ on: viewAllOnly }">
          <input type="checkbox" v-model="viewAllOnly" />
          <span>Chỉ hiện dòng có “Xem tất cả”</span>
          <span class="pgc-toggle-count">{{ viewAllRowCount }}</span>
        </label>

        <div class="pgc-modeswitch">
          <button type="button" class="pgc-modebtn" :class="{ on: !detailMode }" @click="detailMode = false">
            Rút gọn
          </button>
          <button type="button" class="pgc-modebtn" :class="{ on: detailMode }" @click="detailMode = true">
            Chi tiết
          </button>
        </div>

        <label v-if="deprecatedCount > 0" class="pgc-toggle" :class="{ on: showDeprecated }">
          <input type="checkbox" v-model="showDeprecated" />
          <span>Hiện cả nhóm ngừng dùng</span>
          <span class="pgc-toggle-count">{{ deprecatedCount }}</span>
        </label>

        <span class="pgc-shown">
          Hiện {{ visibleResources.length }} / {{ resources.length }} chức năng
        </span>
      </section>

      <!-- ── Bảng so sánh ── -->
      <div class="pgc-table-wrap">
        <table class="pgc-table">
          <thead>
            <tr>
              <th class="th-resource">Chức năng</th>
              <th v-for="g in flatGroups" :key="g.id" class="th-group" :class="{ 'is-deprecated': isDeprecatedGroup(g.name) }">
                <div class="th-group-name">{{ g.name }}</div>
                <div class="th-group-meta">
                  <span v-if="isDeprecatedGroup(g.name)" class="tag-deprecated">ngừng dùng</span>
                  <span v-else-if="g.isSystem" class="tag-system">hệ thống</span>
                  <span class="th-group-stat">{{ grantCount(g) }} quyền</span>
                  <span class="th-group-stat">{{ g.memberCount }} người</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="visibleResources.length === 0">
              <td :colspan="flatGroups.length + 1" class="pgc-empty-row">
                Không có chức năng nào khớp bộ lọc.
              </td>
            </tr>
            <tr
              v-for="r in visibleResources"
              :key="r"
              :class="{ 'row-diff': isRowDifferent(r) }"
            >
              <th class="td-resource">
                <span class="td-resource-icon">{{ resourceIcon(r) }}</span>
                <div class="td-resource-text">
                  <div class="td-resource-label">{{ resourceLabel(r) }}</div>
                  <code class="td-resource-key">{{ r }}</code>
                </div>
                <span v-if="isRowDifferent(r)" class="diff-dot" title="Các nhóm khác nhau ở dòng này">●</span>
              </th>
              <td
                v-for="g in flatGroups"
                :key="g.id"
                class="td-cell"
                :class="{ 'is-open': isDetailOpen(g, r), 'is-tappable': actionsOf(r).length > 0 }"
                :title="cellTooltip(g, r)"
                :role="actionsOf(r).length ? 'button' : undefined"
                :tabindex="actionsOf(r).length ? 0 : undefined"
                @click="openDetail(g, r, $event)"
                @keydown.enter.prevent="openDetail(g, r, $event)"
                @keydown.space.prevent="openDetail(g, r, $event)"
              >
                <div v-if="actionsOf(r).length === 0" class="cell-none">—</div>

                <!-- Rút gọn: 1 nhãn tiếng Việt, đọc phát hiểu -->
                <template v-else-if="!detailMode">
                  <span class="lvl" :class="`lvl-${summaryOf(g, r).level}`">
                    {{ summaryOf(g, r).label }}
                  </span>
                  <span v-if="summaryOf(g, r).viewAll" class="lvl-all" title="Xem được dữ liệu của người khác">
                    🌐 Xem tất cả
                  </span>
                </template>

                <!-- Chi tiết: icon từng hành động (không dùng chữ cái — xem ACTION_ICON) -->
                <div v-else class="cell-badges">
                  <span
                    v-for="a in actionsOf(r)"
                    :key="a"
                    class="badge"
                    :class="{
                      on: isGranted(g, r, a),
                      'badge-viewall': a === 'view_all' && isGranted(g, r, a),
                    }"
                    :title="`${actionLabel(a)} — ${isGranted(g, r, a) ? 'CÓ' : 'không'}`"
                  >{{ actionIcon(a) }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Chú giải ── -->
      <section class="pgc-legend">
        <div v-if="!detailMode" class="legend-group">
          <span class="legend-title">Mức quyền:</span>
          <span class="legend-item"><span class="lvl lvl-full">Toàn quyền</span> xem, thêm, sửa, xoá</span>
          <span class="legend-item"><span class="lvl lvl-edit">Thêm · Sửa</span> làm được việc ghi tương ứng</span>
          <span class="legend-item"><span class="lvl lvl-view">Chỉ xem</span> vào xem, không sửa</span>
          <span class="legend-item"><span class="lvl lvl-none">Không có</span> không vào được</span>
          <span class="legend-item"><span class="lvl-all">🌐 Xem tất cả</span> xem cả dữ liệu người khác</span>
        </div>
        <div v-else class="legend-group">
          <span class="legend-title">Hành động:</span>
          <span v-for="a in actions" :key="a" class="legend-item">
            <span class="badge on" :class="{ 'badge-viewall': a === 'view_all' }">{{ actionIcon(a) }}</span>
            {{ actionLabel(a) }}
          </span>
          <span class="legend-item"><span class="badge">👁</span> chưa cấp</span>
        </div>
        <div class="legend-group">
          <span class="legend-item"><span class="diff-dot">●</span> các nhóm khác nhau ở dòng này</span>
          <span class="legend-item">— chức năng không có hành động đó</span>
          <span class="legend-item">Bấm vào ô để xem chi tiết quyền.</span>
        </div>
      </section>

      <!-- Bảng chi tiết 1 ô — mở bằng BẤM (chạy được cả trên máy tính lẫn điện thoại).
           position: fixed nên không bị khung cuộn của bảng cắt mất. -->
      <div v-if="detail" class="pgc-pop" :style="popStyle" @click.stop>
        <div class="pgc-pop-head">
          <div class="pgc-pop-title">
            <div class="pgc-pop-group">{{ detail.group.name }}</div>
            <div class="pgc-pop-res">
              {{ resourceIcon(detail.resource) }} {{ resourceLabel(detail.resource) }}
            </div>
          </div>
          <button type="button" class="pgc-pop-close" aria-label="Đóng" @click="detail = null">×</button>
        </div>

        <ul class="pgc-pop-list">
          <li
            v-for="a in actionsOf(detail.resource)"
            :key="a"
            :class="{ on: isGranted(detail.group, detail.resource, a) }"
          >
            <span class="pgc-pop-mark">{{ isGranted(detail.group, detail.resource, a) ? '✓' : '✗' }}</span>
            <span class="pgc-pop-icon">{{ actionIcon(a) }}</span>
            <span class="pgc-pop-label">{{ actionLabel(a) }}</span>
          </li>
        </ul>

        <p v-if="isGranted(detail.group, detail.resource, 'view_all')" class="pgc-pop-note">
          🌐 Xem được dữ liệu của người khác, không chỉ của mình.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * PermissionComparePage — so sánh grants của TẤT CẢ nhóm quyền cạnh nhau.
 *
 * Vì sao có màn này: PermissionGroupEditPanel chỉ render ma trận của MỘT nhóm
 * (resource × action). Muốn trả lời "Marketing xoá được broadcast mà Sale Senior
 * thì không?" admin phải mở từng nhóm rồi tự nhớ. Màn này xoay trục: resource ×
 * NHÓM, đọc một phát thấy hết.
 *
 * Read-only. Sửa quyền vẫn ở /settings/rbac/permission-groups.
 * KHÔNG cần endpoint mới: GET /permission-groups đã trả grants cho mọi node.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRbacStore, type PermissionGroupNode } from '@/stores/rbac';
import {
  resourceLabel, resourceIcon, actionLabel, isDeprecatedGroup,
  actionIcon, summarizeGrants, type GrantSummary,
} from '@/constants/permission-meta';

const store = useRbacStore();

const searchQ = ref('');
const diffOnly = ref(false);
const viewAllOnly = ref(false);
/** Nhóm ngừng dùng — ẩn mặc định để bảng chỉ còn 4 vai trò đang dùng. */
const showDeprecated = ref(false);
/** false = nhãn tiếng Việt rút gọn (mặc định); true = icon từng hành động. */
const detailMode = ref(false);

onMounted(() => {
  // Store dùng chung với màn Phân quyền — chỉ load nếu chưa có.
  if (!store.matrixMeta || store.permissionGroups.length === 0) {
    store.loadPermissionGroups();
  }
});
// (listener đóng bảng chi tiết đăng ký ở khối "Bảng chi tiết 1 ô" bên dưới)

const resources = computed<string[]>(() => store.matrixMeta?.resources ?? []);
const actions = computed<string[]>(() => store.matrixMeta?.actions ?? []);
const resourceActions = computed<Record<string, string[]>>(() => store.matrixMeta?.resourceActions ?? {});

/**
 * Cây nhóm quyền → danh sách phẳng, giữ nguyên thứ tự cây (cha trước con).
 * 2026-08-06: nhóm ngừng dùng ẩn mặc định; bật lại thì dồn xuống cuối bảng để
 * 4 vai trò đang dùng luôn nằm bên trái.
 */
const allFlatGroups = computed<PermissionGroupNode[]>(() => {
  const out: PermissionGroupNode[] = [];
  const walk = (nodes: PermissionGroupNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(store.permissionGroups);
  return out;
});

const deprecatedCount = computed(
  () => allFlatGroups.value.filter((g) => isDeprecatedGroup(g.name)).length,
);

const flatGroups = computed<PermissionGroupNode[]>(() => {
  const live = allFlatGroups.value.filter((g) => !isDeprecatedGroup(g.name));
  if (!showDeprecated.value) return live;
  return [...live, ...allFlatGroups.value.filter((g) => isDeprecatedGroup(g.name))];
});

/** Hành động hợp lệ của 1 resource (vd engagement_score chỉ có access + view_all). */
function actionsOf(resource: string): string[] {
  return resourceActions.value[resource] ?? [];
}

function isGranted(group: PermissionGroupNode, resource: string, action: string): boolean {
  return group.grants?.[resource]?.[action] === true;
}

/** Danh sách hành động ĐÃ CẤP của 1 nhóm trên 1 resource. */
function grantedOf(group: PermissionGroupNode, resource: string): string[] {
  return actionsOf(resource).filter((a) => isGranted(group, resource, a));
}

/** Nhãn tiếng Việt rút gọn cho ô (chế độ mặc định). */
function summaryOf(group: PermissionGroupNode, resource: string): GrantSummary {
  return summarizeGrants(grantedOf(group, resource), actionsOf(resource));
}

// ── Bảng chi tiết 1 ô ────────────────────────────────────────────────────────
// Trước đây chi tiết CHỈ nằm ở thuộc tính `title` = chỉ hiện khi rê chuột, nên
// trên điện thoại/tablet chạm vào ô không ra gì (mà trang này có breakpoint mobile).
// Giờ BẤM để mở bảng chi tiết; `title` vẫn giữ cho ai dùng chuột quen rê.
const detail = ref<{
  group: PermissionGroupNode;
  resource: string;
  left: number;
  top: number;
  bottom: number;
  /** Hệ số zoom luỹ kế của các thẻ cha (xem effectiveZoom). */
  zoom: number;
} | null>(null);

/**
 * Zoom luỹ kế từ el lên tới gốc.
 *
 * Gốc app Vuetify đang đặt `zoom: 0.85`. `zoom` KHÁC `transform`: nó co cả hệ toạ
 * độ của con, kể cả con `position: fixed`. Hệ quả:
 *   - getBoundingClientRect() trả về pixel THẬT trên màn hình (đã nhân zoom)
 *   - còn `style.top = 100px` lại được vẽ ở 100 × 0.85 = 85px thật
 * Đọc một hệ, ghi một hệ → bảng chi tiết lệch ~15%, càng gần mép càng sai.
 * Nên quy hết về hệ toạ độ CÓ ZOOM rồi mới ghi ra style.
 */
function effectiveZoom(el: HTMLElement | null): number {
  let z = 1;
  let cur: HTMLElement | null = el;
  while (cur) {
    const raw = parseFloat(getComputedStyle(cur).zoom || '1'); // 'normal' → NaN → bỏ qua
    if (!Number.isNaN(raw) && raw > 0) z *= raw;
    cur = cur.parentElement;
  }
  return z > 0 ? z : 1;
}

const POP_WIDTH = 236;
/** Ước lượng chiều cao để lật lên khi ô nằm sát đáy màn hình. */
const POP_EST_HEIGHT = 210;

function isDetailOpen(group: PermissionGroupNode, resource: string): boolean {
  return detail.value?.group.id === group.id && detail.value?.resource === resource;
}

function openDetail(group: PermissionGroupNode, resource: string, ev: Event) {
  // Ô "—" (resource không có hành động nào) thì không có gì để xem.
  if (actionsOf(resource).length === 0) return;
  // Bấm lại đúng ô đang mở → đóng.
  if (isDetailOpen(group, resource)) {
    detail.value = null;
    return;
  }
  const el = ev.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  detail.value = {
    group, resource,
    left: rect.left, top: rect.top, bottom: rect.bottom,
    zoom: effectiveZoom(el),
  };
}

const popStyle = computed(() => {
  if (!detail.value) return {};
  const { left, top, bottom, zoom } = detail.value;
  // Quy pixel THẬT (từ getBoundingClientRect + innerWidth/Height) về hệ toạ độ có
  // zoom, vì style.top/left sẽ được vẽ trong hệ đó. POP_WIDTH / POP_EST_HEIGHT
  // vốn đã là đơn vị style nên giữ nguyên.
  const s = 1 / zoom;
  const vw = window.innerWidth * s;
  const vh = window.innerHeight * s;
  const cellLeft = left * s;
  const cellTop = top * s;
  const cellBottom = bottom * s;

  // Tràn phải thì đẩy sang trái; sát đáy thì lật lên trên.
  const x = Math.max(8, Math.min(cellLeft, vw - POP_WIDTH - 12));
  const flipUp = cellBottom + POP_EST_HEIGHT + 12 > vh;
  const wanted = flipUp ? cellTop - POP_EST_HEIGHT - 6 : cellBottom + 6;
  // KẸP CỨNG trong màn. Lật lên thôi CHƯA đủ: ô nằm ngoài vùng nhìn (bảng dài,
  // đang cuộn) cho toạ độ âm hoặc lớn hơn chiều cao màn → bảng chi tiết bay mất.
  const y = Math.max(8, Math.min(wanted, vh - POP_EST_HEIGHT - 8));
  return { left: `${x}px`, top: `${y}px`, width: `${POP_WIDTH}px` };
});

function closeDetail() {
  detail.value = null;
}
/**
 * Bấm ra ngoài thì đóng. Bấm vào ô khác KHÔNG đóng ở đây — openDetail đã chạy
 * trước (giai đoạn bubble) và dời bảng sang ô mới; handler này thấy target nằm
 * trong .td-cell nên bỏ qua, tránh mở-rồi-đóng ngay.
 */
function onDocPointerDown(e: Event) {
  if (!detail.value) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest('.pgc-pop') || t?.closest('.td-cell')) return;
  closeDetail();
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeDetail();
}

onMounted(() => {
  document.addEventListener('click', onDocPointerDown);
  document.addEventListener('keydown', onKeydown);
  // capture: true để bắt cả cuộn BÊN TRONG khung bảng, không chỉ cuộn trang.
  window.addEventListener('scroll', closeDetail, true);
  window.addEventListener('resize', closeDetail);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocPointerDown);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('scroll', closeDetail, true);
  window.removeEventListener('resize', closeDetail);
});

/** Rê chuột lên ô → liệt kê đầy đủ bằng tiếng Việt, cả 2 chế độ đều có. */
function cellTooltip(group: PermissionGroupNode, resource: string): string {
  const granted = grantedOf(group, resource);
  const head = `${group.name} · ${resourceLabel(resource)}`;
  if (actionsOf(resource).length === 0) return `${head} — không áp dụng`;
  if (granted.length === 0) return `${head} — không có quyền`;
  return `${head}: ${granted.map(actionLabel).join(', ')}`;
}

/** Tổng số quyền đã cấp của 1 nhóm (đếm cả ma trận) — hiện ở header cột. */
function grantCount(group: PermissionGroupNode): number {
  let n = 0;
  for (const r of resources.value) {
    for (const a of actionsOf(r)) if (isGranted(group, r, a)) n++;
  }
  return n;
}

/** Chữ ký grants của 1 nhóm trên 1 resource — so sánh chuỗi để phát hiện khác biệt. */
function signature(group: PermissionGroupNode, resource: string): string {
  return actionsOf(resource).filter((a) => isGranted(group, resource, a)).join(',');
}

/** True nếu KHÔNG phải mọi nhóm đều giống nhau ở dòng này. */
function isRowDifferent(resource: string): boolean {
  if (flatGroups.value.length < 2) return false;
  const first = signature(flatGroups.value[0], resource);
  return flatGroups.value.some((g) => signature(g, resource) !== first);
}

function hasAnyViewAll(resource: string): boolean {
  if (!actionsOf(resource).includes('view_all')) return false;
  return flatGroups.value.some((g) => isGranted(g, resource, 'view_all'));
}

const visibleResources = computed<string[]>(() => {
  const q = searchQ.value.trim().toLowerCase();
  return resources.value.filter((r) => {
    if (q && !resourceLabel(r).toLowerCase().includes(q) && !r.toLowerCase().includes(q)) return false;
    if (diffOnly.value && !isRowDifferent(r)) return false;
    if (viewAllOnly.value && !hasAnyViewAll(r)) return false;
    return true;
  });
});

const diffRowCount = computed(() => resources.value.filter(isRowDifferent).length);
const viewAllRowCount = computed(() => resources.value.filter(hasAnyViewAll).length);

/** Xuất đúng bảng đang hiện (đã áp bộ lọc) — dán vào Excel/doc để review. */
function exportCsv(): void {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const header = ['Chức năng', 'Key', ...flatGroups.value.map((g) => g.name)];
  // Xuất bằng nhãn TIẾNG VIỆT đầy đủ (không phải viết tắt tiếng Anh) — file này
  // đem đi họp/duyệt, người đọc không nhất thiết biết Acc/Add/Del nghĩa là gì.
  const rows = visibleResources.value.map((r) => [
    resourceLabel(r),
    r,
    ...flatGroups.value.map((g) => {
      const granted = grantedOf(g, r);
      return granted.length ? granted.map(actionLabel).join(', ') : 'Không có';
    }),
  ]);
  const csv = [header, ...rows].map((row) => row.map(esc).join(',')).join('\r\n');
  // BOM để Excel đọc đúng tiếng Việt.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `so-sanh-nhom-quyen-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
/* PermissionComparePage — Airtable theme, khớp PermissionGroupsView */

.pgc-page { padding-bottom: 24px; }

/* ── Toolbar ── */
.pgc-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.pgc-toolbar .search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: white;
  border: 1px solid #e0e2e6;
  border-radius: 8px;
  padding: 6px 10px;
  min-width: 220px;
}
.pgc-toolbar .search-box input {
  border: 0;
  outline: 0;
  font-size: 13px;
  width: 100%;
  background: transparent;
  color: #181d26;
}
.search-icon { font-size: 12px; opacity: 0.5; }

.pgc-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: #4b5563;
  background: white;
  border: 1px solid #e0e2e6;
  border-radius: 8px;
  padding: 7px 11px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.12s, background 0.12s;
}
.pgc-toggle:hover { border-color: #c9ccd1; }
.pgc-toggle.on { border-color: #181d26; background: #f8fafc; color: #181d26; font-weight: 600; }
.pgc-toggle input { accent-color: #181d26; cursor: pointer; }
.pgc-toggle-count {
  font-size: 11px;
  background: #eef0f3;
  border-radius: 999px;
  padding: 1px 7px;
  color: #4b5563;
  font-weight: 600;
}
.pgc-shown { font-size: 12px; color: #6b7280; margin-left: auto; }

.pgc-modeswitch {
  display: inline-flex; background: white; border: 1px solid #e0e2e6;
  border-radius: 8px; overflow: hidden;
}
.pgc-modebtn {
  font-size: 12.5px; padding: 7px 12px; border: 0; background: transparent;
  color: #4b5563; cursor: pointer; transition: all 0.12s;
}
.pgc-modebtn:hover { background: #f8fafc; }
.pgc-modebtn.on { background: #181d26; color: white; font-weight: 600; }

/* ── Bảng ── */
.pgc-table-wrap {
  background: white;
  border: 1px solid #e0e2e6;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(24, 29, 38, 0.04);
  overflow: auto;          /* cuộn NGANG trong khung, không đẩy trang */
  max-height: calc(100vh - 300px);
}
.pgc-table {
  border-collapse: separate;
  border-spacing: 0;
  width: max-content;
  min-width: 100%;
  font-size: 12.5px;
}
.pgc-table th, .pgc-table td {
  border-right: 1px solid #eef0f3;
  border-bottom: 1px solid #eef0f3;
  padding: 8px 10px;
  text-align: left;
  vertical-align: middle;
  background: white;
}
.pgc-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #f8fafc;
  border-bottom: 1px solid #e0e2e6;
}
/* Cột đầu dính trái — resource luôn nhìn thấy khi cuộn ngang */
.th-resource, .td-resource {
  position: sticky;
  left: 0;
  z-index: 2;
  min-width: 210px;
  background: white;
}
.pgc-table thead .th-resource {
  z-index: 4;              /* góc trên-trái đè cả 2 chiều sticky */
  background: #f8fafc;
}
.th-group { min-width: 132px; }
.th-group-name { font-size: 13px; font-weight: 700; color: #181d26; white-space: nowrap; }
.th-group-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; flex-wrap: wrap; }
.tag-system {
  font-size: 10px;
  background: #eaf3ff;
  color: #1d4ed8;
  border-radius: 4px;
  padding: 1px 5px;
  font-weight: 600;
}
.tag-deprecated {
  font-size: 10px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 4px;
  padding: 1px 5px;
  font-weight: 600;
}
/* Nhóm ngừng dùng: làm mờ để mắt bám vào 4 vai trò đang dùng */
.th-group.is-deprecated { background: #fafbfc; }
.th-group.is-deprecated .th-group-name { color: #9ca3af; font-weight: 600; }
.th-group-stat { font-size: 10.5px; color: #6b7280; white-space: nowrap; }

.td-resource { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.td-resource-icon { font-size: 14px; flex-shrink: 0; }
.td-resource-text { min-width: 0; }
.td-resource-label { font-size: 12.5px; color: #181d26; font-weight: 600; line-height: 1.25; }
.td-resource-key { font-size: 10px; color: #9ca3af; font-family: ui-monospace, monospace; }
.diff-dot { color: #d97706; font-size: 9px; margin-left: auto; flex-shrink: 0; }

.row-diff .td-resource { background: #fffbeb; }
.row-diff:hover td, .row-diff:hover .td-resource { background: #fef9ec; }
.pgc-table tbody tr:hover td, .pgc-table tbody tr:hover .td-resource { background: #fbfcfd; }

.cell-badges { display: flex; gap: 3px; flex-wrap: wrap; }
.cell-none { color: #d1d5db; font-size: 13px; }

/* ── Chế độ Rút gọn: nhãn tiếng Việt, tô theo mức quyền ── */
.lvl {
  display: inline-block;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 5px;
  padding: 2px 7px;
  white-space: nowrap;
}
.lvl-full { background: #dcfce7; color: #15803d; }   /* xanh lá — làm được hết */
.lvl-edit { background: #dbeafe; color: #1d4ed8; }   /* xanh dương — ghi được */
.lvl-view { background: #f3f4f6; color: #4b5563; }   /* xám — chỉ xem */
.lvl-none { background: transparent; color: #d1d5db; font-weight: 500; }
.lvl-all {
  display: inline-block;
  margin-top: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: #f3f4f6;
  color: #cbd0d6;
  border: 1px solid #eceef1;
  cursor: default;
}
.badge.on {
  background: #181d26;
  color: white;
  border-color: #181d26;
}
/* view_all = cờ bỏ qua scope → tô khác màu cho dễ soi khi rà bảo mật */
.badge.badge-viewall {
  background: #b45309;
  border-color: #b45309;
  color: #fff;
}

.pgc-empty-row { text-align: center; color: #9ca3af; padding: 28px; font-size: 13px; }

/* ── Ô bấm được + bảng chi tiết ── */
.td-cell.is-tappable { cursor: pointer; }
.td-cell.is-tappable:focus-visible { outline: 2px solid #181d26; outline-offset: -2px; }
.td-cell.is-open { background: #eef2ff !important; box-shadow: inset 0 0 0 2px #6366f1; }

.pgc-pop {
  position: fixed;                 /* thoát khỏi khung cuộn của bảng */
  z-index: 60;
  background: white;
  border: 1px solid #d5d8dd;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(24, 29, 38, 0.16);
  padding: 10px 12px;
  font-size: 12.5px;
}
.pgc-pop-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.pgc-pop-title { min-width: 0; flex: 1; }
.pgc-pop-group { font-weight: 700; color: #181d26; font-size: 13px; line-height: 1.3; }
.pgc-pop-res { color: #6b7280; font-size: 11.5px; margin-top: 1px; }
.pgc-pop-close {
  border: 0; background: transparent; color: #9ca3af; cursor: pointer;
  font-size: 20px; line-height: 1; padding: 0 2px; flex-shrink: 0;
}
.pgc-pop-close:hover { color: #181d26; }

.pgc-pop-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid #eef0f3; }
.pgc-pop-list li {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 0; color: #9ca3af; border-bottom: 1px solid #f5f6f8;
}
.pgc-pop-list li:last-child { border-bottom: 0; }
.pgc-pop-list li.on { color: #181d26; font-weight: 600; }
.pgc-pop-mark { width: 13px; text-align: center; color: #d1d5db; font-weight: 700; }
.pgc-pop-list li.on .pgc-pop-mark { color: #16a34a; }
.pgc-pop-icon { width: 16px; text-align: center; }
.pgc-pop-label { flex: 1; }
.pgc-pop-note {
  margin: 8px 0 0; padding-top: 8px; border-top: 1px solid #eef0f3;
  font-size: 11.5px; color: #b45309;
}

/* ── Chú giải ── */
.pgc-legend {
  margin-top: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e0e2e6;
  border-radius: 10px;
}
.legend-group { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 6px; }
.legend-title { font-size: 12px; font-weight: 700; color: #181d26; }
.legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: #4b5563; }
.legend-note { font-size: 11.5px; color: #6b7280; margin: 4px 0 0; }

@media (max-width: 900px) {
  .pgc-shown { margin-left: 0; }
  .pgc-table-wrap { max-height: none; }
  /* Vùng chạm rộng hơn trên điện thoại — ngón tay khó trúng ô 8px padding. */
  .pgc-table td.td-cell { padding: 12px 10px; }
}
</style>
