<template>
  <div class="media-page">
    <!-- Top bar -->
    <header class="m-top">
      <h1 class="m-title">Kho lưu trữ</h1>
      <div class="m-tools">
        <div class="m-search">
          <span class="material-symbols-outlined i">search</span>
          <input v-model="search" placeholder="Tìm ảnh, tag dự án…" @input="debouncedReload" />
        </div>
        <button class="btn-dark" @click="triggerUpload">+ Tải lên</button>
        <!-- Trình duyệt trả mọi tệp bên trong kèm đường dẫn tương đối, đủ để dựng lại cây. -->
        <button class="btn-folder" :disabled="folderUploading" title="Tải lên cả một thư mục (giữ nguyên thư mục con)" @click="triggerFolderUpload">
          <FolderUpIcon :size="15" :stroke-width="1.9" /> Tải thư mục
        </button>
        <button v-if="!trashMode" class="btn-multi" :class="{ on: multiMode }" :title="multiMode ? 'Tắt chọn nhiều' : 'Chọn nhiều ảnh'" @click="toggleMultiMode">
          <CheckSquareIcon :size="15" :stroke-width="1.9" /> Chọn nhiều
        </button>
        <button class="btn-trash" :class="{ on: trashMode }" :title="trashMode ? 'Đóng thùng rác' : 'Mở thùng rác'" @click="trashMode ? closeTrash() : openTrash()">
          <Trash2Icon :size="15" :stroke-width="1.9" /> Thùng rác
        </button>
        <input ref="fileInput" type="file" multiple accept="image/*,video/*,.pdf,.xlsx,.docx,.zip" hidden @change="onFilesPicked" />
        <!-- Vue cần :webkitdirectory="true" vì đây không phải attribute HTML hợp lệ. -->
        <input
          ref="folderInput"
          type="file"
          multiple
          :webkitdirectory="true"
          hidden
          @change="onFolderPicked"
        />
      </div>
    </header>

    <!-- Tabs -->
    <nav class="m-tabs">
      <button v-for="t in tabs" :key="t.kind" class="tab" :class="{ on: activeKind === t.kind }" @click="setKind(t.kind)">{{ t.label }}</button>
    </nav>

    <!-- ════════ THÙNG RÁC (GĐ13a) ════════ -->
    <section v-if="trashMode" class="m-trash">
      <div class="trash-bar">
        <span class="trash-ttl"><Trash2Icon :size="16" :stroke-width="1.9" /> Thùng rác · {{ trashItems.length }} mục</span>
        <span class="trash-note">Đồ trong đây giữ 30 ngày rồi tự dọn. File gốc luôn được giữ — lịch sử chat đã gửi không bị ảnh hưởng.</span>
        <button class="trash-empty" :disabled="trashItems.length === 0" @click="onEmptyTrash">Dọn sạch</button>
        <button class="trash-close" title="Đóng" @click="closeTrash"><XIcon :size="15" :stroke-width="2" /></button>
      </div>

      <div v-if="trashLoading" class="m-empty"><div class="spin"></div> Đang tải…</div>
      <div v-else-if="trashItems.length === 0" class="m-empty">
        <div class="empty-ic"><Trash2Icon :size="40" :stroke-width="1.4" /></div>
        <div class="empty-ttl">Thùng rác trống</div>
        <div class="empty-sub">File anh xóa khỏi kho sẽ nằm đây 30 ngày, khôi phục lại được trước khi tự dọn.</div>
      </div>

      <div v-else class="m-grid">
        <div v-for="a in trashItems" :key="a.id" class="card trash-card">
          <div class="thumb">
            <img v-if="a.thumbnailUrl" :src="a.thumbnailUrl" loading="lazy" alt="" />
            <span v-else class="ph"><component :is="kindIcon(a.kind)" :size="26" :stroke-width="1.6" /></span>
            <span class="purge-badge" :class="{ soon: a.daysUntilPurge <= 3 }">còn {{ a.daysUntilPurge }} ngày</span>
          </div>
          <div class="meta">
            <div class="fn" :title="a.name">{{ a.name }}</div>
            <div class="trash-acts">
              <button class="t-restore" @click="onRestore(a)"><RotateCcwIcon :size="13" :stroke-width="1.9" /> Khôi phục</button>
              <button class="t-perm" title="Xóa vĩnh viễn" @click="onPermanentDelete(a)"><Trash2Icon :size="13" :stroke-width="1.9" /></button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Lọc theo quyền, loại nằm ở tabs phía trên -->
    <div v-if="!trashMode" class="m-filter">
      <span class="crumb">Tất cả<template v-if="activeFolder"> ▸ <b>{{ activeFolderName }}</b></template></span>
      <span v-for="tag in activeTags" :key="tag" class="chip coral" @click="toggleTag(tag)">#{{ tag }} <XIcon :size="11" :stroke-width="2.2" /></span>
      <button class="lvl2-btn" :class="{ on: showLever2 }" @click="showLever2 = !showLever2">⚙ Lọc sâu</button>
      <div class="vis-toggle">
        <span :class="{ on: visFilter === '' }" @click="setVis('')">Tất cả</span>
        <span :class="{ on: visFilter === 'public' }" @click="setVis('public')"><GlobeIcon :size="12" :stroke-width="2" /> Công khai</span>
        <span :class="{ on: visFilter === 'private' }" @click="setVis('private')"><LockIcon :size="12" :stroke-width="2" /> Riêng tư</span>
      </div>
    </div>

    <!-- LEVER 2: Sắp xếp / Thời gian / Size / Tag (ẩn/hiện) -->
    <div v-if="showLever2 && !trashMode" class="m-lever2">
      <select v-model="ownerFilter" class="lv2-sel" @change="applyFilters">
        <option value="">Mọi người sở hữu</option>
        <option v-for="u in uploaders" :key="u.id" :value="u.id">{{ u.name }} ({{ u.count }})</option>
      </select>
      <select v-model="sortBy" class="lv2-sel" @change="applyFilters">
        <option value="recent">Gần đây dùng</option>
        <option value="newest">Mới tải lên</option>
        <option value="most_used">Hay dùng nhất</option>
        <option value="name">Tên A→Z</option>
      </select>
      <select v-model="sinceBy" class="lv2-sel" @change="applyFilters">
        <option value="">Mọi lúc</option>
        <option value="7d">7 ngày</option>
        <option value="30d">30 ngày</option>
        <option value="90d">90 ngày</option>
      </select>
      <select v-model="sizeBy" class="lv2-sel" @change="applyFilters">
        <option value="">Mọi cỡ</option>
        <option value="small">&lt; 1MB</option>
        <option value="medium">1–10MB</option>
        <option value="large">&gt; 10MB</option>
      </select>
      <input v-model="tagInput" class="lv2-tag" placeholder="Lọc theo tag…" @keyup.enter="applyTagFilter" @input="debouncedReload" />
    </div>

    <div v-if="!trashMode" class="m-work">
      <!-- BE trả danh sách phẳng kèm parentId, FE tự dựng cây. -->
      <aside class="m-tree">
        <div class="tree-ttl">Thư mục
          <button class="addf" title="Tạo thư mục gốc" @click="onCreateFolder(null)">＋</button>
        </div>
        <div class="f" :class="{ on: !activeFolder }" @click="setFolder(null)"><FolderIcon :size="13" :stroke-width="1.9" /> Tất cả</div>
        <div
          v-for="row in visibleFolderRows"
          :key="row.folder.id"
          class="f"
          :class="{ on: activeFolder === row.folder.id }"
          :style="{ paddingLeft: `${8 + row.depth * 13}px` }"
          @click="setFolder(row.folder.id)"
        >
          <!-- click.stop để bấm mũi tên chỉ mở gập, không đổi luôn thư mục đang xem. -->
          <button
            v-if="row.hasChildren"
            class="tw"
            :title="expanded.has(row.folder.id) ? 'Thu gọn' : 'Mở rộng'"
            @click.stop="toggleExpand(row.folder.id)"
          >{{ expanded.has(row.folder.id) ? '▾' : '▸' }}</button>
          <span v-else class="tw tw-empty"></span>
          <FolderIcon :size="13" :stroke-width="1.9" /> {{ row.folder.name }}
          <LockIcon v-if="row.folder.visibility === 'private'" class="lk" :size="11" :stroke-width="2" />
          <button class="addsub" title="Tạo thư mục con" @click.stop="onCreateFolder(row.folder.id)">＋</button>
        </div>
      </aside>

      <!-- Grid / empty / loading -->
      <div class="m-grid-wrap">
        <!-- GĐ12: thanh thao tác hàng loạt (hiện khi chọn nhiều + có ảnh chọn) -->
        <div v-if="multiMode && picked.size > 0" class="bulk-bar">
          <span class="bulk-cnt">Đã chọn {{ picked.size }}</span>
          <select v-model="bulkFolderId" class="bulk-sel" @change="onBulkFolder">
            <option value="__none">Gán thư mục…</option>
            <option value="">— Bỏ khỏi thư mục —</option>
            <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
          <input v-model="bulkTag" class="bulk-tag" placeholder="Gán tag rồi Enter" @keyup.enter="onBulkTag" />
          <button class="bulk-trash" @click="onBulkTrash"><Trash2Icon :size="13" :stroke-width="1.9" /> Xóa {{ picked.size }} mục</button>
          <button class="bulk-clear" @click="clearPicked">Bỏ chọn</button>
        </div>

        <!-- Đã gỡ dải "Hay dùng nhất", sẽ build module báo cáo riêng. -->

        <div v-if="loading" class="m-empty"><div class="spin"></div> Đang tải…</div>

        <div v-else-if="items.length === 0" class="m-empty">
          <div class="empty-ic"><ImageIcon :size="44" :stroke-width="1.4" /></div>
          <div class="empty-ttl">Kho lưu trữ của bạn đang trống</div>
          <div class="empty-sub">Tải ảnh hay dùng (bảng giá, mặt bằng, brochure) để gửi khách 1 chạm.</div>
          <button class="btn-dark" @click="triggerUpload">+ Tải tệp đầu tiên</button>
          <div class="empty-hint"><LightbulbIcon :size="13" :stroke-width="1.9" /> Hoặc chuột phải ảnh trong chat → <b>Lưu vào Media</b></div>
        </div>

        <!-- Tệp hiện dạng dòng vì grid card không cho phân biệt tệp nào với tệp nào. -->
        <div v-else-if="activeKind === 'file'" class="m-flist">
          <div v-for="a in items" :key="a.id" class="frow" :class="{ sel: selected?.id === a.id }" @click="select(a)">
            <span class="ficon" :style="{ background: fileIcon(a.name).bg, color: fileIcon(a.name).fg }">{{ fileIcon(a.name).label }}</span>
            <div class="finfo">
              <div class="fname" :title="a.name">{{ a.name }}</div>
              <div class="fmeta">
                {{ fmtSize(a.sizeBytes) }} · {{ a.visibility === 'public' ? 'Công khai' : 'Riêng tư' }} · đã dùng {{ a.usageCount }}
              </div>
              <div class="fmeta src-row" :title="sourceLabel(a)">
                <component :is="sourceIcon(a)" :size="11" :stroke-width="2" /> {{ sourceLabel(a) }}
              </div>
            </div>
          </div>
        </div>

        <!-- ẢNH/VIDEO: grid thẻ thumbnail -->
        <div v-else class="m-grid">
          <div v-for="a in items" :key="a.id" class="card" :class="{ sel: selected?.id === a.id, picked: picked.has(a.id) }" @click="onCardClick(a)">
            <div class="thumb">
              <img v-if="a.thumbnailUrl" :src="a.thumbnailUrl" loading="lazy" alt="" />
              <span v-else class="ph"><component :is="kindIcon(a.kind)" :size="26" :stroke-width="1.6" /></span>
              <span v-if="a.kind === 'video'" class="play-ic">▶</span>
              <span v-if="a.kind === 'video' && a.durationSec" class="dur">{{ fmtDuration(a.durationSec) }}</span>
              <span v-if="a.visibility === 'private'" class="badge"><LockIcon :size="11" :stroke-width="2.2" /></span>
              <span v-if="multiMode" class="pick-tick" :class="{ on: picked.has(a.id) }">{{ picked.has(a.id) ? '✓' : '' }}</span>
            </div>
            <div class="meta">
              <div class="fn" :title="a.name">{{ a.name }}</div>
              <!-- NGUỒN: ảnh từ nick nào / sale nào (2026-06-15). Lucide icon, không emoji. -->
              <div class="src" :title="sourceLabel(a)">
                <component :is="sourceIcon(a)" :size="11" :stroke-width="2" />
                <span>{{ sourceLabel(a) }}</span>
              </div>
              <div class="stat" :class="a.visibility === 'public' ? 'pub' : 'lk'">
                <component :is="a.visibility === 'public' ? GlobeIcon : LockIcon" :size="11" :stroke-width="2" />
                {{ a.visibility === 'public' ? 'Công khai' : 'Riêng tư' }} · {{ a.usageCount }} lần
              </div>
            </div>
          </div>
        </div>

        <!-- Phân trang (anh chốt 2026-06-16): nút chuyển trang + tổng số mục, tránh load lag. -->
        <div v-if="!loading && total > 0" class="m-pager">
          <button class="pg-btn" :disabled="page === 0" @click="goPage(-1)">‹ Trước</button>
          <span class="pg-num">Trang {{ page + 1 }}/{{ totalPages }} · {{ total }} mục</span>
          <button class="pg-btn" :disabled="page + 1 >= totalPages" @click="goPage(1)">Sau ›</button>
        </div>
      </div>

      <!-- Detail panel (PA3) -->
      <MediaDetailPanel
        v-if="selected"
        :asset="selected"
        :folders="folders"
        @close="selected = null"
        @updated="onAssetUpdated"
        @archived="onAssetArchived"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  listMediaPaged, listMediaUploaders, uploadMedia, listMediaFolders, createMediaFolder,
  createOrReuseMediaFolder, deleteMediaFolder,
  listTrash, restoreMedia, permanentDeleteMedia, emptyTrash,
  archiveMedia, bulkUpdateMedia,
  type MediaAssetItem, type MediaFolder, type TrashItem,
} from '@/api/media';
import { useToast } from '@/composables/use-toast';
import MediaDetailPanel from '@/components/media/MediaDetailPanel.vue';
import {
  Trash2 as Trash2Icon, RotateCcw as RotateCcwIcon, X as XIcon, CheckSquare as CheckSquareIcon,
  Globe as GlobeIcon, Lock as LockIcon, Smartphone as NickIcon, Upload as UploadIcon,
  Image as ImageIcon, FileText as FileIcon, Video as VideoIcon, Folder as FolderIcon,
  Lightbulb as LightbulbIcon, FolderUp as FolderUpIcon,
} from 'lucide-vue-next';

// Icon placeholder theo loại media.
function kindIcon(kind: string) {
  return kind === 'video' ? VideoIcon : kind === 'file' ? FileIcon : ImageIcon;
}

const toast = useToast();

// Nhãn + icon NGUỒN ảnh (2026-06-15): "nick nào · sale nào" hoặc "Tải lên thủ công · sale".
function sourceLabel(a: MediaAssetItem): string {
  const sale = a.ownerName ? ` · ${a.ownerName}` : '';
  if (a.source === 'saved_from_chat' && a.sourceNickName) return `${a.sourceNickName}${sale}`;
  if (a.source === 'saved_from_chat') return `Lưu từ chat${sale}`;
  return `Tải lên thủ công${sale}`;
}
function sourceIcon(a: MediaAssetItem) {
  return a.source === 'saved_from_chat' && a.sourceNickName ? NickIcon : UploadIcon;
}

const tabs = [
  { kind: 'image', label: 'Ảnh' },
  { kind: 'album', label: 'Album' },
  { kind: 'file', label: 'Tệp' },
  { kind: 'video', label: 'Video' },
];
const activeKind = ref<'image' | 'album' | 'file' | 'video'>('image');
const items = ref<MediaAssetItem[]>([]);
const folders = ref<MediaFolder[]>([]);
const loading = ref(false);
const search = ref('');
const visFilter = ref<'' | 'public' | 'private'>('');
const activeFolder = ref<string | null>(null);
const activeTags = ref<string[]>([]);
const selected = ref<MediaAssetItem | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
/** Khoá nút để không bấm chồng lên nhau khi đang dựng cây và tải thư mục. */
const folderUploading = ref(false);

// Lọc sâu.
const showLever2 = ref(false);
const sortBy = ref<'recent' | 'newest' | 'most_used' | 'name'>('recent');
const sinceBy = ref<'' | '7d' | '30d' | '90d'>('');
const sizeBy = ref<'' | 'small' | 'medium' | 'large'>('');
const tagInput = ref('');

// Lọc theo người sở hữu ảnh + phân trang (anh chốt 2026-06-16: /media load nhiều ảnh lag,
// cần nút chuyển trang; thêm lọc theo người upload). Tái dùng BE skip/total/ownerUserId.
const ownerFilter = ref('');
const uploaders = ref<Array<{ id: string; name: string; count: number }>>([]);
const PAGE_SIZE = 40;
const page = ref(0);
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

const activeFolderName = computed(() => folders.value.find((f) => f.id === activeFolder.value)?.name ?? '');

// Dựng cây ở FE để một request là đủ, và để lọc theo quyền vẫn nằm gọn một chỗ ở BE.
const expanded = ref<Set<string>>(new Set());
function toggleExpand(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  expanded.value = next;
}

/** Thư mục có cha đã bị lọc mất vì thiếu quyền thì coi như thư mục gốc. */
const childrenByParent = computed(() => {
  const ids = new Set(folders.value.map((f) => f.id));
  const map = new Map<string | null, MediaFolder[]>();
  for (const f of folders.value) {
    const key = f.parentId && ids.has(f.parentId) ? f.parentId : null;
    const arr = map.get(key) ?? [];
    arr.push(f);
    map.set(key, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return map;
});

/** Làm phẳng thành các dòng để v-for, chỉ gồm nhánh đang mở. */
const visibleFolderRows = computed(() => {
  const rows: Array<{ folder: MediaFolder; depth: number; hasChildren: boolean }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childrenByParent.value.get(parentId) ?? []) {
      const hasChildren = (childrenByParent.value.get(f.id)?.length ?? 0) > 0;
      rows.push({ folder: f, depth, hasChildren });
      if (hasChildren && expanded.value.has(f.id)) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
});

function sizeRange(): { sizeMin?: number; sizeMax?: number } {
  const MB = 1024 * 1024;
  if (sizeBy.value === 'small') return { sizeMax: MB };
  if (sizeBy.value === 'medium') return { sizeMin: MB, sizeMax: 10 * MB };
  if (sizeBy.value === 'large') return { sizeMin: 10 * MB };
  return {};
}
function applyTagFilter() {
  const t = tagInput.value.trim();
  if (t && !activeTags.value.includes(t)) activeTags.value = [...activeTags.value, t];
  tagInput.value = '';
  applyFilters();
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(applyFilters, 300);
}

// Đổi bộ lọc → luôn về trang 1 (tránh kẹt ở "trang 5" rỗng khi kết quả co lại).
function applyFilters() { page.value = 0; reload(); }
function goPage(delta: number) {
  const next = page.value + delta;
  if (next < 0 || next >= totalPages.value) return;
  page.value = next;
  reload();
}

async function reload() {
  loading.value = true;
  try {
    // Album tab dùng folders; còn lại list assets theo kind.
    const kind = activeKind.value === 'album' ? undefined : activeKind.value;
    const res = await listMediaPaged({
      kind,
      q: search.value || undefined,
      visibility: visFilter.value || undefined,
      folderId: activeFolder.value || undefined,
      tag: activeTags.value[0] || tagInput.value.trim() || undefined,
      ownerUserId: ownerFilter.value || undefined,
      // Lever 2.
      sort: sortBy.value,
      since: sinceBy.value || undefined,
      limit: PAGE_SIZE,
      skip: page.value * PAGE_SIZE,
      ...sizeRange(),
    });
    items.value = res.items;
    total.value = res.total;
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không tải được kho');
  } finally {
    loading.value = false;
  }
}

// Đổ vào dropdown lọc, khớp kind và visibility đang xem.
async function loadUploaders() {
  try {
    uploaders.value = await listMediaUploaders({
      kind: activeKind.value === 'album' ? undefined : activeKind.value,
      visibility: visFilter.value || undefined,
    });
  } catch { /* ignore — dropdown rỗng vẫn dùng lọc khác */ }
}

async function loadFolders() {
  try { folders.value = await listMediaFolders(); } catch { /* ignore */ }
}

function setKind(k: any) { activeKind.value = k; selected.value = null; if (trashMode.value) loadTrash(); else { applyFilters(); loadUploaders(); } }
function setVis(v: any) { visFilter.value = v; applyFilters(); loadUploaders(); }
function setFolder(id: string | null) { activeFolder.value = id; applyFilters(); }
function toggleTag(tag: string) { activeTags.value = activeTags.value.filter((t) => t !== tag); applyFilters(); }
function select(a: MediaAssetItem) { selected.value = a; }

// ── GĐ12: Chọn nhiều + thao tác hàng loạt ───────────────────────────────────
const multiMode = ref(false);
const picked = ref<Set<string>>(new Set());
const bulkFolderId = ref('__none');
const bulkTag = ref('');

function toggleMultiMode() {
  multiMode.value = !multiMode.value;
  if (!multiMode.value) clearPicked();
  else selected.value = null; // tắt panel chi tiết khi vào chế độ chọn nhiều
}
function clearPicked() { picked.value = new Set(); }
function onCardClick(a: MediaAssetItem) {
  if (!multiMode.value) { select(a); return; }
  const next = new Set(picked.value);
  if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
  picked.value = next;
}
async function onBulkFolder() {
  const v = bulkFolderId.value;
  if (v === '__none' || picked.value.size === 0) return;
  try {
    const folderId = v === '' ? null : v;
    const res = await bulkUpdateMedia([...picked.value], { folderId });
    toast.success(`Đã gán thư mục cho ${res.updated} mục`);
    bulkFolderId.value = '__none';
    clearPicked(); reload();
  } catch (e: any) { toast.warning(e?.response?.data?.error || 'Gán thư mục thất bại'); }
}
async function onBulkTag() {
  const t = bulkTag.value.trim();
  if (!t || picked.value.size === 0) return;
  try {
    const res = await bulkUpdateMedia([...picked.value], { addTags: [t] });
    toast.success(`Đã gán tag "${t}" cho ${res.updated} mục`);
    bulkTag.value = ''; reload();
  } catch (e: any) { toast.warning(e?.response?.data?.error || 'Gán tag thất bại'); }
}
async function onBulkTrash() {
  const ids = [...picked.value];
  if (ids.length === 0) return;
  if (!window.confirm(`Chuyển ${ids.length} mục vào Thùng rác?\n(Khôi phục được trong 30 ngày. Lịch sử chat đã gửi không bị ảnh hưởng.)`)) return;
  try {
    // Chạy tuần tự cho an toàn.
    let ok = 0;
    for (const id of ids) { try { await archiveMedia(id); ok++; } catch { /* skip lỗi lẻ */ } }
    toast.success(`Đã chuyển ${ok}/${ids.length} mục vào Thùng rác`);
    clearPicked(); reload();
  } catch (e: any) { toast.warning(e?.response?.data?.error || 'Xóa hàng loạt thất bại'); }
}

// Định dạng thời lượng video: 95s → "1:35".
function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Icon + màu theo định dạng tệp (sale nhận diện nhanh PDF/Excel/Word).
function fileIcon(name: string): { label: string; bg: string; fg: string } {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return { label: 'PDF', bg: '#fdecec', fg: '#c0392b' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', bg: '#e7f4ec', fg: '#1e7e45' };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', bg: '#e8effb', fg: '#1a5cc0' };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', bg: '#fdeee4', fg: '#c75b1e' };
  if (['zip', 'rar', '7z'].includes(ext)) return { label: 'ZIP', bg: '#f0eef9', fg: '#6b4fb0' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), bg: '#eef0f2', fg: '#41454d' };
}
function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  const MB = 1024 * 1024;
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Phải khớp hạn mức ở media-routes.ts, lệch là người dùng ăn 413 giữa chừng. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const UPLOAD_BATCH = 25;

/** Chỉ đếm số tệp là chưa đủ vì 25 tệp x 10MB = 250MB, vượt trần 100MB mỗi lượt. */
function batchFiles(files: File[]): File[][] {
  const out: File[][] = [];
  let cur: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (cur.length >= UPLOAD_BATCH || (cur.length > 0 && bytes + f.size > MAX_BATCH_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Báo ngay tại máy người dùng còn hơn để server trả 413 giữa chừng. */
function splitOversize(files: File[]): { ok: File[]; tooBig: File[] } {
  const ok: File[] = [];
  const tooBig: File[] = [];
  for (const f of files) (f.size > MAX_FILE_BYTES ? tooBig : ok).push(f);
  return { ok, tooBig };
}

function totalBytes(files: File[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

/**
 * Tên tệp cho toast cảnh báo. withPath=true dùng webkitRelativePath (tải cả thư mục), vì
 * nhiều thư mục con hay trùng tên tệp gốc (vd "file.pdf") — chỉ tên trần không phân biệt được.
 * Cắt bớt ở `max` để toast không phình to khi cả trăm tệp cùng bị chặn.
 */
function listNames(files: File[], withPath: boolean, max = 8): string {
  const label = (f: File) => `"${withPath ? ((f as any).webkitRelativePath || f.name) : f.name}" (${fmtSize(f.size)})`;
  const shown = files.slice(0, max).map(label).join(', ');
  return files.length > max ? `${shown} và ${files.length - max} tệp khác` : shown;
}

function triggerUpload() { fileInput.value?.click(); }
async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files.length) return;

  // Trần TOÀN BỘ lượt chọn (khớp REQUEST_TOTAL_MAX ở BE) — chặn cứng ngay tại đây thay vì
  // để batchFiles âm thầm chia thành nhiều request vẫn thành công.
  const total = totalBytes(files);
  if (total > MAX_BATCH_BYTES) {
    toast.warning(`${fmtSize(total)} vượt trần ${fmtSize(MAX_BATCH_BYTES)} mỗi lượt chọn — chọn ít tệp hơn rồi thử lại`, 6000);
    return;
  }

  const { ok: sendable, tooBig } = splitOversize(files);
  if (tooBig.length) {
    toast.warning(`Bỏ qua ${tooBig.length} tệp quá 10MB: ${listNames(tooBig, false)}`, 6000);
  }
  if (!sendable.length) return;

  try {
    const assets: Array<{ id: string; name: string; deduped: boolean }> = [];
    for (const b of batchFiles(sendable)) {
      const part = await uploadMedia(b, { visibility: 'private', folderId: activeFolder.value ?? undefined });
      assets.push(...part.assets);
    }
    const dup = assets.filter((a) => a.deduped).length;
    toast.success(dup > 0 ? `Đã tải ${assets.length} tệp (${dup} đã có sẵn, không tốn thêm dung lượng)` : `Đã tải ${assets.length} tệp lên kho`);
    reload();
  } catch (err: any) {
    toast.warning(err?.response?.data?.error || 'Tải lên thất bại');
  }
}

async function onCreateFolder(parentId: string | null = null) {
  const parentName = parentId ? folders.value.find((f) => f.id === parentId)?.name : null;
  const name = window.prompt(parentName ? `Tên thư mục con trong "${parentName}":` : 'Tên thư mục mới:');
  if (!name?.trim()) return;
  try {
    await createMediaFolder(name.trim(), 'private', parentId);
    toast.success('Đã tạo thư mục');
    if (parentId) expanded.value = new Set(expanded.value).add(parentId); // mở cha để thấy con vừa tạo
    loadFolders();
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không tạo được thư mục');
  }
}

// Cây thư mục được dựng lại từ webkitRelativePath của từng tệp, dạng "bao_gia/2026/q4.pdf".
// Thư mục được chọn nằm dưới thư mục đang mở, nên tải vào "Tất cả" thì nó thành thư mục gốc.
function triggerFolderUpload() { folderInput.value?.click(); }

async function onFolderPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files.length) return;

  // Trần TOÀN BỘ cây thư mục vừa chọn (mọi thư mục con cộng lại), KHÔNG phải mỗi request —
  // tải lên thật vẫn chia theo từng thư mục con (mỗi thư mục 1 request riêng) nên tổng một
  // cây > 100MB từng lọt qua trót lọt dù mỗi request tự nó không sao. Chặn cứng ngay ở đây.
  const total = totalBytes(files);
  if (total > MAX_BATCH_BYTES) {
    toast.warning(`Cả thư mục ${fmtSize(total)} vượt trần ${fmtSize(MAX_BATCH_BYTES)} mỗi lượt tải — chia thư mục nhỏ hơn rồi thử lại`, 6000);
    return;
  }

  // Loại tệp quá cỡ trước khi dựng cây, để thư mục toàn tệp quá cỡ không bị tạo ra.
  const { ok: usable, tooBig } = splitOversize(files);
  if (tooBig.length) {
    toast.warning(`Bỏ qua ${tooBig.length}/${files.length} tệp quá 10MB: ${listNames(tooBig, true)}`, 6000);
  }
  if (!usable.length) {
    toast.warning('Mọi tệp trong thư mục đều quá 10MB, không tạo thư mục nào');
    return;
  }

  // Khoá rỗng nghĩa là tệp nằm ngay trong thư mục gốc được chọn.
  const byDir = new Map<string, File[]>();
  for (const f of usable) {
    const rel = (f as any).webkitRelativePath as string | undefined;
    const dir = rel ? rel.split('/').slice(0, -1).join('/') : '';
    const arr = byDir.get(dir) ?? [];
    arr.push(f);
    byDir.set(dir, arr);
  }

  folderUploading.value = true;
  try {
    // Sắp nông trước sâu sau để thư mục cha luôn tồn tại trước con.
    const made = new Map<string, string>(); // đường dẫn tương đối sang id thư mục kho
    const allDirs = [...new Set([...byDir.keys()].flatMap(dirAndAncestors))]
      .filter(Boolean)
      .sort((a, b) => a.split('/').length - b.split('/').length);

    let reusedCount = 0;
    // Chỉ thư mục do lần này tạo mới được phép dọn, thư mục có sẵn tuyệt đối không đụng tới.
    const createdHere: string[] = [];
    for (const dir of allDirs) {
      const segs = dir.split('/');
      const parentPath = segs.slice(0, -1).join('/');
      const parentId = parentPath ? made.get(parentPath) ?? null : activeFolder.value;
      const leaf = segs[segs.length - 1];

      // BE chặn trùng tên bằng 409, bắt lấy và dùng lại để tải bổ sung vào cây có sẵn vẫn chạy.
      const { id, reused } = await createOrReuseMediaFolder(leaf, parentId);
      if (reused) reusedCount++;
      else createdHere.push(id);
      made.set(dir, id);
    }

    // gotFiles ghi lại thư mục nhận được ít nhất một tệp, để biết cái nào rỗng mà dọn.
    let ok = 0;
    let failed = 0;
    const gotFiles = new Set<string>();
    for (const [dir, group] of byDir) {
      const folderId = dir ? made.get(dir) : (activeFolder.value ?? undefined);
      // Vượt trần số tệp hay trần dung lượng đều làm hỏng cả thư mục đó, nên cắt mẻ theo cả hai.
      for (const b of batchFiles(group)) {
        try {
          const res = await uploadMedia(b, { visibility: 'private', folderId: folderId ?? undefined });
          ok += res.assets.length;
          if (folderId && res.assets.length) gotFiles.add(folderId);
        } catch {
          failed += b.length;
        }
      }
    }

    // Thư mục tạo trước khi tải tệp, nên khi mọi tệp bị từ chối sẽ còn lại cả cây trống trơn.
    // Xoá từ sâu lên nông để thư mục cha rỗng đi sau khi mất con cũng được dọn theo.
    const survivors = new Set(gotFiles);
    const deepestFirst = allDirs
      .filter((d) => createdHere.includes(made.get(d)!))
      .sort((a, b) => b.split('/').length - a.split('/').length);
    let cleaned = 0;
    for (const dir of deepestFirst) {
      const id = made.get(dir)!;
      if (survivors.has(id)) continue;
      // Không thể xoá cha của một thư mục còn tệp.
      const hasLiveChild = allDirs.some((d) => d.startsWith(`${dir}/`) && survivors.has(made.get(d)!));
      if (hasLiveChild) { survivors.add(id); continue; }
      try { await deleteMediaFolder(id); cleaned++; } catch { survivors.add(id); }
    }

    const reusedNote = reusedCount > 0 ? `, ${reusedCount} thư mục đã có sẵn` : '';
    const keptFolders = allDirs.length - cleaned;
    if (ok === 0 && failed > 0) {
      toast.warning(
        `Không tải được tệp nào (${failed} tệp, nhiều khả năng định dạng không hỗ trợ). ` +
        `Đã dọn ${cleaned} thư mục rỗng vừa tạo.`,
      );
    } else {
      const cleanNote = cleaned > 0 ? `, dọn ${cleaned} thư mục rỗng` : '';
      toast.success(
        failed > 0
          ? `Đã tải ${ok} tệp vào ${keptFolders} thư mục${reusedNote}${cleanNote} (${failed} tệp lỗi, có thể do định dạng không hỗ trợ)`
          : `Đã tải ${ok} tệp vào ${keptFolders} thư mục${reusedNote}${cleanNote}`,
      );
    }
    if (activeFolder.value) expanded.value = new Set(expanded.value).add(activeFolder.value);
    loadFolders();
    reload();
  } catch (err: any) {
    toast.warning(err?.response?.data?.error || 'Tải thư mục thất bại');
  } finally {
    folderUploading.value = false;
  }
}

/** "a/b/c" thành ["a", "a/b", "a/b/c"], để tạo đủ cả thư mục trung gian không chứa tệp nào. */
function dirAndAncestors(dir: string): string[] {
  if (!dir) return [];
  const segs = dir.split('/');
  return segs.map((_, i) => segs.slice(0, i + 1).join('/'));
}

function onAssetUpdated(patch: Partial<MediaAssetItem>) {
  if (!selected.value) return;
  Object.assign(selected.value, patch);
  const it = items.value.find((x) => x.id === selected.value!.id);
  if (it) Object.assign(it, patch);
}
function onAssetArchived(id: string) {
  items.value = items.value.filter((x) => x.id !== id);
  selected.value = null;
  toast.success('Đã chuyển vào Thùng rác');
}

// ── GĐ13a: Thùng rác ────────────────────────────────────────────────────────
const trashMode = ref(false);
const trashItems = ref<TrashItem[]>([]);
const trashLoading = ref(false);

async function loadTrash() {
  trashLoading.value = true;
  try {
    const kind = activeKind.value === 'album' ? undefined : activeKind.value;
    const res = await listTrash({ kind });
    trashItems.value = res.items;
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Không tải được thùng rác');
  } finally {
    trashLoading.value = false;
  }
}
function openTrash() { trashMode.value = true; selected.value = null; loadTrash(); }
function closeTrash() { trashMode.value = false; reload(); }

async function onRestore(a: TrashItem) {
  try {
    await restoreMedia(a.id);
    trashItems.value = trashItems.value.filter((x) => x.id !== a.id);
    toast.success(`Đã khôi phục "${a.name}" về kho`);
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Khôi phục thất bại');
  }
}
async function onPermanentDelete(a: TrashItem) {
  if (!window.confirm(`Xóa vĩnh viễn "${a.name}"? Sẽ KHÔNG khôi phục được nữa.\n(Lịch sử chat đã gửi không bị ảnh hưởng.)`)) return;
  try {
    await permanentDeleteMedia(a.id);
    trashItems.value = trashItems.value.filter((x) => x.id !== a.id);
    toast.success('Đã xóa vĩnh viễn khỏi kho');
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Xóa vĩnh viễn thất bại');
  }
}
async function onEmptyTrash() {
  if (trashItems.value.length === 0) return;
  if (!window.confirm(`Dọn sạch Thùng rác (${trashItems.value.length} mục)? Sẽ KHÔNG khôi phục được.\n(Lịch sử chat đã gửi không bị ảnh hưởng.)`)) return;
  try {
    const res = await emptyTrash();
    toast.success(`Đã dọn ${res.deleted} mục${res.hasMore ? ' (còn nữa, bấm lại để dọn tiếp)' : ''}`);
    loadTrash();
  } catch (e: any) {
    toast.warning(e?.response?.data?.error || 'Dọn thùng rác thất bại');
  }
}



onMounted(() => { reload(); loadFolders(); loadUploaders(); });
</script>

<style scoped>
.media-page {
  --ink:#181d26; --body:#333840; --muted:#41454d; --hairline:#dddddd;
  --canvas:#fff; --soft:#f8fafc; --strong:#e0e2e6; --coral:#aa2d00; --success:#006400;
  --r-sm:6px; --r-md:10px; --pill:9999px;
  /* Chiều cao CỐ ĐỊNH theo viewport (trừ topnav 48px) — v-main chỉ có min-height nên
     height:100% không phân giải → flex chain hỏng, cột 3 detail không cuộn được, accordion
     mở ra tràn khỏi màn (anh báo 2026-06-16). Cố định height → .p-body cuộn đúng. */
  display:flex; flex-direction:column; height:calc(100vh - var(--smax-topnav-h)); min-height:0; overflow:hidden;
  background:var(--canvas); color:var(--body); font-size:14px;
}
.m-top { display:flex; align-items:center; justify-content:space-between; padding:16px 24px 12px; border-bottom:1px solid var(--hairline); }
.m-title { font-size:20px; font-weight:400; color:var(--ink); margin:0; }
.m-tools { display:flex; gap:10px; align-items:center; }
.m-search { display:flex; align-items:center; gap:7px; border:1px solid var(--hairline); border-radius:var(--r-sm); padding:6px 12px; width:240px; }
.m-search input { border:none; outline:none; font-size:13px; width:100%; background:transparent; color:var(--body); }
.btn-dark { background:var(--ink); color:#fff; border:none; border-radius:var(--r-md); padding:8px 16px; font-size:13.5px; font-weight:500; cursor:pointer; }
/* Thứ yếu so với "+ Tải lên" nên để dạng viền, cùng khuôn .btn-trash và .btn-multi. */
.btn-folder { display:inline-flex; align-items:center; gap:6px; background:#fff; color:var(--muted); border:1px solid var(--hairline); border-radius:var(--r-md); padding:7px 13px; font-size:13px; font-weight:500; cursor:pointer; }
.btn-folder:hover:not(:disabled) { border-color:#1786be; color:#1786be; }
.btn-folder:disabled { opacity:.5; cursor:default; }
.m-tabs { display:flex; gap:2px; padding:0 24px; border-bottom:1px solid var(--hairline); }
.tab { padding:11px 16px; font-size:14px; color:var(--muted); border:none; background:none; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
.tab.on { color:var(--ink); font-weight:500; border-bottom-color:var(--ink); }
.m-filter { display:flex; align-items:center; gap:10px; padding:12px 24px; border-bottom:1px solid var(--hairline); flex-wrap:wrap; }
.crumb { color:var(--muted); font-size:13px; }
.crumb b { color:var(--ink); font-weight:500; }
.chip { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--hairline); border-radius:var(--pill); padding:4px 11px; font-size:12.5px; cursor:pointer; }
.chip.coral { background:#fbe9e2; border-color:#f0c4b3; color:var(--coral); }
.vis-toggle { margin-left:auto; display:inline-flex; border:1px solid var(--hairline); border-radius:var(--pill); overflow:hidden; font-size:12.5px; }
.vis-toggle span { padding:5px 13px; cursor:pointer; color:var(--muted); }
.vis-toggle span.on { background:var(--ink); color:#fff; }
.lvl2-btn { border:1px solid var(--hairline); background:var(--canvas); border-radius:var(--pill); padding:5px 12px; font-size:12.5px; cursor:pointer; color:var(--muted); }
.lvl2-btn.on { background:var(--ink); color:#fff; border-color:var(--ink); }
.m-lever2 { display:flex; gap:8px; align-items:center; padding:10px 24px; border-bottom:1px solid var(--hairline); flex-wrap:wrap; background:var(--soft); }
.lv2-sel { border:1px solid var(--hairline); border-radius:var(--r-sm,6px); padding:5px 10px; font-size:12.5px; color:var(--ink); background:var(--canvas); outline:none; }
.lv2-tag { border:1px solid var(--hairline); border-radius:var(--r-sm,6px); padding:5px 11px; font-size:12.5px; width:150px; outline:none; }
.thumb .play-ic { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:34px; height:34px; border-radius:9999px; background:rgba(0,0,0,.5); color:#fff; font-size:14px; display:flex; align-items:center; justify-content:center; pointer-events:none; }
.thumb .dur { position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,.7); color:#fff; border-radius:4px; padding:1px 6px; font-size:10.5px; font-variant-numeric:tabular-nums; }
.m-work { display:flex; flex:1; overflow:hidden; min-height:0; }
.m-tree { width:180px; border-right:1px solid var(--hairline); padding:14px 12px; flex-shrink:0; overflow:auto; }
.tree-ttl { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin-bottom:8px; font-weight:500; display:flex; justify-content:space-between; align-items:center; }
.addf { border:none; background:none; cursor:pointer; color:var(--ink); font-size:16px; line-height:1; }
.f { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:var(--r-sm); font-size:13px; color:var(--body); cursor:pointer; }
.f.on { background:var(--soft); color:var(--ink); font-weight:500; }
.f .lk { margin-left:auto; font-size:11px; }
/* ── Cây thư mục lồng nhau (2026-08-07) ── */
/* Mũi tên mở/gập. .tw-empty giữ đúng chỗ trống để nhãn các cấp thẳng hàng. */
.tw { width:13px; flex-shrink:0; border:none; background:none; padding:0; cursor:pointer; color:var(--muted); font-size:10px; line-height:1; text-align:left; }
.tw-empty { cursor:default; }
/* Chỉ hiện khi rê chuột lên dòng, tránh rối cây. */
.addsub { margin-left:auto; border:none; background:none; cursor:pointer; color:var(--muted); font-size:14px; line-height:1; padding:0 2px; opacity:0; }
.f:hover .addsub { opacity:1; }
.addsub:hover { color:var(--ink); }
.f .lk + .addsub { margin-left:4px; }
.m-grid-wrap { flex:1; padding:16px 24px; overflow:auto; min-width:0; }
.m-pager { display:flex; align-items:center; justify-content:center; gap:14px; padding:16px 0 4px; }
.pg-btn { border:1px solid var(--hairline); background:var(--canvas); border-radius:var(--r-sm,6px); padding:6px 14px; font-size:13px; cursor:pointer; color:var(--ink); }
.pg-btn:disabled { opacity:.4; cursor:default; }
.pg-num { font-size:12.5px; color:var(--muted,#8b93a7); font-variant-numeric:tabular-nums; white-space:nowrap; }
/* GĐ12a (HD-first 1366): cell co theo cỡ màn. 1366 ô nhỏ (sale màn nhỏ thấy nhiều ảnh
   hơn, đỡ cuộn) → 1920 vừa → 2560 ô to thoáng. minmax auto-fill giữ lưới không vỡ. */
.m-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:12px; }
@media (min-width:1600px) { .m-grid { grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:14px; } }
@media (min-width:2200px) { .m-grid { grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:16px; } }
/* Tệp hiện dạng dòng vì grid card không cho phân biệt tệp nào với tệp nào. */
.m-flist { display:flex; flex-direction:column; border:1px solid var(--hairline); border-radius:var(--r-md); overflow:hidden; background:var(--canvas); }
.frow { display:flex; align-items:center; gap:13px; padding:11px 14px; border-bottom:1px solid var(--hairline); cursor:pointer; }
.frow:last-child { border-bottom:none; }
.frow:hover { background:var(--soft); }
.frow.sel { background:#eef2fb; }
.ficon { width:46px; height:46px; flex-shrink:0; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; letter-spacing:.02em; }
.finfo { flex:1; min-width:0; }
.fname { font-size:14px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px; }
.fmeta { font-size:12px; color:var(--muted); }
.card { border:1px solid var(--hairline); border-radius:var(--r-md); overflow:hidden; cursor:pointer; background:var(--canvas); }
.card.sel { border-color:var(--ink); box-shadow:0 0 0 2px var(--ink); }
.thumb { height:108px; background:var(--strong); position:relative; display:flex; align-items:center; justify-content:center; }
.thumb img { width:100%; height:100%; object-fit:cover; }
.thumb .ph { color:var(--muted); display:flex; align-items:center; justify-content:center; }
.thumb .badge { position:absolute; top:6px; right:6px; background:rgba(24,29,38,.82); color:#fff; border-radius:var(--pill); padding:3px 6px; display:inline-flex; align-items:center; }
.meta { padding:8px 10px; }
.fn { font-size:12.5px; color:var(--ink); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.stat { font-size:11px; margin-top:3px; }
.stat.pub { color:var(--success); }
.stat.lk { color:var(--coral); }
.m-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--muted); padding:60px 20px; text-align:center; }
.empty-ic { opacity:.5; color:var(--muted); display:flex; align-items:center; justify-content:center; }
.empty-ttl { font-size:17px; color:var(--ink); font-weight:500; }
.empty-sub { font-size:13px; max-width:340px; }
.empty-hint { margin-top:10px; background:#f5e9d4; border:1px solid #e6d3ad; color:#6b5520; padding:6px 16px; border-radius:var(--pill); font-size:12px; display:inline-flex; align-items:center; gap:6px; }
.spin { width:18px; height:18px; border:2px solid var(--strong); border-top-color:var(--ink); border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }


/* Nguồn ảnh: nick nào, sale nào. */
.src { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.src span { overflow:hidden; text-overflow:ellipsis; }
.src-row { display:flex; align-items:center; gap:4px; margin-top:2px; }
.stat { display:flex; align-items:center; gap:4px; }

/* ── GĐ13a: Thùng rác ── */
.btn-trash { display:inline-flex; align-items:center; gap:6px; background:#fff; color:var(--muted); border:1px solid var(--hairline); border-radius:var(--r-md); padding:7px 13px; font-size:13px; font-weight:500; cursor:pointer; }
.btn-trash:hover { border-color:#1786be; color:#1786be; }
.btn-trash.on { background:#1786be; border-color:#1786be; color:#fff; }
.m-trash { flex:1; display:flex; flex-direction:column; padding:14px 24px; overflow:auto; min-height:0; }
.trash-bar { display:flex; align-items:center; gap:12px; padding:9px 13px; background:#fff8ec; border:1px solid #ffe3b3; border-radius:var(--r-md); margin-bottom:14px; }
.trash-ttl { display:inline-flex; align-items:center; gap:6px; font-size:13.5px; font-weight:700; color:#92400e; flex-shrink:0; }
.trash-note { font-size:11.5px; color:#7a5a1e; flex:1; line-height:1.4; }
.trash-empty { background:#fff; border:1px solid #e0a93f; color:#92400e; border-radius:var(--r-sm); padding:5px 12px; font-size:12px; font-weight:600; cursor:pointer; flex-shrink:0; }
.trash-empty:disabled { opacity:.45; cursor:default; }
.trash-close { background:none; border:none; cursor:pointer; color:#92400e; display:inline-flex; padding:3px; flex-shrink:0; }
.trash-card { cursor:default; }
.purge-badge { position:absolute; top:5px; left:5px; background:rgba(20,26,36,.72); color:#fff; font-size:10px; font-weight:600; border-radius:5px; padding:1px 6px; }
.purge-badge.soon { background:#c0392b; }
.trash-acts { display:flex; gap:5px; margin-top:4px; }
.t-restore { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:4px; background:#e4f1f8; color:#1786be; border:1px solid #cfe6f3; border-radius:var(--r-sm); padding:5px 8px; font-size:11.5px; font-weight:600; cursor:pointer; }
.t-restore:hover { background:#1786be; color:#fff; border-color:#1786be; }
.t-perm { background:#fff; color:#c0392b; border:1px solid #f0c8c2; border-radius:var(--r-sm); padding:5px 9px; cursor:pointer; display:inline-flex; align-items:center; }
.t-perm:hover { background:#c0392b; color:#fff; border-color:#c0392b; }

/* ── GĐ12: Chọn nhiều + thao tác hàng loạt ── */
.btn-multi { display:inline-flex; align-items:center; gap:6px; background:#fff; color:var(--muted); border:1px solid var(--hairline); border-radius:var(--r-md); padding:7px 13px; font-size:13px; font-weight:500; cursor:pointer; }
.btn-multi:hover { border-color:#1786be; color:#1786be; }
.btn-multi.on { background:#1786be; border-color:#1786be; color:#fff; }
.pick-tick { position:absolute; top:6px; left:6px; width:22px; height:22px; border-radius:6px; border:2px solid #fff; background:rgba(20,26,36,.35); color:#fff; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,.25); }
.pick-tick.on { background:#1786be; }
.card.picked { border-color:#1786be; box-shadow:0 0 0 2px #d4ecf7; }
.bulk-bar { display:flex; align-items:center; gap:10px; background:#e4f1f8; border:1px solid #b9ddf0; border-radius:var(--r-md); padding:9px 13px; margin-bottom:14px; }
.bulk-cnt { font-size:13px; font-weight:700; color:#0b5880; flex-shrink:0; }
.bulk-sel, .bulk-tag { border:1px solid #b9ddf0; border-radius:var(--r-sm); padding:6px 10px; font-size:12.5px; background:#fff; color:var(--ink); outline:none; }
.bulk-tag { width:150px; }
.bulk-trash { display:inline-flex; align-items:center; gap:5px; background:#fff; border:1px solid #f0c8c2; color:#c0392b; border-radius:var(--r-sm); padding:6px 11px; font-size:12.5px; font-weight:600; cursor:pointer; }
.bulk-trash:hover { background:#c0392b; color:#fff; border-color:#c0392b; }
.bulk-clear { margin-left:auto; background:none; border:none; color:#0b5880; font-size:12.5px; font-weight:600; cursor:pointer; }
</style>
