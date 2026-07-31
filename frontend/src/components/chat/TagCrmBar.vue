<template>
  <div class="tag-crm-bar" v-if="friendId">
    <div class="qt-chips-wrapper">
      <button
        v-for="tag in displayTags"
        :key="tag.slug"
        type="button"
        class="qt-chip"
        :class="{ active: activeTagSlugs.has(tag.slug) }"
        :style="getChipStyle(tag, activeTagSlugs.has(tag.slug))"
        :title="activeTagSlugs.has(tag.slug) ? `Nhấp để gỡ nhãn '${tag.name}'` : `Nhấp để gắn nhãn '${tag.name}'`"
        :disabled="pendingSlugs.has(tag.slug)"
        @click="toggleTag(tag)"
      >
        <span v-if="tag.emoji" class="qt-chip-emoji">{{ tag.emoji }}</span>
        <span class="qt-chip-name">{{ tag.name }}</span>
      </button>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

import { api } from '@/api/index';

import { useToast } from '@/composables/use-toast';
import { useFriendSocket } from '@/composables/use-friend-socket';
import { refreshTagTaxonomy } from '@/composables/use-tag-taxonomy';

interface TagV2 {
  id: string;
  name: string;
  slug: string;
  color: string;
  emoji: string | null;
  scope: 'friend' | 'crm';
  source: string;
  priority: number;
}

interface FriendTagAssignment {
  id: string;
  tag: TagV2;
  addedAt: string;
  removedAt: string | null;
}

const props = defineProps<{
  friendId: string | null;
  contactId?: string | null;
}>();

const toast = useToast();


// ── UI Source of Truth ────────────────────────────────────────────────────────
// activeTagSlugs: Set slug của các tag ĐANG ACTIVE cho friend hiện tại.
// Đây là state duy nhất quyết định màu chip — không bao giờ bị reset giữa 2 toggle.
const activeTagSlugs = ref<Set<string>>(new Set());

// pendingSlugs: slug đang chờ API → disable chip để tránh double-click
const pendingSlugs = ref<Set<string>>(new Set());

// Cache assignments để lấy real tag ID khi DELETE (tránh gọi thêm GET)
const cachedAssignments = ref<FriendTagAssignment[]>([]);

// Dữ liệu tag definitions (chỉ dùng cho displayTags, không ảnh hưởng active state)
const manualTagDefs = ref<TagV2[]>([]);

// ── Preset Tags (fallback nếu DB trống) ─────────────────────────────────────
const DEFAULT_PRESET_TAGS: Array<TagV2> = [
  { id: 'p1',  name: 'Đã lưu thông tin',    slug: 'da-luu-thong-tin',    color: '#16A34A', emoji: '📞', scope: 'friend', source: 'manual_per_nick', priority: 1  },
  { id: 'p2',  name: 'Cần hỗ trợ gấp',      slug: 'can-ho-tro-gap',      color: '#DC2626', emoji: '⚡', scope: 'friend', source: 'manual_per_nick', priority: 2  },
  { id: 'p3',  name: 'Đã lên đơn hàng',     slug: 'da-len-don-hang',     color: '#16A34A', emoji: '🛒', scope: 'friend', source: 'manual_per_nick', priority: 3  },
  { id: 'p4',  name: 'workshop',             slug: 'workshop',            color: '#C026D3', emoji: '👥', scope: 'friend', source: 'manual_per_nick', priority: 4  },
  { id: 'p5',  name: 'NHÓM KHÁCH HÀNG',     slug: 'nhom-khach-hang',     color: '#DC2626', emoji: '👥', scope: 'friend', source: 'manual_per_nick', priority: 5  },
  { id: 'p6',  name: 'Nhóm Cộng Đồng',      slug: 'nhom-cong-dong',      color: '#D97706', emoji: '👥', scope: 'friend', source: 'manual_per_nick', priority: 6  },
  { id: 'p7',  name: 'Admin Test',           slug: 'admin-test',          color: '#1E293B', emoji: '✖', scope: 'friend', source: 'manual_per_nick', priority: 7  },
  { id: 'p8',  name: 'Bám đuổi thất bại',   slug: 'bam-duoi-that-bai',   color: '#D97706', emoji: null, scope: 'friend', source: 'manual_per_nick', priority: 8  },
  { id: 'p9',  name: 'Bám đuổi thành công', slug: 'bam-duoi-thanh-cong', color: '#16A34A', emoji: null, scope: 'friend', source: 'manual_per_nick', priority: 9  },
  { id: 'p10', name: 'Hỏi sp - giá',        slug: 'hoi-sp-gia',          color: '#DC2626', emoji: null, scope: 'friend', source: 'manual_per_nick', priority: 10 },
  { id: 'p11', name: 'Đã đặt hàng',         slug: 'da-dat-hang',         color: '#EA580C', emoji: '🛒', scope: 'friend', source: 'manual_per_nick', priority: 11 },
];

// displayTags: LUÔN hiển thị đủ danh sách, dù active state thay đổi.
// Ưu tiên tags từ DB; nếu DB chưa có thì dùng preset.
// Merge: preset tags mà có slug trùng DB → dùng DB version (có real ID) nhưng giữ màu/emoji preset để tránh bị chuyển thành màu xám mặc định của DB.
const displayTags = computed((): TagV2[] => {
  const presetsMap = new Map(DEFAULT_PRESET_TAGS.map(t => [t.slug, t]));
  if (manualTagDefs.value.length === 0) return DEFAULT_PRESET_TAGS;

  const mergedDefs = manualTagDefs.value.map(dbTag => {
    const preset = presetsMap.get(dbTag.slug);
    if (preset) {
      // Nếu màu DB là mặc định (gray) hoặc rỗng, dùng màu của preset
      const usePresetColor = !dbTag.color ||
        dbTag.color.toLowerCase() === '#94a3b8' ||
        dbTag.color.toLowerCase() === '#cbd5e1' ||
        dbTag.color.toLowerCase() === '#64748b' ||
        dbTag.color.toLowerCase() === '#e2e8f0' ||
        dbTag.color.toLowerCase() === '#90a4ae';
      return {
        ...dbTag,
        color: usePresetColor ? preset.color : dbTag.color,
        emoji: dbTag.emoji || preset.emoji
      };
    }
    return dbTag;
  });

  const dbSlugs = new Set(mergedDefs.map((t) => t.slug));
  const extras = DEFAULT_PRESET_TAGS.filter((t) => !dbSlugs.has(t.slug));
  return [...mergedDefs, ...extras].sort((a, b) => (a.priority || 99) - (b.priority || 99));
});

// Helper parse hex màu an toàn tránh NaN
function hexToRgb(hexColor: string): { r: number; g: number; b: number } {
  let hex = (hexColor || '#0068FF').replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  if (hex.length !== 6) {
    return { r: 0, g: 104, b: 255 }; // Default blue fallback
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return isNaN(r) || isNaN(g) || isNaN(b) ? { r: 0, g: 104, b: 255 } : { r, g, b };
}

// ── Chip Style ────────────────────────────────────────────────────────────────
// Active   → nền đặc màu tag, chữ trắng
// Inactive → nền tint nhẹ (10% opacity), viền + chữ cùng màu tag
function getChipStyle(tag: TagV2, active: boolean) {
  const color = tag.color || '#0068FF';
  if (active) {
    return {
      '--chip-color': color,
      background: color,
      borderColor: color,
      color: '#ffffff',
      fontWeight: '700',
    };
  }
  const { r, g, b } = hexToRgb(color);
  return {
    '--chip-color': color,
    background: `rgba(${r}, ${g}, ${b}, 0.10)`,
    borderColor: color,
    color: color,
    fontWeight: '500',
  };
}

// ── Load từ server ─────────────────────────────────────────────────────────────
// Chỉ gọi khi mount / chuyển friend / socket event.
// KHÔNG gọi trong toggleTag để tránh ghi đè optimistic state.
async function loadFriendTags() {
  if (!props.friendId) return;
  try {
    const { data } = await api.get(`/friends/${props.friendId}/tags`);
    const assignments: FriendTagAssignment[] = data.friendTags || [];
    cachedAssignments.value = assignments;
    // Set thẳng từ server — loadFriendTags chỉ được gọi sau khi finally xóa pending slug
    activeTagSlugs.value = new Set(
      assignments.filter((ft) => !ft.removedAt).map((ft) => ft.tag.slug)
    );
  } catch (err) {
    console.warn('[TagCrmBar] loadFriendTags failed', err);
  }
}

// ── Load tag definitions (không ảnh hưởng active state) ──────────────────────
let fetchedDefsOnce = false;
async function loadManualTagDefs() {
  if (fetchedDefsOnce) return;
  try {
    const { data } = await api.get('/tags', { params: { scope: 'friend', source: 'manual_per_nick', limit: 200 } });
    const fetched = (data.tags || []).filter((t: TagV2) => t.source === 'manual_per_nick');
    if (fetched.length > 0) manualTagDefs.value = fetched;
    fetchedDefsOnce = true;
  } catch (err) {
    console.warn('[TagCrmBar] loadManualTagDefs failed', err);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  loadFriendTags();
  loadManualTagDefs();
});

watch(() => props.friendId, () => {
  // Reset khi chuyển sang friend khác
  activeTagSlugs.value = new Set();
  pendingSlugs.value = new Set();
  loadFriendTags();
});

useFriendSocket((p) => {
  if (!props.friendId || p.friendId !== props.friendId) return;
  if (p.patch && 'zaloLabels' in p.patch) loadFriendTags();
});

// ── Notify ────────────────────────────────────────────────────────────────────
function notifyTimeline() {
  if (props.contactId) {
    window.dispatchEvent(new CustomEvent('timeline-updated', { detail: { contactId: props.contactId } }));
  }
}

function notifyConvListTags() {
  if (!props.friendId) return;
  window.dispatchEvent(new CustomEvent('friend-crm-tags-changed', {
    detail: { friendId: props.friendId, slugs: [...activeTagSlugs.value] },
  }));
}

// ── Toggle Handler ─────────────────────────────────────────────────────────────
// Nguyên tắc:
//   1. Cập nhật activeTagSlugs NGAY LẬP TỨC (UI không chờ API)
//   2. API call chạy ngầm — KHÔNG gọi loadFriendTags() sau khi xong
//      vì optimistic update đã đúng; gọi loadFriendTags sẽ ghi đè pendingSlugs sai
//   3. Chỉ rollback đúng 1 slug nếu API thất bại
async function toggleTag(tag: TagV2) {
  if (!props.friendId || pendingSlugs.value.has(tag.slug)) return;

  const wasActive = activeTagSlugs.value.has(tag.slug);

  // ① Instant UI update (optimistic)
  const nextSlugs = new Set(activeTagSlugs.value);
  if (wasActive) nextSlugs.delete(tag.slug);
  else nextSlugs.add(tag.slug);
  activeTagSlugs.value = nextSlugs;

  // ② Đánh dấu pending (disable chip trong lúc chờ)
  pendingSlugs.value = new Set([...pendingSlugs.value, tag.slug]);

  let apiError = false;
  try {
    if (wasActive) {
      // Lấy real tag ID từ cache assignments (không cần gọi GET thêm)
      const existing = cachedAssignments.value.find(
        (ft) => !ft.removedAt &&
          (ft.tag.slug === tag.slug || ft.tag.name.toLowerCase() === tag.name.toLowerCase())
      );
      if (existing?.tag.id) {
        await api.delete(`/friends/${props.friendId}/tags/${existing.tag.id}`);
      } else {
        // Fallback: fetch assignments nếu cache chưa có
        const { data } = await api.get(`/friends/${props.friendId}/tags`);
        const fallback = (data.friendTags as FriendTagAssignment[] || []).find(
          (ft) => !ft.removedAt &&
            (ft.tag.slug === tag.slug || ft.tag.name.toLowerCase() === tag.name.toLowerCase())
        );
        if (fallback?.tag.id) {
          await api.delete(`/friends/${props.friendId}/tags/${fallback.tag.id}`);
        }
      }
    } else {
      const isPreset = tag.id.startsWith('p');
      const { data: postData } = await api.post(`/friends/${props.friendId}/tags`, {
        tagId: isPreset ? undefined : tag.id,
        tagName: tag.name,
        source: 'manual_per_nick',
        autoCreate: true,
        color: tag.color,
        emoji: tag.emoji,
      });
      // Cập nhật cache với assignment mới trả về
      if (postData?.assignment) {
        cachedAssignments.value = [...cachedAssignments.value, postData.assignment];
      }
      if (isPreset) {
        fetchedDefsOnce = false;
        loadManualTagDefs();
        refreshTagTaxonomy();
      }
    }
    notifyTimeline();
    notifyConvListTags();
  } catch (err) {
    apiError = true;
    // Rollback chỉ slug này — tag khác không bị ảnh hưởng
    const rollback = new Set(activeTagSlugs.value);
    if (wasActive) rollback.add(tag.slug);
    else rollback.delete(tag.slug);
    activeTagSlugs.value = rollback;
    toast.error(wasActive ? 'Gỡ tag thất bại' : 'Gắn tag thất bại');
    console.error('[TagCrmBar] toggleTag error', err);
  } finally {
    // Xóa pending slug
    const done = new Set(pendingSlugs.value);
    done.delete(tag.slug);
    pendingSlugs.value = done;
    // Nếu thành công → sync nhẹ để cập nhật cachedAssignments
    if (!apiError) {
      loadFriendTags();
    }
  }
}


</script>

<style scoped>
.tag-crm-bar {
  padding: 6px 10px 8px;
  background: #ffffff;
  border-bottom: 1px solid #e8eef5;
  box-sizing: border-box;
}

.qt-chips-wrapper {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 0;
}

.qt-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 9999px;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
  user-select: none;
  border: 1.5px solid var(--chip-color, #0068FF);
  outline: none;
}

.qt-chip:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.qt-chip:not(:disabled):active {
  transform: translateY(0);
}

/* Chip đang chờ API → mờ đi một chút */
.qt-chip:disabled {
  opacity: 0.65;
  cursor: wait;
}

.qt-chip-emoji {
  font-size: 13px;
  line-height: 1;
}

.qt-chip-name {
  line-height: 1.2;
}

.qt-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1.5px dashed #94a3b8;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: 2px;
  transition: all 0.15s ease;
}

.qt-add-btn:hover {
  background: #f1f5f9;
  color: #0068ff;
  border-color: #0068ff;
}
</style>
