<template>
  <Teleport to="body">
    <div class="tag-modal-backdrop" @click.self="$emit('close')">
      <div class="tag-modal-container">
      <!-- Header -->
      <div class="tag-modal-header">
        <div class="tag-modal-title-group">
          <div class="tag-modal-icon-badge">
            <Tag :size="18" class="text-blue-600" />
          </div>
          <div>
            <h3 class="tag-modal-title">Quản lý thẻ nhãn khách hàng</h3>
          </div>
        </div>
        <button type="button" class="tag-modal-close-btn" @click="$emit('close')">
          <X :size="18" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="tag-modal-tabs">
        <button
          type="button"
          class="tag-tab-btn"
          :class="{ active: activeTab === 'create' }"
          @click="activeTab = 'create'"
        >
          <Plus :size="15" />
          <span>Thêm thẻ nhãn mới</span>
        </button>
        <button
          type="button"
          class="tag-tab-btn"
          :class="{ active: activeTab === 'list' }"
          @click="activeTab = 'list'"
        >
          <Settings2 :size="15" />
          <span>Danh sách & Quản lý</span>
          <span class="tag-tab-count">{{ tagList.length }}</span>
        </button>
      </div>

      <!-- Body: Tab Tạo mới -->
      <div v-if="activeTab === 'create'" class="tag-modal-body">
        <form @submit.prevent="handleCreateTag" class="tag-form">
          <!-- 2 Cột: Cột trái (Nhập liệu) & Cột phải (Xem trước trực tiếp) -->
          <div class="tag-create-top-layout">
            <!-- Cột trái: Tên thẻ, Biểu tượng, Màu sắc -->
            <div class="tag-fields-col">
              <!-- Tên thẻ -->
              <div class="tag-form-group">
                <label class="tag-form-label" for="tag-name-input">
                  <span>Tên thẻ nhãn</span>
                  <span class="required">*</span>
                </label>
                <input
                  id="tag-name-input"
                  v-model.trim="formName"
                  type="text"
                  class="tag-input"
                  placeholder="VD: Khách tiềm năng, Cần gọi lại..."
                  maxlength="40"
                  required
                  autofocus
                />
              </div>


              <!-- Chọn màu sắc -->
              <div class="tag-form-group">
                <label class="tag-form-label">
                  <span>Màu sắc nhận diện</span>
                </label>
                <div class="color-picker-row">
                  <div class="color-palette">
                    <button
                      v-for="c in COLOR_PALETTE"
                      :key="c"
                      type="button"
                      class="color-swatch"
                      :class="{ active: formColor.toLowerCase() === c.toLowerCase() }"
                      :style="{ backgroundColor: c }"
                      @click="formColor = c"
                    >
                      <Check v-if="formColor.toLowerCase() === c.toLowerCase()" :size="13" class="text-white" />
                    </button>
                  </div>
                  <div class="custom-color-input-wrapper">
                    <input
                      v-model="formColor"
                      type="color"
                      class="custom-color-input"
                      title="Chọn màu tùy chỉnh"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Cột phải: Khung xem trước chip trực tiếp -->
            <div class="tag-preview-col">
              <div class="tag-preview-header">
                <Eye :size="13" />
                <span>Xem trước</span>
              </div>
              <div class="tag-preview-canvas">
                <div
                  class="preview-chip"
                  :style="getPreviewChipStyle()"
                  :title="formName || 'Tên thẻ nhãn'"
                >
                  <span v-if="formIsPrivate" class="preview-priv-icon">🔒</span>
                  <span v-if="formEmoji" class="preview-emoji">{{ formEmoji }}</span>
                  <span class="preview-name">{{ formName || 'Tên thẻ nhãn' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Chế độ phạm vi (Gọn gàng 2 nút, không giải thích dài dòng) -->
          <div class="tag-form-group">
            <label class="tag-form-label">
              <span>Phạm vi hiển thị</span>
            </label>
            <div class="scope-segmented-control">
              <button
                type="button"
                class="scope-segment-btn"
                :class="{
                  active: !formIsPrivate,
                  disabled: !canCreatePublicTag
                }"
                :disabled="!canCreatePublicTag"
                @click="canCreatePublicTag && (formIsPrivate = false)"
              >
                <Globe :size="14" />
                <span>Công khai</span>
                <span v-if="!canCreatePublicTag" class="scope-admin-badge">Admin</span>
              </button>

              <button
                type="button"
                class="scope-segment-btn"
                :class="{ active: formIsPrivate }"
                @click="formIsPrivate = true"
              >
                <Lock :size="14" />
                <span>Riêng tư (Chỉ mình tôi)</span>
              </button>
            </div>
          </div>

          <!-- Checkbox: Gắn ngay cho khách hiện tại -->
          <div v-if="friendId" class="tag-form-group">
            <label class="checkbox-label">
              <input v-model="formAssignNow" type="checkbox" />
              <span>Gắn thẻ này ngay cho khách hàng đang mở</span>
            </label>
          </div>

          <!-- Footer hành động -->
          <div class="tag-modal-footer">
            <button type="button" class="btn btn-secondary" @click="$emit('close')">
              Đóng
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="!formName.trim() || isSubmitting"
            >
              <Loader2 v-if="isSubmitting" :size="16" class="animate-spin" />
              <Plus v-else :size="16" />
              <span>{{ isSubmitting ? 'Đang tạo...' : 'Tạo thẻ nhãn' }}</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Body: Tab Danh sách & Quản lý -->
      <div v-else class="tag-modal-body">
        <div class="tag-list-toolbar">
          <div class="tag-search-wrapper">
            <Search :size="15" class="search-icon" />
            <input
              v-model.trim="searchQuery"
              type="text"
              class="tag-search-input"
              placeholder="Tìm kiếm thẻ nhãn..."
            />
            <button v-if="searchQuery" type="button" class="clear-search-btn" @click="searchQuery = ''">
              <X :size="13" />
            </button>
          </div>

          <div class="filter-pills">
            <button
              type="button"
              class="filter-pill"
              :class="{ active: filterScope === 'all' }"
              @click="filterScope = 'all'"
            >
              Tất cả ({{ tagList.length }})
            </button>
            <button
              type="button"
              class="filter-pill"
              :class="{ active: filterScope === 'public' }"
              @click="filterScope = 'public'"
            >
              🌐 Công khai
            </button>
            <button
              type="button"
              class="filter-pill"
              :class="{ active: filterScope === 'private' }"
              @click="filterScope = 'private'"
            >
              🔒 Riêng tư
            </button>
          </div>
        </div>

        <!-- Danh sách tag cards -->
        <div v-if="loadingTags" class="tag-list-loading">
          <Loader2 :size="24" class="animate-spin text-blue-600" />
          <span>Đang tải danh sách thẻ nhãn...</span>
        </div>

        <div v-else-if="filteredTagList.length === 0" class="tag-list-empty">
          <Tag :size="32" class="text-slate-300 mb-2" />
          <p>Không tìm thấy thẻ nhãn nào phù hợp</p>
        </div>

        <div v-else class="tag-cards-container">
          <div
            v-for="tag in filteredTagList"
            :key="tag.id"
            class="tag-card"
          >
            <!-- Preview Chip -->
            <div class="tag-card-chip-col">
              <span
                class="tag-card-chip"
                :style="getTagChipStyle(tag)"
              >
                <span v-if="tag.isPrivate" class="tag-card-priv-icon">🔒</span>
                <span v-if="tag.emoji" class="tag-card-emoji">{{ tag.emoji }}</span>
                <span class="tag-card-name">{{ tag.name }}</span>
              </span>
            </div>

            <!-- Meta info: Scope & Created date -->
            <div class="tag-card-info">
              <span
                class="tag-scope-badge"
                :class="tag.isPrivate ? 'scope-private' : 'scope-public'"
              >
                {{ tag.isPrivate ? 'Riêng tư 🔒' : 'Công khai 🌐' }}
              </span>
              <span v-if="tag.source === 'zalo_real'" class="tag-source-badge">
                Zalo Sync
              </span>
            </div>

            <!-- Actions: Sửa & Xóa -->
            <div class="tag-card-actions">
              <button
                v-if="canManageTag(tag)"
                type="button"
                class="action-btn edit-btn"
                title="Chỉnh sửa thẻ nhãn"
                @click="startEditTag(tag)"
              >
                <Pencil :size="14" />
              </button>
              <button
                v-if="canManageTag(tag)"
                type="button"
                class="action-btn delete-btn"
                title="Xóa thẻ nhãn"
                :disabled="deletingTagId === tag.id"
                @click="confirmDeleteTag(tag)"
              >
                <Loader2 v-if="deletingTagId === tag.id" :size="14" class="animate-spin" />
                <Trash2 v-else :size="14" />
              </button>
              <span v-else class="action-disabled-note" title="Bạn không có quyền sửa/xóa thẻ này">
                Cố định
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Inline Edit Dialog nếu đang sửa 1 tag -->
      <div v-if="editingTag" class="tag-edit-overlay" @click.self="editingTag = null">
        <div class="tag-edit-dialog">
          <div class="tag-edit-head">
            <h4>Chỉnh sửa thẻ nhãn</h4>
            <button type="button" class="tag-edit-close" @click="editingTag = null">
              <X :size="16" />
            </button>
          </div>
          <form @submit.prevent="handleSaveEdit" class="tag-edit-body">
            <div class="tag-form-group">
              <label class="tag-form-label">Tên thẻ nhãn</label>
              <input
                v-model.trim="editName"
                type="text"
                class="tag-input"
                maxlength="40"
                required
              />
            </div>
            <div class="tag-form-group">
              <label class="tag-form-label">Màu sắc</label>
              <div class="color-palette">
                <button
                  v-for="c in COLOR_PALETTE"
                  :key="c"
                  type="button"
                  class="color-swatch"
                  :class="{ active: editColor.toLowerCase() === c.toLowerCase() }"
                  :style="{ backgroundColor: c }"
                  @click="editColor = c"
                >
                  <Check v-if="editColor.toLowerCase() === c.toLowerCase()" :size="13" class="text-white" />
                </button>
              </div>
            </div>
            <div class="tag-edit-foot">
              <button type="button" class="btn btn-secondary" @click="editingTag = null">Huỷ</button>
              <button type="submit" class="btn btn-primary" :disabled="!editName.trim() || isSavingEdit">
                {{ isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Tag,
  X,
  Plus,
  Settings2,
  Check,
  Globe,
  Lock,
  Eye,
  Search,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-vue-next';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';

export interface TagV2 {
  id: string;
  name: string;
  slug: string;
  color: string;
  emoji: string | null;
  scope: 'friend' | 'crm';
  source: string;
  priority: number;
  isPrivate?: boolean;
  createdById?: string | null;
}

const props = defineProps<{
  friendId?: string | null;
  contactId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created', tag: TagV2, assignNow: boolean): void;
  (e: 'updated', tag: TagV2): void;
  (e: 'deleted', tagId: string): void;
}>();

const authStore = useAuthStore();
const toast = useToast();

const activeTab = ref<'create' | 'list'>('create');

// ── Palette màu sắc ─────────────────────────────────────────────────────────────
const COLOR_PALETTE = [
  '#16A34A', // Xanh lá cây (Emerald)
  '#0068FF', // Xanh dương Zalo
  '#DC2626', // Đỏ nổi bật (Rose red)
  '#D97706', // Vàng cam ấm (Amber)
  '#EA580C', // Cam đất (Orange)
  '#9333EA', // Tím (Purple)
  '#C026D3', // Hồng tím (Fuchsia)
  '#0D9488', // Xanh mòng két (Teal)
  '#475569', // Xám than (Slate)
  '#1E293B', // Đen thanh lịch
];


// ── Form State (Tạo mới) ────────────────────────────────────────────────────────
const formName = ref('');
const formEmoji = ref('');
const formColor = ref(COLOR_PALETTE[0]);
// Phân quyền: Sale chỉ được tạo Thẻ Riêng Tư; Admin/Quản lý có thể chọn Công Khai
const canCreatePublicTag = computed(() => {
  return authStore.isAdmin || authStore.isManager || authStore.isOwner;
});
const formIsPrivate = ref(!canCreatePublicTag.value);
const formAssignNow = ref(Boolean(props.friendId));
const isSubmitting = ref(false);

// ── List & Manage State ─────────────────────────────────────────────────────────
const tagList = ref<TagV2[]>([]);
const loadingTags = ref(false);
const searchQuery = ref('');
const filterScope = ref<'all' | 'public' | 'private'>('all');
const deletingTagId = ref<string | null>(null);

// Edit inline
const editingTag = ref<TagV2 | null>(null);
const editName = ref('');
const editEmoji = ref('');
const editColor = ref('');
const isSavingEdit = ref(false);

// ── Permissions ─────────────────────────────────────────────────────────────────
function canManageTag(tag: TagV2): boolean {
  if (authStore.isAdmin || authStore.isOwner) return true;
  // Sale chỉ sửa/xóa được thẻ riêng tư do mình tạo
  if (tag.isPrivate && tag.createdById === authStore.user?.id) return true;
  return false;
}

// ── Load Tag List ───────────────────────────────────────────────────────────────
async function fetchTagList() {
  loadingTags.value = true;
  try {
    const { data } = await api.get('/tags', {
      params: { scope: 'friend', source: 'manual_per_nick', limit: 200 },
    });
    tagList.value = (data.tags || []).filter((t: TagV2) => t.source === 'manual_per_nick');
  } catch (err) {
    console.warn('[TagCrmManageModal] fetchTagList error', err);
  } finally {
    loadingTags.value = false;
  }
}

onMounted(() => {
  fetchTagList();
});

// ── Filtered List ───────────────────────────────────────────────────────────────
const filteredTagList = computed(() => {
  return tagList.value.filter((tag) => {
    // Filter scope
    if (filterScope.value === 'public' && tag.isPrivate) return false;
    if (filterScope.value === 'private' && !tag.isPrivate) return false;

    // Filter search query
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      const matchName = tag.name.toLowerCase().includes(q);
      const matchSlug = tag.slug.toLowerCase().includes(q);
      if (!matchName && !matchSlug) return false;
    }
    return true;
  });
});

// ── Helpers Chip Style ──────────────────────────────────────────────────────────
function hexToRgb(hexColor: string): { r: number; g: number; b: number } {
  let hex = (hexColor || '#0068FF').replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((char) => char + char).join('');
  }
  if (hex.length !== 6) return { r: 0, g: 104, b: 255 };
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return isNaN(r) || isNaN(g) || isNaN(b) ? { r: 0, g: 104, b: 255 } : { r, g, b };
}

function getPreviewChipStyle() {
  const color = formColor.value || '#0068FF';
  const { r, g, b } = hexToRgb(color);
  return {
    borderColor: color,
    color: color,
    background: `rgba(${r}, ${g}, ${b}, 0.12)`,
  };
}

function getTagChipStyle(tag: TagV2) {
  const color = tag.color || '#0068FF';
  const { r, g, b } = hexToRgb(color);
  return {
    borderColor: color,
    color: color,
    background: `rgba(${r}, ${g}, ${b}, 0.12)`,
  };
}

// ── Action: Tạo thẻ mới ─────────────────────────────────────────────────────────
async function handleCreateTag() {
  if (!formName.value.trim() || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    const { data } = await api.post('/tags', {
      name: formName.value.trim(),
      scope: 'friend',
      source: 'manual_per_nick',
      color: formColor.value,
      emoji: formEmoji.value || null,
      isPrivate: formIsPrivate.value,
    });

    const createdTag = data.tag as TagV2;
    toast.success(
      createdTag.isPrivate
        ? 'Đã tạo thẻ nhãn riêng tư mới'
        : 'Đã tạo thẻ nhãn công khai mới'
    );

    emit('created', createdTag, formAssignNow.value);

    // Reset form
    formName.value = '';
    formEmoji.value = '';
    formColor.value = COLOR_PALETTE[0];
    await fetchTagList();
    emit('close');
  } catch (err: any) {
    const errMsg = err?.response?.data?.message || err?.response?.data?.error || 'Tạo thẻ nhãn thất bại';
    toast.error(errMsg);
  } finally {
    isSubmitting.value = false;
  }
}

// ── Action: Chỉnh sửa thẻ ───────────────────────────────────────────────────────
function startEditTag(tag: TagV2) {
  editingTag.value = tag;
  editName.value = tag.name;
  editEmoji.value = tag.emoji || '';
  editColor.value = tag.color || COLOR_PALETTE[0];
}

async function handleSaveEdit() {
  if (!editingTag.value || !editName.value.trim() || isSavingEdit.value) return;

  isSavingEdit.value = true;
  try {
    const { data } = await api.patch(`/tags/${editingTag.value.id}`, {
      name: editName.value.trim(),
      emoji: editEmoji.value || null,
      color: editColor.value,
    });

    toast.success('Cập nhật thẻ nhãn thành công');
    emit('updated', data.tag);
    editingTag.value = null;
    await fetchTagList();
  } catch (err: any) {
    const errMsg = err?.response?.data?.message || err?.response?.data?.error || 'Cập nhật thất bại';
    toast.error(errMsg);
  } finally {
    isSavingEdit.value = false;
  }
}

// ── Action: Xóa thẻ ─────────────────────────────────────────────────────────────
async function confirmDeleteTag(tag: TagV2) {
  const confirmMsg = tag.isPrivate
    ? `Bạn có chắc muốn xóa thẻ riêng tư "${tag.name}"?`
    : `Bạn có chắc muốn xóa thẻ công khai "${tag.name}"? Mọi nhân viên sẽ không còn thấy thẻ này.`;

  if (!window.confirm(confirmMsg)) return;

  deletingTagId.value = tag.id;
  try {
    await api.delete(`/tags/${tag.id}`);
    toast.success(`Đã xóa thẻ nhãn "${tag.name}"`);
    tagList.value = tagList.value.filter((t) => t.id !== tag.id);
    emit('deleted', tag.id);
  } catch (err: any) {
    const errMsg = err?.response?.data?.message || err?.response?.data?.error || 'Xóa thẻ thất bại';
    toast.error(errMsg);
  } finally {
    deletingTagId.value = null;
  }
}
</script>

<style scoped>
.tag-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  padding: 16px;
  animation: fadeIn 0.18s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tag-modal-container {
  width: 100%;
  max-width: 620px;
  max-height: 88vh;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  z-index: 100000;
}

@keyframes slideUp {
  from { transform: translateY(12px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

/* Header */
.tag-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.tag-modal-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tag-modal-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #eff6ff;
  color: #0068ff;
  flex-shrink: 0;
}

.tag-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.tag-modal-subtitle {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: #64748b;
}

.tag-modal-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tag-modal-close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

/* Tabs */
.tag-modal-tabs {
  display: flex;
  padding: 0 20px;
  border-bottom: 1px solid #f1f5f9;
  background: #fafbfc;
  gap: 8px;
}

.tag-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 12px 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 13.5px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tag-tab-btn:hover {
  color: #0068ff;
}

.tag-tab-btn.active {
  color: #0068ff;
  border-bottom-color: #0068ff;
  font-weight: 600;
  background: #ffffff;
}

.tag-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  background: #e2e8f0;
  color: #334155;
}

.tag-tab-btn.active .tag-tab-count {
  background: #eff6ff;
  color: #0068ff;
}

/* Body */
.tag-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 20px;
  max-height: calc(88vh - 120px);
}

.tag-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tag-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tag-form-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 4px;
}

.required {
  color: #ef4444;
}

.optional {
  font-size: 11.5px;
  color: #94a3b8;
  font-weight: normal;
}

.tag-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 13.5px;
  color: #0f172a;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.tag-input:focus {
  border-color: #0068ff;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.12);
}


/* Colors */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-palette {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease;
  outline: none;
}

.color-swatch:hover {
  transform: scale(1.15);
}

.color-swatch.active {
  box-shadow: 0 0 0 2.5px #0068ff;
  transform: scale(1.1);
}

.custom-color-input-wrapper {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0 0 1px #cbd5e1;
  cursor: pointer;
  flex-shrink: 0;
}

.custom-color-input {
  position: absolute;
  top: -8px;
  left: -8px;
  width: 44px;
  height: 44px;
  border: none;
  cursor: pointer;
}

/* 2-Column Top Layout */
.tag-create-top-layout {
  display: grid;
  grid-template-columns: 1fr 190px;
  gap: 16px;
  align-items: stretch;
}

.tag-fields-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.tag-preview-col {
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 10px;
  box-sizing: border-box;
  align-items: stretch;
}

.tag-preview-header {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 8px;
}

.tag-preview-canvas {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 6px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  min-height: 110px;
}

/* Segmented Scope Selector */
.scope-segmented-control {
  display: flex;
  gap: 8px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 10px;
}

.scope-segment-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 12.5px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.scope-segment-btn:hover:not(.disabled) {
  color: #0f172a;
}

.scope-segment-btn.active {
  background: #ffffff;
  color: #0068ff;
  font-weight: 600;
  border-color: rgba(0, 104, 255, 0.15);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.scope-segment-btn.disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: transparent;
}

.scope-admin-badge {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: #e2e8f0;
  color: #64748b;
  text-transform: uppercase;
}

/* Checkbox */
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  cursor: pointer;
  user-select: none;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 600;
  border: 1.5px solid;
  max-width: 160px;
  box-sizing: border-box;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.15s ease;
}

.preview-priv-icon {
  font-size: 12px;
}

.preview-emoji {
  font-size: 13px;
}

.preview-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .tag-create-top-layout {
    grid-template-columns: 1fr;
  }
}

/* Modal Footer */
.tag-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  outline: none;
}

.btn-secondary {
  background: #f1f5f9;
  color: #475569;
}

.btn-secondary:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.btn-primary {
  background: #0068ff;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: #0056d6;
  box-shadow: 0 4px 12px rgba(0, 104, 255, 0.25);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Tab Danh Sách ── */
.tag-list-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.tag-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: #94a3b8;
  pointer-events: none;
}

.tag-search-input {
  width: 100%;
  padding: 8px 30px 8px 32px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  outline: none;
}

.tag-search-input:focus {
  border-color: #0068ff;
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.filter-pills {
  display: flex;
  gap: 6px;
}

.filter-pill {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.12s ease;
}

.filter-pill:hover {
  background: #e2e8f0;
}

.filter-pill.active {
  background: #eff6ff;
  color: #0068ff;
  border-color: #bfdbfe;
  font-weight: 600;
}

.tag-list-loading,
.tag-list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  color: #64748b;
  font-size: 13px;
}

.tag-cards-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}

.tag-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  background: #ffffff;
  transition: all 0.12s ease;
}

.tag-card:hover {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.tag-card-chip-col {
  flex: 1;
  min-width: 0;
}

.tag-card-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  border: 1.5px solid;
  white-space: nowrap;
}

.tag-card-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px;
  flex-shrink: 0;
}

.tag-scope-badge {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.tag-scope-badge.scope-public {
  background: #ecfdf5;
  color: #059669;
}

.tag-scope-badge.scope-private {
  background: #fef3c7;
  color: #b45309;
}

.tag-source-badge {
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11px;
  background: #eff6ff;
  color: #0068ff;
  font-weight: 500;
}

.tag-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.12s ease;
}

.edit-btn {
  color: #475569;
}

.edit-btn:hover {
  background: #e2e8f0;
  color: #0068ff;
}

.delete-btn {
  color: #ef4444;
}

.delete-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

.action-disabled-note {
  font-size: 11px;
  color: #94a3b8;
  padding: 2px 6px;
}

/* ── Inline Edit Dialog ── */
.tag-edit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 10;
}

.tag-edit-dialog {
  width: 100%;
  max-width: 420px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.tag-edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.tag-edit-head h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.tag-edit-close {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
}

.tag-edit-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-edit-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 10px;
}
</style>
