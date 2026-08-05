<!--
  AppointmentEditor.vue — 1 modal duy nhất cho create + edit "Nhắc hẹn".

  Replace AppointmentQuickCreate.vue cũ (sẽ delete sau khi shipping).

  9 sections theo mockup:
    1. Header
    2. Tiêu đề (font 500, default = tên KH)
    3. KH autocomplete (nếu không có context KH)
    4. Ngày + Giờ (2 cols, custom pickers)
    5. Quick time chips (Sáng/Trưa/Chiều/Tối — random + re-roll)
    6. Duration grid (5p → 3 ngày, default 15p, compute endAt)
    7. Loại (4 icon chips: Gọi điện/Nhắn tin/Gặp mặt/Theo dõi)
    8. Địa điểm (input + 5 preset chips + smart suggest từ tiêu đề)
    9. Ghi chú (textarea optional)
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="editor-backdrop" @click.self="close">
      <div class="editor airtable-scope" @keydown.escape="close" @keydown.ctrl.enter="submit" tabindex="-1">
        <!-- ─── Header ─── -->
        <div class="editor-head">
          <h2><v-icon size="19" class="head-ic">mdi-calendar-clock</v-icon> {{ isEdit ? 'Sửa nhắc hẹn' : 'Tạo nhắc hẹn' }}</h2>
          <button class="close" @click="close" title="Đóng (Esc)"><v-icon size="18">mdi-close</v-icon></button>
        </div>

        <!-- ─── Body ─── -->
        <div class="editor-body">
          <!-- 1. Tiêu đề — ô duy nhất để đặt tên lịch hẹn (2026-08-04: bỏ hẳn
               trường "Loại nhắc hẹn"). -->
          <div class="field">
            <div class="title-input-wrap">
              <span class="ic"><v-icon size="16">{{ titleIcon }}</v-icon></span>
              <input
                ref="titleInputRef"
                v-model="form.title"
                class="title-input"
                type="text"
                :placeholder="titlePlaceholder"
              />
            </div>
          </div>

          <!-- 2. Phân loại lịch hẹn — dropdown preset + nút (+) tự thêm loại mới -->
          <div class="field">
            <span class="field-label">Phân loại lịch hẹn</span>
            <div class="cat-row">
              <select v-model="form.type" class="plain-select">
                <option :value="null">— Chưa phân loại —</option>
                <option v-for="c in categoryOptions" :key="c.value" :value="c.value">{{ c.text }}</option>
              </select>
              <button
                type="button"
                class="cat-add"
                title="Thêm phân loại mới"
                @click="startAddCategory"
              ><v-icon size="18">mdi-plus</v-icon></button>
            </div>

            <div v-if="addingCategory" class="cat-new">
              <input
                ref="catInputRef"
                v-model="newCategory"
                class="cat-new-input"
                type="text"
                placeholder="Tên phân loại mới"
                @keydown.enter.prevent="commitNewCategory"
                @keydown.esc.stop="cancelAddCategory"
              />
              <button type="button" class="cat-new-ok" :disabled="!canAddCategory" @click="commitNewCategory">Thêm</button>
              <button type="button" class="cat-new-cancel" @click="cancelAddCategory">Huỷ</button>
            </div>

            <div v-if="customCategories.length" class="cat-custom-list">
              <span v-for="c in customCategories" :key="c" class="cat-tag">
                {{ c }}
                <button type="button" title="Xoá phân loại này" @click="removeCategory(c)">
                  <v-icon size="11">mdi-close</v-icon>
                </button>
              </span>
            </div>
          </div>

          <!-- 1.5. Liên kết KH (1 col — bỏ "Sale phụ trách" 2026-08-04: sale chỉ
               tạo lịch cho chính mình, người tạo = người phụ trách) -->
          <div class="row-1">
            <!-- KH -->
            <div class="field">
              <span class="field-label">Liên kết khách hàng</span>
              <!-- Linked KH — 2 dòng: tên (lớn) + SĐT (phụ nhỏ), avatar load img thật nếu có -->
              <div v-if="selectedContact" class="linked-kh-row">
                <span
                  class="av"
                  :style="!selectedContact.avatarUrl ? { background: contactColor(selectedContact.id) } : {}"
                >
                  <img v-if="selectedContact.avatarUrl" :src="selectedContact.avatarUrl" alt="" @error="onAvatarError" />
                  <template v-else>{{ initials(selectedContact.fullName) }}</template>
                </span>
                <div class="linked-info">
                  <span class="name">{{ selectedContact.fullName || 'Khách hàng' }}</span>
                  <span v-if="selectedContact.phone" class="phone-row">{{ formatPhoneVN(selectedContact.phone) }}</span>
                  <span v-else-if="selectedContact.zaloUsername" class="phone-row muted">{{ selectedContact.zaloUsername }}</span>
                </div>
                <button type="button" class="remove" @click="clearContact" title="Bỏ link KH"><v-icon size="13">mdi-close</v-icon></button>
              </div>
              <!-- KH autocomplete dropdown — autofocus search ngay khi mở -->
              <div v-else-if="custSuggestOpen" class="cust-suggest">
                <input
                  ref="custSearchInputRef"
                  v-model="custQuery"
                  class="cust-suggest-search"
                  type="text"
                  placeholder="Tìm tên / SĐT / tên gợi nhớ..."
                  autocomplete="off"
                  @input="onCustSearch"
                />
                <div v-if="custSearching" class="cust-loading">Đang tìm...</div>
                <div
                  v-for="c in custSuggestions"
                  :key="c.id"
                  class="cust-item"
                  @mousedown.prevent="pickContact(c)"
                >
                  <span class="av" :style="!c.avatarUrl ? { background: contactColor(c.id) } : {}">
                    <img v-if="c.avatarUrl" :src="c.avatarUrl" alt="" @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }" />
                    <template v-else>{{ initials(c.fullName) }}</template>
                  </span>
                  <div class="cust-info-1line">
                    <span class="name">{{ c.fullName || 'Khách hàng' }}</span>
                    <span v-if="c.phone" class="sep">·</span>
                    <span v-if="c.phone" class="phone">{{ formatPhoneVN(c.phone) }}</span>
                    <span v-if="c.zaloUsername" class="nick">({{ c.zaloUsername }})</span>
                  </div>
                </div>
                <div v-if="!custSearching && custQuery && custSuggestions.length === 0" class="cust-empty">
                  Không tìm thấy KH "{{ custQuery }}"
                </div>
                <div class="cust-item skip" @mousedown.prevent="dismissCustSuggest">
                  → Không gắn khách
                </div>
              </div>
              <button v-else type="button" class="link-kh-btn" @click="openCustSuggest">
                + Liên kết khách hàng
              </button>
            </div>
          </div>

          <!-- 2. Ngày + Giờ (2 cols) -->
          <div class="row-2">
            <div class="field">
              <span class="field-label">Ngày</span>
              <button ref="dateBtnRef" class="picker-display" :class="{ open: openDatePicker }" @click="toggleDatePicker">
                <span class="ic"><v-icon size="16">mdi-calendar-outline</v-icon></span>
                <span class="val">{{ dateLabel }}</span>
                <span class="caret"><v-icon size="16">{{ openDatePicker ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon></span>
              </button>
            </div>
            <div class="field">
              <span class="field-label">Giờ bắt đầu</span>
              <button ref="timeBtnRef" class="picker-display" :class="{ open: openTimePicker }" @click="toggleTimePicker">
                <span class="ic"><v-icon size="16">mdi-clock-outline</v-icon></span>
                <span class="val">{{ form.time || '--:--' }}</span>
                <span class="caret"><v-icon size="16">{{ openTimePicker ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon></span>
              </button>
            </div>
          </div>

          <!-- 3. Phân công thời gian — dropdown (2026-08-04: đổi từ chip sang select) -->
          <div class="field">
            <div class="duration-header">
              <span class="field-label">Phân công thời gian</span>
              <span class="duration-end">Kết thúc: <b class="end-bold">{{ computedEndLabel }}</b></span>
            </div>
            <div class="dur-row">
              <select v-model.number="durationChoice" class="plain-select">
                <option v-for="d in DURATIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
                <option :value="CUSTOM_DURATION">Khác…</option>
              </select>
              <input
                v-if="durationChoice === CUSTOM_DURATION"
                v-model.number="customMinutes"
                class="dur-custom"
                type="number"
                min="5"
                max="1440"
                step="5"
                aria-label="Số phút"
                @change="commitCustom"
              />
              <span v-if="durationChoice === CUSTOM_DURATION" class="dur-unit">phút</span>
            </div>
            <div v-if="crossesMidnight" class="dur-warn">
              <v-icon size="13">mdi-alert-outline</v-icon>
              Lịch kéo dài qua nửa đêm, kết thúc lúc {{ computedEndLabel }} ngày hôm sau.
            </div>
          </div>

          <!-- 5. Địa điểm — nút bookmark trong ô để lưu, nút ngoài để mở danh sách đã lưu -->
          <div class="field">
            <div class="location-row">
              <div class="location-input-wrap">
                <span class="ic"><v-icon size="16">mdi-map-marker-outline</v-icon></span>
                <input
                  v-model="form.location"
                  class="location-input"
                  type="text"
                  placeholder="Nhập địa điểm"
                />
                <button
                  type="button"
                  class="loc-save"
                  :disabled="!canSaveLocation"
                  :title="locationAlreadySaved ? 'Địa điểm đã được lưu' : 'Lưu địa điểm này'"
                  @click="saveCurrentLocation"
                >
                  <v-icon size="16">{{ locationAlreadySaved ? 'mdi-bookmark' : 'mdi-bookmark-outline' }}</v-icon>
                </button>
              </div>
              <button
                type="button"
                class="loc-list-btn"
                :class="{ open: openSavedLocations }"
                @click="openSavedLocations = !openSavedLocations"
              >
                <v-icon size="16">mdi-bookmark-multiple-outline</v-icon>
                <span v-if="savedLocations.length" class="loc-count">{{ savedLocations.length }}</span>
              </button>
            </div>
            <div v-if="openSavedLocations" class="saved-loc-panel">
              <div v-if="!savedLocations.length" class="saved-loc-empty">Chưa lưu địa điểm nào</div>
              <div v-for="loc in savedLocations" :key="loc" class="saved-loc-item">
                <button type="button" class="saved-loc-pick" @click="pickSavedLocation(loc)">{{ loc }}</button>
                <button type="button" class="saved-loc-del" title="Xoá" @click="removeSavedLocation(loc)">
                  <v-icon size="13">mdi-close</v-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- 6. Ghi chú -->
          <div class="field">
            <span class="field-label">Ghi chú</span>
            <textarea v-model="form.notes" class="notes-area" rows="2"></textarea>
          </div>

          <!-- Error -->
          <div v-if="error" class="error-banner"><v-icon size="15">mdi-alert-outline</v-icon> {{ error }}</div>
        </div>

        <!-- ─── Footer ─── -->
        <div class="editor-foot">
          <div class="actions">
            <button type="button" class="at-btn at-btn--secondary" @click="close">Huỷ</button>
            <button
              type="button"
              class="at-btn at-btn--primary"
              :disabled="!canSubmit || saving"
              @click="submit"
            >
              <v-icon v-if="!saving" size="16">mdi-check</v-icon>
              {{ saving ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo nhắc hẹn') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Date picker popup — position fixed bên ngoài modal (không push modal expand) -->
      <div
        v-if="openDatePicker"
        class="picker-popup date-popup airtable-scope"
        :style="datePopupStyle"
        v-click-outside="closeDatePicker"
      >
        <div class="dp-head">
          <button type="button" @click="shiftCalMonth(-1)"><v-icon size="18">mdi-chevron-left</v-icon></button>
          <span class="month">Tháng {{ calMonth.getMonth() + 1 }}, {{ calMonth.getFullYear() }}</span>
          <button type="button" @click="shiftCalMonth(1)"><v-icon size="18">mdi-chevron-right</v-icon></button>
        </div>
        <div class="dp-grid">
          <div v-for="w in ['CN','T2','T3','T4','T5','T6','T7']" :key="w" class="dp-wd">{{ w }}</div>
          <div
            v-for="cell in calCells"
            :key="cell.iso"
            class="dp-day"
            :class="{ muted: cell.muted, today: cell.isToday, selected: cell.iso === form.date }"
            @click="pickDate(cell.date)"
          >{{ cell.day }}</div>
        </div>
        <div class="dp-tip-divider"></div>
        <div class="dp-tips">
          <button
            v-for="t in dateTips"
            :key="t.label"
            type="button"
            class="tip-chip dp-tip"
            :class="{ active: isDateTipActive(t.offset) }"
            @click="pickDateOffset(t.offset)"
          >{{ t.label }}</button>
        </div>
        <div class="popup-foot">
          <button type="button" class="at-btn at-btn--primary popup-confirm" @click="closeDatePicker"><v-icon size="15">mdi-check</v-icon> Xác nhận</button>
        </div>
      </div>

      <!-- Time picker popup -->
      <div
        v-if="openTimePicker"
        class="picker-popup time-popup airtable-scope"
        :style="timePopupStyle"
        v-click-outside="closeTimePicker"
      >
        <div class="tp-wheels">
          <div class="tp-fade tp-fade--top"></div>
          <div class="tp-fade tp-fade--bot"></div>
          <div class="tp-wheel" @wheel.prevent="onHourWheel">
            <div class="tp-wheel-items" :style="{ transform: `translateY(${-hourWheelOffset}px)` }">
              <div
                v-for="h in HOURS"
                :key="h"
                class="tp-wheel-item"
                :class="{ selected: h === hourValue }"
                @click="setHour(h)"
              >{{ String(h).padStart(2, '0') }}</div>
            </div>
          </div>
          <div class="tp-separator">:</div>
          <div class="tp-wheel" @wheel.prevent="onMinuteWheel">
            <div class="tp-wheel-items" :style="{ transform: `translateY(${-minuteWheelOffset}px)` }">
              <div
                v-for="m in MINUTES"
                :key="m"
                class="tp-wheel-item"
                :class="{ selected: m === minuteValue }"
                @click="setMinute(m)"
              >{{ String(m).padStart(2, '0') }}</div>
            </div>
          </div>
        </div>
        <div class="tp-quick-grid">
          <button type="button" class="tip-chip" @click="randomTime('morning')"><v-icon size="14">mdi-weather-sunny</v-icon> Sáng</button>
          <button type="button" class="tip-chip" @click="randomTime('noon')"><v-icon size="14">mdi-weather-partly-cloudy</v-icon> Trưa</button>
          <button type="button" class="tip-chip" @click="randomTime('afternoon')"><v-icon size="14">mdi-weather-sunset</v-icon> Chiều</button>
          <button type="button" class="tip-chip" @click="randomTime('evening')"><v-icon size="14">mdi-weather-night</v-icon> Tối</button>
        </div>
        <div class="tp-helper">Bấm lại 1 khung để random giờ khác</div>
        <div class="popup-foot">
          <button type="button" class="at-btn at-btn--primary popup-confirm" @click="closeTimePicker"><v-icon size="15">mdi-check</v-icon> Xác nhận</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import {
  APPOINTMENT_TYPE_OPTIONS,
  initials,
  type AppointmentEx as Appointment,
  type AiPrefill,
} from '@/composables/appointment-helpers';
import {
  useContactSearch,
  toContactLite,
  formatPhoneVN,
  contactColor,
  type ContactLite,
} from '@/composables/use-contact-search';

interface UserLite {
  id: string;
  fullName: string | null;
  email: string;
}

const props = defineProps<{
  modelValue: boolean;
  /** Mở ở mode edit khi truyền appointment, ngược lại = create */
  appointment?: Appointment | null;
  /** Default date khi tạo mới (vd click slot week-view) */
  defaultDate?: Date | null;
  /** Prefill contact (vd mở từ contact page) */
  prefillContact?: ContactLite | null;
  /** Danh sách user trong org cho dropdown Sale */
  users?: UserLite[];
  /** ID của user đang đăng nhập — default Sale phụ trách */
  currentUserId?: string | null;
  /** AI parse result từ ghi chú → fill các trường tạo lịch hẹn */
  aiPrefill?: AiPrefill | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created', a: Appointment): void;
  (e: 'updated', a: Appointment): void;
}>();

const titleInputRef = ref<HTMLInputElement | null>(null);
const dateBtnRef = ref<HTMLButtonElement | null>(null);
const timeBtnRef = ref<HTMLButtonElement | null>(null);
const custSearchInputRef = ref<HTMLInputElement | null>(null);

// Computed popup position từ button bounding rect (vì popup TELEPORT ngoài modal,
// không thể dùng absolute relative đến field nữa — modal sẽ KHÔNG bị popup
// push expand vì popup overlay riêng).
const datePopupStyle = ref<Record<string, string>>({});
const timePopupStyle = ref<Record<string, string>>({});

function computePopupPosition(
  btnRef: HTMLButtonElement | null,
  popupWidth = 280,
  popupHeight = 400,
): Record<string, string> {
  if (!btnRef) return {};
  const rect = btnRef.getBoundingClientRect();
  // Horizontal: prefer left-align với button, clamp khi tràn phải viewport
  const left = Math.min(rect.left, window.innerWidth - popupWidth - 16);
  // Vertical: ưu tiên dưới button; nếu tràn dưới → place above button
  let top = rect.bottom + 6;
  if (top + popupHeight > window.innerHeight - 16) {
    const above = rect.top - popupHeight - 6;
    top = above >= 16 ? above : Math.max(16, window.innerHeight - popupHeight - 16);
  }
  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${Math.max(8, left)}px`,
    width: `${popupWidth}px`,
  };
}

const isEdit = computed(() => !!props.appointment);

// ───────── Contact state ─────────
const selectedContact = ref<ContactLite | null>(null);
const custSuggestOpen = ref(false);
// 2026-08-04: tìm KH chuyển sang composable dùng chung với AppointmentQuickCreate.
const {
  query: custQuery,
  suggestions: custSuggestions,
  searching: custSearching,
  search: onCustSearch,
  reset: resetCustSearch,
  enrichAvatar: enrichContactAvatar,
  loadById: loadContactById,
  onAvatarError,
} = useContactSearch(selectedContact);

function openCustSuggest() {
  custSuggestOpen.value = true;
  // Auto-focus search input ngay khi mở (1-click flow, không cần click thêm)
  nextTick(() => {
    custSearchInputRef.value?.focus();
  });
}

function dismissCustSuggest() {
  custSuggestOpen.value = false;
  resetCustSearch();
}

function pickContact(c: ContactLite) {
  selectedContact.value = c;
  custSuggestOpen.value = false;
  resetCustSearch();
  // Rebuild title theo tên KH mới
  form.title = buildDefaultTitle();
  nextTick(() => focusTitleAtEnd());
}

function clearContact() {
  selectedContact.value = null;
}

// ───────── Form state ─────────
const form = reactive({
  title: '',
  date: '',
  time: '',
  durationMin: 15,
  type: null as string | null,
  location: '',
  notes: '',
  assignedUserId: null as string | null,
});

// 2026-08-04: bỏ dropdown "Sale phụ trách" → không cần dựng danh sách user nữa.
// Prop `users` giữ lại (5 nơi gọi editor vẫn truyền) nhưng không còn được đọc.
const auth = useAuthStore();
const currentUserId = computed<string | null>(() => props.currentUserId ?? auth.user?.id ?? null);

const saving = ref(false);
const error = ref('');

const titlePlaceholder = computed(() =>
  selectedContact.value?.fullName
    ? `Tiêu đề nhắc hẹn — vd Gọi nhắc ${selectedContact.value.fullName}`
    : 'Tiêu đề nhắc hẹn — vd Gọi nhắc khách hàng',
);

/**
 * 2026-08-04: KHÔNG tự sinh tiêu đề nữa.
 *
 * Bản cũ điền sẵn "Gọi điện cho {tên KH}" rồi lúc lưu còn nối "📍 {địa điểm}".
 * Với tên KH thật (vd "Chuỗi Sunday Basic 560 Lê Quang Định, Gò Vấp, HCM") ra
 * chuỗi ~85 ký tự, bị cắt ở thẻ lịch, cắt ở agenda, kẹp 3 dòng ở popover — mà
 * tên KH và địa điểm vốn đã hiện riêng ở các chỗ đó.
 *
 * Giờ để trống; chỗ nào cần hiển thị thì tự lùi về tên KH (`a.title || customer`).
 */
function buildDefaultTitle(): string {
  return '';
}

function focusTitleAtEnd() {
  const el = titleInputRef.value;
  if (!el) return;
  el.focus();
  const len = el.value.length;
  try { el.setSelectionRange(len, len); } catch { /* IE fallback no-op */ }
}

/**
 * Icon prefix ô tiêu đề — hằng số. Trước đây là computed bám theo loại đang
 * chọn; bỏ trường loại rồi thì không còn gì để bám, và giữ computed chỉ tạo
 * thêm việc cho mỗi lần re-render khi gõ tiêu đề.
 */
const titleIcon = 'mdi-calendar-check-outline';

// Tiêu đề KHÔNG còn bắt buộc (bỏ trống → hiển thị theo tên KH). Chỉ cần ngày+giờ.
const canSubmit = computed(() => !!form.date && !!form.time);

// ───────── Init / reset state khi mở ─────────
watch(() => props.modelValue, (open) => {
  if (!open) return;
  error.value = '';
  saving.value = false;
  openDatePicker.value = false;
  openTimePicker.value = false;
  custSuggestOpen.value = false;
  custQuery.value = '';
  loadSavedLocations();
  openSavedLocations.value = false;
  loadCategories();
  cancelAddCategory();

  if (props.appointment) {
    // Edit mode
    const a = props.appointment;
    form.title = (a as any).title || (a.contact?.fullName ? `Nhắc hẹn KH ${a.contact.fullName}` : '');
    form.date = a.appointmentDate;
    form.time = a.appointmentTime;
    form.durationMin = (a as any).durationMin || 15;
    form.type = a.type ?? null;
    form.location = (a as any).location || '';
    form.notes = a.notes || '';
    form.assignedUserId = (a as any).assignedUserId ?? (a as any).assignedTo?.id ?? null;
    // FIX 2026-06-16 (Anh báo "sửa lịch mất link KH"): vài nguồn list/chat truyền object
    // lịch KHÔNG kèm `contact` → trước đây set null → mất link. Giờ: có contact thì dùng,
    // thiếu mà còn contactId thì FETCH lại để giữ link KH.
    const cObj = (a as any).contact;
    if (cObj) {
      selectedContact.value = toContactLite(cObj);
      if (!selectedContact.value.avatarUrl) enrichContactAvatar(selectedContact.value.id);
    } else if ((a as any).contactId) {
      selectedContact.value = null;
      loadContactById((a as any).contactId);
    } else {
      selectedContact.value = null;
    }
    calMonth.value = a.appointmentDate ? new Date(a.appointmentDate) : new Date();
  } else {
    // Create mode
    const base = props.defaultDate || roundToNextSlot(new Date());
    form.date = isoDate(base);
    form.time = isoTime(base);
    form.durationMin = 15;
    form.type = null; // tạo mới: mặc định "— Chưa phân loại —"
    form.location = '';
    form.notes = '';
    form.assignedUserId = currentUserId.value; // người tạo = người phụ trách
    // Prefill: nếu parent truyền object có sẵn friends → resolve avatar fallback,
    // không thì giữ nguyên (parent có thể đã set avatarUrl chuẩn).
    selectedContact.value = props.prefillContact
      ? toContactLite(props.prefillContact)
      : null;
    // Parent (ChatAppointments, CustomerTimelineSection) thường chỉ truyền {id, fullName}
    // → fetch detail để enrich avatar (Contact.avatarUrl + Friend.zaloAvatarUrl fallback).
    if (selectedContact.value?.id && !selectedContact.value.avatarUrl) {
      enrichContactAvatar(selectedContact.value.id);
    }
    // Tiêu đề default = template theo loại hiện tại (call), kèm tên KH nếu prefill
    form.title = buildDefaultTitle();
    calMonth.value = new Date(base);

    // AI prefill (sau khi default đã set) — override field nào AI có giá trị.
    // Đến từ NotesSection sau khi ai-parse cascade (rule-based + Gemini).
    if (props.aiPrefill) {
      const p = props.aiPrefill;
      // AI parse vẫn có thể suy ra loại — giữ lại ngầm dù không có ô nhập.
      if (p.type) form.type = p.type;
      if (p.date) {
        form.date = p.date;
        calMonth.value = new Date(p.date + 'T00:00:00');
      }
      if (p.time) form.time = p.time;
      if (p.location) form.location = p.location;
      // Title: ưu tiên AI summary, fallback template theo type mới
      if (p.title && p.title.trim()) {
        form.title = p.title.trim();
      } else {
        form.title = buildDefaultTitle();
      }
      if (p.notes) form.notes = p.notes;
    }
  }

  // PHẢI chạy sau 2 nhánh trên (form.durationMin mới có giá trị thật): sửa lịch
  // 45 phút thì select đứng ở "Khác…" kèm số 45, không bật về mốc gần nhất.
  syncDurationMode();

  nextTick(() => titleInputRef.value?.focus());
});

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function roundToNextSlot(d: Date): Date {
  // Round lên slot phút gần nhất trong [0, 10, 15, 30, 45, 50]
  const out = new Date(d);
  out.setSeconds(0, 0);
  const slots = [0, 10, 15, 30, 45, 50];
  const m = out.getMinutes();
  const next = slots.find((s) => s > m);
  if (next != null) {
    out.setMinutes(next);
  } else {
    out.setHours(out.getHours() + 1);
    out.setMinutes(0);
  }
  return out;
}

// ───────── Date label ─────────
const VN_DOWS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dateLabel = computed(() => {
  if (!form.date) return 'Chọn ngày...';
  const d = new Date(form.date);
  return `${VN_DOWS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
});

// ───────── Date picker ─────────
const openDatePicker = ref(false);
const calMonth = ref(new Date());

function shiftCalMonth(delta: number) {
  const d = new Date(calMonth.value);
  d.setMonth(d.getMonth() + delta);
  calMonth.value = d;
}

interface CalCell { date: Date; iso: string; day: number; muted: boolean; isToday: boolean }
const calCells = computed<CalCell[]>(() => {
  const year = calMonth.value.getFullYear();
  const month = calMonth.value.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  // VN week starts Sunday (CN=0)? Anh dùng CN-T2-...-T7. JS getDay=0 (CN).
  const offset = firstOfMonth.getDay();
  const start = new Date(year, month, 1 - offset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cells: CalCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      iso: isoDate(d),
      day: d.getDate(),
      muted: d.getMonth() !== month,
      isToday: d.getTime() === today.getTime(),
    });
  }
  return cells;
});

function pickDate(d: Date) {
  form.date = isoDate(d);
  calMonth.value = new Date(d); // sync month nếu user click ngày tháng khác
  // KHÔNG auto close — user phải bấm "Xác nhận" hoặc click outside
}

function pickDateOffset(offsetDays: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  form.date = isoDate(d);
  calMonth.value = new Date(d); // jump calendar tới tháng đúng
  // KHÔNG auto close
}

/** Active state cho tip chip: chip "Hôm nay" sáng nếu form.date === today, v.v. */
function isDateTipActive(offsetDays: number): boolean {
  if (!form.date) return false;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return isoDate(d) === form.date;
}

// Mutually exclusive popups + click-outside helpers
function toggleDatePicker() {
  if (openDatePicker.value) {
    openDatePicker.value = false;
  } else {
    openTimePicker.value = false;
    datePopupStyle.value = computePopupPosition(dateBtnRef.value, 300, 470);
    openDatePicker.value = true;
  }
}
function closeDatePicker() { openDatePicker.value = false; }
function toggleTimePicker() {
  if (openTimePicker.value) {
    openTimePicker.value = false;
  } else {
    openDatePicker.value = false;
    timePopupStyle.value = computePopupPosition(timeBtnRef.value, 240, 360);
    openTimePicker.value = true;
  }
}
function closeTimePicker() { openTimePicker.value = false; }

// v-click-outside directive — đóng popup khi click ngoài.
// Skip trigger (button mở chính popup đó) để tránh toggle-then-close cùng frame.
const vClickOutside = {
  beforeMount(el: HTMLElement, binding: { value: () => void }) {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (el.contains(target)) return;
      // Skip nếu click vào picker-display button (đã handle bằng toggle)
      if (target.closest('.picker-display')) return;
      binding.value();
    };
    (el as any).__clickOutsideHandler = handler;
    setTimeout(() => document.addEventListener('click', handler), 0);
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener('click', (el as any).__clickOutsideHandler);
  },
};

// 8 tip chips — bỏ "Hôm nay" (default form.date đã là hôm nay nên không cần)
// Layout: 4-col × 2 dòng, gọn trong popup 300px.
const dateTips = [
  { label: 'Ngày mai',   offset: 1 },
  { label: 'Ngày mốt',   offset: 2 },
  { label: '+3 ngày',    offset: 3 },
  { label: '+5 ngày',    offset: 5 },
  { label: '+7 ngày',    offset: 7 },
  { label: '+10 ngày',   offset: 10 },
  { label: '+15 ngày',   offset: 15 },
  { label: '+1 tháng',   offset: 30 },
];

// ───────── Time picker (iOS wheel) ─────────
const openTimePicker = ref(false);
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23
const MINUTES = [0, 10, 15, 30, 45, 50];
const WHEEL_ITEM_H = 32; // match CSS .tp-wheel-item height (160px wheels = 5 items visible)

const hourValue = computed<number>(() => {
  if (!form.time) return 9;
  return parseInt(form.time.split(':')[0], 10);
});
const minuteValue = computed<number>(() => {
  if (!form.time) return 30;
  return parseInt(form.time.split(':')[1], 10);
});

// Wheel translation: center selected at row index 2 (5 visible rows, center = row idx 2)
const hourWheelOffset = computed(() => {
  const idx = HOURS.indexOf(hourValue.value);
  return idx >= 0 ? idx * WHEEL_ITEM_H - 2 * WHEEL_ITEM_H : 0;
});
const minuteWheelOffset = computed(() => {
  const idx = MINUTES.indexOf(minuteValue.value);
  return idx >= 0 ? idx * WHEEL_ITEM_H - 2 * WHEEL_ITEM_H : 0;
});

function setHour(h: number) {
  const m = minuteValue.value;
  form.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function setMinute(m: number) {
  const h = hourValue.value;
  form.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function onHourWheel(e: WheelEvent) {
  const dir = e.deltaY > 0 ? 1 : -1;
  const idx = HOURS.indexOf(hourValue.value);
  const next = Math.max(0, Math.min(HOURS.length - 1, idx + dir));
  setHour(HOURS[next]);
}
function onMinuteWheel(e: WheelEvent) {
  const dir = e.deltaY > 0 ? 1 : -1;
  const idx = MINUTES.indexOf(minuteValue.value);
  const next = Math.max(0, Math.min(MINUTES.length - 1, idx + dir));
  setMinute(MINUTES[next]);
}

// Random time trong khung Sáng/Trưa/Chiều/Tối — re-roll khi click lại
const TIME_RANGES: Record<string, [number, number]> = {
  morning:   [6, 11],
  noon:      [12, 12],
  afternoon: [13, 15],
  evening:   [16, 23],
};
function randomTime(period: 'morning' | 'noon' | 'afternoon' | 'evening') {
  const [lo, hi] = TIME_RANGES[period];
  const h = lo + Math.floor(Math.random() * (hi - lo + 1));
  const m = MINUTES[Math.floor(Math.random() * MINUTES.length)];
  form.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ───────── Duration ─────────
// 2026-05-21 chốt: bỏ "3 ngày" — chỉ tới "1 ngày" là đủ cho domain BĐS sale.
/**
 * 2026-08-04: rút từ 10 lựa chọn (5p → 1 ngày) còn 4 + "Khác".
 * Dùng hằng ngày thì 15/30/60/120 phủ gần hết; các mốc dài (8/12 giờ, 1 ngày)
 * vừa hiếm vừa là thứ đẻ ra lịch tràn qua nửa đêm hiển thị sai.
 */
const DURATIONS = [
  { label: '15 phút', value: 15 },
  { label: '30 phút', value: 30 },
  { label: '1 giờ',   value: 60 },
  { label: '2 giờ',   value: 120 },
];
const CUSTOM_DURATION = -1;

/**
 * Select giữ 1 trong 4 mốc, hoặc CUSTOM_DURATION để lộ ô nhập phút.
 * `form.durationMin` vẫn là nguồn sự thật duy nhất gửi lên BE.
 *
 * FIX 2026-08-05 (anh báo "chọn Khác không nhập được"): bản đầu suy trạng thái
 * "đang ở chế độ Khác" TỪ giá trị — chọn Khác thì setter không ghi gì, getter
 * thấy durationMin vẫn là 1 trong 4 mốc nên trả lại đúng mốc đó, select bật
 * ngược về và ô nhập không bao giờ hiện. Phải có cờ riêng, không suy từ giá trị.
 */
const customMode = ref(false);
const customMinutes = ref(30);

const durationChoice = computed<number>({
  get: () =>
    customMode.value || !DURATIONS.some((d) => d.value === form.durationMin)
      ? CUSTOM_DURATION
      : form.durationMin,
  set: (v) => {
    if (v === CUSTOM_DURATION) {
      customMode.value = true;
      customMinutes.value = form.durationMin;
    } else {
      customMode.value = false;
      form.durationMin = v;
    }
  },
});

/**
 * Gõ tới đâu cập nhật tới đó, nhưng KHÔNG kẹp — kẹp lúc gõ thì "45" thành "5"
 * ngay ở ký tự đầu. Kẹp để dành cho lúc rời ô (`commitCustom`).
 *
 * Dùng watch chứ KHÔNG dùng @input: v-model trên input native là directive, thứ
 * tự chạy so với listener @input không đảm bảo — handler đọc trúng giá trị cũ
 * nên số phút gõ vào không vào được form (giờ kết thúc đứng im).
 */
watch(customMinutes, (v) => {
  const n = Math.round(Number(v) || 0);
  if (n >= 1 && n <= 1440) form.durationMin = n;
});
function commitCustom() {
  const clamped = Math.min(1440, Math.max(5, Math.round(Number(customMinutes.value) || 5)));
  customMinutes.value = clamped;
  form.durationMin = clamped;
}

/** Gọi khi mở modal — sau khi form.durationMin đã được nạp. */
function syncDurationMode() {
  customMode.value = !DURATIONS.some((d) => d.value === form.durationMin);
  customMinutes.value = form.durationMin;
}

/** Cảnh báo tràn nửa đêm — nguồn gốc của lỗi hiển thị "38:45". */
const crossesMidnight = computed(() => {
  const t = /^(\d{1,2}):(\d{2})/.exec((form.time || '').trim());
  if (!t) return false;
  return (+t[1] * 60 + +t[2]) + form.durationMin > 1440;
});

/**
 * Compute end label support multi-day.
 *   Trong ngày      → "HH:mm"
 *   Qua ngày khác   → "HH:mm DD/MM"
 *
 * Parse form.date (ISO "YYYY-MM-DD") theo LOCAL timezone (split + new Date(y, m-1, d))
 * thay vì new Date("YYYY-MM-DD") (UTC midnight → off by tz hours khi compute).
 */
const computedEndLabel = computed(() => {
  if (!form.time || !form.durationMin || !form.date) return '--:--';
  const [y, mo, d] = form.date.split('-').map((s) => parseInt(s, 10));
  const [h, m] = form.time.split(':').map((s) => parseInt(s, 10));
  const startDate = new Date(y, mo - 1, d, h, m, 0, 0);
  const endDate = new Date(startDate.getTime() + form.durationMin * 60 * 1000);
  const endH = String(endDate.getHours()).padStart(2, '0');
  const endM = String(endDate.getMinutes()).padStart(2, '0');
  const timeOnly = `${endH}:${endM}`;
  if (
    endDate.getFullYear() === startDate.getFullYear() &&
    endDate.getMonth() === startDate.getMonth() &&
    endDate.getDate() === startDate.getDate()
  ) {
    return timeOnly;
  }
  const dd = String(endDate.getDate()).padStart(2, '0');
  const mm = String(endDate.getMonth() + 1).padStart(2, '0');
  return `${timeOnly} ${dd}/${mm}`;
});

/* ── Phân loại lịch hẹn (2026-08-04) ────────────────────────────────────────
 * Ghi vào chính cột `Appointment.type` (String?, BE không validate enum) nên
 * bộ lọc "Loại" + báo cáo cũ vẫn đọc được 4 preset gốc.
 *   - 4 preset gốc  → lưu MÃ chuẩn ('call'/'message'/'meeting'/'follow_up')
 *   - preset tự thêm → lưu nguyên văn chữ sale gõ
 * Danh sách tự thêm nằm ở localStorage theo user (giống địa điểm đã lưu) —
 * CHƯA có bảng BE nên không đồng bộ giữa máy hay giữa các sale trong org.
 */
const CATEGORY_MAX = 30;
const customCategories = ref<string[]>([]);
const addingCategory = ref(false);
const newCategory = ref('');
const catInputRef = ref<HTMLInputElement | null>(null);

const categoryKey = computed(() => `apt:categories:${currentUserId.value ?? 'anon'}`);

function loadCategories() {
  try {
    const raw = localStorage.getItem(categoryKey.value);
    const arr = raw ? JSON.parse(raw) : [];
    customCategories.value = Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [];
  } catch {
    customCategories.value = [];
  }
}
function persistCategories() {
  try {
    localStorage.setItem(categoryKey.value, JSON.stringify(customCategories.value));
  } catch { /* quota/private mode — không chặn luồng tạo lịch */ }
}

const categoryOptions = computed<{ value: string; text: string }[]>(() => {
  const opts = [
    ...APPOINTMENT_TYPE_OPTIONS.map((o) => ({ value: o.value, text: o.text })),
    ...customCategories.value.map((c) => ({ value: c, text: c })),
  ];
  // Đang sửa lịch mang phân loại của người khác (không có trong localStorage máy
  // này) → vẫn phải liệt kê, nếu không select rơi về rỗng và lưu đè mất dữ liệu.
  const cur = form.type;
  if (cur && !opts.some((o) => o.value === cur)) opts.push({ value: cur, text: cur });
  return opts;
});

const canAddCategory = computed(() => {
  const v = newCategory.value.trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  return !categoryOptions.value.some(
    (o) => o.text.toLowerCase() === lower || o.value.toLowerCase() === lower,
  );
});

function startAddCategory() {
  addingCategory.value = true;
  newCategory.value = '';
  nextTick(() => catInputRef.value?.focus());
}
function cancelAddCategory() {
  addingCategory.value = false;
  newCategory.value = '';
}
function commitNewCategory() {
  if (!canAddCategory.value) return;
  const v = newCategory.value.trim();
  customCategories.value = [...customCategories.value, v].slice(0, CATEGORY_MAX);
  persistCategories();
  form.type = v; // chọn luôn loại vừa tạo
  cancelAddCategory();
}
function removeCategory(c: string) {
  customCategories.value = customCategories.value.filter((x) => x !== c);
  persistCategories();
  if (form.type === c) form.type = null;
}

/* ── Địa điểm đã lưu (2026-08-04) ────────────────────────────────────────────
 * Thay 5 preset cứng + nút "Auto" bằng bookmark do sale tự lưu.
 * LƯU Ý: chưa có endpoint BE cho danh sách này → lưu localStorage theo user,
 * nghĩa là KHÔNG đồng bộ giữa máy/trình duyệt. Muốn dùng chung cả org thì cần
 * thêm bảng + route riêng.
 */
const SAVED_LOC_MAX = 20;
const savedLocations = ref<string[]>([]);
const openSavedLocations = ref(false);

const savedLocKey = computed(() => `apt:saved-locations:${currentUserId.value ?? 'anon'}`);

function loadSavedLocations() {
  try {
    const raw = localStorage.getItem(savedLocKey.value);
    const arr = raw ? JSON.parse(raw) : [];
    savedLocations.value = Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [];
  } catch {
    savedLocations.value = [];
  }
}
function persistSavedLocations() {
  try {
    localStorage.setItem(savedLocKey.value, JSON.stringify(savedLocations.value));
  } catch { /* quota/private mode — bỏ qua, không chặn luồng tạo lịch */ }
}

const locationAlreadySaved = computed(() => {
  const v = form.location.trim().toLowerCase();
  return !!v && savedLocations.value.some((l) => l.toLowerCase() === v);
});
const canSaveLocation = computed(() => !!form.location.trim() && !locationAlreadySaved.value);

function saveCurrentLocation() {
  const v = form.location.trim();
  if (!v || locationAlreadySaved.value) return;
  savedLocations.value = [v, ...savedLocations.value].slice(0, SAVED_LOC_MAX);
  persistSavedLocations();
}
function pickSavedLocation(loc: string) {
  form.location = loc;
  openSavedLocations.value = false;
}
function removeSavedLocation(loc: string) {
  savedLocations.value = savedLocations.value.filter((l) => l !== loc);
  persistSavedLocations();
}

// ───────── Submit / close ─────────
async function submit() {
  if (!canSubmit.value) {
    error.value = 'Chọn ngày và giờ trước khi tạo nhắc hẹn';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    // 2026-08-04: BỎ việc nối "📍 {location}" vào tiêu đề khi lưu.
    // Địa điểm đã là trường riêng và được hiện riêng ở popover/agenda, nên nối
    // thêm chỉ làm tiêu đề phình ra rồi bị cắt ở mọi chỗ hiển thị.
    // Tiêu đề để trống được: lịch/agenda tự lùi về tên khách hàng.
    const payload = {
      title: form.title.trim() || null,
      contactId: selectedContact.value?.id ?? null,
      // 2026-08-04: bỏ ô chọn sale. Tạo mới → luôn gán cho chính người đang tạo.
      // Sửa → GIỮ NGUYÊN người phụ trách cũ, không âm thầm cướp lịch của sale khác.
      assignedUserId: isEdit.value ? form.assignedUserId : currentUserId.value,
      appointmentDate: form.date,
      appointmentTime: form.time,
      durationMin: form.durationMin,
      type: form.type,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (isEdit.value && props.appointment) {
      // FIX 2026-06-09 (Anh báo "lưu sửa lịch báo not_found"): BE chỉ có PUT /appointments/:id
      // (PATCH /:id chưa định nghĩa → 404 not_found). Đổi patch→put, khớp use-appointments.ts.
      const res = await api.put(`/appointments/${props.appointment.id}`, payload);
      emit('updated', res.data);
    } else {
      const res = await api.post('/appointments', payload);
      emit('created', res.data);
    }
    close();
  } catch (err: any) {
    // BE trả `message` (vd lịch trùng giờ — câu chữ cụ thể) → ưu tiên; fallback `error`.
    error.value = err?.response?.data?.message || err?.response?.data?.error || 'Không lưu được nhắc hẹn';
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('update:modelValue', false);
}

// Re-compute popup position khi window resize
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (openDatePicker.value) datePopupStyle.value = computePopupPosition(dateBtnRef.value, 300, 470);
    if (openTimePicker.value) timePopupStyle.value = computePopupPosition(timeBtnRef.value, 240, 360);
  });
}
</script>

<style scoped>
@import '@/assets/airtable.css';

/* FIX 2026-06-09 (Anh báo bể UI): 2 token --at-coral-tint / --at-coral-text KHÔNG
   được định nghĩa trong airtable.css → render rỗng → hàng KH liên kết (.linked-kh-row)
   + banner lỗi (.error-banner) mất nền/màu chữ. Bổ sung scoped tại đây (không đụng
   airtable.css dùng chung). Tint = nền đỏ nhạt, text = chữ đỏ đậm — khớp --at-coral. */
.airtable-scope {
  --at-coral-tint: var(--at-atlas-danger-soft, #fdeceb);
  --at-coral-text: var(--at-coral, #f04438);
}

/* ─── Backdrop + modal ─── */
.editor-backdrop {
  position: fixed; inset: 0;
  background: rgba(24, 29, 38, 0.55);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: var(--at-s-md);
}
.editor {
  width: 560px; max-width: 100%;
  /* FIX 2026-06-09 (Anh báo bể): bỏ height cứng 780px (gây dồn cục section + dư khoảng
     trống đáy). Modal tự co theo nội dung, cap 94vh — body flex:1 overflow-y:auto tự cuộn
     nếu thiếu chỗ. Popup ngày/giờ TELEPORT ra ngoài (position fixed) nên không push modal. */
  height: auto;
  max-height: 94vh;
  background: var(--at-canvas);
  border-radius: var(--at-r-lg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column;
  overflow: hidden;
  outline: none;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--at-body);
}

.editor-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--at-s-md) var(--at-s-lg);
  border-bottom: 1px solid var(--at-hairline);
}
.editor-head h2 { font-size: 18px; font-weight: 500; color: var(--at-ink); margin: 0; }
.editor-head .close {
  width: 32px; height: 32px; border-radius: var(--at-r-md);
  background: transparent; border: none; color: var(--at-muted);
  font-size: 18px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.editor-head .close:active { background: var(--at-surface-soft); }

.editor-body {
  flex: 1; overflow-y: auto;
  padding: var(--at-s-md) var(--at-s-lg);
  display: flex; flex-direction: column; gap: var(--at-s-md);
}

.editor-foot {
  display: flex; align-items: center; justify-content: space-between; gap: var(--at-s-xs);
  padding: var(--at-s-sm) var(--at-s-lg);
  background: var(--at-surface-soft);
  border-top: 1px solid var(--at-hairline);
}
.editor-foot .actions { display: flex; gap: 6px; margin-left: auto; }

/* ─── Field common ─── */
/* FIX 2026-06-09 (Anh báo "bể tè le"): global hs-crm-theme.css định nghĩa `.field` là
   1 Ô INPUT (height:40px, flex row, border, bg, padding) — leak vào đây làm MỖI section
   thành 1 khung viền đè chồng lên field dưới. Trong editor, `.field` là 1 KHỐI DỌC
   (label trên + control dưới). Phải RESET đè lại toàn bộ box-prop global + ép cao tự động.
   Scope dưới .editor để KHÔNG đụng .field nơi khác. */
.editor .field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--at-s-xs);
  position: relative;
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}
.editor .field:focus-within { box-shadow: none; } /* huỷ glow global của .field:focus-within */
/* Khôi phục viền cho input/select THẬT bên trong editor (global .field input{border:0} đã xoá) */
.editor .field .title-input-wrap,
.editor .field .location-input-wrap,
.editor .field .picker-display,
.editor .field .sale-select,
.editor .field .notes-area,
.editor .field .cust-suggest-search { border: 1px solid var(--at-hairline); }
.field-label {
  font-size: 11.5px; font-weight: 500; color: var(--at-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--at-s-sm); }
.row-1 { display: grid; grid-template-columns: 1fr; }

/* Title input wrap — icon prefix + placeholder bold inline */
.title-input-wrap {
  display: flex; align-items: center;
  width: 100%; height: 48px; padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  background: var(--at-canvas); gap: 10px;
}
.title-input-wrap:focus-within { border-color: var(--at-ink); }
.title-input-wrap .ic { font-size: 18px; flex-shrink: 0; }
.title-input {
  flex: 1; min-width: 0;
  border: none; outline: none; background: transparent;
  font-family: inherit; font-size: 16px; font-weight: 500;
  color: var(--at-ink);
}
.title-input::placeholder { font-weight: 500; color: var(--at-muted); }

/* Linked KH row — 2 dòng: tên (chính) + SĐT (phụ). Avatar img thật fallback initials. */
.linked-kh-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: var(--at-coral-tint);
  border-radius: var(--at-r-sm);
  min-height: 52px;
}
.linked-kh-row .av {
  width: 40px; height: 40px; border-radius: 50%;
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 500; flex-shrink: 0;
  overflow: hidden;
}
.linked-kh-row .av img {
  width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
  display: block;
}
.linked-kh-row .linked-info {
  display: flex; flex-direction: column; gap: 1px;
  flex: 1; min-width: 0;
  color: var(--at-coral-text);
}
.linked-kh-row .name {
  font-weight: 500; font-size: 14px; color: var(--at-ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  line-height: 1.25;
}
.linked-kh-row .phone-row {
  font-size: 12px; color: var(--at-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  line-height: 1.25;
}
.linked-kh-row .phone-row.muted { font-style: italic; }
.linked-kh-row .remove {
  width: 24px; height: 24px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.08); border: none; cursor: pointer;
  font-size: 11px; color: inherit; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}

/* Sale dropdown */
.sale-select {
  width: 100%; height: 40px; padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  font-family: inherit; font-size: 13.5px; color: var(--at-ink);
  background: var(--at-canvas); outline: none;
  cursor: pointer;
}
.sale-select:focus { border-color: var(--at-ink); }

.link-kh-btn {
  align-self: flex-start;
  font-size: 12px; color: var(--at-link); cursor: pointer;
  background: transparent; border: 1px dashed var(--at-hairline);
  border-radius: var(--at-r-sm); padding: 5px 10px;
  font-family: inherit;
}
.link-kh-btn:active { background: var(--at-surface-soft); }

/* KH autocomplete */
.cust-suggest {
  background: var(--at-canvas); border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-md); padding: var(--at-s-xs);
  max-height: 260px; overflow-y: auto;
}
.cust-suggest-head {
  font-size: 11.5px; color: var(--at-muted);
  padding: var(--at-s-xs); margin-bottom: 4px;
}
.cust-suggest-head .opt { color: var(--at-ink); font-weight: 500; margin-left: 4px; }
.cust-suggest-search {
  width: 100%; padding: 8px 12px;
  background: var(--at-surface-soft); border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-sm); font-size: 13px; font-family: inherit;
  outline: none; margin-bottom: var(--at-s-xs);
}
.cust-suggest-search:focus { border-color: var(--at-ink); }
.cust-loading, .cust-empty {
  padding: 10px; font-size: 12.5px; color: var(--at-muted);
  text-align: center;
}
.cust-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--at-r-sm); cursor: pointer;
  font-size: 13px;
}
.cust-item:active { background: var(--at-surface-soft); }
.cust-item .av {
  width: 28px; height: 28px; border-radius: 50%;
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 500; flex-shrink: 0;
  overflow: hidden;
}
.cust-item .av img {
  width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
  display: block;
}
.cust-item .name { font-weight: 500; color: var(--at-ink); }
.cust-item .meta { font-size: 11.5px; color: var(--at-muted); }
.cust-info-1line {
  display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0;
  font-size: 13px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cust-info-1line .name { font-weight: 500; color: var(--at-ink); }
.cust-info-1line .sep { color: var(--at-muted); }
.cust-info-1line .phone { color: var(--at-body); font-variant-numeric: tabular-nums; }
.cust-info-1line .nick { color: var(--at-muted); font-style: italic; font-size: 12px; }
.cust-item.skip {
  margin-top: 4px; padding-top: 8px;
  border-top: 1px solid var(--at-hairline);
  color: var(--at-muted); font-style: italic;
}

/* Picker display button */
.picker-display {
  width: 100%; height: 44px; padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  background: var(--at-canvas);
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 14px; color: var(--at-ink); cursor: pointer;
  font-family: inherit;
}
.picker-display:active { background: var(--at-surface-soft); }
.picker-display .ic { color: var(--at-muted); }
.picker-display .val { font-weight: 500; flex: 1; text-align: left; }
.picker-display .caret { color: var(--at-muted); font-size: 10px; }

/* Picker popups — TELEPORTED ra ngoài modal, position fixed.
   Modal KHÔNG bị expand khi popup mở. Popup overlay đè modal. */
.picker-popup {
  z-index: 110; /* > modal z-index (100) */
  background: var(--at-canvas);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-lg);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
  padding: var(--at-s-sm);
}

/* Date picker grid — shrinked (300px container) */
.dp-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.dp-head .month { font-size: 13px; font-weight: 500; color: var(--at-ink); }
.dp-head button {
  width: 26px; height: 26px; border-radius: var(--at-r-sm);
  background: transparent; border: none; cursor: pointer;
  color: var(--at-body); font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
}
.dp-head button:active { background: var(--at-surface-soft); }
.dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
.dp-wd {
  font-size: 10px; color: var(--at-muted); text-align: center;
  padding: 4px 0; font-weight: 500;
}
.dp-day {
  height: 32px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--at-body); border-radius: var(--at-r-sm);
  cursor: pointer;
}
.dp-day:active { background: var(--at-surface-soft); }
.dp-day.muted { color: var(--at-muted); opacity: 0.4; }
.dp-day.today { background: var(--at-ink); color: var(--at-on-primary); font-weight: 500; }
/* Selected nhưng KHÔNG phải today: bg coral đậm để dễ thấy */
.dp-day.selected:not(.today) {
  background: var(--at-coral); color: var(--at-on-primary); font-weight: 500;
}
.dp-tip-divider {
  height: 1px; background: var(--at-hairline);
  margin: var(--at-s-sm) calc(-1 * var(--at-s-sm));
}
/* Tip chips: 2-col × 4-row (8 chips). 4-col bị tràn label "+10 ngày"/"+1 tháng"
   → đổi 2-col cho mỗi chip rộng ~135px, đọc thoải mái. */
.dp-tips {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.dp-tip {
  font-size: 11.5px;
  padding: 5px 10px;
  height: 28px;
  justify-content: center;
}

/* Time picker wheels — compact để fit trong field 240-260px */
.tp-wheels {
  display: flex; align-items: center; justify-content: center; gap: var(--at-s-sm);
  height: 160px; position: relative;
  background: var(--at-surface-soft);
  border-radius: var(--at-r-md);
  overflow: hidden;
}
.tp-wheels::before, .tp-wheels::after {
  content: ''; position: absolute; left: 8%; right: 8%;
  height: 1px; background: var(--at-border-strong);
  pointer-events: none; z-index: 2;
}
.tp-wheels::before { top: 64px; }
.tp-wheels::after { top: 96px; }
.tp-fade { position: absolute; left: 0; right: 0; pointer-events: none; z-index: 3; }
.tp-fade--top { top: 0; height: 64px; background: linear-gradient(to bottom, var(--at-surface-soft) 0%, rgba(248, 250, 252, 0) 100%); }
.tp-fade--bot { bottom: 0; height: 64px; background: linear-gradient(to top, var(--at-surface-soft) 0%, rgba(248, 250, 252, 0) 100%); }
.tp-wheel {
  width: 60px; height: 160px; overflow: hidden;
  display: flex; flex-direction: column;
  position: relative; z-index: 1;
}
.tp-wheel-items {
  display: flex; flex-direction: column; align-items: center;
  transition: transform 0.25s ease;
}
.tp-wheel-item {
  height: 32px; display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 400; color: var(--at-muted);
  font-variant-numeric: tabular-nums;
  width: 100%; cursor: pointer;
  flex-shrink: 0;
}
.tp-wheel-item.selected {
  color: var(--at-ink); font-weight: 500; font-size: 20px;
}
.tp-separator { font-size: 20px; font-weight: 500; color: var(--at-ink); z-index: 4; }
/* 4 chips 2x2 grid */
.tp-quick-grid {
  margin-top: var(--at-s-md);
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;
}
.tp-quick-grid .tip-chip { justify-content: center; }
.tp-helper {
  margin-top: 8px; text-align: center;
  font-size: 11px; color: var(--at-muted);
}

/* Popup footer (Xác nhận button) */
.popup-foot {
  display: flex; justify-content: flex-end;
  margin-top: var(--at-s-sm);
  padding-top: var(--at-s-sm);
  border-top: 1px solid var(--at-hairline);
}
.popup-confirm { padding: 6px 14px; font-size: 12.5px; }

/* picker-display active state khi popup open */
.picker-display.open { border-color: var(--at-ink); }

/* Chips */
.tip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.tip-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 11px; background: var(--at-canvas);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-pill);
  font-size: 12.5px; font-weight: 500; color: var(--at-body);
  cursor: pointer; font-family: inherit; white-space: nowrap;
}
.tip-chip:active { background: var(--at-surface-soft); }
.tip-chip.active {
  background: var(--at-ink); color: var(--at-on-primary); border-color: var(--at-ink);
}
.tip-chip.smart {
  background: var(--at-cream); border-color: var(--at-mustard); color: var(--at-ink);
}

/* Duration — small tag chips trên 1 dòng (scroll-x nếu overflow) */
.duration-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--at-s-xs);
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.duration-end {
  font-size: 11.5px; color: var(--at-muted);
}
.duration-end b { color: var(--at-ink); font-weight: 500; }
.duration-end em { color: var(--at-muted); font-style: italic; font-size: 11px; }
/* End label bôi đậm số giờ + ngày */
.end-bold {
  color: var(--at-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ─── Phân loại lịch hẹn ─── */
.cat-row { display: flex; align-items: center; gap: 6px; }
.cat-row .plain-select { flex: 1; min-width: 0; }
.cat-add {
  flex-shrink: 0;
  width: 44px; height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  background: var(--at-canvas); color: var(--at-body);
  cursor: pointer; font-family: inherit;
}
.cat-add:hover { background: var(--at-surface-soft); color: var(--at-ink); }

.cat-new { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.cat-new-input {
  flex: 1; min-width: 0; height: 36px;
  padding: 0 var(--at-s-md);
  border: 1px solid var(--at-ink); border-radius: var(--at-r-sm);
  background: var(--at-canvas);
  font-family: inherit; font-size: 13.5px; color: var(--at-ink);
  outline: none;
}
.cat-new-ok, .cat-new-cancel {
  flex-shrink: 0; height: 36px; padding: 0 12px;
  border-radius: var(--at-r-sm);
  font-family: inherit; font-size: 12.5px; font-weight: 500;
  cursor: pointer;
}
.cat-new-ok {
  border: 1px solid var(--at-ink);
  background: var(--at-ink); color: var(--at-on-primary);
}
.cat-new-ok:disabled { opacity: 0.4; cursor: not-allowed; }
.cat-new-cancel {
  border: 1px solid var(--at-hairline);
  background: var(--at-canvas); color: var(--at-body);
}
.cat-new-cancel:hover { background: var(--at-surface-soft); }

.cat-custom-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.cat-tag {
  display: inline-flex; align-items: center; gap: 2px;
  height: 22px; padding: 0 4px 0 8px;
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-pill, 999px);
  background: var(--at-surface-soft);
  font-size: 11.5px; color: var(--at-body);
  max-width: 100%;
}
.cat-tag > button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px;
  border: none; border-radius: 50%;
  background: transparent; color: var(--at-muted);
  cursor: pointer; flex-shrink: 0;
}
.cat-tag > button:hover { background: var(--at-hairline); color: var(--at-ink); }

/* Phân công thời gian — select + ô "Khác…" */
.dur-row { display: flex; align-items: center; gap: 6px; }
.dur-row .plain-select { flex: 1; min-width: 0; }
.dur-custom {
  flex: 0 0 92px;
  height: 44px;
  padding: 0 10px;
  border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-sm);
  background: var(--at-canvas);
  font-family: inherit;
  font-size: 14px;
  color: var(--at-ink);
  outline: none;
}
.dur-custom:focus { border-color: var(--at-ink); }
.dur-unit { flex: none; font-size: 13px; color: var(--at-muted); }
.dur-warn {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  font-size: 11.5px;
  color: #8a5b08;
}

/* Dropdown trơn — "Phân loại lịch hẹn" + "Phân công thời gian" */
.plain-select {
  width: 100%;
  height: 44px;
  padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-sm);
  background: var(--at-canvas);
  font-family: inherit;
  font-size: 14px;
  color: var(--at-ink);
  outline: none;
}
.plain-select:focus { border-color: var(--at-ink); }
.plain-select { cursor: pointer; }

/* Location input wrap — icon prefix giống title */
.location-input-wrap {
  display: flex; align-items: center;
  width: 100%; height: 44px; padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  background: var(--at-canvas); gap: 8px;
}
.location-input-wrap:focus-within { border-color: var(--at-ink); }
.location-input-wrap .ic { font-size: 16px; flex-shrink: 0; }
.location-input {
  flex: 1; min-width: 0;
  border: none; outline: none; background: transparent;
  font-family: inherit; font-size: 14px; color: var(--at-ink);
}
.location-input::placeholder { color: var(--at-muted); font-weight: 500; }

/* Địa điểm: ô nhập (có nút bookmark bên trong) + nút mở danh sách đã lưu */
.location-row { display: flex; align-items: center; gap: 6px; }
.location-row .location-input-wrap { flex: 1; min-width: 0; }

.loc-save {
  flex-shrink: 0;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--at-r-sm);
  background: transparent; color: var(--at-muted);
  cursor: pointer; font-family: inherit;
}
.loc-save:hover:not(:disabled) { background: var(--at-surface-soft); color: var(--at-ink); }
.loc-save:disabled { opacity: 0.45; cursor: default; }

.loc-list-btn {
  flex-shrink: 0;
  position: relative;
  width: 44px; height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  background: var(--at-canvas); color: var(--at-body);
  cursor: pointer; font-family: inherit;
}
.loc-list-btn:hover { background: var(--at-surface-soft); }
.loc-list-btn.open { border-color: var(--at-ink); color: var(--at-ink); }
.loc-count {
  position: absolute; top: 4px; right: 4px;
  min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: 7px;
  background: var(--at-ink); color: var(--at-on-primary);
  font-size: 9px; font-weight: 700;
  display: grid; place-items: center;
}

.saved-loc-panel {
  margin-top: 6px;
  border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-sm);
  background: var(--at-canvas);
  max-height: 168px;
  overflow-y: auto;
}
.saved-loc-empty {
  padding: 10px var(--at-s-md);
  font-size: 12.5px;
  color: var(--at-muted);
}
.saved-loc-item {
  display: flex; align-items: center;
  border-bottom: 1px solid var(--at-hairline);
}
.saved-loc-item:last-child { border-bottom: none; }
.saved-loc-pick {
  flex: 1; min-width: 0;
  text-align: left;
  padding: 9px var(--at-s-md);
  border: none; background: transparent;
  font-family: inherit; font-size: 13px; color: var(--at-ink);
  cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.saved-loc-pick:hover { background: var(--at-surface-soft); }
.saved-loc-del {
  flex-shrink: 0;
  width: 30px; height: 30px; margin-right: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--at-r-sm);
  background: transparent; color: var(--at-muted);
  cursor: pointer;
}
.saved-loc-del:hover { background: var(--at-surface-soft); color: var(--at-ink); }

/* Notes textarea */
.notes-area {
  width: 100%; min-height: 56px; max-height: 120px;
  padding: 10px var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  font-family: inherit; font-size: 13.5px; color: var(--at-ink);
  background: var(--at-canvas); outline: none; resize: vertical;
}
.notes-area:focus { border-color: var(--at-ink); }
.notes-area::placeholder { color: var(--at-muted); font-style: italic; }

/* Buttons */
.at-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 18px; border-radius: var(--at-r-lg);
  font-size: 13.5px; font-weight: 500; cursor: pointer;
  font-family: inherit; white-space: nowrap; border: none;
}
.at-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.at-btn--primary { background: var(--at-ink); color: var(--at-on-primary); }
.at-btn--primary:active:not(:disabled) { background: var(--at-primary-active); }
.at-btn--secondary {
  background: var(--at-canvas); color: var(--at-ink);
  border: 1px solid var(--at-hairline);
}
.at-btn--secondary:active { background: var(--at-surface-soft); }

/* Error banner */
.error-banner {
  padding: 8px 12px;
  background: var(--at-coral-tint); color: var(--at-coral-text);
  border-radius: var(--at-r-sm);
  font-size: 12.5px;
}

/* ─── Mobile ─── */
@media (max-width: 600px) {
  .editor-backdrop { padding: 0; }
  .editor {
    width: 100%; max-width: 100%; max-height: 100vh;
    height: 100vh; border-radius: 0;
  }
  .editor-body { padding: var(--at-s-sm) var(--at-s-md); }
  .editor-foot { padding: var(--at-s-sm) var(--at-s-md); flex-direction: column-reverse; gap: var(--at-s-xs); }
  .editor-foot .actions { width: 100%; }
  .editor-foot .actions .at-btn { flex: 1; }
  .row-2 { grid-template-columns: 1fr 1fr; gap: 8px; }
  .type-row { display: grid; grid-template-columns: repeat(2, 1fr); }
  .type-chip { min-width: 0; }
  .duration-grid { grid-template-columns: repeat(3, 1fr); }
  .picker-popup { width: 100%; }
}

/* ═══ Hi-CRM theme polish ═══════════════════════════
   Đổi accent từ --at-ink (đen trung tính) → brand teal-blue HS; hàng KH liên kết
   từ coral (đỏ) → brand-soft. --brand* là token global (hs-crm-theme.css). Đặt
   CUỐI block để thắng cascade (cùng specificity → rule sau thắng). */
.editor { border-top: 3px solid var(--brand, #1786be); }
.editor-head { background: linear-gradient(180deg, var(--brand-softer, #f2f8fc), var(--at-canvas, #fff)); }
.editor-head h2 { color: var(--brand-700, #0b5880); font-weight: 700; display: flex; align-items: center; gap: 7px; }
.editor-head h2 .head-ic { color: var(--brand, #1786be); }

/* Icon MDI inline (thay emoji) — căn giữa theo dòng chữ, kế thừa màu chữ */
.editor :deep(.v-icon),
.picker-popup :deep(.v-icon) { vertical-align: middle; }

/* Hàng KH liên kết: coral → brand-soft, chữ về ink bình thường */
.linked-kh-row { background: var(--brand-soft, #e4f1f8); }
.linked-kh-row .linked-info { color: var(--at-ink, #1f2d3d); }
.link-kh-btn { color: var(--brand-700, #0b5880); }
.link-kh-btn:hover { background: var(--brand-softer, #f2f8fc); border-color: var(--brand, #1786be); }

/* Focus → viền + glow brand */
.title-input-wrap:focus-within,
.location-input-wrap:focus-within,
.sale-select:focus,
.cust-suggest-search:focus,
.notes-area:focus,
.picker-display.open { border-color: var(--brand, #1786be); box-shadow: 0 0 0 3px var(--brand-soft, #e4f1f8); }

/* Chips đang chọn → brand */
.type-chip.active,
.tag-chip.active,
.tip-chip.active,
.loc-chip.active { background: var(--brand-soft, #e4f1f8); border-color: var(--brand, #1786be); color: var(--brand-700, #0b5880); }

/* Ngày/giờ đang chọn → brand */
.dp-day.today { background: var(--brand, #1786be); color: #fff; }
.dp-day.selected:not(.today) { background: var(--brand-soft, #e4f1f8); color: var(--brand-700, #0b5880); border-color: var(--brand, #1786be); }
.tp-wheel-item.selected { color: var(--brand-700, #0b5880); }

/* Nút primary (Tạo/Cập nhật + Xác nhận popup) → brand */
.at-btn--primary { background: var(--brand, #1786be); color: #fff; }
.at-btn--primary:hover:not(:disabled) { background: var(--brand-600, #0f6fa0); }
.at-btn--primary:active:not(:disabled) { background: var(--brand-700, #0b5880); }
</style>
