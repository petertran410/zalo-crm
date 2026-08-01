<template>
  <!-- Atlas People — màn gộp "Bạn bè" + "Khách hàng" (design CRM Atlas No-Blur, 2026-07-29).
       Toàn bộ token màu nằm trong :root của .people → dark mode chỉ đổi data-theme,
       KHÔNG đụng theme global (index.html khai báo color-scheme: light only). -->
  <div class="people" :data-theme="theme">
    <!-- ═══════════ HEADER ═══════════ -->
    <header class="ppl-head">
      <div class="ppl-head-row">
        <div class="ppl-title">
          <h1>Khách hàng</h1>
        </div>

        <label class="ppl-search" :class="{ on: !!q }">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" /></svg>
          <input v-model="q" placeholder="Tìm khách hàng…" title="Tìm theo tên, SĐT, UID hoặc @username" @input="onQueryInput" />
          <span v-if="q" class="ppl-search-x" @click="clearQuery">×</span>
        </label>

        <!-- 2026-07-31: modal giờ làm 2 việc — liên kết KH có sẵn bên POS, hoặc
             tạo KH mới (Zalo/Facebook chưa có ở POS). Nhãn giữ "Thêm khách". -->
        <button class="ppl-btn-primary" @click="openAdd">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 4v12M4 10h12" /></svg>
          Thêm khách
        </button>

        <button class="ppl-theme" :title="theme === 'dark' ? 'Chuyển nền sáng' : 'Chuyển nền tối'" @click="toggleTheme">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 12.4A6.2 6.2 0 0 1 7.6 4.5a6.5 6.5 0 1 0 7.9 7.9Z" /></svg>
          {{ theme === 'dark' ? 'Sáng' : 'Tối' }}
        </button>
      </div>

      <!-- ─── Thanh lọc ─── -->
      <div class="ppl-tools">
        <button class="ppl-chip-btn" :class="{ open: menu === 'filters', armed: activeCount > 0 }" @click="toggleMenu('filters')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5.5h14M6 10h8M8.5 14.5h3" /></svg>
          Bộ lọc
          <span v-if="activeCount" class="ppl-count-badge">{{ activeCount }}</span>
        </button>

        <!-- Thùng rác đã gỡ khỏi màn này 2026-07-31 (anh chốt) — xem/khôi phục/xoá
             vĩnh viễn đều ở Cài đặt › Thùng rác, owner-only. -->
        <button class="ppl-chip-btn" :class="{ open: menu === 'sort' }" @click="toggleMenu('sort')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="14" height="12.5" rx="2.2" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></svg>
          Thời gian &amp; sắp xếp
          <span class="ppl-chip-sum">{{ sortSummary }}</span>
        </button>

        <span v-if="activeCount" class="ppl-clear" @click="clearAll">Xoá lọc</span>

        <div class="ppl-meta">
          <span :title="countApprox ? 'Máy chủ phân trang theo lần tương tác cuối; đang lọc thêm theo mốc khác nên tổng là ước lượng.' : ''">
            <strong>{{ rows.length }}</strong> / {{ countApprox ? '~' : '' }}{{ total }} khách
          </span>
          <span class="ppl-live"><span class="ppl-live-dot"></span>Trực tiếp</span>
        </div>

        <!-- ── MENU: Bộ lọc ── -->
        <template v-if="menu === 'filters'">
          <div class="ppl-scrim" @click="menu = null"></div>
          <div class="ppl-menu ppl-menu--filters">
            <div class="ppl-grp">
              <div class="ppl-grp-t">Bộ lọc đã lưu</div>
              <div class="ppl-set-row">
                <span
                  v-for="s in savedSets" :key="s.key"
                  class="ppl-set" :class="{ on: f.set === s.key }"
                  @click="pickSet(s)"
                >
                  {{ s.name }}
                  <span v-if="s.builtin" class="ppl-set-n">•</span>
                  <span v-else class="ppl-set-x" @click.stop="deleteSet(s)">×</span>
                </span>
              </div>
              <div class="ppl-set-save">
                <input v-model="setName" placeholder="Tên bộ lọc…" @keyup.enter="saveSet" />
                <button @click="saveSet">Lưu hiện tại</button>
              </div>
            </div>

            <div class="ppl-grp">
              <div class="ppl-grp-t">Quan hệ Zalo</div>
              <div class="ppl-seg">
                <span
                  v-for="r in REL_OPTIONS" :key="r.value"
                  class="ppl-seg-i" :class="{ on: f.rel.includes(r.value) }"
                  @click="toggleRel(r.value)"
                >{{ r.label }}</span>
              </div>
            </div>

            <div class="ppl-grid2">
              <div class="ppl-field">
                <span class="ppl-field-l">Nhân viên phụ trách</span>
                <select v-model="f.employee" @change="applyFilters">
                  <option value="">Tất cả</option>
                  <option v-for="u in users" :key="u.id" :value="u.id">{{ u.fullName }}</option>
                </select>
              </div>
              <div class="ppl-field">
                <span class="ppl-field-l">Trạng thái KH</span>
                <select v-model="f.statusId" @change="applyFilters">
                  <option value="">Tất cả trạng thái</option>
                  <option v-for="s in statuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="ppl-field">
                <span class="ppl-field-l">Nguồn khách</span>
                <select v-model="f.source" @change="applyFilters">
                  <option value="">Tất cả nguồn</option>
                  <option v-for="o in SOURCE_OPTIONS" :key="o.value" :value="o.value">{{ o.text }}</option>
                </select>
              </div>
              <div class="ppl-field">
                <span class="ppl-field-l">Loại liên hệ</span>
                <select v-model="f.type" @change="applyFilters">
                  <option value="">Cá nhân hoặc nhóm</option>
                  <option value="user">Cá nhân</option>
                  <option value="group">Nhóm</option>
                </select>
              </div>
            </div>

            <div class="ppl-grp">
              <div class="ppl-grp-t">Có Zalo</div>
              <div class="ppl-seg">
                <span
                  v-for="z in ZALO_OPTIONS" :key="z.value"
                  class="ppl-seg-i" :class="{ on: f.zalo === z.value }"
                  @click="f.zalo = z.value; applyFilters()"
                >{{ z.label }}</span>
              </div>
            </div>

            <div class="ppl-menu-foot">
              <span class="ppl-clear" @click="clearAll">Xoá tất cả</span>
              <button class="ppl-btn-primary sm" @click="menu = null">Xem {{ total }} kết quả</button>
            </div>
          </div>
        </template>

        <!-- ── MENU: Thời gian & sắp xếp ── -->
        <template v-if="menu === 'sort'">
          <div class="ppl-scrim" @click="menu = null"></div>
          <div class="ppl-menu ppl-menu--sort">
            <div class="ppl-grp">
              <div class="ppl-grp-row">
                <div class="ppl-grp-t">Khoảng ngày</div>
                <div class="ppl-range-lbl">{{ rangeLabel }}</div>
              </div>
              <div class="ppl-preset-row">
                <span
                  v-for="p in PRESETS" :key="p.label"
                  class="ppl-preset" :class="{ on: isPresetOn(p) }"
                  @click="pickPreset(p)"
                >{{ p.label }}</span>
              </div>
              <div class="ppl-cals">
                <div class="ppl-cal">
                  <div class="ppl-cal-h">
                    <span class="ppl-cal-nav" @click="shiftMonth(-1)">‹</span>
                    <span class="ppl-cal-m">{{ monthLabel(0) }}</span>
                  </div>
                  <div class="ppl-cal-g">
                    <span v-for="(w, i) in DOW" :key="'a' + i" class="ppl-dow">{{ w }}</span>
                    <span
                      v-for="(d, i) in monthGrid(0)" :key="'ca' + i"
                      class="ppl-day" :class="d.cls" @click="d.date && pickDay(d.date)"
                    >{{ d.label }}</span>
                  </div>
                </div>
                <div class="ppl-cal">
                  <div class="ppl-cal-h">
                    <span class="ppl-cal-m">{{ monthLabel(1) }}</span>
                    <span class="ppl-cal-nav" @click="shiftMonth(1)">›</span>
                  </div>
                  <div class="ppl-cal-g">
                    <span v-for="(w, i) in DOW" :key="'b' + i" class="ppl-dow">{{ w }}</span>
                    <span
                      v-for="(d, i) in monthGrid(1)" :key="'cb' + i"
                      class="ppl-day" :class="d.cls" @click="d.date && pickDay(d.date)"
                    >{{ d.label }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ppl-time-row">
              <div class="ppl-field">
                <span class="ppl-field-l">Giờ trong ngày từ</span>
                <input v-model="f.tFrom" type="time" class="ppl-time" />
              </div>
              <div class="ppl-field">
                <span class="ppl-field-l">đến</span>
                <input v-model="f.tTo" type="time" class="ppl-time" />
              </div>
              <div class="ppl-field grow">
                <span class="ppl-field-l">Thứ tự</span>
                <div class="ppl-seg">
                  <span class="ppl-seg-i" :class="{ on: f.dir === 'desc' }" @click="f.dir = 'desc'">Mới nhất trước</span>
                  <span class="ppl-seg-i" :class="{ on: f.dir === 'asc' }" @click="f.dir = 'asc'">Cũ nhất trước</span>
                </div>
              </div>
            </div>
            <!-- Cuối menu (anh chốt 2026-07-29): mặc định "Tất cả", bấm lại ô đang
                 bật để tắt. Giải thích chuyển sang title= cho gọn. -->
            <div class="ppl-grp">
              <div class="ppl-grp-t">Mốc</div>
              <div class="ppl-seg">
                <span
                  class="ppl-seg-i" :class="{ on: !f.field }"
                  title="Không lọc theo mốc — giữ thứ tự tương tác mới nhất trước"
                  @click="f.field = ''"
                >Tất cả</span>
                <span
                  v-for="o in FIELD_OPTIONS" :key="o.value"
                  class="ppl-seg-i" :class="{ on: f.field === o.value }"
                  :title="`Lọc & sắp xếp theo ${o.label}. KH trống mốc này sẽ bị loại. Bấm lại để tắt.`"
                  @click="pickField(o.value)"
                >{{ o.label }}</span>
              </div>
            </div>

            <div class="ppl-menu-foot">
              <span class="ppl-clear" @click="resetTime">Đặt lại ngày &amp; giờ</span>
              <button class="ppl-btn-primary sm" @click="onApplySort">Áp dụng</button>
            </div>
          </div>
        </template>
      </div>
    </header>

    <!-- ═══════════ BULK BAR ═══════════ -->
    <div v-if="canArchive && selected.size > 0" class="ppl-bulk">
      <span class="ppl-bulk-n">Đã chọn <b>{{ selected.size }}</b> khách</span>
      <span class="ppl-clear" @click="selected = new Set()">Bỏ chọn</span>
      <div class="ppl-bulk-sp"></div>
      <button class="ppl-bulk-btn danger" :disabled="bulkWorking" @click="onBulkArchive">
        {{ bulkWorking ? 'Đang xử lý…' : 'Chuyển vào thùng rác' }}
      </button>
    </div>

    <!-- ═══════════ DANH SÁCH ═══════════ -->
    <div ref="listEl" class="ppl-list" :style="{ opacity: (drawerOpen || menu) ? 0.5 : 1 }" @scroll="onScroll">
      <div class="ppl-cols">
        <span v-if="canArchive" class="c-check">
          <input type="checkbox" :checked="allSelected" title="Chọn tất cả đang hiển thị" @change="toggleSelectAll(($event.target as HTMLInputElement).checked)" />
        </span>
        <span class="c-person">Khách hàng</span>
        <span class="c-chan">Kênh phụ trách</span>
        <span class="c-tags">Thẻ</span>
        <span class="c-sent" :class="{ on: f.field === 'sent' }" @click="setField('sent')">Nhắn cuối {{ arrow('sent') }}</span>
        <span class="c-created" :class="{ on: f.field === 'created' }" @click="setField('created')">Ngày tạo {{ arrow('created') }}</span>
        <span class="c-inter" :class="{ on: f.field === 'inter' }" @click="setField('inter')">Tương tác {{ arrow('inter') }}</span>
      </div>

      <!-- Skeleton lần tải đầu -->
      <div v-if="booting" class="ppl-rows">
        <div v-for="s in SKEL" :key="s.w1" class="ppl-skel">
          <span class="sk-av"></span>
          <span class="sk-lines">
            <span class="sk-l" :style="{ width: s.w1 }"></span>
            <span class="sk-l sm" :style="{ width: s.w2 }"></span>
          </span>
          <span class="sk-pill"></span>
        </div>
      </div>

      <!-- Dữ liệu -->
      <div v-else-if="rows.length" class="ppl-rows">
        <div
          v-for="r in rows" :key="r.id"
          class="ppl-row" :class="{ sel: r.id === selectedId, flash: r.id === flashId, picked: selected.has(r.id) }"
          @click="openDrawer(r)"
        >
          <span v-if="canArchive" class="c-check" @click.stop>
            <input
              type="checkbox"
              :checked="selected.has(r.id)"
              @change="toggleSelectOne(r.id, ($event.target as HTMLInputElement).checked)"
            />
          </span>
          <span class="c-person">
            <span class="ppl-av" :style="{ background: hueOf(r.id) }">
              <img v-if="r.avatarUrl" :src="r.avatarUrl" alt="" referrerpolicy="no-referrer" @error="onAvatarError" />
              <template v-else>{{ initialsOf(r) }}</template>
            </span>
            <span class="ppl-person-txt">
              <span class="ppl-nm-line">
                <span class="ppl-nm" :class="{ unnamed: !hasName(r) }">{{ displayNameOf(r) }}</span>
                <span v-if="r.id === flashId" class="ppl-new">Vừa cập nhật</span>
              </span>
              <span class="ppl-sub2">
                <span>{{ genderLabel(r.gender) }}</span>
                <span class="ppl-dot"></span>
                <span>{{ r.phone || 'Chưa có SĐT' }}</span>
              </span>
            </span>
          </span>

          <span class="c-chan ppl-chan">
            <span class="ppl-chan-dot" :style="{ background: relColor(primaryRelOf(r)) }"></span>
            <span class="ppl-chan-nm" :class="{ faint: !channelOf(r) }">{{ channelOf(r) || 'Không có kênh' }}</span>
            <span v-if="extraNickCount(r) > 0" class="ppl-chan-more">+{{ extraNickCount(r) }}</span>
          </span>

          <span class="c-tags ppl-tags">
            <span v-for="t in (r.tags || []).slice(0, 2)" :key="t" class="ppl-tag">{{ t }}</span>
            <span v-if="(r.tags || []).length > 2" class="ppl-tag-more">+{{ r.tags.length - 2 }}</span>
          </span>

          <span class="c-sent ppl-time-cell">
            <span v-if="isRedacted(r)" class="ppl-lock" title="Vai trò của bạn không xem được nội dung tin nhắn">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4.5" y="9" width="11" height="7.5" rx="1.5" /><path d="M7.2 9V7a2.8 2.8 0 0 1 5.6 0v2" /></svg>
              Hạn chế
            </span>
            <template v-else>{{ r.lastOutboundAt ? fmtStamp(r.lastOutboundAt) : '—' }}</template>
          </span>

          <span class="c-created ppl-time-cell">{{ r.createdAt ? fmtStamp(r.createdAt) : '—' }}</span>
          <!-- lastActivity = MAX(inbound|outbound|interaction) → "tin cuối của bất kỳ bên nào" -->
          <span class="c-inter ppl-time-cell">{{ r.lastActivity ? fmtStamp(r.lastActivity) : '—' }}</span>
        </div>

        <div v-if="loadingMore" class="ppl-more"><span class="ppl-spin"></span></div>
        <div v-else-if="allLoaded" class="ppl-alldone">Hết · {{ total }}</div>
      </div>

      <!-- Lỗi tải: PHẢI tách khỏi empty state — trước đây fetch fail hiện
           "không ai khớp", sale tưởng là do bộ lọc (2026-07-29). -->
      <div v-else-if="fetchError" class="ppl-blank">
        <div class="ppl-blank-ico err">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 3.5 17.5 17H2.5z" /><path d="M10 8.5v3.5M10 14.2v.3" /></svg>
        </div>
        <div class="ppl-blank-t">Không tải được danh sách</div>
        <div class="ppl-blank-d">{{ fetchError }}</div>
        <button class="ppl-btn-primary" @click="fetchPage(true)">Thử lại</button>
      </div>

      <!-- Không có kết quả -->
      <div v-else class="ppl-blank">
        <div v-if="!activeCount" class="ppl-blank-ico">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="7" r="3" /><path d="M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5" /></svg>
        </div>
        <div class="ppl-blank-t">{{ activeCount ? `Không có ai khớp (${activeCount} bộ lọc)` : 'Chưa có khách hàng' }}</div>
        <button v-if="activeCount" class="ppl-btn-ghost" @click="clearAll">Xoá bộ lọc</button>
        <button v-else class="ppl-btn-primary" @click="openAdd">Thêm khách đầu tiên</button>
      </div>
    </div>

    <!-- ═══════════ DRAWER CHI TIẾT ═══════════ -->
    <div v-if="drawerOpen && detail" class="ppl-drawer">
      <div class="ppl-dr-head">
        <div class="ppl-dr-top">
          <div class="ppl-dr-av" :style="{ background: hueOf(detail.id) }">
            <img v-if="detail.avatarUrl" :src="detail.avatarUrl" alt="" referrerpolicy="no-referrer" @error="onAvatarError" />
            <template v-else>{{ initialsOf(detail) }}</template>
          </div>
          <div class="ppl-dr-idt">
            <div class="ppl-dr-nm-row">
              <h2 :class="{ unnamed: !hasName(detail) }">{{ displayNameOf(detail) }}</h2>
              <span v-if="statusNameOf(detail)" class="ppl-dr-status">{{ statusNameOf(detail) }}</span>
            </div>
            <div class="ppl-dr-meta">{{ genderAgeOf(detail) }} · {{ detail.phone || 'Chưa có SĐT' }} · {{ locationOf(detail) || 'Chưa có địa chỉ' }}</div>
            <div class="ppl-dr-pills">
              <span class="ppl-dr-pill"><span class="ppl-chan-dot" :style="{ background: relColor(primaryRelOf(detail)) }"></span>{{ relLabel(primaryRelOf(detail)) }}</span>
              <span class="ppl-dr-pill">{{ detail.email || 'Chưa có email' }}</span>
            </div>
          </div>
          <button class="ppl-dr-x" @click="closeDrawer">×</button>
        </div>

        <div class="ppl-dr-actions">
          <button class="ppl-btn-primary sm" :disabled="openingChat" @click="openChat">
            {{ openingChat ? 'Đang mở…' : (channelOf(detail) ? 'Mở chat Zalo' : 'Mở chat nội bộ') }}
          </button>
          <div class="ppl-dr-tags">
            <span v-for="t in (draft.tags || [])" :key="t" class="ppl-tag editable">
              {{ t }}<span class="ppl-tag-x" @click="removeTag(t)">×</span>
            </span>
            <input v-model="tagDraft" class="ppl-tag-input" placeholder="+ thẻ" @keyup.enter="addTag" />
          </div>
        </div>

        <div class="ppl-tabs">
          <div
            v-for="t in TABS" :key="t.value"
            class="ppl-tab" :class="{ on: tab === t.value }"
            @click="tab = t.value"
          >{{ t.label }}</div>
        </div>
      </div>

      <div class="ppl-dr-body">
        <!-- ── Tổng quan ── -->
        <div v-if="tab === 'over'" class="ppl-pane">
          <div class="ppl-grp">
            <div class="ppl-grp-t">Thông tin cá nhân</div>
            <div class="ppl-grid2">
              <label v-for="fd in personalFields" :key="fd.key" class="ppl-input-box">
                <span class="ppl-input-l">{{ fd.label }}</span>
                <input v-model="(draft as any)[fd.key]" :placeholder="fd.ph" @change="dirty = true" />
              </label>
            </div>
          </div>

          <div class="ppl-grp">
            <div class="ppl-grp-t">Thông tin chăm sóc</div>
            <div class="ppl-grid2">
              <div class="ppl-input-box">
                <span class="ppl-input-l">Sale phụ trách</span>
                <select v-model="draft.assignedUserId" @change="dirty = true">
                  <option :value="null">— chưa gán —</option>
                  <option v-for="u in users" :key="u.id" :value="u.id">{{ u.fullName }}</option>
                </select>
              </div>
              <div class="ppl-input-box">
                <span class="ppl-input-l">Trạng thái KH</span>
                <select v-model="draft.statusId" @change="dirty = true">
                  <option :value="null">— chưa đặt —</option>
                  <option v-for="s in statuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="ppl-input-box">
                <span class="ppl-input-l">Nguồn khách</span>
                <select v-model="draft.source" @change="dirty = true">
                  <option :value="null">— chưa rõ —</option>
                  <option v-for="o in SOURCE_OPTIONS" :key="o.value" :value="o.value">{{ o.text }}</option>
                </select>
              </div>
              <div class="ppl-input-box">
                <span class="ppl-input-l">Giới tính</span>
                <select v-model="draft.gender" @change="dirty = true">
                  <option :value="null">— chưa rõ —</option>
                  <option v-for="g in GENDER_OPTIONS" :key="g.value" :value="g.value">{{ g.text }}</option>
                </select>
              </div>
            </div>
          </div>

          <div class="ppl-grp">
            <div class="ppl-grp-row">
              <div class="ppl-grp-t">Biến cá nhân hoá</div>
              <div class="ppl-grp-side" title="Bấm một dòng để copy mã biến">{{ resolvedVars.length }}</div>
            </div>
            <div class="ppl-vars">
              <div
                v-for="v in resolvedVars" :key="v.code"
                class="ppl-var" :class="{ copied: copiedCode === v.code }"
                @click="copyVar(v.code)"
              >
                <span class="ppl-var-c">{{ v.code }}</span>
                <span class="ppl-var-v">{{ v.value }}</span>
                <span v-if="copiedCode === v.code" class="ppl-var-ok">ĐÃ COPY</span>
              </div>
            </div>
          </div>

          <div class="ppl-save-bar">
            <button class="ppl-btn-primary sm" :disabled="!dirty || saving" @click="saveContact">
              {{ saving ? 'Đang lưu…' : 'Lưu thay đổi' }}
            </button>
          </div>
        </div>

        <!-- ── Kênh (nick) ── -->
        <div v-else-if="tab === 'chan'" class="ppl-pane">
          <div v-if="!(detail.friends || []).length" class="ppl-nochan">
            <div class="ppl-nochan-t">Chưa có kênh Zalo nào</div>
            <button class="ppl-btn-primary sm" :disabled="openingChat" @click="openChat">
              {{ openingChat ? 'Đang mở…' : 'Mở hội thoại nội bộ' }}
            </button>
          </div>
          <div v-for="ch in detail.friends || []" :key="ch.id" class="ppl-chan-card">
            <div class="ppl-chan-card-h">
              <span class="ppl-chan-dot" :style="{ background: relColor(ch.relationshipKind) }"></span>
              <span class="ppl-chan-card-nm">{{ ch.zaloAccount?.displayName || ch.zaloAccount?.phone || 'Nick' }}</span>
              <span class="ppl-chan-card-rel">{{ relLabel(ch.relationshipKind) }}</span>
            </div>
            <div class="ppl-chan-grid">
              <label class="ppl-input-box flat">
                <span class="ppl-input-l">Tên gợi nhớ</span>
                <input
                  :value="chanEdit[ch.id]?.alias ?? (ch as any).aliasInNick ?? ''"
                  @change="onChanEdit(ch, 'alias', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <div class="ppl-input-box flat">
                <span class="ppl-input-l">Trạng thái</span>
                <select
                  :value="chanEdit[ch.id]?.statusId ?? (ch as any).statusId ?? ''"
                  @change="onChanEdit(ch, 'statusId', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">— đặt —</option>
                  <option v-for="s in statuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
            </div>
            <div class="ppl-chan-foot">
              <button class="ppl-btn-ghost sm" @click="openChatForFriend(ch)">Mở chat này</button>
              <!-- Tách nick thành KH riêng — chuyển từ nút ⬆ ở child row cũ về đây
                   (anh chốt 2026-07-29). Chỉ hiện khi KH có ≥2 nick, vì tách nick
                   duy nhất ra thì KH cha rỗng. -->
              <button
                v-if="(detail.friends || []).length > 1"
                class="ppl-btn-ghost sm"
                :disabled="promoting === ch.id"
                title="Tách kênh này thành một khách hàng riêng"
                @click="onPromote(ch)"
              >{{ promoting === ch.id ? 'Đang tách…' : 'Tách thành KH riêng' }}</button>
            </div>
          </div>
        </div>

        <!-- ── Lịch sử ── -->
        <div v-else-if="tab === 'hist'" class="ppl-pane">
          <div v-if="loadingTimeline" class="ppl-inline-load">Đang tải lịch sử…</div>
          <div v-else-if="!timeline.length" class="ppl-inline-load">Chưa có hoạt động nào.</div>
          <div v-for="(h, i) in timeline" :key="i" class="ppl-hist">
            <div class="ppl-hist-rail"><span class="ppl-hist-dot"></span><span class="ppl-hist-line"></span></div>
            <div class="ppl-hist-card">
              <div class="ppl-hist-h">
                <span class="ppl-hist-t">{{ h.title }}</span>
                <span class="ppl-hist-w">{{ h.when }}</span>
              </div>
              <div v-if="h.desc" class="ppl-hist-d">{{ h.desc }}</div>
            </div>
          </div>
        </div>

        <!-- ── Ghi chú ── -->
        <div v-else class="ppl-pane">
          <div class="ppl-note-new">
            <textarea v-model="noteDraft" placeholder="Ghi chú…"></textarea>
            <button class="ppl-btn-primary sm" :disabled="!noteDraft.trim() || savingNote" @click="saveNote">Lưu ghi chú</button>
          </div>
          <div v-if="loadingNotes" class="ppl-inline-load">Đang tải ghi chú…</div>
          <div v-for="n in notes" :key="n.id" class="ppl-note-card">
            <div class="ppl-note-h">
              <span class="ppl-note-av">{{ initialsOfName(n.author) }}</span>
              <span class="ppl-note-a">{{ n.author }}</span>
              <span class="ppl-note-w">{{ n.when }}</span>
            </div>
            <div class="ppl-note-b">{{ n.body }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ LIÊN KẾT KHÁCH HÀNG (2026-07-31) ═══════════
         Trước đây là "Thêm nhanh" (Họ tên + SĐT → quick-create). Anh chốt: bỏ
         tạo mới, bắt buộc gõ SĐT rồi chọn đúng KH đã có để liên kết. -->
    <div v-if="addOpen" class="ppl-modal-wrap">
      <div class="ppl-modal-scrim" @click="closeAdd"></div>
      <div class="ppl-modal">
        <h3>Thêm khách hàng</h3>
        <div class="ppl-modal-sub">Nhập SĐT để tìm khách có sẵn bên POS. Khách mới từ Zalo/Facebook chưa có ở POS thì tạo mới bên dưới.</div>
        <label class="ppl-input-box">
          <span class="ppl-input-l">Số điện thoại</span>
          <input
            v-model="addPhone" class="mono" placeholder="09…"
            type="tel" inputmode="tel" autocomplete="tel"
            @input="onAddPhoneInput" />
        </label>

        <div class="ppl-link-res">
          <div v-if="linkSearching" class="ppl-link-note">Đang tìm…</div>
          <div v-else-if="linkError" class="ppl-link-note warn">{{ linkError }}</div>
          <div v-else-if="linkSearched && !linkResults.length" class="ppl-link-note">
            Không có khách nào khớp SĐT này.
          </div>
          <!-- linked = đã có Contact trong CRM → làm mờ, không bấm được (2026-07-31) -->
          <button
            v-for="c in linkResults" :key="candidateKey(c)" type="button"
            class="ppl-link-row"
            :class="{
              on: linkPicked && candidateKey(linkPicked) === candidateKey(c),
              off: c.linked || !c.accessible,
            }"
            :disabled="c.linked || !c.accessible || linkSaving"
            @click="linkPicked = c"
          >
            <span class="ppl-link-nm">{{ candidateDisplayName(c) }}</span>
            <span class="ppl-link-meta">
              <span class="ppl-link-ph mono">{{ c.phone || '—' }}</span>
              <!-- Lý do disable phải là CHỮ, không chỉ tooltip: bàn phím và trình
                   đọc màn hình không thấy title, chỉ gặp nút xám không rõ vì sao. -->
              <span v-if="!c.accessible" class="ppl-link-tag">sale khác chăm</span>
              <span v-else-if="c.linked" class="ppl-link-tag">đã có</span>
              <span v-else-if="c.contactId" class="ppl-link-tag">chưa mua</span>
            </span>
          </button>
          <div v-if="linkSearched && linkTruncated" class="ppl-link-note">
            Còn khách khác khớp số này chưa hiện — gõ thêm chữ số cho gọn danh sách.
          </div>
        </div>

        <!-- KH mới tinh từ Zalo/Facebook — chưa có ở POS lẫn CRM. Chỉ mở khi
             không có dòng "đã có" nào, để không tạo trùng KH sẵn có. -->
        <div v-if="canCreate" class="ppl-link-new">
          <div class="ppl-link-new-t">Không thấy khách? Tạo mới với SĐT này.</div>
          <label class="ppl-input-box">
            <span class="ppl-input-l">Họ tên</span>
            <input v-model="createName" placeholder="Nguyễn Văn A" @input="linkPicked = null" />
          </label>
        </div>

        <div class="ppl-modal-foot">
          <span class="ppl-clear" @click="closeAdd">Huỷ</span>
          <button class="ppl-btn-primary sm" :disabled="primaryDisabled" @click="submitPrimary">
            {{ primaryLabel }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════ CẢNH BÁO: chọn ngày bắt đầu mà chưa chọn ngày kết thúc ═══════════ -->
    <div v-if="warnNoEndDate" class="ppl-modal-wrap">
      <div class="ppl-modal-scrim" @click="warnNoEndDate = false"></div>
      <div class="ppl-modal ppl-modal--warn">
        <div class="ppl-warn-head">
          <span class="ppl-warn-ico">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3.5 17 16H3z" /><path d="M10 8v3.5M10 13.5v.5" /></svg>
          </span>
          <div>
            <h3>Chưa chọn ngày kết thúc</h3>
            <div class="ppl-modal-sub">Đang có {{ f.from ? fmtDate(f.from) : '' }} → chưa chốt khoảng.</div>
          </div>
        </div>
        <div class="ppl-modal-foot">
          <span class="ppl-clear" @click="warnNoEndDate = false">Để tôi chọn tiếp</span>
          <button class="ppl-btn-primary sm" @click="applyToToday">Lấy đến hôm nay</button>
        </div>
      </div>
    </div>

    <div v-if="toastMsg" class="ppl-toast">{{ toastMsg }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * PeopleView.vue — màn gộp "Bạn bè" + "Khách hàng" (2026-07-29).
 *
 * Thiết kế: CRM Atlas No-Blur (claude.ai/design). Giữ nguyên hệ thống thị giác
 * (token màu, bo góc, typography, drawer 566px), nhãn dịch sang tiếng Việt cho khớp app.
 *
 * Ràng buộc backend đã kiểm chứng (contact-routes.ts):
 *   - relationshipKindAny nhận CSV → lọc quan hệ Zalo đa chọn chạy server-side.
 *   - dateFrom/dateTo lọc theo lastActivity → mốc "ngày tạo"/"nhắn cuối" chỉ đổi cột sắp xếp.
 *   - sort chỉ có 'score' | mặc định → sắp xếp theo cột + giờ trong ngày làm client-side
 *     trên các dòng đã tải (đã ghi chú ngay trong menu cho sale biết).
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/index';
import {
  useContacts,
  SOURCE_OPTIONS,
  GENDER_OPTIONS,
  type Contact,
} from '@/composables/use-contacts';
import { useFriendSocket, type FriendUpdatedPayload } from '@/composables/use-friend-socket';
import { useContactPhoneSearch, candidateDisplayName, candidateKey, type PosLinkCandidate } from '@/composables/use-contact-phone-search';
import { displayCustomerName, customerInitials } from '@/composables/use-friend-display';
import { TEMPLATE_VARIABLES } from '@/constants/template-variables';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { useConfirm } from '@/composables/use-confirm';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const { confirm } = useConfirm();
const {
  updateContact,
  bulkArchiveContacts,
} = useContacts();

// 2026-07-31 (anh chốt): xoá KH giờ CHỈ owner — trước đây mở cho grant
// contact.delete (Admin / Trưởng phòng / Sale Senior). Backend cũng đã siết
// theo user.role === 'owner' nên đây chỉ là lớp ẩn UI, không phải lớp chặn.
const canArchive = computed(() => authStore.isOwner);

// ─────────────────────── Hằng số UI ───────────────────────
const PAGE_SIZE = 20;
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const SKEL = [
  { w1: '46%', w2: '30%' }, { w1: '36%', w2: '42%' }, { w1: '52%', w2: '26%' },
  { w1: '30%', w2: '38%' }, { w1: '44%', w2: '32%' }, { w1: '38%', w2: '46%' },
  { w1: '50%', w2: '28%' },
];
const REL_OPTIONS = [
  { value: 'friend', label: 'Đã kết bạn' },
  { value: 'pending_friend', label: 'Đã mời' },
  { value: 'chatting_stranger', label: 'Người lạ' },
  { value: 'ghost', label: 'Đã ngắt' },
];
const ZALO_OPTIONS: Array<{ value: '' | 'true' | 'false'; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'true', label: 'Có Zalo' },
  { value: 'false', label: 'Không Zalo' },
];
const FIELD_OPTIONS = [
  { value: 'inter', label: 'Tương tác cuối' },
  { value: 'created', label: 'Ngày tạo' },
  { value: 'sent', label: 'Nhắn cuối' },
] as const;
const PRESETS = [
  { label: 'Mọi lúc', days: null as number | null },
  { label: '7 ngày qua', days: 7 },
  { label: '30 ngày qua', days: 30 },
  { label: '90 ngày qua', days: 90 },
];
const TABS = [
  { value: 'over', label: 'Tổng quan' },
  { value: 'chan', label: 'Kênh' },
  { value: 'hist', label: 'Lịch sử' },
  { value: 'note', label: 'Ghi chú' },
];

type FieldKey = 'inter' | 'created' | 'sent';

// ─────────────────────── Theme (scoped, không đụng global) ───────────────────────
const LS_THEME = 'peopleview.theme.v1';
const theme = ref<'light' | 'dark'>(
  (localStorage.getItem(LS_THEME) as 'light' | 'dark') || 'light',
);
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(LS_THEME, theme.value); } catch { /* ignore */ }
}

// ─────────────────────── State danh sách ───────────────────────
/** Dữ liệu thô từ server. KHÔNG lọc/sắp xếp trực tiếp trên ref này. */
const rawRows = ref<Contact[]>([]);
const total = ref(0);
const page = ref(1);
const booting = ref(true);
const loadingMore = ref(false);
const listEl = ref<HTMLElement | null>(null);
const flashId = ref<string | null>(null);

const q = ref('');
const menu = ref<'filters' | 'sort' | null>(null);
const fetchError = ref<string | null>(null);

// ─── Chọn nhiều để chuyển vào thùng rác (owner-only từ 2026-07-31) ───
// Không còn chế độ "xem thùng rác" tại đây; khôi phục ở Cài đặt › Thùng rác.
const selected = ref<Set<string>>(new Set());
const bulkWorking = ref(false);

const allSelected = computed(
  () => rows.value.length > 0 && rows.value.every((r) => selected.value.has(r.id)),
);
function toggleSelectAll(on: boolean) {
  const next = new Set(selected.value);
  for (const r of rows.value) {
    if (on) next.add(r.id);
    else next.delete(r.id);
  }
  selected.value = next;
}
function toggleSelectOne(id: string, on: boolean) {
  const next = new Set(selected.value);
  if (on) next.add(id);
  else next.delete(id);
  selected.value = next;
}
async function onBulkArchive() {
  const ids = [...selected.value];
  const ok = await confirm({
    title: `Chuyển ${ids.length} khách vào thùng rác?`,
    message: 'Khách sẽ ẩn khỏi danh sách chính nhưng chưa bị xoá. Có thể khôi phục lại từ thùng rác.',
    tone: 'danger',
    confirmText: 'Chuyển vào thùng rác',
  });
  if (!ok) return;
  bulkWorking.value = true;
  try {
    const n = await bulkArchiveContacts(ids);
    selected.value = new Set();
    showToast(`Đã chuyển ${n} khách vào thùng rác`);
    await fetchPage(true);
  } finally {
    bulkWorking.value = false;
  }
}
const f = reactive({
  rel: [] as string[],
  employee: '',
  statusId: '',
  source: '',
  type: '' as '' | 'user' | 'group',
  zalo: '' as '' | 'true' | 'false',
  field: '' as FieldKey | '',   // '' = Tất cả (mặc định, không lọc theo mốc nào)
  dir: 'desc' as 'desc' | 'asc',
  from: null as Date | null,
  to: null as Date | null,
  tFrom: '',
  tTo: '',
  set: null as string | null,
});

const users = ref<Array<{ id: string; fullName: string }>>([]);
const statuses = ref<Array<{ id: string; name: string; color: string | null }>>([]);

const allLoaded = computed(() => rawRows.value.length > 0 && rawRows.value.length >= total.value);

const activeCount = computed(() => {
  let n = 0;
  if (q.value.trim()) n++;
  if (f.rel.length) n++;
  if (f.employee) n++;
  if (f.statusId) n++;
  if (f.source) n++;
  if (f.type) n++;
  if (f.zalo) n++;
  if (f.from || f.to) n++;
  if (f.tFrom || f.tTo) n++;
  if (f.set) n++;
  return n;
});

// ─────────────────────── Tải dữ liệu ───────────────────────
/**
 * dateFrom/dateTo PHẢI là 'YYYY-MM-DD' (fix 500, 2026-07-29).
 * Backend tự nối chuỗi cho mốc cuối ngày: `new Date(dateTo + 'T23:59:59.999Z')`
 * (contact-routes.ts:121). Gửi ISO đầy đủ → '…999ZT23:59:59.999Z' → Invalid Date
 * → Prisma từ chối `lte` → 500.
 * Cắt theo giờ ĐỊA PHƯƠNG, không dùng toISOString(): f.from là local midnight nên
 * ở UTC+7 toISOString() lùi về 17:00 ngày hôm trước → lọc lệch 1 ngày.
 */
function toDayParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchPage(reset: boolean) {
  if (reset) {
    page.value = 1;
    booting.value = true;
  } else {
    loadingMore.value = true;
  }
  fetchError.value = null;
  try {
    const res = await api.get('/contacts', {
      params: {
        page: page.value,
        limit: PAGE_SIZE,
        search: q.value.trim() || undefined,
        relationshipKindAny: f.rel.length ? f.rel.join(',') : undefined,
        assignedUserId: f.employee || undefined,
        statusId: f.statusId || undefined,
        source: f.source || undefined,
        threadType: f.type || undefined,
        hasZalo: f.zalo || undefined,
        dateFrom: f.from ? toDayParam(f.from) : undefined,
        dateTo: f.to ? toDayParam(f.to) : undefined,
      },
    });
    const list: Contact[] = res.data.contacts ?? res.data ?? [];
    total.value = res.data.total ?? list.length;
    rawRows.value = reset ? list : rawRows.value.concat(list);
  } catch (err) {
    console.error('[PeopleView] fetch contacts failed:', err);
    const status = (err as { response?: { status?: number } }).response?.status;
    // Phân biệt 403 / lỗi server / mất mạng — trước đây mọi lỗi đều báo "kiểm tra
    // mạng", nên khi backend trả 500 (vd dateTo sai format) sale đi soi mạng oan.
    fetchError.value = status === 403
      ? 'Không có quyền xem'
      : status
        ? `Lỗi ${status}`
        : 'Mất kết nối';
    if (reset) {
      rawRows.value = [];
      total.value = 0;
    } else {
      // Tải thêm fail → lùi page để lần cuộn sau thử lại đúng trang đó.
      page.value = Math.max(1, page.value - 1);
    }
  } finally {
    booting.value = false;
    loadingMore.value = false;
  }
}

/**
 * Cột ↔ field thật (anh xác nhận nghĩa 2026-07-29):
 *   sent    "Nhắn cuối"     = tin CUỐI CÙNG DO MÌNH gửi   → lastOutboundAt
 *   inter   "Tương tác cuối" = tin cuối của BẤT KỲ bên nào → lastActivity
 *           (lastActivity = MAX(inbound|outbound|interaction), xem scoring/types.ts:210.
 *            Trước đây dùng lastInteractionAt — đó là mốc "sự kiện tương tác" riêng,
 *            chỉ 1-1, và KHÔNG phải field backend lọc/sắp xếp mặc định → lệch.)
 *   created "Ngày tạo"      = createdAt
 */
const FIELD_MAP: Record<FieldKey, keyof Contact> = {
  inter: 'lastActivity',
  created: 'createdAt',
  sent: 'lastOutboundAt',
};

/**
 * rows = rawRows + lọc/sắp xếp client-side. Là computed nên bật/tắt bộ lọc không
 * phá dữ liệu đã tải (trước đây applyClientSort ghi đè rows.value → tắt lọc giờ
 * là mất luôn các dòng bị loại cho tới khi refetch).
 *
 * Vì sao phải lọc thêm ở client: backend CHỈ lọc dateFrom/dateTo theo lastActivity
 * (contact-routes.ts:118). Nên khi anh chọn mốc "Nhắn cuối" + khoảng ngày, server
 * vẫn trả KH khớp lastActivity nhưng lastOutboundAt rỗng/ngoài khoảng — đúng lỗi
 * anh gặp. Ở đây loại chúng ra để danh sách khớp đúng điều kiện đang hiển thị.
 */
const rows = computed<Contact[]>(() => {
  const list = rawRows.value;
  if (!f.field) return list;           // "Tất cả" → giữ nguyên thứ tự server (lastActivity desc)
  const k = FIELD_MAP[f.field];
  const mF = minsOf(f.tFrom);
  const mT = minsOf(f.tTo);
  const fromT = f.from ? new Date(f.from.getFullYear(), f.from.getMonth(), f.from.getDate()).getTime() : null;
  const toT = f.to ? new Date(f.to.getFullYear(), f.to.getMonth(), f.to.getDate(), 23, 59, 59, 999).getTime() : null;
  const hasRange = fromT !== null || toT !== null;
  const hasTime = mF !== null || mT !== null;

  const out = list.filter((c) => {
    const raw = c[k] as string | null | undefined;
    if (!hasRange && !hasTime) return true;
    if (!raw) return false;            // mốc đang lọc mà KH không có giá trị → loại
    const d = new Date(raw);
    const t = d.getTime();
    if (fromT !== null && t < fromT) return false;
    if (toT !== null && t > toT) return false;
    if (hasTime) {
      const m = d.getHours() * 60 + d.getMinutes();
      if (mF !== null && m < mF) return false;
      if (mT !== null && m > mT) return false;
    }
    return true;
  });

  return out.sort((a, b) => {
    const av = a[k] ? new Date(a[k] as string).getTime() : 0;
    const bv = b[k] ? new Date(b[k] as string).getTime() : 0;
    return f.dir === 'desc' ? bv - av : av - bv;
  });
});

/** Server đếm theo lastActivity → khi lọc client theo mốc khác, tổng sẽ lệch. */
const countApprox = computed(() => !!f.field && (!!f.from || !!f.to || !!f.tFrom || !!f.tTo));

function minsOf(hhmm: string): number | null {
  if (!hhmm) return null;
  const p = hhmm.split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

let searchTimer: ReturnType<typeof setTimeout>;
function onQueryInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchPage(true), 300);
}
function clearQuery() {
  q.value = '';
  fetchPage(true);
}

function applyFilters() {
  fetchPage(true);
}

function onScroll() {
  const el = listEl.value;
  if (!el || loadingMore.value || booting.value) return;
  if (rawRows.value.length >= total.value) return;
  if (el.scrollTop + el.clientHeight > el.scrollHeight - 160) {
    page.value += 1;
    fetchPage(false);
  }
}

function toggleRel(v: string) {
  const i = f.rel.indexOf(v);
  if (i >= 0) f.rel.splice(i, 1);
  else f.rel.push(v);
  applyFilters();
}

/**
 * Click header cột: chưa chọn → bật (mới nhất trước) → đổi sang cũ nhất trước →
 * TẮT hẳn (về "Tất cả"). Cho phép bỏ mốc mà không cần mở menu (2026-07-29).
 */
function setField(v: FieldKey) {
  if (f.field !== v) { f.field = v; f.dir = 'desc'; return; }
  if (f.dir === 'desc') { f.dir = 'asc'; return; }
  f.field = '';
}
/** Click ô trong menu: đang bật thì tắt, chưa bật thì bật. */
function pickField(v: FieldKey) {
  f.field = f.field === v ? '' : v;
}
function arrow(k: FieldKey) {
  return f.field === k ? (f.dir === 'desc' ? '↓' : '↑') : '';
}

function clearAll() {
  q.value = '';
  f.rel = [];
  f.employee = '';
  f.statusId = '';
  f.source = '';
  f.type = '';
  f.zalo = '';
  f.from = null;
  f.to = null;
  f.tFrom = '';
  f.tTo = '';
  f.set = null;
  f.field = '';
  f.dir = 'desc';
  pendingDay.value = null;
  fetchPage(true);
}
function resetTime() {
  f.from = null;
  f.to = null;
  f.tFrom = '';
  f.tTo = '';
  pendingDay.value = null;
  fetchPage(true);
}
function toggleMenu(m: 'filters' | 'sort') {
  menu.value = menu.value === m ? null : m;
}

// ─────────────────────── Bộ lọc đã lưu ───────────────────────
interface SavedSet {
  key: string;
  name: string;
  builtin?: boolean;
  snap: Partial<typeof f>;
}
const LS_SETS = 'peopleview.sets.v1';
const userSets = ref<SavedSet[]>([]);
const setName = ref('');

const BUILTIN_SETS: SavedSet[] = [
  { key: 'b_friends', name: 'Đã kết bạn', builtin: true, snap: { rel: ['friend'] } },
  { key: 'b_pending', name: 'Đang chờ đồng ý', builtin: true, snap: { rel: ['pending_friend'] } },
  { key: 'b_stranger', name: 'Người lạ đang nhắn', builtin: true, snap: { rel: ['chatting_stranger'] } },
  { key: 'b_nozalo', name: 'Chưa có Zalo', builtin: true, snap: { zalo: 'false' } },
];
const savedSets = computed(() => BUILTIN_SETS.concat(userSets.value));

function loadSets() {
  try {
    const raw = localStorage.getItem(LS_SETS);
    if (raw) userSets.value = JSON.parse(raw);
  } catch { /* ignore */ }
}
function persistSets() {
  try { localStorage.setItem(LS_SETS, JSON.stringify(userSets.value)); } catch { /* ignore */ }
}
function pickSet(s: SavedSet) {
  if (f.set === s.key) {
    f.set = null;
    clearAll();
    return;
  }
  f.rel = [];
  f.employee = '';
  f.statusId = '';
  f.source = '';
  f.type = '';
  f.zalo = '';
  Object.assign(f, s.snap);
  f.set = s.key;
  fetchPage(true);
}
function saveSet() {
  const name = setName.value.trim();
  if (!name) { toast.warning('Đặt tên cho bộ lọc trước đã'); return; }
  const key = 'u' + Date.now();
  userSets.value.push({
    key, name,
    snap: {
      rel: [...f.rel], employee: f.employee, statusId: f.statusId,
      source: f.source, type: f.type, zalo: f.zalo,
    },
  });
  persistSets();
  setName.value = '';
  f.set = key;
  showToast(`Đã lưu bộ lọc "${name}"`);
}
function deleteSet(s: SavedSet) {
  userSets.value = userSets.value.filter((x) => x.key !== s.key);
  persistSets();
  if (f.set === s.key) f.set = null;
}

// ─────────────────────── Lịch (2 tháng) ───────────────────────
const calMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const pendingDay = ref<Date | null>(null);

function shiftMonth(delta: number) {
  calMonth.value = new Date(calMonth.value.getFullYear(), calMonth.value.getMonth() + delta, 1);
}
function monthLabel(off: number) {
  const d = new Date(calMonth.value.getFullYear(), calMonth.value.getMonth() + off, 1);
  return `Tháng ${d.getMonth() + 1} ${d.getFullYear()}`;
}
function monthGrid(off: number) {
  const d = new Date(calMonth.value.getFullYear(), calMonth.value.getMonth() + off, 1);
  const lead = d.getDay();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells: Array<{ label: string; date: Date | null; cls: string }> = [];
  for (let i = 0; i < lead; i++) cells.push({ label: '', date: null, cls: 'blank' });
  const start = pendingDay.value || f.from;
  const end = pendingDay.value ? null : f.to;
  for (let n = 1; n <= days; n++) {
    const day = new Date(d.getFullYear(), d.getMonth(), n);
    const isStart = !!start && day.toDateString() === start.toDateString();
    const isEnd = !!end && day.toDateString() === end.toDateString();
    const inR = !!start && !!end && day > start && day < end;
    cells.push({
      label: String(n),
      date: day,
      cls: isStart ? 'start' : isEnd ? 'end' : inR ? 'in' : '',
    });
  }
  return cells;
}
function pickDay(day: Date) {
  if (!pendingDay.value) {
    pendingDay.value = day;
    f.from = day;
    f.to = null;
    return;
  }
  let a = pendingDay.value;
  let b = day;
  if (b < a) { const t = a; a = b; b = t; }
  pendingDay.value = null;
  f.from = a;
  f.to = b;
  fetchPage(true);
}
function isPresetOn(p: { days: number | null }) {
  if (p.days === null) return !f.from && !f.to;
  if (!f.from || !f.to) return false;
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - (p.days - 1) * 86400000);
  return f.from.toDateString() === from.toDateString() && f.to.toDateString() === to.toDateString();
}
function pickPreset(p: { days: number | null }) {
  pendingDay.value = null;
  if (p.days === null) {
    f.from = null;
    f.to = null;
  } else {
    const to = new Date();
    to.setHours(0, 0, 0, 0);
    f.from = new Date(to.getTime() - (p.days - 1) * 86400000);
    f.to = to;
  }
  fetchPage(true);
}

/**
 * Bấm "Áp dụng" khi mới chọn 1 đầu ngày → cảnh báo thay vì đóng im lặng
 * (anh chốt 2026-07-29). Trước đây khoảng hở này bị bỏ qua: pickDay chỉ fetch ở
 * click thứ 2, nên chọn 1 ngày rồi Áp dụng = không có bộ lọc nào chạy.
 */
const warnNoEndDate = ref(false);
function onApplySort() {
  if (f.from && !f.to) { warnNoEndDate.value = true; return; }
  menu.value = null;
  fetchPage(true);
}
function applyToToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (f.from && f.from > today) f.to = f.from, f.from = today;
  else f.to = today;
  pendingDay.value = null;
  warnNoEndDate.value = false;
  menu.value = null;
  fetchPage(true);
}

const rangeLabel = computed(() => {
  if (!f.from) return 'Mọi ngày';
  return fmtDate(f.from) + (f.to ? ` → ${fmtDate(f.to)}` : ' → chọn ngày kết thúc');
});
const sortSummary = computed(() => {
  const lbl = FIELD_OPTIONS.find((o) => o.value === f.field)?.label ?? '';
  let s = lbl ? `${lbl} ${f.dir === 'desc' ? '↓' : '↑'}` : 'Tất cả';
  if (f.from) s += ` · ${rangeLabel.value}`;
  if (f.tFrom || f.tTo) s += ` · ${f.tFrom || '00:00'}–${f.tTo || '23:59'}`;
  return s;
});

// ─────────────────────── Định dạng / hiển thị ───────────────────────
function fmtDate(v: string | Date) {
  const d = typeof v === 'string' ? new Date(v) : v;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function fmtDateTime(v: string | Date) {
  const d = typeof v === 'string' ? new Date(v) : v;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/**
 * Format 3 cột mốc thời gian của bảng: "17:30 22/07/2026" (giờ trước, ngày sau).
 * Anh chốt 2026-07-29 theo ảnh mẫu — dùng cho Nhắn cuối / Ngày tạo / Tương tác cuối
 * để 3 cột đọc thẳng hàng, thay vì trộn "22/07 17:30" + ngày trần + "3 ngày trước".
 */
function fmtStamp(v: string | Date) {
  const d = typeof v === 'string' ? new Date(v) : v;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} ${dd}/${mo}/${d.getFullYear()}`;
}
function ago(v: string | Date) {
  const d = typeof v === 'string' ? new Date(v) : v;
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  const days = Math.round(m / 1440);
  if (days === 1) return 'Hôm qua';
  if (days < 30) return `${days} ngày trước`;
  return fmtDate(d);
}

/**
 * Tên hiển thị: dùng chain dùng chung của use-friend-display thay vì
 * `crmName || fullName`. Quan trọng vì Contact stub do resolveContact tạo có
 * fullName='Unknown' — chain này loại literal đó rồi rơi xuống tên Zalo /
 * tên gợi nhớ / KH-XXXX (2026-07-29).
 */
function toFriendLike(c: Contact) {
  const fr = c.friends?.[0] as Record<string, unknown> | undefined;
  return {
    contact: { crmName: c.crmName, fullName: c.fullName },
    zaloDisplayName: (fr?.zaloDisplayName as string) ?? null,
    aliasInNick: (fr?.aliasInNick as string) ?? null,
    zaloUidInNick: (fr?.zaloUid as string) ?? c.zaloUid ?? null,
  };
}
function displayNameOf(c: Contact) {
  return displayCustomerName(toFriendLike(c), 'Chưa có tên');
}
/** True khi có tên thật (không phải fallback KH-XXXX / 'Chưa có tên'). */
function hasName(c: Contact) {
  const n = displayNameOf(c);
  return n !== 'Chưa có tên' && !n.startsWith('KH-');
}
function initialsOfName(name: string | null | undefined) {
  if (!name) return '??';
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}
function initialsOf(c: Contact) {
  const ini = customerInitials(toFriendLike(c));
  return ini === '?' ? '??' : ini;
}
/** Avatar gradient ổn định theo id (thay cho oklch hue của design). */
function hueOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `oklch(0.82 0.085 ${h % 360})`;
}
function onAvatarError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}
function genderLabel(g?: string | null) {
  if (g === 'male') return 'Nam';
  if (g === 'female') return 'Nữ';
  if (g === 'other') return 'Khác';
  return '—';
}
function genderAgeOf(c: Contact) {
  const age = c.birthYear ? `${new Date().getFullYear() - c.birthYear} tuổi` : 'chưa rõ tuổi';
  return `${genderLabel(c.gender)} · ${age}`;
}
function locationOf(c: Contact) {
  return [c.district, c.province].filter(Boolean).join(', ');
}
function statusNameOf(c: Contact) {
  return c.displayStatus?.name || c.statusRef?.name || '';
}
function isRedacted(c: Contact) {
  return !!(c as unknown as { redacted?: boolean }).redacted;
}
function nicksOf(c: Contact) {
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string }> = [];
  for (const fr of c.friends ?? []) {
    const acc = fr.zaloAccount;
    if (!acc?.id || seen.has(acc.id)) continue;
    seen.add(acc.id);
    out.push({ id: acc.id, name: acc.displayName || acc.phone || 'Nick' });
  }
  return out;
}
function channelOf(c: Contact) {
  return nicksOf(c)[0]?.name || '';
}
function extraNickCount(c: Contact) {
  return Math.max(0, nicksOf(c).length - 1);
}
function primaryRelOf(c: Contact) {
  return c.friends?.[0]?.relationshipKind || '';
}
function relLabel(kind: string) {
  return REL_OPTIONS.find((r) => r.value === kind)?.label || 'Chưa có kênh';
}
function relColor(kind: string) {
  if (kind === 'friend') return 'var(--pp-good)';
  if (kind === 'pending_friend') return 'var(--pp-warn)';
  if (kind === 'ghost') return 'var(--pp-bad)';
  if (kind === 'chatting_stranger') return 'var(--pp-muted)';
  return 'transparent';
}

// ─────────────────────── Drawer chi tiết ───────────────────────
const drawerOpen = ref(false);
const selectedId = ref<string | null>(null);
const detail = ref<Contact | null>(null);
const tab = ref('over');
const dirty = ref(false);
const saving = ref(false);
const draft = reactive<Record<string, unknown>>({});
const tagDraft = ref('');
const copiedCode = ref<string | null>(null);
const chanEdit = reactive<Record<string, { alias?: string; statusId?: string }>>({});

const timeline = ref<Array<{ title: string; desc: string; when: string }>>([]);
const loadingTimeline = ref(false);
const notes = ref<Array<{ id: string; author: string; body: string; when: string }>>([]);
const loadingNotes = ref(false);
const noteDraft = ref('');
const savingNote = ref(false);

const personalFields = [
  { key: 'crmName', label: 'Tên CRM', ph: 'Tên gọi nội bộ' },
  { key: 'fullName', label: 'Tên đầy đủ', ph: 'Theo hồ sơ' },
  { key: 'birthYear', label: 'Năm sinh', ph: 'YYYY' },
  { key: 'phone', label: 'SĐT chính', ph: '09…' },
  { key: 'email', label: 'Email', ph: '+ thêm' },
  { key: 'occupation', label: 'Nghề nghiệp', ph: '+ thêm' },
  { key: 'province', label: 'Tỉnh / Thành', ph: '+ thêm' },
  { key: 'district', label: 'Quận / Huyện', ph: '+ thêm' },
];

async function openDrawer(row: Contact) {
  selectedId.value = row.id;
  drawerOpen.value = true;
  detail.value = row;
  hydrateDraft(row);
  try {
    const res = await api.get(`/contacts/${row.id}`);
    if (res.data && selectedId.value === row.id) {
      detail.value = res.data;
      hydrateDraft(res.data);
    }
  } catch (err) {
    console.error('[PeopleView] load detail failed:', err);
  }
}
function hydrateDraft(c: Contact) {
  Object.keys(draft).forEach((k) => delete draft[k]);
  Object.assign(draft, {
    crmName: c.crmName ?? '', fullName: c.fullName ?? '', birthYear: c.birthYear ?? '',
    phone: c.phone ?? '', email: c.email ?? '', occupation: c.occupation ?? '',
    province: c.province ?? '', district: c.district ?? '',
    assignedUserId: c.assignedUserId ?? null, statusId: c.statusId ?? null,
    source: c.source ?? null, gender: c.gender ?? null,
    tags: [...(c.tags || [])],
  });
  dirty.value = false;
}
function closeDrawer() {
  drawerOpen.value = false;
  selectedId.value = null;
  // Bỏ ?focus= khỏi URL sau khi đóng — không thì F5 lại tự mở lại drawer vừa đóng.
  if (route.query.focus) {
    const q = { ...route.query };
    delete q.focus;
    void router.replace({ path: route.path, query: q });
  }
}

// Deep-link ?focus=<contactId> 2026-07-31 — KH cần mở có thể KHÔNG nằm trong
// trang đầu (list phân trang 20/lần), nên tìm trong rawRows trước rồi mới fetch
// thẳng theo id. Trước đây chỉ find() trong rows đã tải → link im lặng không mở.
async function openDrawerById(id: string) {
  const row = rawRows.value.find((r) => r.id === id);
  if (row) { void openDrawer(row); return; }
  try {
    const res = await api.get(`/contacts/${id}`);
    if (!res.data) return;
    selectedId.value = id;
    drawerOpen.value = true;
    detail.value = res.data;
    hydrateDraft(res.data);
  } catch (err) {
    console.error('[PeopleView] deep-link load failed:', err);
    toast.error('Không mở được hồ sơ khách hàng');
  }
}

function addTag() {
  const t = tagDraft.value.trim();
  if (!t) return;
  const list = draft.tags as string[];
  if (!list.includes(t)) list.push(t);
  tagDraft.value = '';
  dirty.value = true;
}
function removeTag(t: string) {
  draft.tags = (draft.tags as string[]).filter((x) => x !== t);
  dirty.value = true;
}

async function saveContact() {
  if (!detail.value || !dirty.value) return;
  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      crmName: draft.crmName || null,
      fullName: draft.fullName || null,
      birthYear: draft.birthYear ? Number(draft.birthYear) : null,
      phone: draft.phone || null,
      email: draft.email || null,
      occupation: draft.occupation || null,
      province: draft.province || null,
      district: draft.district || null,
      assignedUserId: draft.assignedUserId || null,
      statusId: draft.statusId || null,
      source: draft.source || null,
      gender: draft.gender || null,
      tags: draft.tags,
    };
    await updateContact(detail.value.id, payload as Partial<Contact>);
    dirty.value = false;
    showToast('Đã lưu thay đổi');
    const i = rawRows.value.findIndex((r) => r.id === detail.value!.id);
    if (i >= 0) rawRows.value[i] = { ...rawRows.value[i], ...(payload as Partial<Contact>) };
  } catch (err) {
    console.error('[PeopleView] save failed:', err);
    toast.error('Lưu thất bại');
  } finally {
    saving.value = false;
  }
}

/** Sửa per-nick → PATCH /friends/:id (route dùng chung với chat, không đổi contract). */
async function onChanEdit(ch: { id: string }, key: 'alias' | 'statusId', value: string) {
  chanEdit[ch.id] = { ...(chanEdit[ch.id] || {}), [key]: value };
  const body: Record<string, unknown> = {};
  if (key === 'alias') body.aliasInNick = value;
  if (key === 'statusId') body.statusId = value || null;
  try {
    await api.patch(`/friends/${ch.id}`, body);
    showToast('Đã cập nhật kênh');
  } catch (err) {
    console.error('[PeopleView] patch friend failed:', err);
    toast.error('Không cập nhật được kênh');
  }
}

const openingChat = ref(false);

/** Tách 1 kênh thành KH riêng — route dùng chung, trước ở nút ⬆ child row. */
const promoting = ref<string | null>(null);
async function onPromote(ch: { id: string; zaloAccount?: { displayName?: string | null } | null }) {
  const nickName = ch.zaloAccount?.displayName || 'kênh này';
  const ok = await confirm({
    title: 'Tách kênh thành khách hàng riêng?',
    message: `${nickName} sẽ trở thành một bản ghi khách hàng độc lập, không còn nằm dưới khách hiện tại. Không tự hoàn tác được.`,
    tone: 'danger',
    confirmText: 'Tách ra',
  });
  if (!ok) return;
  promoting.value = ch.id;
  try {
    await api.post(`/friends/${ch.id}/promote-to-parent`, {});
    showToast('Đã tách thành khách hàng riêng');
    closeDrawer();
    await fetchPage(true);
  } catch (err) {
    console.error('[PeopleView] promote failed:', err);
    toast.error('Không tách được kênh này');
  } finally {
    promoting.value = null;
  }
}

/**
 * Mở đúng hộp thoại của KH (2026-07-29).
 *  - Có nick Zalo  → ensure-conversation của Friend đó → /chat/:convId
 *  - Không có nick → POST /contacts/:id/virtual-conversation, backend ưu tiên
 *    trả hội thoại THẬT nếu đã có, không thì tạo hội thoại nội bộ → /chat/:convId
 * Trước đây case nội bộ chỉ push /chat?contactId= → vào Chat mà không mở sẵn
 * đoạn nào, sale phải tự tìm lại KH trong list.
 */
async function openChat() {
  if (!detail.value) return;
  const nick = nicksOf(detail.value)[0];
  if (nick) {
    const fr = detail.value.friends?.find((x) => x.zaloAccountId === nick.id);
    if (fr) { await openChatForFriend(fr); return; }
  }
  openingChat.value = true;
  try {
    const res = await api.post<{ conversationId: string }>(
      `/contacts/${detail.value.id}/virtual-conversation`, {},
    );
    if (res.data?.conversationId) {
      router.push({ name: 'Chat', params: { convId: res.data.conversationId } });
      return;
    }
    toast.error('Không mở được hội thoại nội bộ');
  } catch (err) {
    console.error('[PeopleView] virtual-conversation failed:', err);
    const body = (err as { response?: { data?: { error?: string; message?: string } } }).response?.data;
    // 400 no_nick: org chưa kết nối nick nào → nói rõ cách xử lý, đừng báo lỗi chung.
    toast.error(body?.error === 'no_nick'
      ? (body.message || 'Tổ chức chưa có nick Zalo nào để dùng chat nội bộ.')
      : 'Không mở được hội thoại nội bộ');
  } finally {
    openingChat.value = false;
  }
}
async function openChatForFriend(fr: { id: string }) {
  try {
    const res = await api.post<{ conversationId: string }>(`/friends/${fr.id}/ensure-conversation`, {});
    if (res.data?.conversationId) {
      router.push({ name: 'Chat', params: { convId: res.data.conversationId } });
      return;
    }
  } catch (err) {
    console.error('[PeopleView] ensure-conversation failed:', err);
  }
  if (detail.value) router.push({ path: '/chat', query: { contactId: detail.value.id } });
}

// ── Biến cá nhân hoá: dùng đúng TEMPLATE_VARIABLES của app (36 biến) ──
const resolvedVars = computed(() => {
  const c = detail.value;
  if (!c) return [];
  const nick = nicksOf(c)[0];
  const fr = c.friends?.[0] as Record<string, unknown> | undefined;
  const nameWords = (c.fullName || '').trim().split(/\s+/).filter(Boolean);
  const crmFull = (fr?.aliasInNick as string) || c.crmName || c.fullName || '';
  const crmWords = crmFull.trim().split(/\s+/).filter(Boolean);
  const saleWords = (c.assignedUser?.fullName || '').trim().split(/\s+/).filter(Boolean);
  const map: Record<string, unknown> = {
    '{gender}': c.gender === 'male' ? 'Anh' : c.gender === 'female' ? 'Chị' : 'Anh/Chị',
    '{name}': nameWords[nameWords.length - 1] || '',
    '{name_full}': c.fullName || '',
    '{name_first}': nameWords[0] || '',
    '{crm_full}': crmFull,
    '{crm_first}': crmWords[0] || '',
    '{crm_last}': crmWords[crmWords.length - 1] || '',
    '{phone}': c.phone || '',
    '{email}': c.email || '',
    '{facebook}': c.socialFacebook || '',
    '{tiktok}': c.socialTiktok || '',
    '{age}': c.birthYear ? new Date().getFullYear() - c.birthYear : '',
    '{occupation}': c.occupation || '',
    '{province}': c.province || '',
    '{district}': c.district || '',
    '{ward}': c.ward || '',
    '{address}': c.addressLine || '',
    '{income}': c.incomeRange || '',
    '{status}': statusNameOf(c),
    '{nick_status}': (fr?.statusRef as { name?: string })?.name || '',
    '{source}': SOURCE_OPTIONS.find((o) => o.value === c.source)?.text || c.source || '',
    '{next_appt}': c.nextAppointment ? fmtDateTime(c.nextAppointment) : '',
    '{first_active}': c.firstContactDate ? fmtDate(c.firstContactDate) : '',
    '{last_active}': c.lastActivity ? fmtDate(c.lastActivity) : '',
    '{last_message}': c.lastInboundPreview || '',
    '{last_inbound}': c.lastInboundAt ? fmtDateTime(c.lastInboundAt) : '',
    '{last_outbound}': c.lastOutboundAt ? fmtDateTime(c.lastOutboundAt) : '',
    // Cùng nghĩa với cột "Tương tác cuối" → dùng lastActivity, không phải lastInteractionAt.
    '{last_interaction}': c.lastActivity ? fmtDateTime(c.lastActivity) : '',
    '{msg_count}': `${c.totalInbound ?? 0}/${c.totalOutbound ?? 0}`,
    '{uid}': (fr?.zaloUid as string) || c.zaloUid || '',
    '{nick_name}': nick?.name || '',
    '{kb_status}': relLabel(primaryRelOf(c)),
    '{became_friend}': fr?.becameFriendAt ? fmtDate(fr.becameFriendAt as string) : '',
    '{sale}': saleWords[saleWords.length - 1] || '',
    '{sale_full}': c.assignedUser?.fullName || '',
  };
  // Ẩn {score} khỏi bảng biến — bỏ lead score khỏi màn này (anh chốt 2026-07-29).
  // KHÔNG sửa TEMPLATE_VARIABLES (hằng dùng chung cho soạn tin/mẫu tin ở chỗ khác).
  return TEMPLATE_VARIABLES
    .filter((v) => v.code !== '{score}')
    .map((v) => ({
      code: v.code,
      value: String(map[v.code] ?? '') || '—',
    }));
});

function copyVar(code: string) {
  copiedCode.value = code;
  try { navigator.clipboard?.writeText(code); } catch { /* ignore */ }
  setTimeout(() => { if (copiedCode.value === code) copiedCode.value = null; }, 1400);
}

// ── Lịch sử + ghi chú (lazy theo tab) ──
watch([tab, selectedId], async ([t, id]) => {
  if (!id) return;
  if (t === 'hist' && !timeline.value.length) {
    loadingTimeline.value = true;
    try {
      const res = await api.get(`/customers/${id}/timeline`, { params: { limit: 25 } });
      const items = res.data?.items ?? res.data ?? [];
      timeline.value = (items as Array<Record<string, unknown>>).map((it) => ({
        title: String(it.title ?? it.action ?? 'Hoạt động'),
        desc: String(it.description ?? it.preview ?? ''),
        when: it.createdAt ? ago(String(it.createdAt)) : '',
      }));
    } catch (err) {
      console.error('[PeopleView] timeline failed:', err);
      timeline.value = [];
    } finally {
      loadingTimeline.value = false;
    }
  }
  if (t === 'note' && !notes.value.length) {
    loadingNotes.value = true;
    try {
      const res = await api.get(`/contacts/${id}/notes`);
      const items = res.data?.notes ?? res.data ?? [];
      notes.value = (items as Array<Record<string, unknown>>).map((n) => ({
        id: String(n.id),
        author: String((n.user as { fullName?: string })?.fullName ?? 'Hệ thống'),
        body: String(n.content ?? n.body ?? ''),
        when: n.createdAt ? ago(String(n.createdAt)) : '',
      }));
    } catch (err) {
      console.error('[PeopleView] notes failed:', err);
      notes.value = [];
    } finally {
      loadingNotes.value = false;
    }
  }
});
watch(selectedId, () => {
  timeline.value = [];
  notes.value = [];
  Object.keys(chanEdit).forEach((k) => delete chanEdit[k]);
});

async function saveNote() {
  if (!noteDraft.value.trim() || !selectedId.value) return;
  savingNote.value = true;
  try {
    await api.post(`/contacts/${selectedId.value}/notes`, { content: noteDraft.value.trim() });
    notes.value.unshift({
      id: 'tmp' + Date.now(), author: 'Bạn',
      body: noteDraft.value.trim(), when: 'Vừa xong',
    });
    noteDraft.value = '';
    showToast('Đã lưu ghi chú');
  } catch (err) {
    console.error('[PeopleView] save note failed:', err);
    toast.error('Không lưu được ghi chú');
  } finally {
    savingNote.value = false;
  }
}

// ─────────────────────── Liên kết KH POS theo SĐT (2026-07-31) ───────────────
// Bỏ tạo KH trắng ở màn này — tìm KH bên POS theo SĐT rồi kéo vào CRM. KH POS
// đã có Contact (linked) bị disable ở template nên không chọn được; nút "Liên
// kết" cũng disable tới khi có linkPicked, không thể bỏ qua bước chọn.
const addOpen = ref(false);
const addPhone = ref('');
const linkPicked = ref<PosLinkCandidate | null>(null);
const linkSaving = ref(false);
const {
  results: linkResults,
  searching: linkSearching,
  searched: linkSearched,
  error: linkError,
  truncated: linkTruncated,
  search: runLinkSearch,
  reset: resetLinkSearch,
} = useContactPhoneSearch();

function onAddPhoneInput() {
  // Đổi SĐT thì bỏ lựa chọn cũ — tránh liên kết nhầm KH của lần gõ trước.
  linkPicked.value = null;
  runLinkSearch(addPhone.value);
}

// ── Tạo KH mới (Zalo/Facebook, chưa có ở POS) ───────────────────────────────
// 2026-07-31: KH thật sự mới thì không có record POS để liên kết. Cho tạo mới,
// nhưng CHẶN khi SĐT đã thuộc về một Contact đang có (dòng linked) — đó mới là
// case trùng. Có record POS trùng số thì vẫn cho tạo: KH buôn hay dùng chung số.
const createName = ref('');
// Chặn tạo mới khi SĐT đã thuộc BẤT KỲ Contact nào — kể cả contact Zalo chưa
// phải KH POS: người đó không "mới", đã có dòng chọn được ở danh sách trên.
const hasExistingContact = computed(() => linkResults.value.some((c) => c.contactId !== null));
const phoneDigits = computed(() => addPhone.value.replace(/\D/g, ''));
const canCreate = computed(() =>
  linkSearched.value
  && !linkSearching.value
  && !hasExistingContact.value
  && phoneDigits.value.length >= 9,
);
const primaryDisabled = computed(() => {
  if (linkSaving.value) return true;
  if (linkPicked.value) return false;
  return !(canCreate.value && createName.value.trim());
});
const primaryLabel = computed(() => {
  if (linkSaving.value) return 'Đang lưu…';
  if (!linkPicked.value) return 'Tạo khách mới';
  // Contact Zalo đã có trong CRM thì chỉ mở hồ sơ, không "liên kết" gì.
  return linkPicked.value.posCustomerId == null ? 'Mở hồ sơ' : 'Liên kết';
});
function submitPrimary() {
  return linkPicked.value ? submitLink() : submitCreate();
}

async function submitCreate() {
  const name = createName.value.trim();
  if (!canCreate.value || !name || linkSaving.value) return;
  linkSaving.value = true;
  try {
    // leadSource (không phải `source`) — đúng tên field route quick-create đọc.
    const res = await api.post('/contacts/quick-create', {
      fullName: name,
      phone: addPhone.value.trim(),
      leadSource: 'quick_add',
    });
    const created = res.data?.contact;
    closeAdd();
    showToast(res.data?.exists ? 'Khách đã có sẵn — mở hồ sơ' : 'Đã tạo khách mới');
    await fetchPage(true);
    if (created?.id) await openDrawerById(created.id);
  } catch (err) {
    console.error('[PeopleView] quick-create failed:', err);
    const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
    toast.error(msg || 'Không tạo được khách hàng');
  } finally {
    linkSaving.value = false;
  }
}

function openAdd() {
  addOpen.value = true;
  menu.value = null;
}
function closeAdd() {
  addOpen.value = false;
  addPhone.value = '';
  createName.value = '';
  linkPicked.value = null;
  resetLinkSearch();
}
async function submitLink() {
  const picked = linkPicked.value;
  // Dòng "đã có" đã disable ở template; guard này chặn nốt đường bàn phím.
  if (!picked || picked.linked || linkSaving.value) return;

  // Contact Zalo/Facebook đã nằm sẵn trong CRM (chưa phải KH POS) → không tạo
  // hay liên kết gì thêm, chỉ mở hồ sơ KH đó ra.
  if (picked.posCustomerId == null) {
    const id = picked.contactId;
    if (!id) return;
    closeAdd();
    await openDrawerById(id);
    return;
  }

  linkSaving.value = true;
  try {
    const res = await api.post('/contacts/link-pos', { posCustomerId: picked.posCustomerId });
    const linked = res.data?.contact;
    closeAdd();
    showToast(res.data?.exists ? 'Khách đã có sẵn — mở hồ sơ' : 'Đã liên kết khách từ POS');
    await fetchPage(true);
    if (linked?.id) await openDrawerById(linked.id);
  } catch (err) {
    console.error('[PeopleView] link-pos failed:', err);
    toast.error('Không liên kết được khách hàng');
  } finally {
    linkSaving.value = false;
  }
}
// ─────────────────────── Toast cục bộ (khớp design) ───────────────────────
const toastMsg = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(msg: string) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg.value = null; }, 2200);
}

// ─────────────────────── Realtime ───────────────────────
// Dùng lại use-friend-socket (contract friend:updated đang có 7 nơi tiêu thụ — không đổi shape).
useFriendSocket((payload: FriendUpdatedPayload) => {
  const row = rawRows.value.find((r) => r.id === payload.contactId);
  if (!row) return;
  Object.assign(row, payload.patch ?? {});
  flashId.value = row.id;
  setTimeout(() => { if (flashId.value === row.id) flashId.value = null; }, 2000);
});

// ─────────────────────── Lifecycle ───────────────────────
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (warnNoEndDate.value) { warnNoEndDate.value = false; return; }
  if (addOpen.value) { closeAdd(); return; }
  if (menu.value) { menu.value = null; return; }
  if (drawerOpen.value) closeDrawer();
}

onMounted(async () => {
  loadSets();
  document.addEventListener('keydown', onKey);

  // Deep-link: /friends redirect sang /contacts?rel=friend, và ContactsView cũ
  // link tới ?zaloAccountId=. Nhận cả hai để bookmark/link cũ không vỡ (2026-07-29).
  const rel = route.query.rel;
  if (typeof rel === 'string' && REL_OPTIONS.some((r) => r.value === rel)) {
    f.rel = [rel];
  }
  const focus = route.query.focus;

  void fetchPage(true).then(() => {
    if (typeof focus === 'string') void openDrawerById(focus);
  });
  try {
    const [u, s] = await Promise.all([
      api.get('/users'),
      api.get('/settings/statuses'),
    ]);
    users.value = u.data?.users || [];
    statuses.value = s.data?.statuses || [];
  } catch (err) {
    console.error('[PeopleView] load lookups failed:', err);
  }
});

// 2026-07-31: onMounted chỉ chạy 1 lần. Khi đang Ở /contacts mà có nơi push tiếp
// /contacts?focus=<id khác> (vd nút "Xem hồ sơ KH tổng hợp" ở cột 4 chat), router
// tái dùng component → drawer im lặng không mở. Watch query để deep-link luôn ăn.
watch(() => route.query.focus, (focus) => {
  if (typeof focus === 'string' && focus && focus !== selectedId.value) {
    void openDrawerById(focus);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  clearTimeout(searchTimer);
  clearTimeout(toastTimer);
});
</script>

<style scoped>
/* ═══════════ Token màu — light + dark (design CRM Atlas) ═══════════
   Đặt trên .people để dark mode KHÔNG rò ra ngoài trang này. */
.people {
  --pp-bg: #F0EFF6; --pp-panel: #FFFFFF; --pp-card: #F7F6FC;
  --pp-fg: #1B1A24; --pp-muted: #736F84; --pp-faint: #9C97AC;
  --pp-line: #E7E4F0; --pp-accent: #5B4BE6; --pp-onAccent: #FFFFFF;
  --pp-chip: #EDEAFB; --pp-chipFg: #4C3FBF;
  --pp-good: #0E9F6E; --pp-warn: #C2810C; --pp-bad: #DC3A5B;
  --pp-shadow: rgba(30, 20, 80, .16);

  /* Chữ (anh chốt 2026-07-29 sau khi soi /font-lab.html):
       tiêu đề  = Montserrat 700/800 — chỉ ở cỡ lớn, nơi nét hình học còn đọc được
       nội dung = Roboto 400/500/700 — gọn nhất trong 5 font đã thử, nét ở 13–14px
       số/mã    = var(--mono) = Roboto Mono, cùng superfamily với Roboto
     Nhãn nhỏ 10.5px in hoa CỐ TÌNH để Roboto: ở cỡ đó nét hình học của
     Montserrat không còn thấy, chỉ tổ rộng thêm ~11%. */
  --pp-display: 'Montserrat', -apple-system, 'Segoe UI', Roboto, sans-serif;
  --pp-body: 'Roboto', -apple-system, 'Segoe UI', sans-serif;
}
.people[data-theme='dark'] {
  --pp-bg: #121121; --pp-panel: #1B1930; --pp-card: #232040;
  --pp-fg: #EFEDF8; --pp-muted: #9A95B0; --pp-faint: #7A7593;
  --pp-line: #2C2846; --pp-accent: #9686FF; --pp-onAccent: #16132B;
  --pp-chip: #2A2647; --pp-chipFg: #C5BEF5;
  --pp-good: #4ADEA0; --pp-warn: #E3B457; --pp-bad: #FF7C9C;
  --pp-shadow: rgba(0, 0, 0, .5);
}

.people {
  height: calc(100vh - var(--smax-topnav-h, 52px));
  display: flex; flex-direction: column;
  position: relative; overflow: hidden;
  background: var(--pp-bg); color: var(--pp-fg);
  font-family: var(--pp-body);
}
.people * { box-sizing: border-box; }
.people input, .people select, .people textarea, .people button { font-family: inherit; }
.people input:focus, .people select:focus, .people textarea:focus { outline: none; }

@keyframes ppShim { 0% { opacity: .5 } 50% { opacity: 1 } 100% { opacity: .5 } }
@keyframes ppSpin { to { transform: rotate(360deg) } }
@keyframes ppPulse { 0%, 100% { opacity: 1 } 40% { opacity: .55 } }
@keyframes ppSlide { from { transform: translateX(26px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes ppPop { from { transform: translateY(8px) scale(.98); opacity: 0 } to { transform: none; opacity: 1 } }

/* ═══════════ Header ═══════════ */
.ppl-head { padding: 14px 28px 0; display: flex; flex-direction: column; gap: 12px; z-index: 15; }
.ppl-head-row { display: flex; align-items: center; gap: 20px; }
.ppl-title h1 { margin: 0; font-family: var(--pp-display); font-size: 22px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }

.ppl-search {
  flex: 1; max-width: 430px; margin: 0 auto;
  display: flex; align-items: center; gap: 10px;
  height: 44px; padding: 0 16px; border-radius: 999px;
  background: var(--pp-panel); border: 1px solid var(--pp-line);
  box-shadow: 0 2px 8px -4px var(--pp-shadow);
  transition: border-color .14s;
}
.ppl-search.on { border-color: var(--pp-accent); }
.ppl-search svg { width: 16px; height: 16px; color: var(--pp-accent); flex: none; }
.ppl-search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--pp-fg); font-size: 13.5px; }
.ppl-search-x { cursor: pointer; color: var(--pp-muted); font-size: 16px; line-height: 1; }

.ppl-btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 20px; border: 0; border-radius: 999px;
  background: var(--pp-accent); color: var(--pp-onAccent);
  font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap;
  box-shadow: 0 8px 20px -8px var(--pp-accent);
  transition: opacity .12s;
}
/* Hover dùng opacity (transform/opacity only) — trước là transition: filter. */
.ppl-btn-primary:hover:not(:disabled) { opacity: .9; }
.ppl-btn-primary:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
.ppl-btn-primary.sm { height: 36px; padding: 0 18px; font-size: 13px; }
.ppl-btn-primary svg { width: 15px; height: 15px; }
.ppl-btn-ghost {
  height: 40px; padding: 0 18px; border: 1px solid var(--pp-line); border-radius: 999px;
  background: transparent; color: var(--pp-fg); font-size: 13.5px; font-weight: 700; cursor: pointer;
}
.ppl-btn-ghost.sm { height: 32px; padding: 0 13px; font-size: 12px; align-self: flex-start; background: var(--pp-panel); }

.ppl-theme {
  display: inline-flex; align-items: center; gap: 7px;
  height: 44px; padding: 0 15px; border-radius: 999px;
  border: 1px solid var(--pp-line); background: var(--pp-panel);
  color: var(--pp-muted); font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.ppl-theme:hover { color: var(--pp-fg); }
.ppl-theme svg { width: 16px; height: 16px; }

/* ── Thanh lọc ── */
.ppl-tools { display: flex; align-items: center; gap: 10px; position: relative; }
.ppl-chip-btn {
  display: inline-flex; align-items: center; gap: 9px;
  height: 38px; padding: 0 15px; border-radius: 999px;
  border: 1px solid var(--pp-line); background: var(--pp-panel);
  color: var(--pp-fg); font-size: 13px; font-weight: 600; cursor: pointer;
}
.ppl-chip-btn.armed, .ppl-chip-btn.open { border-color: var(--pp-accent); }
.ppl-chip-btn.open { background: var(--pp-chip); }
.ppl-chip-btn svg { width: 14px; height: 14px; }
.ppl-chip-sum { font-weight: 500; color: var(--pp-muted); }
.ppl-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: var(--pp-accent); color: var(--pp-onAccent); font-size: 11px; font-weight: 800;
}
.ppl-clear {
  font-size: 13px; font-weight: 600; color: var(--pp-muted); cursor: pointer;
  text-decoration: underline; text-underline-offset: 3px; white-space: nowrap;
}
.ppl-meta {
  margin-left: auto; display: flex; align-items: center; gap: 9px;
  font-size: 12.5px; color: var(--pp-muted); white-space: nowrap;
}
.ppl-meta strong { color: var(--pp-fg); font-weight: 700; }
.ppl-live {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px; background: var(--pp-card);
  font-size: 11.5px; font-weight: 600;
}
.ppl-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pp-good); }

/* ── Menu dropdown ── */
.ppl-scrim { position: fixed; inset: 0; z-index: 38; }
.ppl-menu {
  position: absolute; top: 44px; z-index: 40;
  max-height: calc(100vh - 190px); overflow-y: auto;
  padding: 14px; border-radius: 16px;
  background: var(--pp-panel); border: 1px solid var(--pp-line);
  box-shadow: 0 26px 52px -20px var(--pp-shadow);
  display: flex; flex-direction: column; gap: 12px;
  animation: ppPop .16s ease-out;
}
.ppl-menu--filters { left: 0; width: 520px; }
.ppl-menu--sort { left: 128px; width: 560px; }
.ppl-menu-foot {
  display: flex; align-items: center; gap: 11px;
  padding-top: 10px; border-top: 1px solid var(--pp-line);
}
.ppl-menu-foot .ppl-btn-primary { margin-left: auto; }

.ppl-grp { display: flex; flex-direction: column; gap: 7px; }
.ppl-grp-t { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--pp-muted); font-weight: 800; }
.ppl-grp-row { display: flex; align-items: center; }
.ppl-grp-side { margin-left: auto; font-size: 11.5px; color: var(--pp-muted); }

.ppl-set-row { display: flex; flex-wrap: wrap; gap: 7px; }
.ppl-set {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 14px; border-radius: 999px;
  background: var(--pp-card); color: var(--pp-muted);
  border: 1px solid var(--pp-line);
  font-size: 12.5px; font-weight: 700; cursor: pointer;
}
.ppl-set.on { background: var(--pp-accent); color: var(--pp-onAccent); border-color: var(--pp-accent); }
.ppl-set-n { opacity: .55; font-weight: 500; }
.ppl-set-x { opacity: .55; font-size: 13px; }
.ppl-set-x:hover { opacity: 1; }
.ppl-set-save { display: flex; gap: 7px; align-items: center; }
.ppl-set-save input {
  flex: 1; height: 34px; padding: 0 13px; border-radius: 999px;
  border: 1px dashed var(--pp-line); background: transparent;
  color: var(--pp-fg); font-size: 12.5px;
}
.ppl-set-save button {
  height: 34px; padding: 0 14px; border: 0; border-radius: 999px;
  background: var(--pp-chip); color: var(--pp-chipFg);
  font-size: 12.5px; font-weight: 700; cursor: pointer;
}

.ppl-seg { display: flex; gap: 7px; }
.ppl-seg-i {
  flex: 1; text-align: center; padding: 9px 0; border-radius: 11px;
  background: var(--pp-card); color: var(--pp-muted);
  font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.ppl-seg-i.on { background: var(--pp-accent); color: var(--pp-onAccent); }

.ppl-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.ppl-field { display: flex; flex-direction: column; gap: 6px; }
.ppl-field.grow { flex: 1; }
.ppl-field-l { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--pp-muted); font-weight: 800; }
.ppl-field select, .ppl-time {
  height: 38px; padding: 0 13px; border-radius: 11px;
  border: 1px solid var(--pp-line); background: var(--pp-card);
  color: var(--pp-fg); font-size: 13px; font-weight: 600; cursor: pointer;
}
.ppl-time { width: 118px; font-family: var(--mono); }
.ppl-time-row { display: flex; gap: 11px; align-items: flex-end; }

/* ── Lịch ── */
.ppl-range-lbl { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--pp-accent); }
.ppl-preset-row { display: flex; gap: 6px; flex-wrap: wrap; }
.ppl-preset {
  padding: 6px 12px; border-radius: 999px; background: transparent;
  color: var(--pp-muted); border: 1px solid var(--pp-line);
  font-size: 11.5px; font-weight: 700; cursor: pointer;
}
.ppl-preset.on { background: var(--pp-chip); color: var(--pp-chipFg); border-color: var(--pp-chip); }
.ppl-cals { display: flex; gap: 16px; padding: 12px; border-radius: 14px; background: var(--pp-card); }
.ppl-cal { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.ppl-cal-h { display: flex; align-items: center; }
.ppl-cal-m { flex: 1; text-align: center; font-size: 12.5px; font-weight: 700; }
.ppl-cal-nav {
  width: 22px; height: 22px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--pp-muted);
}
.ppl-cal-nav:hover { background: var(--pp-panel); color: var(--pp-fg); }
.ppl-cal-g { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.ppl-dow { height: 18px; display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 800; color: var(--pp-faint); }
.ppl-day {
  height: 26px; display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 500; border-radius: 9px;
  color: var(--pp-fg); cursor: pointer;
}
.ppl-day.blank { cursor: default; }
.ppl-day.start, .ppl-day.end { background: var(--pp-accent); color: var(--pp-onAccent); font-weight: 800; }
.ppl-day.start { border-radius: 9px 4px 4px 9px; }
.ppl-day.end { border-radius: 4px 9px 9px 4px; }
.ppl-day.in { background: var(--pp-chip); color: var(--pp-chipFg); border-radius: 4px; }

/* ═══════════ Danh sách ═══════════ */
.ppl-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 10px 28px 24px; transition: opacity .16s; }
.ppl-cols, .ppl-row { display: flex; align-items: center; min-width: 1120px; }
.ppl-cols {
  padding: 0 18px 8px; font-size: 10.5px; letter-spacing: .11em;
  text-transform: uppercase; font-weight: 800; color: var(--pp-muted);
}
.c-check { width: 34px; flex: none; display: flex; align-items: center; }
.c-check input { width: 15px; height: 15px; accent-color: var(--pp-accent); cursor: pointer; }
.c-person { flex: 1 1 auto; min-width: 240px; }
.c-chan { width: 180px; flex: none; }
.c-tags { width: 220px; flex: none; }
/* 3 cột mốc dùng chung format "17:30 22/07/2026" → cùng bề rộng 152px
   (chuỗi cần ~112px @12px tabular + padding). Trước là 140/115/135 vì mỗi
   cột một format khác nhau. */
.c-sent { width: 152px; flex: none; }
.c-created { width: 152px; flex: none; }
.c-inter { width: 152px; flex: none; }
.ppl-cols .c-sent, .ppl-cols .c-created, .ppl-cols .c-inter { cursor: pointer; }
.ppl-cols .on { color: var(--pp-accent); }

.ppl-rows { display: flex; flex-direction: column; gap: 8px; }
/* Hover chỉ transition transform (item 5: transform/opacity only trên phần tử
   lặp lại). border-color vẫn đổi nhưng snap, không transition → không có
   thuộc tính paint nào animate trên mỗi dòng của list dài. */
.ppl-row {
  padding: 13px 18px; border-radius: 14px;
  background: var(--pp-panel); border: 1px solid var(--pp-line);
  cursor: pointer; box-shadow: 0 1px 3px -1px var(--pp-shadow);
  transition: transform .12s;
}
.ppl-row:hover { border-color: var(--pp-accent); transform: translateY(-1px); }
.ppl-row.sel { background: var(--pp-chip); border-color: var(--pp-accent); }
.ppl-row.picked { border-color: var(--pp-accent); }
.ppl-row.flash { animation: ppPulse 1.6s ease-out; }

/* ── Bulk bar ── */
.ppl-bulk {
  margin: 0 28px; padding: 10px 16px; border-radius: 12px;
  background: var(--pp-chip); border: 1px solid var(--pp-accent);
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: var(--pp-chipFg);
  animation: ppPop .16s ease-out;
}
.ppl-bulk-n b { font-weight: 800; }
.ppl-bulk-sp { flex: 1; }
.ppl-bulk-btn {
  height: 32px; padding: 0 14px; border-radius: 999px;
  border: 1px solid var(--pp-line); background: var(--pp-panel);
  color: var(--pp-fg); font-size: 12.5px; font-weight: 700; cursor: pointer;
}
.ppl-bulk-btn.danger { border-color: var(--pp-bad); color: var(--pp-bad); }
.ppl-bulk-btn:disabled { opacity: .5; cursor: not-allowed; }
.ppl-chan-foot { display: flex; gap: 8px; flex-wrap: wrap; }
.ppl-row .c-person { overflow: hidden; display: flex; align-items: center; gap: 12px; }

.ppl-av {
  width: 40px; height: 40px; flex: none; border-radius: 13px;
  color: #1B1024; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 800; overflow: hidden;
}
.ppl-av img { width: 100%; height: 100%; object-fit: cover; }
.ppl-person-txt { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ppl-nm-line { display: flex; align-items: center; gap: 8px; }
.ppl-nm {
  font-size: 14.5px; font-weight: 700; letter-spacing: -.012em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ppl-nm.unnamed, h2.unnamed { color: var(--pp-muted); font-style: italic; }
.ppl-new {
  flex: none; padding: 2px 7px; border-radius: 999px;
  background: var(--pp-chip); color: var(--pp-good);
  font-size: 9.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
}
.ppl-sub2 { font-size: 12px; color: var(--pp-muted); display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.ppl-dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .5; }

.ppl-chan { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12.5px; color: var(--pp-muted); }
.ppl-chan-dot { width: 8px; height: 8px; flex: none; border-radius: 3px; }
.ppl-chan-nm { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.ppl-chan-nm.faint { color: var(--pp-faint); }
.ppl-chan-more { flex: none; font-size: 11px; font-weight: 700; color: var(--pp-faint); }

.ppl-tags { display: flex; align-items: center; gap: 5px; overflow: hidden; }
.ppl-tag {
  flex: none; padding: 4px 10px; border-radius: 999px;
  background: var(--pp-chip); color: var(--pp-chipFg);
  font-size: 11px; font-weight: 700; white-space: nowrap;
}
.ppl-tag.editable { display: inline-flex; align-items: center; gap: 6px; padding-right: 8px; }
.ppl-tag-x { cursor: pointer; opacity: .55; font-size: 12px; }
.ppl-tag-x:hover { opacity: 1; }
.ppl-tag-more {
  flex: none; padding: 4px 8px; border-radius: 999px;
  border: 1px solid var(--pp-line); color: var(--pp-muted);
  font-size: 11px; font-weight: 700;
}
/* tabular-nums → 3 cột mốc thẳng hàng theo chữ số, không nhảy bề rộng. */
.ppl-time-cell {
  display: flex; align-items: center; overflow: hidden;
  font-size: 12px; color: var(--pp-muted); white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ppl-lock {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 5px; background: var(--pp-card);
  color: var(--pp-muted); font-size: 10px; font-weight: 800;
  letter-spacing: .05em; text-transform: uppercase;
}
.ppl-lock svg { width: 9px; height: 9px; }

.ppl-skel {
  display: flex; align-items: center; gap: 12px; padding: 15px 18px;
  border-radius: 14px; background: var(--pp-panel); border: 1px solid var(--pp-line);
  animation: ppShim 1.4s ease-in-out infinite;
}
.sk-av { width: 40px; height: 40px; border-radius: 13px; background: var(--pp-card); }
.sk-lines { display: flex; flex-direction: column; gap: 7px; flex: 1; }
.sk-l { height: 11px; border-radius: 6px; background: var(--pp-card); }
.sk-l.sm { height: 9px; }
.sk-pill { height: 22px; width: 120px; border-radius: 999px; background: var(--pp-card); }

.ppl-more { display: flex; align-items: center; justify-content: center; padding: 12px; }
.ppl-spin {
  width: 14px; height: 14px; border: 2px solid var(--pp-line);
  border-top-color: var(--pp-accent); border-radius: 50%;
  animation: ppSpin .9s linear infinite;
}
.ppl-alldone { padding: 10px; text-align: center; font-size: 11px; color: var(--pp-faint); }

/* Compact: bỏ prose nên thu nhỏ khối rỗng (trước 70px margin + 44px padding). */
.ppl-blank {
  margin-top: 40px; padding: 28px; border-radius: 16px;
  background: var(--pp-panel); border: 1px solid var(--pp-line);
  text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.ppl-blank-ico {
  width: 44px; height: 44px; border-radius: 14px;
  background: var(--pp-chip); color: var(--pp-accent);
  display: flex; align-items: center; justify-content: center;
}
.ppl-blank-ico svg { width: 20px; height: 20px; }
.ppl-blank-ico.err { background: var(--pp-card); color: var(--pp-bad); }
.ppl-blank-t { font-family: var(--pp-display); font-size: 17px; font-weight: 800; letter-spacing: -.02em; }
.ppl-blank-d { font-size: 12.5px; color: var(--pp-muted); }

/* ═══════════ Drawer ═══════════ */
.ppl-drawer {
  position: absolute; top: 0; right: 0; bottom: 0; width: 566px; max-width: 92vw; z-index: 60;
  background: var(--pp-panel); border-left: 1px solid var(--pp-line);
  box-shadow: -24px 0 60px -24px var(--pp-shadow);
  display: flex; flex-direction: column; animation: ppSlide .2s ease-out;
}
.ppl-dr-head { padding: 22px 24px 0; display: flex; flex-direction: column; gap: 16px; }
.ppl-dr-top { display: flex; gap: 15px; }
.ppl-dr-av {
  width: 62px; height: 62px; flex: none; border-radius: 20px; color: #1B1024;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--pp-display); font-size: 21px; font-weight: 800;
  overflow: hidden;
}
.ppl-dr-av img { width: 100%; height: 100%; object-fit: cover; }
.ppl-dr-idt { flex: 1; min-width: 0; }
.ppl-dr-nm-row { display: flex; align-items: center; gap: 9px; }
.ppl-dr-nm-row h2 {
  margin: 0; font-family: var(--pp-display);
  font-size: 24px; font-weight: 800; letter-spacing: -.028em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ppl-dr-status {
  flex: none; padding: 4px 10px; border-radius: 999px;
  background: var(--pp-chip); color: var(--pp-chipFg);
  font-size: 10.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
}
.ppl-dr-meta { font-size: 13px; color: var(--pp-muted); margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ppl-dr-pills { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.ppl-dr-pill {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 11px; border-radius: 999px; background: var(--pp-card);
  font-size: 12px; font-weight: 600; white-space: nowrap;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis;
}
.ppl-dr-x {
  flex: none; width: 32px; height: 32px; border: 0; border-radius: 11px;
  background: var(--pp-card); color: var(--pp-muted); cursor: pointer; font-size: 16px; line-height: 1;
}
.ppl-dr-x:hover { color: var(--pp-fg); }
.ppl-dr-actions { display: flex; align-items: center; gap: 9px; }
.ppl-dr-tags { margin-left: auto; display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
.ppl-tag-input {
  width: 64px; height: 26px; padding: 0 10px; border-radius: 999px;
  border: 1px dashed var(--pp-line); background: transparent;
  color: var(--pp-fg); font-size: 11px; font-weight: 700;
}
.ppl-tabs { display: flex; gap: 5px; padding: 4px; border-radius: 999px; background: var(--pp-card); }
.ppl-tab {
  flex: 1; text-align: center; padding: 9px 0; border-radius: 999px;
  font-size: 12.5px; font-weight: 700; cursor: pointer; color: var(--pp-muted);
}
.ppl-tab.on { background: var(--pp-accent); color: var(--pp-onAccent); }
.ppl-dr-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 24px 28px; }
.ppl-pane { display: flex; flex-direction: column; gap: 14px; }

.ppl-input-box { padding: 9px 13px; border-radius: 12px; border: 1px solid var(--pp-line); display: block; cursor: text; }
.ppl-input-box.flat { border: 0; background: var(--pp-card); }
.ppl-input-box.warn { border-color: var(--pp-warn); }
.ppl-input-box:hover { border-color: var(--pp-accent); }
.ppl-input-box.flat:hover { border-color: transparent; }
.ppl-input-l { display: block; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--pp-muted); font-weight: 800; margin-bottom: 2px; }
.ppl-input-box input, .ppl-input-box select {
  width: 100%; border: 0; background: transparent; color: var(--pp-fg);
  font-size: 13.5px; font-weight: 600; padding: 0; cursor: pointer;
}
.ppl-input-box input { cursor: text; }
.ppl-input-box input.mono { font-family: var(--mono); font-size: 13px; }

.ppl-vars { max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; padding-right: 3px; }
.ppl-var { display: flex; align-items: center; gap: 11px; padding: 8px 12px; border-radius: 11px; background: var(--pp-card); cursor: pointer; font-size: 12px; }
.ppl-var:hover, .ppl-var.copied { background: var(--pp-chip); }
.ppl-var-c { flex: none; font-family: var(--mono); font-size: 11px; color: var(--pp-accent); font-weight: 600; }
.ppl-var-v { flex: 1; min-width: 0; text-align: right; color: var(--pp-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ppl-var-ok { flex: none; font-size: 10px; font-weight: 800; color: var(--pp-good); }
.ppl-save-bar { display: flex; justify-content: flex-end; }

.ppl-nochan { padding: 20px; border-radius: 16px; background: var(--pp-card); text-align: center; display: flex; flex-direction: column; align-items: center; gap: 11px; }
.ppl-nochan-t { font-family: var(--pp-display); font-size: 15px; font-weight: 800; letter-spacing: -.02em; }
.ppl-chan-card { padding: 16px; border-radius: 18px; border: 1px solid var(--pp-line); display: flex; flex-direction: column; gap: 13px; }
.ppl-chan-card-h { display: flex; align-items: center; gap: 10px; }
.ppl-chan-card-nm { font-size: 14.5px; font-weight: 800; letter-spacing: -.015em; }
.ppl-chan-card-rel {
  padding: 3px 9px; border-radius: 999px; background: var(--pp-chip); color: var(--pp-chipFg);
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;
}
/* 2 cột (Tên gợi nhớ + Trạng thái) — cột Điểm 88px đã bỏ (2026-07-29). */
.ppl-chan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.ppl-hist { display: flex; gap: 14px; padding-bottom: 18px; }
.ppl-hist-rail { width: 10px; flex: none; display: flex; flex-direction: column; align-items: center; padding-top: 6px; }
.ppl-hist-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--pp-accent); }
.ppl-hist-line { flex: 1; width: 2px; border-radius: 1px; background: var(--pp-line); margin-top: 5px; }
.ppl-hist-card { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 14px; background: var(--pp-card); }
.ppl-hist-h { display: flex; align-items: baseline; gap: 10px; }
.ppl-hist-t { font-size: 13.5px; font-weight: 800; }
.ppl-hist-w { margin-left: auto; font-size: 11px; color: var(--pp-muted); flex: none; white-space: nowrap; }
.ppl-hist-d { font-size: 12.5px; color: var(--pp-muted); line-height: 1.6; margin-top: 4px; }
.ppl-inline-load { padding: 20px; text-align: center; font-size: 12.5px; color: var(--pp-faint); }

.ppl-note-new { padding: 14px; border-radius: 16px; border: 1px dashed var(--pp-line); display: flex; flex-direction: column; gap: 10px; }
.ppl-note-new textarea {
  border: 0; background: transparent; resize: none; min-height: 56px;
  color: var(--pp-fg); font-size: 13px; line-height: 1.6;
}
.ppl-note-new button { align-self: flex-end; }
.ppl-note-card { padding: 14px; border-radius: 16px; background: var(--pp-card); }
.ppl-note-h { display: flex; align-items: center; gap: 9px; margin-bottom: 7px; }
.ppl-note-av {
  width: 24px; height: 24px; border-radius: 8px; background: var(--pp-chip); color: var(--pp-chipFg);
  display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800;
}
.ppl-note-a { font-size: 13px; font-weight: 800; }
.ppl-note-w { margin-left: auto; font-size: 11px; color: var(--pp-muted); }
.ppl-note-b { font-size: 13.5px; line-height: 1.6; color: var(--pp-muted); }

/* ═══════════ Modal thêm nhanh ═══════════ */
.ppl-modal-wrap { position: absolute; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; }
.ppl-modal-scrim { position: absolute; inset: 0; background: rgba(24, 20, 52, .42); }
.ppl-modal {
  position: relative; width: 420px; max-width: 92vw; padding: 20px; border-radius: 18px;
  background: var(--pp-panel); box-shadow: 0 40px 80px -30px var(--pp-shadow);
  display: flex; flex-direction: column; gap: 16px; animation: ppPop .18s ease-out;
}
.ppl-modal h3 { margin: 0; font-family: var(--pp-display); font-size: 17px; font-weight: 800; letter-spacing: -.025em; }
.ppl-modal-sub { font-size: 12px; color: var(--pp-muted); margin-top: 3px; }
.ppl-modal-foot { display: flex; align-items: center; gap: 10px; }
.ppl-modal-foot .ppl-btn-primary { margin-left: auto; }
.ppl-modal--warn { width: 440px; }
.ppl-warn-head { display: flex; gap: 13px; align-items: flex-start; }
.ppl-warn-ico {
  flex: none; width: 38px; height: 38px; border-radius: 12px;
  background: var(--pp-chip); color: var(--pp-warn);
  display: flex; align-items: center; justify-content: center;
}
.ppl-warn-ico svg { width: 20px; height: 20px; }
.ppl-dupe { padding: 12px 14px; border-radius: 13px; background: var(--pp-chip); display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; }
.ppl-dupe svg { width: 16px; height: 16px; color: var(--pp-warn); flex: none; margin-top: 1px; }

/* Kết quả tìm KH theo SĐT để liên kết (2026-07-31) */
.ppl-link-res { display: flex; flex-direction: column; gap: 6px; max-height: 244px; overflow-y: auto; }
.ppl-link-note { padding: 10px 13px; border-radius: 12px; background: var(--pp-chip); font-size: 12.5px; color: var(--pp-muted); line-height: 1.5; }
.ppl-link-note.warn { color: var(--pp-warn); }
.ppl-link-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 10px 13px; border-radius: 12px;
  border: 1px solid var(--pp-line); background: transparent;
  font-family: inherit; font-size: 13px; text-align: left; cursor: pointer;
  transition: border-color .15s, background .15s;
}
.ppl-link-row:hover:not(:disabled) { border-color: var(--pp-accent); }
.ppl-link-row.on { border-color: var(--pp-accent); background: var(--pp-chip); }
/* linked = đã có trong tab Khách hàng → mờ, con trỏ không mời bấm */
.ppl-link-row.off { opacity: .5; cursor: not-allowed; }
.ppl-link-row:disabled { cursor: not-allowed; }
.ppl-link-nm { font-weight: 600; color: var(--pp-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppl-link-meta { display: flex; align-items: center; gap: 8px; flex: none; }
.ppl-link-ph { color: var(--pp-muted); font-size: 12px; }
.ppl-link-tag {
  padding: 2px 8px; border-radius: 999px; background: var(--pp-chip);
  font-size: 11px; font-weight: 600; color: var(--pp-muted); white-space: nowrap;
}
.ppl-link-new { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--pp-line); }
.ppl-link-new-t { font-size: 12px; color: var(--pp-muted); }

.ppl-toast {
  position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 90;
  padding: 12px 20px; border-radius: 999px;
  background: var(--pp-fg); color: var(--pp-bg);
  font-size: 13px; font-weight: 600;
  box-shadow: 0 18px 40px -16px var(--pp-shadow); animation: ppPop .16s ease-out;
}

/* ═══════════ Responsive ═══════════
   Thay MobileContactView + ContactDetailDialog đã xoá (anh chốt 2026-07-29).
   ≤900px: header wrap, menu co lại, lịch xếp dọc.
   ≤700px: bảng 6 cột → card 2 hàng, drawer → sheet toàn màn. */
@media (max-width: 900px) {
  .ppl-head-row { flex-wrap: wrap; }
  .ppl-search { order: 3; max-width: none; width: 100%; margin: 0; }
  .ppl-menu--filters, .ppl-menu--sort { left: 0; width: min(520px, calc(100vw - 40px)); }
  .ppl-cals { flex-direction: column; }
  .ppl-grid2 { grid-template-columns: 1fr; }
}

@media (max-width: 700px) {
  .ppl-head { padding: 16px 16px 0; gap: 14px; }
  .ppl-title h1 { font-size: 23px; }
  .ppl-sub { display: none; }
  .ppl-list { padding: 12px 16px 24px; }
  .ppl-bulk { margin: 0 16px; }

  /* Header cột ẩn — card tự mang nhãn qua data-label */
  .ppl-cols { display: none; }

  .ppl-row, .ppl-skel { min-width: 0; }
  .ppl-row {
    display: grid; align-items: center; gap: 8px 10px;
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      'check person inter'
      'check chan   tags';
    padding: 12px 14px;
  }
  .ppl-row .c-check { grid-area: check; width: auto; }
  .ppl-row .c-person { grid-area: person; min-width: 0; }
  .ppl-row .c-chan { grid-area: chan; width: auto; }
  .ppl-row .c-tags { grid-area: tags; width: auto; justify-content: flex-end; }
  .ppl-row .c-inter { grid-area: inter; width: auto; text-align: right; font-size: 11.5px; color: var(--pp-muted); }
  /* Ngày tạo + nhắn cuối bỏ khỏi card — vẫn xem được trong drawer */
  .ppl-row .c-sent, .ppl-row .c-created { display: none; }
  .ppl-row:hover { transform: none; }

  /* Drawer → bottom sheet toàn màn */
  .ppl-drawer {
    width: 100%; max-width: 100%; border-left: 0;
    border-top: 1px solid var(--pp-line);
    border-radius: 18px 18px 0 0;
    animation: ppPop .2s ease-out;
  }
  .ppl-dr-head { padding: 16px 16px 0; }
  .ppl-dr-body { padding: 14px 16px 28px; }
  .ppl-dr-av { width: 48px; height: 48px; border-radius: 15px; font-size: 17px; }
  .ppl-dr-nm-row h2 { font-size: 20px; }
  .ppl-dr-actions { flex-wrap: wrap; }
  .ppl-dr-tags { margin-left: 0; justify-content: flex-start; }
  .ppl-chan-grid { grid-template-columns: 1fr; }
  .ppl-time-row { flex-wrap: wrap; }
  .ppl-modal { width: calc(100vw - 32px); }
}
</style>
