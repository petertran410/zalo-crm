<template>
  <!-- Atlas People — màn gộp "Bạn bè" + "Khách hàng" (design CRM Atlas No-Blur, 2026-07-29).
       Toàn bộ token màu nằm trong :root của .people → dark mode chỉ đổi data-theme,
       KHÔNG đụng theme global (index.html khai báo color-scheme: light only). -->
  <div class="people" :data-theme="uiTheme.isDark ? 'dark' : 'light'">
    <!-- ═══════════ HEADER ═══════════ -->
    <header class="ppl-head">
      <div class="ppl-head-row">
        <div class="ppl-title">
          <h1>Khách hàng</h1>
        </div>

        <!-- 2026-07-31: modal giờ làm 2 việc — liên kết KH có sẵn bên POS, hoặc
             tạo KH mới (Zalo/Facebook chưa có ở POS). Nhãn giữ "Thêm khách". -->
        <button class="ppl-btn-primary" @click="openAdd">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 4v12M4 10h12" /></svg>
          Thêm khách
        </button>
      </div>

      <!-- ─── Thanh lọc ngang ───
           Mọi bộ lọc dồn sau nút "+"; sắp xếp neo phải vì đổi thứ tự chứ không thu hẹp.
           Mọi thay đổi áp dụng ngay, không có nút "Áp dụng". -->
      <div class="ppl-tools">
        <label class="ppl-search" :class="{ on: !!q }">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" /></svg>
          <input v-model="q" placeholder="Tìm khách hàng…" title="Tìm theo tên, SĐT, UID hoặc @username" @input="onQueryInput" />
          <span v-if="q" class="ppl-search-x" @click="clearQuery">×</span>
        </label>

        <!-- Wrapper riêng để popover neo đúng dưới nút "+". -->
        <div class="ppl-morewrap">
          <button
            class="ppl-more"
            :class="{ open: menu === 'more', armed: advCount > 0 }"
            title="Thêm bộ lọc"
            aria-label="Thêm bộ lọc"
            @click="toggleMenu('more')"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 4.5v11M4.5 10h11" /></svg>
            <span v-if="advCount" class="ppl-count-badge">{{ advCount }}</span>
          </button>

          <!-- ── POPOVER: bộ lọc ít dùng ── -->
          <template v-if="menu === 'more'">
            <div class="ppl-scrim" @click="closeMore"></div>
            <div class="ppl-menu ppl-menu--more">
            <div class="ppl-grp">
              <div class="ppl-field">
                <span class="ppl-field-l">Khoảng thời gian</span>
                <div class="ppl-btns">
                  <button
                    v-for="p in PERIOD_OPTIONS" :key="p.value"
                    type="button" class="ppl-btns-i" :class="{ on: period === p.value }"
                    @click="pickPeriod(p.value)"
                  >{{ p.label }}</button>
                </div>
              </div>

              <div class="ppl-field">
                <span class="ppl-field-l">Trạng thái</span>
                <div class="ppl-btns">
                  <button
                    type="button" class="ppl-btns-i" :class="{ on: !f.statusId }"
                    @click="pickStatus('')"
                  >Tất cả</button>
                  <button
                    v-for="s in statuses" :key="s.id"
                    type="button" class="ppl-btns-i" :class="{ on: f.statusId === s.id }"
                    @click="pickStatus(s.id)"
                  >{{ s.name }}</button>
                </div>
              </div>

              <div class="ppl-field">
                <span class="ppl-field-l">Quan hệ Zalo</span>
                <div class="ppl-seg">
                  <span
                    v-for="r in REL_OPTIONS" :key="r.value"
                    class="ppl-seg-i" :class="{ on: f.rel.includes(r.value) }"
                    @click="toggleRel(r.value)"
                  >{{ r.label }}</span>
                </div>
              </div>

            <!-- CKG Milestone 4: Lookalike Cluster Filter -->
            <div class="ppl-field">
              <span class="ppl-field-l">Chân dung Radar (Lookalike Cluster)</span>
              <div class="ppl-set-row" style="display: flex; gap: 6px; flex-wrap: wrap;">
                <span
                  class="ppl-set"
                  :class="{ on: !f.personaCluster }"
                  @click="f.personaCluster = ''; applyFilters()"
                >
                  Tất cả chân dung
                </span>
                <span
                  v-for="cluster in PERSONA_OPTIONS"
                  :key="cluster.value"
                  class="ppl-set"
                  :class="{ on: f.personaCluster === cluster.value }"
                  @click="f.personaCluster = f.personaCluster === cluster.value ? '' : cluster.value; applyFilters()"
                >
                  <span class="ppl-set-dot" :style="{ background: cluster.color, width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block' }"></span>
                  {{ cluster.label }}
                </span>
              </div>
            </div>

            <div class="ppl-field">
              <span class="ppl-field-l">Mức độ tin cậy</span>
              <div class="ppl-seg">
                <span
                  class="ppl-seg-i"
                  :class="{ on: !f.confidenceTier }"
                  @click="f.confidenceTier = ''; applyFilters()"
                >Tất cả</span>
                <span
                  class="ppl-seg-i"
                  :class="{ on: f.confidenceTier === 'CONSOLIDATED' }"
                  @click="f.confidenceTier = f.confidenceTier === 'CONSOLIDATED' ? '' : 'CONSOLIDATED'; applyFilters()"
                >Củng cố (85–95%)</span>
                <span
                  class="ppl-seg-i"
                  :class="{ on: f.confidenceTier === 'PRELIMINARY' }"
                  @click="f.confidenceTier = f.confidenceTier === 'PRELIMINARY' ? '' : 'PRELIMINARY'; applyFilters()"
                >Sơ bộ (50–65%)</span>
              </div>
            </div>
              <div class="ppl-field">
                <span class="ppl-field-l">Nhân viên phụ trách</span>
                <select v-model="f.employee" @change="applyFilters">
                  <option value="">Tất cả</option>
                  <option v-for="u in users" :key="u.id" :value="u.id">{{ u.fullName }}</option>
                </select>
              </div>

              <div class="ppl-field">
                <span class="ppl-field-l">Nguồn khách</span>
                <div class="ppl-btns">
                  <button
                    type="button" class="ppl-btns-i" :class="{ on: !f.source }"
                    @click="pickSource('')"
                  >Tất cả</button>
                  <button
                    v-for="o in SOURCE_OPTIONS" :key="o.value"
                    type="button" class="ppl-btns-i" :class="{ on: f.source === o.value }"
                    @click="pickSource(o.value)"
                  >{{ o.text }}</button>
                </div>
              </div>

              <div class="ppl-field">
                <span class="ppl-field-l">Loại liên hệ</span>
                <div class="ppl-btns">
                  <button
                    v-for="t in TYPE_OPTIONS" :key="t.value"
                    type="button" class="ppl-btns-i" :class="{ on: f.type === t.value }"
                    @click="pickType(t.value)"
                  >{{ t.label }}</button>
                </div>
              </div>

              <div class="ppl-field">
                <span class="ppl-field-l">Có Zalo</span>
                <div class="ppl-btns">
                  <button
                    v-for="z in ZALO_OPTIONS" :key="z.value"
                    type="button" class="ppl-btns-i" :class="{ on: f.zalo === z.value }"
                    @click="pickZalo(z.value)"
                  >{{ z.label }}</button>
                </div>
              </div>

              <label class="ppl-adv--inline">
                <input type="checkbox" v-model="f.multiNick" @change="applyFilters" />
                <span>Chỉ khách có nhiều nick Zalo</span>
              </label>

              <!-- Lọc điểm tiềm năng tạm ẩn; giữ state + param. -->
            </div>

            <!-- Nhóm "Hoạt động" (giờ trong ngày / số lần gắn sequence / số lần gửi kết bạn)
                 tạm ẩn khỏi UI; state + query param + chip giữ nguyên để mở lại sau. -->

            <div class="ppl-grp">
              <div class="ppl-grp-row">
                <div class="ppl-grp-t">Khoảng ngày tuỳ chọn</div>
                <div class="ppl-range-lbl">{{ rangeLabel }}</div>
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

            <div class="ppl-grp">
              <div class="ppl-grp-t">Bộ lọc đã lưu</div>
              <div v-if="userSets.length" class="ppl-set-row">
                <span
                  v-for="s in userSets" :key="s.key"
                  class="ppl-set" :class="{ on: f.set === s.key }"
                  @click="pickSet(s)"
                >
                  {{ s.name }}
                  <span class="ppl-set-x" @click.stop="deleteSet(s)">×</span>
                </span>
              </div>
              <div v-else class="ppl-set-empty">Chưa có bộ lọc nào được lưu</div>
              <div class="ppl-set-save">
                <input v-model="setName" placeholder="Tên bộ lọc…" @keyup.enter="saveSet" />
                <button @click="saveSet">Lưu hiện tại</button>
              </div>
            </div>

            <div class="ppl-menu-foot">
              <span class="ppl-clear" @click="clearAll">Xoá tất cả</span>
              <button class="ppl-btn-primary sm" @click="closeMore">Xong</button>
            </div>
            </div>
          </template>
        </div>

        <!-- Sắp xếp neo phải, tách khỏi cụm lọc: lọc thu hẹp danh sách, sắp xếp đổi thứ tự. -->
        <div class="ppl-sortwrap">
          <button
            class="ppl-sort"
            :class="{ open: menu === 'sort', on: f.sort !== DEFAULT_SORT }"
            title="Sắp xếp"
            aria-haspopup="menu"
            :aria-expanded="menu === 'sort'"
            @click="toggleMenu('sort')"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 4v12M6 16l-2.4-2.6M6 16l2.4-2.6" /><path d="M14 16V4M14 4l-2.4 2.6M14 4l2.4 2.6" /></svg>
            <span>Sắp xếp</span>
            <svg class="ppl-sort-caret" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 8.5l4 4 4-4" /></svg>
          </button>

          <template v-if="menu === 'sort'">
            <div class="ppl-scrim" @click="closeMore"></div>
            <div class="ppl-menu ppl-menu--sort" role="menu">
              <button
                v-for="o in SORT_OPTIONS" :key="o.value"
                type="button" role="menuitem"
                class="ppl-sort-i" :class="{ on: f.sort === o.value }"
                @click="pickSort(o.value)"
              >{{ o.label }}</button>
            </div>
          </template>
        </div>

        <div class="ppl-meta">
          <span :title="countApprox ? 'Đang lọc thêm theo giờ trong ngày ở phía máy khách nên tổng là ước lượng.' : ''">
            <strong>{{ countApprox ? '~' : '' }}{{ total }}</strong> / {{ grandTotal }} khách
          </span>
        </div>
      </div>

      <!-- ─── Chip bộ lọc đang áp dụng ─── -->
      <div v-if="activeChips.length" class="ppl-chips">
        <span v-for="c in activeChips" :key="c.key" class="ppl-chip">
          {{ c.label }}
          <button class="ppl-chip-x" :title="`Bỏ lọc ${c.label}`" @click="c.clear()">×</button>
        </span>
        <span class="ppl-clear" @click="clearAll">Xoá tất cả</span>
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
        <span class="c-radar">Chân dung Radar</span>
        <span class="c-chan">Kênh phụ trách</span>
        <span class="c-tags">Thẻ</span>
        <span class="c-sent" :class="{ on: sortFieldIs('sent') }" @click="setField('sent')">Nhắn cuối {{ arrow('sent') }}</span>
        <span class="c-created" :class="{ on: sortFieldIs('created') }" @click="setField('created')">Ngày tạo {{ arrow('created') }}</span>
        <span class="c-inter" :class="{ on: sortFieldIs('inter') }" @click="setField('inter')">Tương tác {{ arrow('inter') }}</span>
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
                <span
                  v-if="r.posCustomerId != null"
                  class="ppl-pos-tag"
                  :class="{ copied: copiedPosId === r.posCustomerId }"
                  :title="`POS ID: ${r.posCustomerId} — click để copy`"
                  @click.stop="copyPosId(r.posCustomerId)"
                >
                  POS {{ r.posCustomerId }}
                  <span v-if="copiedPosId === r.posCustomerId" class="ppl-pos-ok">✓</span>
                </span>
              </span>
              <span class="ppl-sub2">
                <span>{{ genderLabel(r.gender) }}</span>
                <span class="ppl-dot"></span>
                <span>{{ r.phone || 'Chưa có SĐT' }}</span>
              </span>
            </span>
          </span>

          <!-- CKG Milestone 4: Customer Radar Cell -->
          <span class="c-radar ppl-radar-cell">
            <template v-if="(r as any).radar">
              <span
                class="ppl-radar-badge whitespace-nowrap"
                :class="`cluster-${(r as any).radar.persona.id.toLowerCase()}`"
                :title="(r as any).radar.persona.summary || (r as any).radar.persona.label"
              >
                <span class="ppl-radar-ico mr-1">{{ getPersonaClusterIcon((r as any).radar.persona.id) }}</span>
                <span class="ppl-radar-label">{{ (r as any).radar.persona.clusterBadge || (r as any).radar.persona.label }}</span>
              </span>
              <span
                class="ppl-conf-chip whitespace-nowrap"
                :class="(r as any).radar.confidence.tier === 'CONSOLIDATED' || (r as any).radar.confidence.score >= 0.8 ? 'conf-emerald' : 'conf-amber'"
                :title="`Độ tin cậy: ${(r as any).radar.confidence.percentage}%`"
              >
                <span class="conf-dot"></span>
                <span class="tabular-nums">{{ (r as any).radar.confidence.percentage }}&nbsp;%</span>
              </span>
            </template>
            <template v-else>
              <span class="ppl-radar-empty text-caption text-medium-emphasis whitespace-nowrap">—</span>
            </template>
          </span>

          <span class="c-chan ppl-chan">
            <span class="ppl-chan-nm" :class="{ faint: !channelOf(r) }">{{ channelOf(r) || 'Không có kênh' }}</span>
            <span v-if="extraNickCount(r) > 0" class="ppl-chan-more">+{{ extraNickCount(r) }}</span>
          </span>

          <span class="c-tags ppl-tags">
            <!-- 2026-08-01 (anh chốt): quan hệ (bạn bè / chờ kết bạn / ghost / người
                 lạ) trước đây chỉ là chấm màu vô danh ở cột "Kênh phụ trách" — nhìn
                 màu phải tự đoán, và người mù màu / trình đọc màn hình không thấy gì.
                 Nay tách hẳn thành thẻ CÓ CHỮ, nằm chung cột Thẻ. -->
            <span
              v-if="primaryRelOf(r)"
              class="ppl-tag ppl-tag-rel"
              :style="{ '--rel': relColor(primaryRelOf(r)) }"
            >{{ relLabel(primaryRelOf(r)) }}</span>
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
            <div v-if="metaLine(detail)" class="ppl-dr-meta">{{ metaLine(detail) }}</div>
            <div class="ppl-dr-pills">
              <span v-if="relLabel(primaryRelOf(detail))" class="ppl-dr-pill"><span class="ppl-chan-dot" :style="{ background: relColor(primaryRelOf(detail)) }"></span>{{ relLabel(primaryRelOf(detail)) }}</span>
              <span v-if="detail.email" class="ppl-dr-pill">{{ detail.email }}</span>
              <span class="ppl-dr-pill ppl-dr-debt" :class="debtStatusClass" :title="debtTooltip">
                <span class="ppl-dr-debt-ico">💳</span>
                Công nợ
                <b>{{ debtDisplay }}</b>
              </span>
            </div>
          </div>
          <button class="ppl-dr-x" @click="closeDrawer">×</button>
        </div>

        <div class="ppl-dr-actions">
          <button class="ppl-btn-primary sm" :disabled="openingChat" @click="openChat">
            {{ openingChat ? 'Đang mở…' : (channelOf(detail) ? 'Mở chat Zalo' : 'Mở chat nội bộ') }}
          </button>
          <div ref="familyWrapRef" class="ppl-fam-wrap">
            <button
              class="ppl-btn-ghost sm ppl-fam-btn" :class="{ on: familyOpen }"
              type="button" @click.stop="toggleFamilyMenu"
            >
              nick liên quan
              <span v-if="familyOtherCount" class="ppl-fam-count">{{ familyOtherCount }}</span>
              <span class="ppl-fam-caret" :class="{ up: familyOpen }">▾</span>
            </button>
            <div v-if="familyOpen" class="ppl-fam-panel" @click.stop>
              <div class="ppl-fam-sec">
                <div class="ppl-fam-title">Cùng số điện thoại</div>
                <div v-if="familyLoading" class="ppl-fam-empty">Đang tải…</div>
                <div v-else-if="!familyMembers.length" class="ppl-fam-empty">
                  Không có nick nào khác
                </div>
                <div v-else class="ppl-fam-list">
                  <button
                    v-for="m in familyMembers" :key="m.id"
                    class="ppl-fam-item" :class="{ current: m.isCurrent, locked: !m.accessible }"
                    type="button" :disabled="m.isCurrent"
                    @click="openFamilyMember(m)"
                  >
                    <span class="ppl-fam-av" :style="{ background: hueOf(m.id) }">
                      <img
                        v-if="m.avatarUrl" :src="m.avatarUrl" alt=""
                        referrerpolicy="no-referrer" @error="onAvatarError"
                      />
                      <template v-else>{{ familyInitials(m) }}</template>
                    </span>
                    <span class="ppl-fam-txt">
                      <span class="ppl-fam-zalo">
                        <span class="ppl-fam-zname" :title="familyZaloName(m)">{{ familyZaloName(m) }}</span>
                        <span v-if="m.isCurrent" class="ppl-fam-badge">đang xem</span>
                        <span v-else-if="!m.accessible" class="ppl-fam-badge alt">sale khác</span>
                        <span v-if="m.phoneSuffix" class="ppl-fam-sfx">{{ m.phoneSuffix }}</span>
                      </span>
                      <span class="ppl-fam-pos" :title="familyPosName(m)">
                        {{ familyPosName(m) || '— chưa có tên POS —' }}
                      </span>
                    </span>
                  </button>
                </div>
              </div>
              <div class="ppl-fam-sec alt">
                <div class="ppl-fam-title">chuỗi</div>
                <div v-if="chainLoading" class="ppl-fam-empty">Đang tải…</div>
                <div v-else-if="!chainMembers.length" class="ppl-fam-empty">
                  Không có nick nào cùng chuỗi
                </div>
                <div v-else class="ppl-fam-list">
                  <button
                    v-for="m in chainMembers" :key="m.id"
                    class="ppl-fam-item" :class="{ current: m.isCurrent, locked: !m.accessible }"
                    type="button" :disabled="m.isCurrent"
                    @click="openFamilyMember(m)"
                  >
                    <span class="ppl-fam-av" :style="{ background: hueOf(m.id) }">
                      <img
                        v-if="m.avatarUrl" :src="m.avatarUrl" alt=""
                        referrerpolicy="no-referrer" @error="onAvatarError"
                      />
                      <template v-else>{{ familyInitials(m) }}</template>
                    </span>
                    <span class="ppl-fam-txt">
                      <span class="ppl-fam-zalo">
                        <span class="ppl-fam-zname" :title="familyZaloName(m)">{{ familyZaloName(m) }}</span>
                        <span v-if="m.isCurrent" class="ppl-fam-badge">đang xem</span>
                        <span v-else-if="!m.accessible" class="ppl-fam-badge alt">sale khác</span>
                      </span>
                      <span class="ppl-fam-pos" :title="familyPosName(m)">
                        {{ familyPosName(m) || '— chưa có tên POS —' }}
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
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
          <!-- CKG Milestone 4: Customer Radar Widget in Detail Drawer -->
          <div v-if="detail?.id" class="mb-3">
            <CustomerRadarWidget
              :contact-id="detail.id"
              :contact-name="detail.fullName || detail.crmName || (detail as any).zaloUsername || 'Khách hàng'"
            />
          </div>

          <div class="ppl-grp">
            <div class="ppl-grp-t">Thông tin cá nhân</div>
            <div class="ppl-grid2">
              <label v-for="fd in personalFields" :key="fd.key" class="ppl-input-box">
                <span class="ppl-input-l">{{ fd.label }}</span>
                <input
                  v-model="(draft as any)[fd.key]"
                  :placeholder="fd.ph"
                  :readonly="fd.key === 'posName'"
                  @change="fd.key !== 'posName' && (dirty = true)"
                />
              </label>
            </div>
          </div>

          <div class="ppl-grp">
            <div class="ppl-grp-t">Thông tin chăm sóc</div>
            <div v-if="careLoading" class="ppl-inline-load">Đang tải thông tin chăm sóc…</div>
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
                <span class="ppl-input-l">Workshop đã tham gia</span>
                <input v-model="careFields.workshopsAttended" placeholder="+ thêm" @change="dirtyCare = true" />
              </div>
              <div class="ppl-input-box">
                <span class="ppl-input-l">Phàn nàn</span>
                <input v-model="careFields.complaints" placeholder="+ thêm" @change="dirtyCare = true" />
              </div>
              <div class="ppl-input-box">
                <span class="ppl-input-l">Sản phẩm quan tâm</span>
                <textarea
                  ref="productInterestEl"
                  v-model="productInterestLines"
                  placeholder="+ thêm (mỗi dòng một sản phẩm)"
                  @input="onProductInterestInput"
                  @change="dirtyCare = true"
                ></textarea>
                
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
            <button class="ppl-btn-primary sm" :disabled="(!dirty && !dirtyCare) || saving || careLoading" @click="saveContact">
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

    <div v-if="toastMsg" class="ppl-toast">{{ toastMsg }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * Màn gộp "Bạn bè" và "Khách hàng".
 *
 * Ràng buộc backend: relationshipKindAny lọc được server-side, dateFrom/dateTo chỉ lọc theo
 * lastActivity, và sort chỉ nhận "score" nên sắp xếp theo cột khác phải làm client-side trên
 * các dòng đã tải.
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/index';
import {
  useContacts,
  SOURCE_OPTIONS,
  type Contact,
  type ContactCareFields,
  type PhoneFamilyMember,
  type PhoneFamilyResponse,
  type ChainFamilyResponse,
} from '@/composables/use-contacts';
import { useFriendSocket, type FriendUpdatedPayload } from '@/composables/use-friend-socket';
import { useContactPhoneSearch, candidateDisplayName, candidateKey, type PosLinkCandidate } from '@/composables/use-contact-phone-search';
import { displayCustomerName, customerInitials } from '@/composables/use-friend-display';
import { TEMPLATE_VARIABLES } from '@/constants/template-variables';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { useUiThemeStore } from '@/stores/ui-theme';
import { useConfirm } from '@/composables/use-confirm';
import CustomerRadarWidget from '@/components/radar/CustomerRadarWidget.vue';

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

// Hằng số UI
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
const PERSONA_OPTIONS = [
  { value: 'FNB_WORKSHOP_STUDENT', label: 'Học viên WS', color: '#4F46E5' },
  { value: 'FNB_SHOP_OWNER', label: 'Chủ quán', color: '#D97706' },
  { value: 'WHOLESALE_DISTRIBUTOR', label: 'Đại lý sỉ', color: '#7C3AED' },
  { value: 'HOME_CAFE_RETAIL', label: 'Pha tại nhà', color: '#059669' },
  { value: 'TRIAL_EXPLORER', label: 'Dùng thử', color: '#2563EB' },
];

function getPersonaClusterIcon(id?: string): string {
  switch (String(id).toUpperCase()) {
    case 'FNB_WORKSHOP_STUDENT': return '🎓';
    case 'FNB_SHOP_OWNER': return '🧋';
    case 'WHOLESALE_DISTRIBUTOR': return '🏢';
    case 'HOME_CAFE_RETAIL': return '🏠';
    case 'TRIAL_EXPLORER': return '🎁';
    default: return '🎯';
  }
}
const FIELD_OPTIONS = [
  { value: 'inter', label: 'Tương tác cuối' },
  { value: 'created', label: 'Ngày tạo' },
  { value: 'sent', label: 'Nhắn cuối' },
] as const;

const TYPE_OPTIONS: Array<{ value: '' | 'user' | 'group'; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'user', label: 'Cá nhân' },
  { value: 'group', label: 'Nhóm' },
];
/** Mỗi lựa chọn gộp sẵn field + chiều, map thẳng sang ?sort=&sortDir= của backend. */
const SORT_OPTIONS = [
  { value: 'activity_desc', label: 'Tương tác mới nhất' },
  { value: 'activity_asc', label: 'Tương tác cũ nhất' },
  { value: 'created_desc', label: 'Ngày tạo mới nhất' },
  { value: 'created_asc', label: 'Ngày tạo cũ nhất' },
  { value: 'sent_desc', label: 'Nhắn cuối mới nhất' },
  { value: 'sent_asc', label: 'Nhắn cuối cũ nhất' },
  { value: 'name_asc', label: 'Tên A–Z' },
  { value: 'name_desc', label: 'Tên Z–A' },
  { value: 'score_desc', label: 'Điểm tiềm năng cao nhất' },
  { value: 'score_asc', label: 'Điểm tiềm năng thấp nhất' },
] as const;
const DEFAULT_SORT = 'activity_desc';

// 'custom' không còn là nút — lịch "Khoảng ngày tuỳ chọn" bên dưới đã đảm nhận (pickDay).
const PERIOD_OPTIONS = [
  { value: 'all', label: 'Mọi lúc', days: null as number | null },
  { value: '7', label: '7 ngày qua', days: 7 },
  { value: '30', label: '30 ngày qua', days: 30 },
  { value: '90', label: '90 ngày qua', days: 90 },
] as const;

const TABS = [
  { value: 'over', label: 'Tổng quan' },
  { value: 'chan', label: 'Kênh' },
  { value: 'hist', label: 'Lịch sử' },
  { value: 'note', label: 'Ghi chú' },
];

type FieldKey = 'inter' | 'created' | 'sent';

const uiTheme = useUiThemeStore();

// State danh sách
/** Dữ liệu thô từ server. KHÔNG lọc/sắp xếp trực tiếp trên ref này. */
const rawRows = ref<Contact[]>([]);
const total = ref(0);
const page = ref(1);
const booting = ref(true);
const loadingMore = ref(false);
const listEl = ref<HTMLElement | null>(null);
const flashId = ref<string | null>(null);

const q = ref('');
const menu = ref<'more' | 'sort' | null>(null);
const fetchError = ref<string | null>(null);

// Chọn nhiều để chuyển vào thùng rác (owner-only từ 2026-07-31)
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
    void loadGrandTotal();
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
  personaCluster: '' as string,
  confidenceTier: '' as '' | 'CONSOLIDATED' | 'PRELIMINARY',
  field: '' as FieldKey | '',   // '' = Tất cả (mặc định, không lọc theo mốc nào)
  dir: 'desc' as 'desc' | 'asc',
  multiNick: false,
  scoreMin: '',
  scoreMax: '',
  seqMin: '',
  inviteMin: '',
  sort: DEFAULT_SORT as string,
  from: null as Date | null,
  to: null as Date | null,
  tFrom: '',
  tTo: '',
  set: null as string | null,
});

/** Bật/tắt các lọc ít dùng cần checkbox. */
const adv = reactive({ score: false, hours: false, seq: false, invite: false });

/** Period toolbar; 'custom' = lấy theo lịch. */
const period = ref('all');

const users = ref<Array<{ id: string; fullName: string }>>([]);
const statuses = ref<Array<{ id: string; name: string; color: string | null }>>([]);

/** Tổng KH không lọc — vế phải bộ đếm. */
const grandTotal = ref(0);

const allLoaded = computed(() => rawRows.value.length > 0 && rawRows.value.length >= total.value);

/** Lọc đang bật; dùng cho empty-state và "Xoá tất cả". */
const toolbarPeriodOn = computed(() => ['7', '30', '90'].includes(period.value));
const customRangeOn = computed(() => period.value === 'custom' && !!(f.from || f.to));
/** Badge nút "+" = số lọc đang bật TRONG popover (period + trạng thái nay nằm trong đó). */
const advCount = computed(() => {
  let n = 0;
  if (toolbarPeriodOn.value) n++;
  if (f.statusId) n++;
  if (f.rel.length) n++;
  if (f.employee) n++;
  if (f.source) n++;
  if (f.type) n++;
  if (f.zalo) n++;
  if (f.personaCluster) n++;
  if (f.confidenceTier) n++;
  if (f.multiNick) n++;
  if (f.scoreMin || f.scoreMax) n++;
  if (f.tFrom || f.tTo) n++;
  if (f.seqMin) n++;
  if (f.inviteMin) n++;
  if (customRangeOn.value) n++;
  return n;
});
/** Tổng lọc đang bật (search ở toolbar + phần còn lại trong popover); dùng cho empty-state. */
const activeCount = computed(() => {
  let n = 0;
  if (q.value.trim()) n++;
  return n + advCount.value;
});

/** Chip cho từng lọc; mỗi chip tự gỡ riêng. */
const activeChips = computed<Array<{ key: string; label: string; clear: () => void }>>(() => {
  const out: Array<{ key: string; label: string; clear: () => void }> = [];
  if (toolbarPeriodOn.value) {
    const lbl = PERIOD_OPTIONS.find((p) => p.value === period.value)?.label ?? '';
    out.push({ key: 'period', label: `Khoảng thời gian: ${lbl}`, clear: () => { period.value = 'all'; onPeriodChange(); } });
  }
  if (customRangeOn.value) {
    out.push({ key: 'range', label: `Ngày: ${rangeLabel.value}`, clear: clearRange });
  }
  if (f.statusId) {
    const nm = statuses.value.find((s) => s.id === f.statusId)?.name ?? '';
    out.push({ key: 'status', label: `Trạng thái: ${nm}`, clear: () => { f.statusId = ''; applyFilters(); } });
  }
  if (f.rel.length) {
    const names = f.rel.map((v) => REL_OPTIONS.find((r) => r.value === v)?.label ?? v);
    const txt = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
    out.push({ key: 'rel', label: `Quan hệ Zalo: ${txt}`, clear: () => { f.rel = []; applyFilters(); } });
  }
  if (f.employee) {
    const nm = users.value.find((u) => u.id === f.employee)?.fullName ?? '';
    out.push({ key: 'employee', label: `Nhân viên: ${nm}`, clear: () => { f.employee = ''; applyFilters(); } });
  }
  if (f.source) {
    const txt = SOURCE_OPTIONS.find((o) => o.value === f.source)?.text ?? f.source;
    out.push({ key: 'source', label: `Nguồn: ${txt}`, clear: () => { f.source = ''; applyFilters(); } });
  }
  if (f.type) {
    out.push({ key: 'type', label: `Loại: ${f.type === 'user' ? 'Cá nhân' : 'Nhóm'}`, clear: () => { f.type = ''; applyFilters(); } });
  }
  if (f.zalo) {
    const txt = ZALO_OPTIONS.find((z) => z.value === f.zalo)?.label ?? '';
    out.push({ key: 'zalo', label: `Zalo: ${txt}`, clear: () => { f.zalo = ''; applyFilters(); } });
  }
  if (f.multiNick) {
    out.push({ key: 'multiNick', label: 'Nhiều nick Zalo', clear: () => { f.multiNick = false; applyFilters(); } });
  }
  if (f.scoreMin || f.scoreMax) {
    out.push({ key: 'score', label: `Điểm: ${f.scoreMin || '0'}–${f.scoreMax || '100'}`, clear: () => { adv.score = false; f.scoreMin = ''; f.scoreMax = ''; applyFilters(); } });
  }
  if (f.tFrom || f.tTo) {
    out.push({ key: 'hours', label: `Giờ: ${f.tFrom || '00:00'}–${f.tTo || '23:59'}`, clear: () => { adv.hours = false; f.tFrom = ''; f.tTo = ''; applyFilters(); } });
  }
  if (f.seqMin) {
    out.push({ key: 'seq', label: `Sequence ≥ ${f.seqMin}`, clear: () => { adv.seq = false; f.seqMin = ''; applyFilters(); } });
  }
  if (f.inviteMin) {
    out.push({ key: 'invite', label: `Kết bạn ≥ ${f.inviteMin}`, clear: () => { adv.invite = false; f.inviteMin = ''; applyFilters(); } });
  }
  return out;
});

// Tải dữ liệu
/**
 * dateFrom/dateTo phải là YYYY-MM-DD: backend tự nối "T23:59:59.999Z" cho mốc cuối ngày, gửi
 * ISO đầy đủ sẽ thành chuỗi hỏng và Prisma ném 500.
 * Cắt theo giờ địa phương chứ không toISOString(): ở UTC+7 nó lùi về 17:00 ngày hôm trước.
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
    const [sortField, sortDir] = splitSort(f.sort);
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
        personaCluster: f.personaCluster || undefined,
        confidenceTier: f.confidenceTier || undefined,
        multiNick: f.multiNick ? 'true' : undefined,
        scoreMin: f.scoreMin || undefined,
        scoreMax: f.scoreMax || undefined,
        sequenceAttachMin: f.seqMin || undefined,
        friendInviteMin: f.inviteMin || undefined,
        dateFrom: f.from ? toDayParam(f.from) : undefined,
        dateTo: f.to ? toDayParam(f.to) : undefined,
        sort: sortField || undefined,
        sortDir: sortDir || undefined,
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

/** 'created_asc' → ['created', 'asc']; lạ thì về mặc định. */
function splitSort(v: string): [string, string] {
  const i = v.lastIndexOf('_');
  const field = v.slice(0, i);
  const dir = v.slice(i + 1);
  if (dir !== 'asc' && dir !== 'desc') return ['', ''];
  return [field, dir];
}

/** Tổng KH không lọc (vế phải bộ đếm); gọi lại sau thêm/archive. */
function loadGrandTotal() {
  return api.get('/contacts/stats')
    .then((r) => { grandTotal.value = r.data?.total ?? 0; })
    .catch((err) => console.error('[PeopleView] load stats failed:', err));
}

/** Chỉ lọc giờ-trong-ngày ở client; backend không hỗ trợ. */
const rows = computed<Contact[]>(() => {
  const list = rawRows.value;
  const mF = minsOf(f.tFrom);
  const mT = minsOf(f.tTo);
  if (mF === null && mT === null) return list;

  return list.filter((c) => {
    const raw = c.lastActivity;
    if (!raw) return false;
    const d = new Date(raw);
    const m = d.getHours() * 60 + d.getMinutes();
    if (mF !== null && m < mF) return false;
    if (mT !== null && m > mT) return false;
    return true;
  });
});

/** Lọc giờ chạy client trên trang đã tải → tổng server không còn đúng. */
const countApprox = computed(() => !!f.tFrom || !!f.tTo);

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

/** Bấm nút lọc trong popover: gán giá trị rồi áp dụng ngay (chọn 1, không cộng dồn). */
function pickPeriod(v: string) {
  period.value = v;
  onPeriodChange();
}
function pickStatus(v: string) {
  f.statusId = v;
  applyFilters();
}
function pickSource(v: string) {
  f.source = v;
  applyFilters();
}
function pickType(v: '' | 'user' | 'group') {
  f.type = v;
  applyFilters();
}
function pickZalo(v: '' | 'true' | 'false') {
  f.zalo = v;
  applyFilters();
}
function pickSort(v: string) {
  f.sort = v;
  applyFilters();
  closeMore();
}

/** Cột nào đang là khoá sắp xếp (tô sáng header). */
function sortFieldIs(k: FieldKey): boolean {
  const [field] = splitSort(f.sort);
  const map: Record<FieldKey, string> = { inter: 'activity', created: 'created', sent: 'sent' };
  return field === map[k];
}
/** Mũi tên ↑/↓ cho cột đang sắp. */
function arrow(k: FieldKey) {
  if (!sortFieldIs(k)) return '';
  const [, dir] = splitSort(f.sort);
  return dir === 'asc' ? '↑' : '↓';
}
/** Click header cột: đổi cột hoặc đảo chiều; luôn có thứ tự. */
function setField(v: FieldKey) {
  const map: Record<FieldKey, string> = { inter: 'activity', created: 'created', sent: 'sent' };
  const cur = splitSort(f.sort);
  if (cur[0] === map[v]) f.sort = `${map[v]}_${cur[1] === 'asc' ? 'desc' : 'asc'}`;
  else f.sort = `${map[v]}_desc`;
  applyFilters();
}

/** Preset gán from/to, 'all' xoá; khoảng tuỳ chọn do lịch bên dưới đảm nhận (pickDay). */
function onPeriodChange() {
  const opt = PERIOD_OPTIONS.find((p) => p.value === period.value);
  pendingDay.value = null;
  if (period.value === 'all') {
    f.from = null;
    f.to = null;
  } else if (opt?.days) {
    const to = new Date();
    to.setHours(0, 0, 0, 0);
    f.from = new Date(to.getTime() - (opt.days - 1) * 86400000);
    f.to = to;
  }
  applyFilters();
}

function clearAll() {
  q.value = '';
  period.value = 'all';
  f.rel = [];
  f.employee = '';
  f.statusId = '';
  f.source = '';
  f.type = '';
  f.zalo = '';
  f.personaCluster = '';
  f.confidenceTier = '';
  f.multiNick = false;
  f.scoreMin = '';
  f.scoreMax = '';
  f.seqMin = '';
  f.inviteMin = '';
  f.from = null;
  f.to = null;
  f.tFrom = '';
  f.tTo = '';
  f.set = null;
  f.sort = DEFAULT_SORT;
  adv.score = false;
  adv.hours = false;
  adv.seq = false;
  adv.invite = false;
  pendingDay.value = null;
  fetchPage(true);
}

/** Gỡ chip khoảng ngày tuỳ chọn; trả period về 'all' nếu đang ở 'custom'. */
function clearRange() {
  f.from = null;
  f.to = null;
  pendingDay.value = null;
  if (period.value === 'custom') period.value = 'all';
  applyFilters();
}
function toggleMenu(m: 'more' | 'sort') {
  menu.value = menu.value === m ? null : m;
}
function closeMore() {
  menu.value = null;
}
/** Bật checkbox lọc ít dùng; tắt thì xoá luôn giá trị để không lọc ngầm. */
function toggleAdv(k: keyof typeof adv) {
  adv[k] = !adv[k];
  if (!adv[k]) {
    if (k === 'score') { f.scoreMin = ''; f.scoreMax = ''; }
    if (k === 'hours') { f.tFrom = ''; f.tTo = ''; }
    if (k === 'seq') f.seqMin = '';
    if (k === 'invite') f.inviteMin = '';
  }
  applyFilters();
}

// Bộ lọc đã lưu
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
  f.personaCluster = '';
  f.confidenceTier = '';
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
      personaCluster: f.personaCluster, confidenceTier: f.confidenceTier,
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

// Lịch (2 tháng)
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
    // Click đầu: coi như khoảng một ngày [day, day] để lọc áp dụng ngay (không chờ
    // ngày kết thúc, vì thanh lọc giờ live và không còn nút "Áp dụng").
    pendingDay.value = day;
    f.from = day;
    f.to = day;
    period.value = 'custom';
    fetchPage(true);
    return;
  }
  let a = pendingDay.value;
  let b = day;
  if (b < a) { const t = a; a = b; b = t; }
  pendingDay.value = null;
  f.from = a;
  f.to = b;
  period.value = 'custom';
  fetchPage(true);
}

const rangeLabel = computed(() => {
  if (!f.from) return 'Mọi ngày';
  return fmtDate(f.from) + (f.to ? ` → ${fmtDate(f.to)}` : '');
});

// Định dạng / hiển thị
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
  return '';
}
function genderAgeOf(c: Contact) {
  const age = c.birthYear ? `${new Date().getFullYear() - c.birthYear} tuổi` : '';
  const g = genderLabel(c.gender);
  if (!g && !age) return '';
  return g && age ? `${g} · ${age}` : (g || age);
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
  return REL_OPTIONS.find((r) => r.value === kind)?.label || '';
}
function metaLine(c: Contact) {
  const parts: string[] = [];
  const ga = genderAgeOf(c);
  if (ga) parts.push(ga);
  if (c.phone) parts.push(c.phone);
  const loc = locationOf(c);
  if (loc) parts.push(loc);
  return parts.join(' · ');
}
function relColor(kind: string) {
  if (kind === 'friend') return 'var(--pp-good)';
  if (kind === 'pending_friend') return 'var(--pp-warn)';
  if (kind === 'ghost') return 'var(--pp-bad)';
  if (kind === 'chatting_stranger') return 'var(--pp-muted)';
  return 'transparent';
}

// Drawer chi tiết
const drawerOpen = ref(false);
const selectedId = ref<string | null>(null);
const detail = ref<Contact | null>(null);
const tab = ref('over');
const dirty = ref(false);
const dirtyCare = ref(false);
const saving = ref(false);
const draft = reactive<Record<string, unknown>>({});
const tagDraft = ref('');
const copiedCode = ref<string | null>(null);
const copiedPosId = ref<number | null>(null);
const chanEdit = reactive<Record<string, { alias?: string; statusId?: string }>>({});

// "nick liên quan" — Contact cùng SĐT thật + cùng "chuỗi" (thương hiệu/công ty).
const familyOpen = ref(false);
const familyLoading = ref(false);
const familyMembers = ref<PhoneFamilyMember[]>([]);
const chainLoading = ref(false);
const chainMembers = ref<PhoneFamilyMember[]>([]);
const familyWrapRef = ref<HTMLElement | null>(null);
let familyLoadedFor: string | null = null;
let chainLoadedFor: string | null = null;
// Số nick LIÊN QUAN (không tính Contact đang xem, dedupe theo id giữa 2 list).
const familyOtherCount = computed(() => {
  const ids = new Set<string>();
  for (const m of [...familyMembers.value, ...chainMembers.value]) {
    if (!m.isCurrent) ids.add(m.id);
  }
  return ids.size;
});

const timeline = ref<Array<{ title: string; desc: string; when: string }>>([]);
const loadingTimeline = ref(false);
const notes = ref<Array<{ id: string; author: string; body: string; when: string }>>([]);
const loadingNotes = ref(false);
const noteDraft = ref('');
const savingNote = ref(false);

// Công nợ = số tiền KH đang nợ công ty, lấy từ POS (snapshot + fallback hoá đơn chưa thanh toán).
const debt = ref<{ totalDebt: number; overdueDebt: number; dueDate: string | null; status: string } | null>(null);
const debtLoading = ref(false);

async function loadDebt(contactId: string) {
  debtLoading.value = true;
  debt.value = null;
  try {
    const res = await api.get(`/pos/customers/${contactId}/debts`);
    // Khách có thể đã đổi khi request về — chỉ ghi nếu vẫn đang xem đúng người đó.
    if (selectedId.value !== contactId) return;
    const d = res.data?.data;
    debt.value = {
      totalDebt: Number(d?.totalDebt) || 0,
      overdueDebt: Number(d?.overdueDebt) || 0,
      dueDate: d?.dueDate ?? null,
      status: d?.status ?? 'Normal',
    };
  } catch (err) {
    // Không phải lỗi của người dùng (KH chưa link POS / sale không có quyền xem) → im lặng, chip hiện 0 ₫.
    console.error('[PeopleView] load debt failed:', err);
    if (selectedId.value === contactId) debt.value = null;
  } finally {
    if (selectedId.value === contactId) debtLoading.value = false;
  }
}

const VND_FMT = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const debtDisplay = computed(() => (debtLoading.value ? '…' : VND_FMT.format(debt.value?.totalDebt ?? 0)));
const debtStatusClass = computed(() => {
  const d = debt.value;
  if (!d || d.totalDebt <= 0) return 'clean';
  return d.overdueDebt > 0 || d.status === 'Danger' ? 'danger' : 'warn';
});
const debtTooltip = computed(() => {
  const d = debt.value;
  if (!d || d.totalDebt <= 0) return 'Khách không có công nợ';
  const bits = [`Tổng nợ: ${VND_FMT.format(d.totalDebt)}`];
  if (d.overdueDebt > 0) bits.push(`Quá hạn: ${VND_FMT.format(d.overdueDebt)}`);
  if (d.dueDate) bits.push(`Hạn thanh toán: ${new Date(d.dueDate).toLocaleDateString('vi-VN')}`);
  return bits.join(' · ');
});

const careFields = reactive({
  productInterest: '',
  workshopsAttended: '',
  complaints: '',
});
const careHistory = ref<ContactCareFields | null>(null);
const careLoading = ref(false);
const careSaving = ref(false);
const productInterestDerived = ref(false);

// Expose product interests as newline-separated lines in the UI while keeping
// storage as a comma-separated string for compatibility with existing APIs.
const productInterestLines = computed<string>({
  get() {
    const v = String(careFields.productInterest || '');
    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.join('\n');
  },
  set(val: string) {
    const parts = String(val || '').split('\n').map((s) => s.trim()).filter(Boolean);
    careFields.productInterest = parts.join(', ');
    dirtyCare.value = true;
    productInterestDerived.value = false;
  },
});

// Auto-resize textarea: keep a ref to the element and resize on input / mount.
const productInterestEl = ref<HTMLElement | null>(null);
function resizeProductInterest() {
  const el = productInterestEl.value as HTMLTextAreaElement | null;
  if (!el) return;
  el.style.height = 'auto';
  // Add small padding to ensure caret isn't at the very bottom
  el.style.height = Math.max(el.scrollHeight, 120) + 'px';
}
function onProductInterestInput() {
  productInterestDerived.value = false;
  // let v-model update first
  nextTick(resizeProductInterest);
}

onMounted(() => nextTick(resizeProductInterest));
watch(productInterestLines, () => nextTick(resizeProductInterest));

const personalFields = [
  { key: 'posName', label: 'Tên POS', ph: '' },
  { key: 'fullName', label: 'Tên đầy đủ', ph: 'Theo hồ sơ' },
  { key: 'birthYear', label: 'Năm sinh', ph: 'YYYY' },
  { key: 'phone', label: 'SĐT chính', ph: '09…' },
  { key: 'email', label: 'Email', ph: '+ thêm' },
  { key: 'province', label: 'Tỉnh / Thành', ph: '+ thêm' },
  { key: 'district', label: 'Quận / Huyện', ph: '+ thêm' },
];

async function openDrawer(row: Contact) {
  selectedId.value = row.id;
  drawerOpen.value = true;
  detail.value = row;
  hydrateDraft(row);
  void loadDebt(row.id);
  try {
    const res = await api.get(`/contacts/${row.id}`);
    if (res.data && selectedId.value === row.id) {
      detail.value = res.data;
      hydrateDraft(res.data);
      await loadCareFields(row.id);
    }
  } catch (err) {
    console.error('[PeopleView] load detail failed:', err);
  }
}
function hydrateDraft(c: Contact) {
  Object.keys(draft).forEach((k) => delete draft[k]);
  Object.assign(draft, {
    // Move existing stored fullName (often used for POS name) into `posName`.
    posName: c.fullName || (c as any).posCustomerName || (c as any).posCustomer?.name || '',
    // Compute displayed fullName using shared fallback chain but IGNORE the stored
    // `fullName` (which we now repurpose for POS). This forces the chain to
    // prefer `crmName` → Zalo display → alias → UID instead of the stored value.
    fullName: (() => {
      const fl = toFriendLike(c);
      if (fl.contact) fl.contact.fullName = null;
      return displayCustomerName(fl, '');
    })(),
    phone: c.phone ?? '', email: c.email ?? '',
    province: c.province ?? '', district: c.district ?? '',
    assignedUserId: c.assignedUserId ?? null, statusId: c.statusId ?? null,
    source: c.source ?? null, tags: [...(c.tags || [])],
  });
  // These fields are loaded separately because each category keeps append-only history.
  careHistory.value = null;
  careFields.productInterest = '';
  careFields.workshopsAttended = '';
  careFields.complaints = '';
  productInterestDerived.value = false;
  dirtyCare.value = false;
  dirty.value = false;
}
async function loadCareFields(contactId: string) {
  careLoading.value = true;
  careHistory.value = null;
  try {
    const res = await api.get<ContactCareFields>(`/contacts/${contactId}/care-fields`);
    if (selectedId.value !== contactId) return;
    careHistory.value = res.data;
    careFields.productInterest = res.data.current.productInterest;
    careFields.workshopsAttended = res.data.current.workshopsAttended;
    careFields.complaints = res.data.current.complaints;
    // Giá trị nhập tay thắng; chỉ khi trống mới đổ danh sách suy diễn từ POS vào.
    const derived = res.data.derived?.productInterests ?? [];
    productInterestDerived.value = !careFields.productInterest && derived.length > 0;
    if (productInterestDerived.value) careFields.productInterest = derived.join(', ');
    dirtyCare.value = false;
  } catch (err) {
    console.error('[PeopleView] load care fields failed:', err);
    toast.error('Không tải được thông tin chăm sóc');
  } finally {
    careLoading.value = false;
  }
}
function closeDrawer() {
  drawerOpen.value = false;
  selectedId.value = null;
  closeFamilyMenu();
  debt.value = null;
  debtLoading.value = false;
  // Bỏ ?focus= khỏi URL sau khi đóng — không thì F5 lại tự mở lại drawer vừa đóng.
  if (route.query.focus) {
    const q = { ...route.query };
    delete q.focus;
    void router.replace({ path: route.path, query: q });
  }
}

// ── "nick liên quan": Contact cùng SĐT thật + cùng "chuỗi" ─────────────────
function closeFamilyMenu() {
  familyOpen.value = false;
}

// Click ngoài đóng menu — cùng idiom với pos-menu ở ChatContactPanel.vue.
// Listener chỉ gắn khi menu mở, tránh document listener sống suốt đời component.
function onFamilyOutside(e: MouseEvent) {
  const wrap = familyWrapRef.value;
  if (wrap && !wrap.contains(e.target as Node)) closeFamilyMenu();
}
watch(familyOpen, (open) => {
  if (open) document.addEventListener('mousedown', onFamilyOutside);
  else document.removeEventListener('mousedown', onFamilyOutside);
});

async function toggleFamilyMenu() {
  if (familyOpen.value) { familyOpen.value = false; return; }
  if (!detail.value) return;
  familyOpen.value = true;
  await Promise.all([loadFamily(), loadChain()]);
}

/**
 * Fetch family (cache theo contactId). Gọi khi mở drawer (để chip có số) VÀ khi
 * bấm mở dropdown. `silent=true` (từ drawer) nuốt lỗi để không toast khi chỉ tải
 * số nền — dropdown bấm tay vẫn báo lỗi.
 */
async function loadFamily(silent = false) {
  if (!detail.value) return;
  const anchorId = detail.value.id;
  // Đã tải cho đúng Contact này rồi thì dùng lại — drawer có thể mở lại liên tục.
  if (familyLoadedFor === anchorId) return;
  // Xoá list của Contact trước ngay, đừng để flash dữ liệu cũ trong lúc chờ fetch.
  familyMembers.value = [];
  familyLoading.value = true;
  try {
    const res = await api.get<PhoneFamilyResponse>(`/contacts/${anchorId}/phone-family`);
    // Đổi Contact giữa lúc chờ fetch → bỏ kết quả, không ghi đè family của Contact mới.
    if (selectedId.value !== anchorId) return;
    familyMembers.value = res.data?.contacts ?? [];
    familyLoadedFor = anchorId;
  } catch (err) {
    if (selectedId.value !== anchorId) return;
    console.error('[PeopleView] load phone family failed:', err);
    if (!silent) toast.error('Không tải được các nick khác của khách này');
    familyMembers.value = [];
  } finally {
    if (selectedId.value === anchorId) familyLoading.value = false;
  }
}

/**
 * Fetch "chuỗi" — cùng logic cache/guard như loadFamily, chỉ khác endpoint.
 * `silent=true` từ drawer để chip có số nền mà không toast khi lỗi.
 */
async function loadChain(silent = false) {
  if (!detail.value) return;
  const anchorId = detail.value.id;
  if (chainLoadedFor === anchorId) return;
  chainMembers.value = [];
  chainLoading.value = true;
  try {
    const res = await api.get<ChainFamilyResponse>(`/contacts/${anchorId}/chain-family`);
    if (selectedId.value !== anchorId) return;
    chainMembers.value = res.data?.contacts ?? [];
    chainLoadedFor = anchorId;
  } catch (err) {
    if (selectedId.value !== anchorId) return;
    console.error('[PeopleView] load chain family failed:', err);
    if (!silent) toast.error('Không tải được các nick cùng chuỗi của khách này');
    chainMembers.value = [];
  } finally {
    if (selectedId.value === anchorId) chainLoading.value = false;
  }
}

/**
 * Tên Zalo hiển thị ở dropdown. Cố tình KHÔNG dùng displayCustomerName(): chain đó
 * fallback về fullName, mà fullName ở repo này là TÊN POS — dùng nó sẽ làm hai dòng
 * (Zalo / POS) trùng nhau. Ở đây chỉ lấy tên thật từ Zalo/CRM.
 */
function familyZaloName(m: PhoneFamilyMember) {
  const pick = (s?: string | null) =>
    s && s.trim() && s.trim().toLowerCase() !== 'unknown' ? s.trim() : null;
  return (
    pick(m.crmName) ||
    pick(m.zaloDisplayName) ||
    pick(m.aliasInNick) ||
    (m.zaloUid ? `KH-${m.zaloUid.slice(-4)}` : '') ||
    'Chưa có tên Zalo'
  );
}
function familyPosName(m: PhoneFamilyMember) {
  return m.posName || m.fullName || '';
}
function familyInitials(m: PhoneFamilyMember) {
  return initialsOfName(familyZaloName(m));
}
async function openFamilyMember(m: PhoneFamilyMember) {
  if (m.isCurrent) { closeFamilyMenu(); return; }
  closeFamilyMenu();
  if (!m.accessible) {
    toast.error('Khách này do sale khác phụ trách');
    return;
  }
  await openDrawerById(m.id);
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
    void loadDebt(id);
    await loadCareFields(id);
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
  if (!detail.value || (!dirty.value && !dirtyCare.value)) return;
  saving.value = true;
  try {
    if (dirty.value) {
      const payload: Record<string, unknown> = {
      fullName: draft.fullName || null,
      birthYear: draft.birthYear ? Number(draft.birthYear) : null,
      phone: draft.phone || null,
      email: draft.email || null,
      province: draft.province || null,
      district: draft.district || null,
      assignedUserId: draft.assignedUserId || null,
      statusId: draft.statusId || null,
      source: draft.source || null,
      tags: draft.tags,
      };
      await updateContact(detail.value.id, payload as Partial<Contact>);
      const i = rawRows.value.findIndex((r) => r.id === detail.value!.id);
      if (i >= 0) rawRows.value[i] = { ...rawRows.value[i], ...(payload as Partial<Contact>) };
    }
    if (dirtyCare.value) {
      await api.put(`/contacts/${detail.value.id}/care-fields`, {
        productInterest: careFields.productInterest,
        workshopsAttended: careFields.workshopsAttended,
        complaints: careFields.complaints,
      });
      await loadCareFields(detail.value.id);
      dirtyCare.value = false;
    }
    dirty.value = false;
    showToast('Đã lưu thay đổi');
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
    void loadGrandTotal();
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

// Biến cá nhân hoá: dùng đúng TEMPLATE_VARIABLES của app (36 biến)
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
function copyPosId(posId: number) {
  copiedPosId.value = posId;
  try { navigator.clipboard?.writeText(String(posId)); } catch { /* ignore */ }
  setTimeout(() => { if (copiedPosId.value === posId) copiedPosId.value = null; }, 1400);
}

// Lịch sử + ghi chú (lazy theo tab)
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
  // Tải family + chuỗi nền để chip "nick liên quan" có số ngay — silent=true.
  void loadFamily(true);
  void loadChain(true);
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

// Liên kết KH POS theo SĐT (2026-07-31)
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

// Tạo KH mới (Zalo/Facebook, chưa có ở POS)
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
    void loadGrandTotal();
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
    void loadGrandTotal();
    if (linked?.id) await openDrawerById(linked.id);
  } catch (err) {
    console.error('[PeopleView] link-pos failed:', err);
    toast.error('Không liên kết được khách hàng');
  } finally {
    linkSaving.value = false;
  }
}
// Toast cục bộ (khớp design)
const toastMsg = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(msg: string) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg.value = null; }, 2200);
}

// Realtime
// Dùng lại use-friend-socket (contract friend:updated đang có 7 nơi tiêu thụ — không đổi shape).
useFriendSocket((payload: FriendUpdatedPayload) => {
  const row = rawRows.value.find((r) => r.id === payload.contactId);
  if (!row) return;
  Object.assign(row, payload.patch ?? {});
  flashId.value = row.id;
  setTimeout(() => { if (flashId.value === row.id) flashId.value = null; }, 2000);
});

// Lifecycle
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (familyOpen.value) { closeFamilyMenu(); return; }
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
  void loadGrandTotal();
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
  document.removeEventListener('mousedown', onFamilyOutside);
  clearTimeout(searchTimer);
  clearTimeout(toastTimer);
});
</script>

<style scoped>
/* ═══════════ Token màu — light + dark (design CRM Atlas) ═══════════
   Đặt trên .people để dark mode KHÔNG rò ra ngoài trang này.

   2026-08-12 — ánh xạ về hệ token chung của app:
   Trang này trước dùng bảng màu RIÊNG (nền tím nhạt #F0EFF6, accent tím #5B4BE6,
   viền #E7E4F0, chữ #1B1A24) trong khi phần còn lại của CRM dùng nền xám-xanh
   và accent xanh Zalo. Chuyển từ Tin nhắn sang Khách hàng là đổi hẳn tông màu,
   trông như hai sản phẩm khác nhau.
   Nay các biến --pp-* ở nhánh SÁNG trỏ thẳng vào --app-*; nhánh TỐI giữ nguyên
   giá trị tuyệt đối vì app chưa có bộ token tối. Giữ tên biến --pp-* để không
   phải sửa hơn 600 dòng CSS phía dưới, và nút bật/tắt nền tối vẫn chạy y như cũ. */
.people {
  --pp-bg: var(--app-surface-canvas);
  --pp-panel: var(--app-surface-panel);
  --pp-card: var(--app-surface-sunken);
  --pp-fg: var(--app-text-primary);
  --pp-muted: var(--app-text-secondary);
  --pp-faint: var(--app-text-muted);
  --pp-line: var(--app-border-subtle);
  --pp-accent: var(--app-accent);
  --pp-onAccent: var(--app-text-inverse);
  --pp-chip: var(--app-accent-soft);
  --pp-chipFg: var(--app-accent);
  --pp-good: var(--app-success);
  --pp-warn: var(--app-warning);
  --pp-bad: var(--app-danger);
  --pp-shadow: rgba(16, 24, 40, .16);

  /* Chữ: bỏ Montserrat/Roboto riêng của trang, dùng đúng font của app để tiêu đề
     và nội dung ở đây khớp với các màn khác. */
  --pp-display: inherit;
  --pp-body: inherit;
}
.people[data-theme='dark'] {
  --pp-bg: #121121; --pp-panel: #1B1930; --pp-card: #232040;
  --pp-fg: #EFEDF8; --pp-muted: #9A95B0; --pp-faint: #7A7593;
  --pp-line: #2C2846; --pp-accent: #6BA6FF; --pp-onAccent: #10203A;
  --pp-chip: #1E2A44; --pp-chipFg: #A8C9FF;
  --pp-good: #4ADEA0; --pp-warn: #E3B457; --pp-bad: #FF7C9C;
  --pp-shadow: rgba(0, 0, 0, .5);
}

.people {
  height: calc(100vh - var(--smax-topnav-h));
  display: flex; flex-direction: column;
  position: relative; overflow: hidden;
  background: var(--pp-bg); color: var(--pp-fg);
  font-family: var(--pp-body);
  font-weight: 500;
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
/* Nền đặc + position:relative để z-index có tác dụng: danh sách trượt phía sau
   không lọt qua khe giữa toolbar và bảng. padding-bottom 10px bù cho phần
   padding-top đã bỏ ở .ppl-list — giữ nguyên khoảng thở mà header bảng dính
   sát mép dưới của dải nền đặc, không còn khe hở cho dòng cuộn ló vào. */
.ppl-head {
  padding: 14px 24px 10px; display: flex; flex-direction: column; gap: 10px;
  position: relative; z-index: 15; background: var(--pp-bg);
}
.ppl-head-row { display: flex; align-items: center; gap: 12px; }
.ppl-title h1 { margin: 0; font-family: var(--pp-display); font-size: 20px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }

/* Ô tìm kiếm: nằm đầu hàng lọc (cùng hàng với các dropdown), không còn ở hàng tiêu đề. */
.ppl-search {
  flex: 0 1 280px; min-width: 180px;
  display: flex; align-items: center; gap: 9px;
  height: var(--app-control-h-lg); padding: 0 14px;
  border-radius: var(--app-radius-md);
  background: var(--pp-panel); border: 1px solid var(--pp-line);
  transition: border-color .14s, box-shadow .14s;
}
.ppl-search.on,
.ppl-search:focus-within {
  border-color: var(--pp-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pp-accent) 14%, transparent);
}
.ppl-search svg { width: 16px; height: 16px; color: var(--pp-muted); flex: none; }
.ppl-search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--pp-fg); font-size: 13px; }
.ppl-search input::placeholder { color: var(--pp-faint); }
.ppl-search-x { cursor: pointer; color: var(--pp-muted); font-size: 16px; line-height: 1; }

.ppl-btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  height: var(--app-control-h-lg); padding: 0 16px; border: 0;
  border-radius: var(--app-radius-md);
  background: var(--pp-accent); color: var(--pp-onAccent);
  font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: opacity .12s;
}
/* Hover dùng opacity (transform/opacity only) — trước là transition: filter. */
.ppl-btn-primary:hover:not(:disabled) { opacity: .9; }
.ppl-btn-primary:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
.ppl-btn-primary:focus-visible { outline: 2px solid var(--pp-accent); outline-offset: 2px; }
.ppl-btn-primary.sm { height: var(--app-control-h-md); padding: 0 14px; font-size: 12.5px; }
.ppl-btn-primary svg { width: 15px; height: 15px; }
.ppl-btn-ghost {
  height: var(--app-control-h-md); padding: 0 14px;
  border: 1px solid var(--pp-line); border-radius: var(--app-radius-md);
  background: transparent; color: var(--pp-fg); font-size: 13px; font-weight: 600; cursor: pointer;
}
.ppl-btn-ghost.sm { height: 30px; padding: 0 12px; font-size: 12px; align-self: flex-start; background: var(--pp-panel); }

/* ── Thanh lọc ngang ──
   Tìm kiếm + nút "+" ở trái; sắp xếp và bộ đếm neo phải. */
.ppl-tools { display: flex; align-items: center; gap: 8px; position: relative; }

/* Wrapper để menu sắp xếp neo đúng dưới nút, và đẩy cụm phải sang mép. */
.ppl-sortwrap { position: relative; flex: none; margin-left: auto; }
.ppl-sort {
  display: inline-flex; align-items: center; gap: 7px;
  height: var(--app-control-h-lg); padding: 0 12px;
  border-radius: var(--app-radius-md);
  border: 1px solid var(--pp-line); background: var(--pp-panel);
  color: var(--pp-fg); font-size: 12.5px; font-weight: 700; cursor: pointer;
  transition: border-color .14s, color .14s;
}
.ppl-sort:hover { border-color: var(--pp-accent); color: var(--pp-accent); }
.ppl-sort.on, .ppl-sort.open { border-color: var(--pp-accent); color: var(--pp-accent); }
.ppl-sort.open { background: var(--pp-chip); }
.ppl-sort:focus-visible { outline: 2px solid var(--pp-accent); outline-offset: 2px; }
.ppl-sort svg { width: 16px; height: 16px; flex: none; }
.ppl-sort-caret { width: 13px; height: 13px; opacity: .6; }

/* Wrapper riêng để popover neo đúng dưới nút "+". */
.ppl-morewrap { position: relative; flex: none; }
/* Nút "+" mở popover lọc ít dùng — vuông, cùng chiều cao dropdown. */
.ppl-more {
  position: relative; flex: none;
  width: var(--app-control-h-lg); height: var(--app-control-h-lg);
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--app-radius-md);
  border: 1px solid var(--pp-line); background: var(--pp-panel);
  color: var(--pp-muted); cursor: pointer;
}
.ppl-more:hover { border-color: var(--pp-accent); color: var(--pp-accent); }
.ppl-more.open, .ppl-more.armed { border-color: var(--pp-accent); color: var(--pp-accent); }
.ppl-more.open { background: var(--pp-chip); }
.ppl-more:focus-visible { outline: 2px solid var(--pp-accent); outline-offset: 2px; }
.ppl-more svg { width: 16px; height: 16px; }
.ppl-count-badge {
  position: absolute; top: -5px; right: -5px;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: var(--app-radius-pill);
  background: var(--pp-accent); color: var(--pp-onAccent); font-size: 10px; font-weight: 700;
}
.ppl-clear {
  font-size: 13px; font-weight: 600; color: var(--pp-muted); cursor: pointer;
  text-decoration: underline; text-underline-offset: 3px; white-space: nowrap;
}
/* Bộ đếm đứng sát nút sắp xếp — .ppl-sortwrap giữ margin-left: auto duy nhất. */
.ppl-meta {
  display: flex; align-items: center; gap: 9px; flex: none;
  font-size: 12.5px; color: var(--pp-muted); white-space: nowrap;
}
.ppl-meta strong { color: var(--pp-fg); font-weight: 700; }

/* ── Chip lọc đang áp dụng ── */
.ppl-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.ppl-chip {
  display: inline-flex; align-items: center; gap: 7px;
  height: 28px; padding: 0 6px 0 12px; border-radius: 999px;
  background: var(--pp-chip); color: var(--pp-chipFg);
  border: 1px solid transparent;
  font-size: 12px; font-weight: 600; white-space: nowrap;
}
.ppl-chip-x {
  width: 18px; height: 18px; border-radius: 50%; border: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--pp-chipFg); font-size: 14px; line-height: 1;
}
.ppl-chip-x:hover { background: color-mix(in srgb, var(--pp-chipFg) 22%, transparent); }


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
/* Neo TRÁI vì nút "+" nay sát ô tìm kiếm; neo phải sẽ đẩy popover tràn khỏi màn hình. */
.ppl-menu--more { left: 0; width: 560px; max-width: calc(100vw - 32px); }
.ppl-menu--sort { right: 0; width: 230px; gap: 2px; padding: 7px; }
.ppl-sort-i {
  display: block; width: 100%; text-align: left;
  padding: 9px 11px; border: 0; border-radius: 9px;
  background: transparent; color: var(--pp-fg);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.ppl-sort-i:hover { background: var(--pp-card); }
.ppl-sort-i.on { background: var(--pp-accent); color: var(--pp-onAccent); font-weight: 700; }
.ppl-menu-foot {
  display: flex; align-items: center; gap: 11px;
  padding-top: 10px; border-top: 1px solid var(--pp-line);
}
.ppl-menu-foot .ppl-btn-primary { margin-left: auto; }

/* ── Lọc ít dùng: hàng checkbox ── */
/* Ô tick 15px, không theo mặc định trình duyệt. */
.ppl-adv--inline { display: flex; flex-direction: row; align-items: center; gap: 8px; }
.ppl-adv--inline input { width: 15px; height: 15px; accent-color: var(--pp-accent); cursor: pointer; flex: none; }
.ppl-adv--inline span { font-size: 12.5px; font-weight: 600; }

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

/* Nút lọc xếp khít, tự xuống dòng — thay cho dropdown khi số lựa chọn ít. */
.ppl-btns { display: flex; flex-wrap: wrap; gap: 5px; }
.ppl-btns-i {
  padding: 7px 12px; border-radius: 9px;
  background: var(--pp-card); color: var(--pp-muted);
  border: 1px solid var(--pp-line);
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: border-color .14s, color .14s;
}
.ppl-btns-i:hover { border-color: var(--pp-accent); color: var(--pp-accent); }
.ppl-btns-i.on { background: var(--pp-accent); color: var(--pp-onAccent); border-color: var(--pp-accent); }
.ppl-btns-i:focus-visible { outline: 2px solid var(--pp-accent); outline-offset: 2px; }
.ppl-set-empty { font-size: 12px; color: var(--pp-faint); }

.ppl-grid2 { display: grid; grid-template-columns: 1fr; gap: 11px; }
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

/* ═══════════ Danh sách ═══════════
   2026-08-12: chuyển từ "mỗi dòng là một card nổi, cách nhau 8px" sang bảng liền
   mạch trong một khung duy nhất. Lý do: danh sách khách hàng là dữ liệu để QUÉT
   theo cột — card rời làm mắt phải nhảy qua từng khoảng trống và tốn ~40% chiều
   cao cho khoảng cách + bóng đổ, nên mỗi màn thấy được ít dòng hơn hẳn.
   Hàng tiêu đề nay dính (sticky) để cuộn sâu vẫn biết đang đọc cột nào. */
.ppl-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 0 24px 24px; transition: opacity .16s; }
.ppl-cols, .ppl-row { display: flex; align-items: center; min-width: 1330px; }
.ppl-cols {
  position: sticky; top: 0; z-index: 2;
  padding: 10px 16px; font-size: 10.5px; letter-spacing: .08em;
  text-transform: uppercase; font-weight: 700; color: var(--pp-muted);
  background: var(--pp-card);
  border: 1px solid var(--pp-line);
  border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
}
.c-check { width: 34px; flex: none; display: flex; align-items: center; }
.c-check input { width: 15px; height: 15px; accent-color: var(--pp-accent); cursor: pointer; }
.c-person { flex: 1 1 auto; min-width: 240px; }
.c-radar { width: 210px; flex: none; }
.ppl-radar-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}
.ppl-radar-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  max-width: 125px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ppl-radar-badge.cluster-wholesale_buyer { background: #ede9fe; color: #6d28d9; }
.ppl-radar-badge.cluster-office_skincare { background: #e0f2fe; color: #0369a1; }
.ppl-radar-badge.cluster-mom_baby { background: #fce7f3; color: #be185d; }
.ppl-radar-badge.cluster-genz_acne_glow { background: #fef3c7; color: #b45309; }
.ppl-radar-badge.cluster-trial_explorer { background: #d1fae5; color: #047857; }

.ppl-conf-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
}
.ppl-conf-chip.conf-amber {
  background: #fffbeb;
  color: #b45309;
  border-color: #fde68a;
}
.ppl-conf-chip.conf-emerald {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}
.conf-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 4px;
}
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

/* Thân bảng: một khung, các dòng ngăn nhau bằng đường kẻ 1px. */
.ppl-rows {
  display: flex; flex-direction: column;
  background: var(--pp-panel);
  border: 1px solid var(--pp-line);
  border-top: 0;
  border-radius: 0 0 var(--app-radius-lg) var(--app-radius-lg);
  overflow: hidden;
}
/* Bỏ transform khi hover: ở bảng liền mạch, dòng nhấc lên 1px sẽ đè lên đường kẻ
   của dòng kế và trông như bảng bị rung khi rê chuột dọc danh sách. */
.ppl-row {
  padding: 11px 16px;
  background: var(--pp-panel);
  border-bottom: 1px solid var(--pp-line);
  cursor: pointer;
  transition: background-color .12s;
}
.ppl-row:last-child { border-bottom: 0; }
.ppl-row:hover { background: var(--app-surface-hover); }
.ppl-row.sel {
  background: var(--pp-chip);
  box-shadow: inset 3px 0 0 var(--pp-accent);
}
.ppl-row.picked { background: var(--pp-chip); }
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
.ppl-pos-tag {
  flex: none; display: inline-flex; align-items: center; gap: 3px;
  padding: 1px 7px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--pp-line); background: transparent; color: var(--pp-muted);
  font-family: var(--mono); font-size: 10.5px; font-weight: 700; white-space: nowrap;
}
.ppl-pos-tag:hover { border-color: var(--pp-accent); color: var(--pp-fg); }
.ppl-pos-tag.copied { border-color: var(--pp-good); color: var(--pp-good); }
.ppl-pos-ok { font-size: 9px; }
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
/* Thẻ quan hệ — giữ lại tín hiệu màu cũ bằng chấm dẫn đầu, nhưng chữ mới là
   thông tin chính (màu chỉ còn là phụ trợ, không phải cách duy nhất để hiểu). */
.ppl-tag-rel {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--pp-line); background: transparent; color: var(--pp-fg);
}
.ppl-tag-rel::before {
  content: ''; width: 7px; height: 7px; border-radius: 2px;
  background: var(--rel, transparent); flex: none;
}
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

/* Skeleton phải khớp bảng liền mạch ở trên: cùng khung, ngăn nhau bằng đường kẻ,
   không còn là các card bo góc rời. */
.ppl-skel {
  display: flex; align-items: center; gap: 12px; padding: 13px 16px;
  background: var(--pp-panel); border-bottom: 1px solid var(--pp-line);
  animation: ppShim 1.4s ease-in-out infinite;
}
.ppl-skel:first-child { border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0; }
.ppl-skel:last-child { border-bottom: 0; border-radius: 0 0 var(--app-radius-lg) var(--app-radius-lg); }
.sk-av { width: 40px; height: 40px; border-radius: 13px; background: var(--pp-card); }
.sk-lines { display: flex; flex-direction: column; gap: 7px; flex: 1; }
.sk-l { height: 11px; border-radius: 6px; background: var(--pp-card); }
.sk-l.sm { height: 9px; }
.sk-pill { height: 22px; width: 120px; border-radius: var(--app-radius-pill); background: var(--pp-card); }

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

/* Công nợ: cùng khung pill nhưng KHÔNG cắt bớt (số tiền là nội dung chính). */
.ppl-dr-debt { max-width: none; overflow: visible; gap: 5px; color: var(--pp-muted); }
.ppl-dr-debt b { font-weight: 800; font-variant-numeric: tabular-nums; }
.ppl-dr-debt-ico { font-size: 11px; }
.ppl-dr-debt.clean { background: var(--pp-card); }
.ppl-dr-debt.clean b { color: var(--pp-good); }
.ppl-dr-debt.warn {
  background: color-mix(in srgb, var(--pp-warn) 15%, transparent);
  color: color-mix(in srgb, var(--pp-warn) 72%, var(--pp-fg));
}
.ppl-dr-debt.warn b { color: inherit; }
.ppl-dr-debt.danger {
  background: color-mix(in srgb, var(--pp-bad) 15%, transparent);
  color: color-mix(in srgb, var(--pp-bad) 72%, var(--pp-fg));
}
.ppl-dr-debt.danger b { color: inherit; }
.ppl-dr-x {
  flex: none; width: 32px; height: 32px; border: 0; border-radius: 11px;
  background: var(--pp-card); color: var(--pp-muted); cursor: pointer; font-size: 16px; line-height: 1;
}
.ppl-dr-x:hover { color: var(--pp-fg); }
.ppl-dr-actions { display: flex; align-items: center; gap: 9px; }

/* ── "nick liên quan" dropdown (cùng SĐT thật + cùng "chuỗi") ── */
.ppl-fam-wrap { position: relative; display: inline-flex; flex: none; }
.ppl-fam-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 700;
}
.ppl-fam-btn.on { border-color: var(--pp-accent); color: var(--pp-accent); }
.ppl-fam-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: var(--app-radius-pill);
  background: var(--pp-accent); color: var(--pp-onAccent);
  font-size: 10px; font-weight: 700; line-height: 1;
}
.ppl-fam-caret { font-size: 9px; transition: transform .14s ease; }
.ppl-fam-caret.up { transform: rotate(180deg); }
.ppl-fam-panel {
  position: absolute; top: calc(100% + 7px); left: 0; z-index: 80;
  width: 330px; max-width: calc(92vw - 48px);
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: 14px; background: var(--pp-panel);
  border: 1px solid var(--pp-line); box-shadow: 0 26px 52px -20px var(--pp-shadow);
  animation: ppPop .16s ease-out;
}
.ppl-fam-sec { display: flex; flex-direction: column; flex: none; min-height: 0; }
/* Section "chuỗi" ngăn với section SĐT bằng một đường kẻ. */
.ppl-fam-sec.alt { border-top: 1px solid var(--pp-line); }
.ppl-fam-title {
  flex: none; padding: 11px 14px 8px;
  font-size: 10.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
  color: var(--pp-faint);
}
.ppl-fam-empty { padding: 4px 14px 14px; font-size: 12.5px; color: var(--pp-muted); }
/* max-height trên flex container + overflow-y trên body = cặp quy ước của repo
   (NickPickerPopup, quick-template-popup) để list cuộn mà header vẫn cố định.
   Cap 200px (thay vì 296) để hai section cùng nằm gọn trong panel. */
.ppl-fam-list { flex: 1 1 auto; min-height: 0; max-height: 200px; overflow-y: auto; padding: 0 6px 6px; }
.ppl-fam-item {
  width: 100%; display: flex; align-items: flex-start; gap: 10px;
  padding: 8px; border: 0; border-radius: 11px; background: transparent;
  cursor: pointer; text-align: left; color: inherit;
}
.ppl-fam-item:hover:not(:disabled) { background: var(--pp-card); }
.ppl-fam-item:disabled { cursor: default; }
.ppl-fam-item.current { background: var(--pp-chip); cursor: default; }
.ppl-fam-item.locked { opacity: .62; }
.ppl-fam-av {
  width: 34px; height: 34px; flex: none; border-radius: 12px; overflow: hidden;
  color: #1B1024; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800;
}
.ppl-fam-av img { width: 100%; height: 100%; object-fit: cover; }
.ppl-fam-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ppl-fam-zalo {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700; color: var(--pp-fg);
  white-space: nowrap; overflow: hidden;
}
/* Flex child cần min-width:0 mới ellipsis được — không có thì tên dài đẩy badge
   ra khỏi panel (text-overflow không áp lên flex container). */
.ppl-fam-zname { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ppl-fam-badge {
  flex: none; padding: 1px 7px; border-radius: 999px;
  background: var(--pp-chip); color: var(--pp-chipFg);
  font-size: 9.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase;
}
.ppl-fam-badge.alt { background: var(--pp-card); color: var(--pp-muted); }
.ppl-fam-sfx { flex: none; font-size: 11px; font-weight: 700; color: var(--pp-faint); font-variant-numeric: tabular-nums; }
.ppl-fam-pos {
  font-size: 12px; color: var(--pp-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

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
.ppl-field-hint { display: block; font-size: 11px; color: var(--pp-faint); margin-top: 3px; }
.ppl-input-box input, .ppl-input-box select {
  width: 100%; border: 0; background: transparent; color: var(--pp-fg);
  font-size: 13.5px; font-weight: 600; padding: 0; cursor: pointer;
}
.ppl-input-box input { cursor: text; }
.ppl-input-box input.mono { font-family: var(--mono); font-size: 13px; }

.ppl-input-box textarea {
  width: 100%; border: 0; background: transparent; color: var(--pp-fg);
  font-size: 13.5px; font-weight: 600; padding: 8px 0; cursor: text;
  min-height: 120px; resize: vertical; line-height: 1.6; white-space: pre-wrap;
}

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
  /* Thanh lọc cuộn ngang thay vì dồn ép; tìm kiếm giữ min-width để không bẹp. */
  .ppl-tools { flex-wrap: wrap; }
  .ppl-search { flex: 1 1 220px; }
  .ppl-menu--more { left: 0; width: min(560px, calc(100vw - 32px)); }
  .ppl-cals { flex-direction: column; }
  .ppl-grid2 { grid-template-columns: 1fr; }
}

@media (max-width: 700px) {
   .ppl-head { padding: 14px 16px 0; gap: 10px; }
   .ppl-title h1 { font-size: 20px; }
   .ppl-sub { display: none; }
   .ppl-list { padding: 10px 16px 24px; }
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
   /* Khung desktop nối liền nhiều hàng; mobile là card thông tin 2 hàng, nên
      trả lại corner radius + border bao quanh từng dòng để tap target rõ ràng. */
   .ppl-rows { gap: 8px; background: transparent; border: 0; border-radius: 0; overflow: visible; }
   .ppl-row { border: 1px solid var(--pp-line); border-radius: var(--app-radius-lg); }
   .ppl-row:last-child { border-bottom: 1px solid var(--pp-line); }
   .ppl-skel { border: 1px solid var(--pp-line); border-radius: var(--app-radius-lg); }
   .ppl-skel:first-child, .ppl-skel:last-child { border-radius: var(--app-radius-lg); }
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
