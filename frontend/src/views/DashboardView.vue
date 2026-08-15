<template>
  <div class="dh-v5">
    <!-- ── Role-tab strip — chỉ hiện khi có quyền >1 tab (sale ẩn) ── -->
    <div v-if="hub.hasTeamSection.value || hub.hasSystemSection.value" class="dh-tabbar">
      <div class="dh-tabs" role="tablist">
        <button
          class="dh-tab"
          :class="{ 'is-active': activeTab === 'me' }"
          role="tab"
          :aria-selected="activeTab === 'me'"
          @click="activeTab = 'me'"
        >
          Việc của tôi
        </button>
        <button
          v-if="hub.hasTeamSection.value"
          class="dh-tab"
          :class="{ 'is-active': activeTab === 'team' }"
          role="tab"
          :aria-selected="activeTab === 'team'"
          @click="activeTab = 'team'"
        >
          Quản lý team
          <span v-if="teamBacklog > 0" class="dh-tab__count">{{ teamBacklog }}</span>
        </button>
        <button
          v-if="hub.hasSystemSection.value"
          class="dh-tab"
          :class="{ 'is-active': activeTab === 'system' }"
          role="tab"
          :aria-selected="activeTab === 'system'"
          @click="activeTab = 'system'"
        >
          Quản lý hệ thống
        </button>
      </div>
    </div>

    <div class="dh-body">
      <!-- ════════════════ TAB 1 — VIỆC CỦA TÔI ════════════════ -->
      <div v-show="activeTab === 'me'" class="dh-panel">
        <!-- Greeting -->
        <div class="dh-greet">
          <div class="dh-greet__l">
            <div class="dh-greet__h" :title="viewedName">Chào {{ greetingHour }}, {{ firstName(viewedName) }}</div>
            <div class="dh-greet__s">
              <template v-if="hub.loadingMe.value && !me">Đang tải dữ liệu hôm nay…</template>
              <template v-else-if="hub.errMe.value">Không tải được dữ liệu hôm nay.</template>
              <template v-else>
                Hôm nay có <b>{{ totalUnreplied }} tin chưa rep</b>, <b>{{ totalAppts }} lịch hẹn</b>
                <template v-if="me?.sessions"> và <b>{{ me.sessions.active }} phiên đang theo dõi</b></template
                >.
              </template>
            </div>
          </div>
          <div class="dh-greet__r">
            <!-- View-as (delegated access, server enforces scope + redaction) -->
            <div v-if="canPickUser" class="dh-picker">
              <button class="dh-btn dh-btn--ghost" @click.stop="togglePicker">
                <span class="dh-btn__hint">Xem như</span>
                {{ currentViewedUserName }}
                <ChevronDown :size="13" :stroke-width="2" />
              </button>
              <div v-if="userPickerOpen" class="dh-picker__menu" @click.stop>
                <div class="dh-picker__search">
                  <Search :size="14" :stroke-width="2" />
                  <input v-model="userPickerSearch" placeholder="Tìm nhân viên" />
                </div>
                <div class="dh-picker__group">Của tôi</div>
                <button
                  class="dh-picker__item"
                  :class="{ 'is-active': !hub.viewAsUserId.value }"
                  @click="selectUser(null)"
                >
                  <span class="dh-picker__item-nm">{{ auth.user?.fullName }}</span>
                </button>
                <template v-if="filteredPickerUsers.length">
                  <div class="dh-picker__group">Cấp dưới</div>
                  <button
                    v-for="u in filteredPickerUsers"
                    :key="u.id"
                    class="dh-picker__item"
                    :class="{ 'is-active': hub.viewAsUserId.value === u.id }"
                    @click="selectUser(u.id)"
                  >
                    <span class="dh-picker__item-nm">{{ u.fullName }}</span>
                    <span v-if="u.departmentName" class="dh-picker__dept">{{ u.departmentName }}</span>
                  </button>
                </template>
                <div v-else-if="userPickerSearch.trim()" class="dh-picker__empty">
                  Không tìm thấy nhân viên nào.
                </div>
              </div>
            </div>
            <button v-if="hasLeadPool" class="dh-btn" @click="goToLeadPool">Nhận khách</button>
            <button class="dh-btn dh-btn--primary" @click="goToInbox">
              Vào Tin nhắn <span class="dh-btn__arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <!-- Lead KPIs -->
        <div class="dh-kpis">
          <button class="dh-kpi" @click="goToUnreplied">
            <span class="dh-kpi__head">
              <span class="dh-kpi__label">Chưa rep</span>
              <span class="dh-kpi__go" aria-hidden="true">→</span>
            </span>
            <span class="dh-kpi__row">
              <span class="dh-kpi__value">
                <StatValue :pending="kpiPending"><PrivValue :split="me?.kpi.unreplied" /></StatValue>
              </span>
            </span>
            <span class="dh-kpi__sub">Cần trả lời ngay</span>
          </button>

          <button class="dh-kpi" @click="goToAppts">
            <span class="dh-kpi__head">
              <span class="dh-kpi__label">Hẹn hôm nay</span>
              <span class="dh-kpi__go" aria-hidden="true">→</span>
            </span>
            <span class="dh-kpi__row">
              <span class="dh-kpi__value">
                <StatValue :pending="kpiPending"><PrivValue :split="me?.kpi.todayAppointments" /></StatValue>
              </span>
            </span>
            <span class="dh-kpi__sub">{{ nextApptLabel }}</span>
          </button>

          <div class="dh-kpi">
            <span class="dh-kpi__head">
              <span class="dh-kpi__label">Đang theo dõi</span>
            </span>
            <span class="dh-kpi__row">
              <span class="dh-kpi__value">
                <StatValue :pending="kpiPending">{{ me?.sessions?.active ?? 0 }}</StatValue>
              </span>
            </span>
            <span class="dh-kpi__sub">{{ me?.sessions?.replied ?? 0 }} KH vừa rep</span>
          </div>

          <button class="dh-kpi" @click="goToDormant">
            <span class="dh-kpi__head">
              <span class="dh-kpi__label">KH đình trệ</span>
              <span class="dh-kpi__go" aria-hidden="true">→</span>
            </span>
            <span class="dh-kpi__row">
              <span class="dh-kpi__value">
                <StatValue :pending="kpiPending"><PrivValue :split="me?.kpi.dormantContacts" /></StatValue>
              </span>
            </span>
            <span class="dh-kpi__sub">&gt;7 ngày không nhắn</span>
          </button>
        </div>

        <!-- Demoted metric strip -->
        <div class="dh-strip">
          <div class="dh-strip__item">
            <span class="dh-strip__k">KH của tôi</span>
            <span class="dh-strip__v">
              <StatValue :pending="kpiPending" :width="34">{{ (me?.kpi.totalContacts ?? 0).toLocaleString('vi-VN') }}</StatValue>
            </span>
            <span v-if="newLeadsToday > 0" class="dh-strip__delta">+{{ newLeadsToday }} mới hôm nay</span>
          </div>
          <div class="dh-strip__sep"></div>
          <div class="dh-strip__item">
            <span class="dh-strip__k">Chốt tháng</span>
            <span class="dh-strip__v">
              <StatValue :pending="kpiPending" :width="20">{{ me?.kpi.closedThisMonth ?? 0 }}</StatValue>
            </span>
          </div>
          <template v-if="focusNick">
            <div class="dh-strip__sep"></div>
            <div class="dh-strip__quota">
              <span class="dh-strip__k" :title="focusNick.displayName">
                Quota nick · {{ focusNick.displayName }}<template v-if="otherNickCount > 0">
                  · +{{ otherNickCount }} nick</template
                >
              </span>
              <div class="dh-bar">
                <div class="dh-bar__fill" :class="quotaClass" :style="{ width: quotaPct + '%' }"></div>
              </div>
              <span class="dh-strip__quota-v">{{ focusNick.messagesToday ?? 0 }}/{{ QUOTA_LIMIT }}</span>
            </div>
          </template>
        </div>

        <!-- Two columns -->
        <div class="dh-cols">
          <!-- Cần rep gấp -->
          <div class="dh-card">
            <div class="dh-card__head">
              <span class="dh-card__title">Cần rep gấp</span>
              <span v-if="urgentRows.length" class="dh-card__badge dh-card__badge--danger">{{ urgentRows.length }}</span>
              <span class="dh-card__spacer"></span>
              <button class="dh-card__link" @click="goToUnreplied">Xem tất cả</button>
            </div>
            <div class="dh-card__body">
              <template v-if="hub.loadingMe.value && !me">
                <div v-for="i in 4" :key="i" class="dh-skel-row">
                  <span class="dh-skel dh-skel--av"></span>
                  <div class="dh-skel-row__body">
                    <span class="dh-skel dh-skel--line" style="width: 38%"></span>
                    <span class="dh-skel dh-skel--line" style="width: 72%"></span>
                  </div>
                </div>
              </template>
              <div v-else-if="hub.errMe.value" class="dh-error">
                Không tải được danh sách.
                <button class="dh-error__retry" @click="retryMe">Thử lại</button>
              </div>
              <!-- Not a <button>: Avatar's root is a <div>, which is invalid inside one. -->
              <div
                v-for="u in urgentRows"
                v-else
                :key="u.conversationId"
                class="dh-urgent"
                role="button"
                tabindex="0"
                @click="goToConv(u.conversationId)"
                @keydown.enter.prevent="goToConv(u.conversationId)"
                @keydown.space.prevent="goToConv(u.conversationId)"
              >
                <Avatar
                  :src="u.contactAvatar || null"
                  :name="u.contactName"
                  :size="38"
                  :platform="'zalo'"
                  :gradient-seed="u.conversationId"
                  class="dh-urgent__av"
                />
                <span class="dh-urgent__body">
                  <span class="dh-urgent__top">
                    <span class="dh-urgent__nm">{{ u.contactName }}</span>
                    <span v-if="urgentStatus(u.status)" class="dh-urgent__status">{{ urgentStatus(u.status) }}</span>
                  </span>
                  <span v-if="u.redacted" class="dh-urgent__redacted">
                    <span class="dh-urgent__redacted-bar"></span>
                    <span class="dh-urgent__redacted-lb">Nick riêng tư</span>
                  </span>
                  <span v-else class="dh-urgent__preview">{{ u.messagePreview || 'Khách vừa nhắn' }}</span>
                  <span class="dh-urgent__nick">{{ u.nickName }}</span>
                </span>
                <span class="dh-urgent__r">
                  <span class="dh-urgent__time">{{ ago(u.lastMessageAt) }}</span>
                  <span class="dh-urgent__unread">{{ u.unreadCount }}</span>
                </span>
              </div>
              <div v-if="!hub.loadingMe.value && !hub.errMe.value && !urgentRows.length" class="dh-empty">
                <div class="dh-empty__t">Không có tin nào chưa rep</div>
                <div class="dh-empty__s">Toàn bộ hội thoại của bạn đã được trả lời.</div>
              </div>
            </div>
          </div>

          <!-- Nhắc nhở + phiên theo dõi -->
          <div class="dh-side">
            <div class="dh-card dh-card--grow">
              <div class="dh-card__head">
                <span class="dh-card__title">Nhắc nhở</span>
                <span v-if="reminderRows.length" class="dh-card__badge">{{ reminderRows.length }}</span>
              </div>
              <div class="dh-card__body">
                <template v-if="hub.loadingMe.value && !me">
                  <div v-for="i in 3" :key="i" class="dh-skel-row">
                    <div class="dh-skel-row__body">
                      <span class="dh-skel dh-skel--line" style="width: 30%"></span>
                      <span class="dh-skel dh-skel--line" style="width: 66%"></span>
                    </div>
                  </div>
                </template>
                <div v-else-if="hub.errMe.value" class="dh-error">
                  Không tải được nhắc nhở.
                  <button class="dh-error__retry" @click="retryMe">Thử lại</button>
                </div>
                <button v-for="r in reminderRows" v-else :key="r.key" class="dh-rem" @click="r.go()">
                  <span class="dh-rem__top">
                    <span class="dh-rem__bucket" :class="{ 'dh-rem__bucket--overdue': r.overdue }">{{ r.bucket }}</span>
                    <span class="dh-rem__rule"></span>
                    <span class="dh-rem__when">{{ r.when }}</span>
                  </span>
                  <span class="dh-rem__title">{{ r.title }}</span>
                  <span class="dh-rem__sub">{{ r.sub }}</span>
                </button>
                <div v-if="!hub.loadingMe.value && !hub.errMe.value && !reminderRows.length" class="dh-empty">
                  <div class="dh-empty__t">Không có nhắc nhở</div>
                  <div class="dh-empty__s">Không có lịch hẹn hay sinh nhật cần theo dõi.</div>
                </div>
              </div>
            </div>

            <div class="dh-card dh-sessions">
              <div class="dh-sessions__title">Phiên theo dõi</div>
              <div class="dh-sessions__grid">
                <div>
                  <div class="dh-sessions__v">
                    <StatValue :pending="kpiPending" :width="24">{{ me?.sessions?.active ?? 0 }}</StatValue>
                  </div>
                  <div class="dh-sessions__l">Đang theo dõi</div>
                </div>
                <div>
                  <div class="dh-sessions__v dh-sessions__v--good">
                    <StatValue :pending="kpiPending" :width="24">{{ me?.sessions?.replied ?? 0 }}</StatValue>
                  </div>
                  <div class="dh-sessions__l">KH vừa rep</div>
                </div>
                <div>
                  <div class="dh-sessions__v">
                    <StatValue :pending="kpiPending" :width="24">{{ me?.sessions?.paused ?? 0 }}</StatValue>
                  </div>
                  <div class="dh-sessions__l">Tạm dừng</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ════════════════ TAB 2 — QUẢN LÝ TEAM ════════════════ -->
      <div v-show="activeTab === 'team'" class="dh-panel">
        <div v-if="hub.errTeam.value === 'forbidden'" class="dh-error">
          Bạn không có quyền xem dữ liệu team (cần quyền <b>contact.view_all</b>).
        </div>
        <div v-else-if="hub.errTeam.value === 'error'" class="dh-error">
          Không tải được dữ liệu team.
          <button class="dh-error__retry" @click="hub.fetchTeam()">Thử lại</button>
        </div>

        <template v-else>
          <div class="dh-greet">
            <div class="dh-greet__l">
              <div class="dh-greet__h">Quản lý team</div>
              <div class="dh-metarow">
                <span>{{ teamMembers.length }} nhân viên · <b>{{ teamBacklog }} tin chưa rep</b> toàn team</span>
                <span class="dh-metarow__sep"></span>
                <span class="dh-metarow__note">
                  <Lock :size="13" :stroke-width="2" />
                  Bạn thấy số liệu của nick riêng tư, nhưng không thấy nội dung tin nhắn.
                </span>
              </div>
            </div>
            <div v-if="hasMarketing" class="dh-greet__r">
              <button class="dh-btn" @click="goToMarketing">Chiến dịch</button>
              <button class="dh-btn" @click="goToMarketing">Gửi tin hàng loạt</button>
            </div>
          </div>

          <div class="dh-kpis">
            <button class="dh-kpi" @click="goToTeamUnreplied">
              <span class="dh-kpi__head">
                <span class="dh-kpi__label">Chưa rep · team</span>
                <span class="dh-kpi__go" aria-hidden="true">→</span>
              </span>
              <span class="dh-kpi__row"><span class="dh-kpi__value"><StatValue :pending="teamPending">{{ teamBacklog }}</StatValue></span></span>
              <span class="dh-kpi__split">
                <span>{{ team?.teamKpi.unreplied.public ?? 0 }} công khai</span>
                <span class="dh-kpi__split-sep"></span>
                <span>{{ team?.teamKpi.unreplied.private ?? 0 }} nick riêng</span>
              </span>
            </button>

            <button class="dh-kpi" @click="goToAppts">
              <span class="dh-kpi__head">
                <span class="dh-kpi__label">Hẹn hôm nay</span>
                <span class="dh-kpi__go" aria-hidden="true">→</span>
              </span>
              <span class="dh-kpi__row"><span class="dh-kpi__value"><StatValue :pending="teamPending">{{ teamApptTotal }}</StatValue></span></span>
              <span class="dh-kpi__sub">{{ teamApptSpread }}</span>
            </button>

            <div class="dh-kpi">
              <span class="dh-kpi__head"><span class="dh-kpi__label">Đang theo dõi</span></span>
              <span class="dh-kpi__row"><span class="dh-kpi__value"><StatValue :pending="teamPending">{{ team?.followSessions?.active ?? 0 }}</StatValue></span></span>
              <span class="dh-kpi__sub">{{ team?.followSessions?.replied ?? 0 }} KH vừa rep</span>
            </div>

            <div class="dh-kpi">
              <span class="dh-kpi__head"><span class="dh-kpi__label">Chốt tuần</span></span>
              <span class="dh-kpi__row"><span class="dh-kpi__value"><StatValue :pending="teamPending">{{ team?.teamKpi.closedThisWeek ?? 0 }}</StatValue></span></span>
              <span class="dh-kpi__sub">{{ teamTopLabel }}</span>
            </div>
          </div>

          <div class="dh-strip">
            <div class="dh-strip__item">
              <span class="dh-strip__k">KH toàn team</span>
              <span class="dh-strip__v"><StatValue :pending="teamPending" :width="34">{{ (team?.teamKpi.totalContacts ?? 0).toLocaleString('vi-VN') }}</StatValue></span>
            </div>
            <div class="dh-strip__sep"></div>
            <div class="dh-strip__item">
              <span class="dh-strip__k">Tin gửi đi (hôm nay)</span>
              <span class="dh-strip__v"><StatValue :pending="teamPending" :width="34">{{ (team?.responsePerf?.sent ?? 0).toLocaleString('vi-VN') }}</StatValue></span>
            </div>
            <div class="dh-strip__sep"></div>
            <div class="dh-strip__item">
              <span class="dh-strip__k">KH phản hồi</span>
              <span class="dh-strip__v"><StatValue :pending="teamPending" :width="34">{{ (team?.responsePerf?.replied ?? 0).toLocaleString('vi-VN') }}</StatValue></span>
            </div>
            <div class="dh-strip__sep"></div>
            <div class="dh-strip__quota">
              <span class="dh-strip__k">Tỉ lệ phản hồi</span>
              <div class="dh-bar">
                <div class="dh-bar__fill" :style="{ width: (team?.responsePerf?.replyRate ?? 0) + '%' }"></div>
              </div>
              <span class="dh-strip__quota-v">{{ team?.responsePerf?.replyRate ?? 0 }}%</span>
            </div>
          </div>

          <div class="dh-card dh-tbl" style="--dh-cols: 1.5fr 110px 100px 110px 110px 96px; flex: 1; min-height: 320px">
            <div class="dh-card__head">
              <span class="dh-card__title">Nhân viên</span>
              <span class="dh-card__badge">{{ teamMembers.length }}</span>
              <span class="dh-card__spacer"></span>
              <span class="dh-tbl__hint">Bấm một dòng để mở Dashboard cá nhân của nhân viên</span>
            </div>
            <div class="dh-tbl__head">
              <div>Nhân viên</div>
              <div style="text-align: right">Chưa rep</div>
              <div style="text-align: right">Hẹn</div>
              <div style="text-align: right">Khách hàng</div>
              <div style="text-align: right">Chốt tuần</div>
              <div style="text-align: right">Nick riêng</div>
            </div>
            <div class="dh-tbl__body">
              <template v-if="hub.loadingTeam.value && !team">
                <div v-for="i in 5" :key="i" class="dh-skel-row">
                  <div class="dh-skel-row__body"><span class="dh-skel dh-skel--line" style="width: 32%"></span></div>
                </div>
              </template>
              <div
                v-for="u in visibleTeamMembers"
                v-else
                :key="u.userId"
                class="dh-tbl__row dh-tbl__row--click"
                role="button"
                tabindex="0"
                @click="drillIntoUser(u.userId)"
                @keydown.enter.prevent="drillIntoUser(u.userId)"
                @keydown.space.prevent="drillIntoUser(u.userId)"
              >
                <div class="dh-person">
                  <Avatar :src="u.avatarUrl" :name="u.fullName" :size="28" :gradient-seed="u.userId" />
                  <span class="dh-person__nm">{{ u.fullName }}</span>
                  <span v-if="u.userId === team?.topUser?.userId" class="dh-tag">Dẫn đầu tuần</span>
                  <span class="dh-person__role">{{ u.departmentName || u.deptRole || '' }}</span>
                </div>
                <div style="text-align: right">
                  <span :class="userUnreplied(u) > 0 ? 'dh-count' : 'dh-count dh-count--zero'">{{ userUnreplied(u) }}</span>
                </div>
                <div class="dh-tbl__num">{{ u.todayAppointments.public + u.todayAppointments.private }}</div>
                <div class="dh-tbl__num">{{ u.totalContacts.toLocaleString('vi-VN') }}</div>
                <div class="dh-tbl__num">{{ u.closedThisWeek }}</div>
                <div class="dh-tbl__muted">{{ u.privateNickCount > 0 ? u.privateNickCount + ' nick' : '—' }}</div>
              </div>
              <div v-if="teamMembers.length > visibleTeamMembers.length" class="dh-tbl__more">
                Hiện {{ visibleTeamMembers.length }} / {{ teamMembers.length }} nhân viên ·
                <button @click="teamShowAll = true">xem tất cả</button>
              </div>
              <div v-if="!hub.loadingTeam.value && !teamMembers.length" class="dh-empty">
                <div class="dh-empty__t">Chưa có nhân viên nào trong phạm vi bạn quản lý</div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ════════════════ TAB 3 — QUẢN LÝ HỆ THỐNG ════════════════ -->
      <div v-show="activeTab === 'system'" class="dh-panel">
        <div v-if="hub.errSystem.value" class="dh-error">
          Không tải được dữ liệu hệ thống.
          <button class="dh-error__retry" @click="hub.fetchSystem()">Thử lại</button>
        </div>

        <template v-else>
          <div class="dh-greet">
            <div class="dh-greet__l">
              <div class="dh-titlerow">
                <span class="dh-greet__h">Quản lý hệ thống</span>
                <span class="dh-scopechip"><Lock :size="12" :stroke-width="2" /> Phạm vi: toàn tổ chức</span>
              </div>
              <div class="dh-greet__s">
                Số liệu trên trang này luôn tính cho toàn tổ chức, không đổi theo team hay nhân viên.
              </div>
            </div>
            <div v-if="hasNickAdmin" class="dh-greet__r">
              <button class="dh-btn" @click="goToNickAdmin">Quản lý nick</button>
            </div>
          </div>

          <div class="dh-kpis">
            <button class="dh-kpi" :disabled="!hasNickAdmin" @click="goToNickAdmin">
              <span class="dh-kpi__head">
                <span class="dh-kpi__label">Nick lỗi</span>
                <span v-if="hasNickAdmin" class="dh-kpi__go" aria-hidden="true">→</span>
              </span>
              <span class="dh-kpi__row">
                <!-- Zero faulted nicks is the healthy state; don't paint it alarm-red. -->
                <span class="dh-kpi__value" :class="{ 'dh-kpi__value--danger': nickFaulted > 0 }"><StatValue :pending="systemPending">{{ nickFaulted }}</StatValue></span>
                <span v-if="nickFaulted > 0" class="dh-kpi__delta dh-kpi__delta--danger">Cần xử lý</span>
              </span>
              <span class="dh-kpi__split">
                <span>{{ system?.orgKpi.nickHealth.banned ?? 0 }} bị khoá</span>
                <span class="dh-kpi__split-sep"></span>
                <span>{{ system?.orgKpi.nickHealth.offline ?? 0 }} mất kết nối</span>
              </span>
            </button>

            <div class="dh-kpi">
              <span class="dh-kpi__head"><span class="dh-kpi__label">Nick hoạt động</span></span>
              <span class="dh-kpi__row">
                <span class="dh-kpi__value"><StatValue :pending="systemPending">{{ system?.orgKpi.nickHealth.healthy ?? 0 }}</StatValue></span>
                <span class="dh-kpi__frac">/{{ system?.orgKpi.totalNicks ?? 0 }}</span>
              </span>
              <span class="dh-kpi__sub">{{ nickHealthyLabel }}</span>
            </div>

            <div class="dh-kpi">
              <span class="dh-kpi__head"><span class="dh-kpi__label">Nick riêng tư</span></span>
              <span class="dh-kpi__row"><span class="dh-kpi__value"><StatValue :pending="systemPending">{{ system?.orgKpi.nickHealth.private ?? 0 }}</StatValue></span></span>
              <span class="dh-kpi__sub">Nội dung không hiển thị cho quản lý</span>
            </div>

            <button class="dh-kpi" @click="goToContacts">
              <span class="dh-kpi__head">
                <span class="dh-kpi__label">Lead mới tháng</span>
                <span class="dh-kpi__go" aria-hidden="true">→</span>
              </span>
              <span class="dh-kpi__row">
                <span class="dh-kpi__value"><StatValue :pending="systemPending">{{ (system?.orgKpi.newLeadsThisMonth ?? 0).toLocaleString('vi-VN') }}</StatValue></span>
              </span>
              <span class="dh-kpi__sub">Toàn tổ chức, tháng {{ currentMonth }}</span>
            </button>
          </div>

          <div class="dh-strip">
            <div class="dh-strip__item">
              <span class="dh-strip__k">KH toàn tổ chức</span>
              <span class="dh-strip__v"><StatValue :pending="systemPending" :width="34">{{ (system?.orgKpi.totalContacts ?? 0).toLocaleString('vi-VN') }}</StatValue></span>
            </div>
            <div class="dh-strip__sep"></div>
            <div class="dh-strip__item">
              <span class="dh-strip__k">Đang theo dõi</span>
              <span class="dh-strip__v"><StatValue :pending="systemPending" :width="20">{{ system?.orgKpi.followSessions ?? 0 }}</StatValue></span>
            </div>
            <div class="dh-strip__sep"></div>
            <div class="dh-strip__wide">
              <span class="dh-strip__k">Nhật ký gần nhất</span>
              <span v-if="latestAudit" class="dh-strip__text" :title="latestAudit">{{ latestAudit }}</span>
              <span v-else class="dh-strip__text" style="color: var(--dh-faint)">Chưa có hoạt động nào hôm nay</span>
              <button v-if="hasAuditLog" class="dh-strip__link" @click="goToAuditLog">Mở nhật ký</button>
            </div>
          </div>

          <div class="dh-cols dh-cols--start">
            <div class="dh-card dh-tbl" style="--dh-cols: 1.6fr 110px 130px 120px">
              <div class="dh-card__head">
                <span class="dh-card__title">Hiệu suất phòng ban</span>
                <span class="dh-card__spacer"></span>
                <span class="dh-tbl__hint">Tháng {{ currentMonth }}</span>
              </div>
              <div class="dh-tbl__head">
                <div>Phòng ban</div>
                <div style="text-align: right">Nhân sự</div>
                <div style="text-align: right">Lead mới</div>
                <div style="text-align: right">Chốt tháng</div>
              </div>
              <div class="dh-tbl__body">
                <div v-for="d in departments" :key="d.departmentId" class="dh-tbl__row dh-tbl__row--tall">
                  <div class="dh-person">
                    <span class="dh-initial dh-initial--sq" :style="deptTint(d.departmentId)">
                      {{ initials(d.departmentName) }}
                    </span>
                    <span class="dh-person__nm">{{ d.departmentName }}</span>
                  </div>
                  <div class="dh-tbl__num">{{ d.memberCount }}</div>
                  <div class="dh-tbl__num">{{ d.newLeadsThisMonth.toLocaleString('vi-VN') }}</div>
                  <div class="dh-tbl__num">{{ d.closedThisMonth.toLocaleString('vi-VN') }}</div>
                </div>
                <div v-if="departments.length" class="dh-tbl__foot">
                  <div>Toàn tổ chức</div>
                  <div class="dh-tbl__num">{{ deptTotals.members }}</div>
                  <div class="dh-tbl__num">{{ deptTotals.leads.toLocaleString('vi-VN') }}</div>
                  <div class="dh-tbl__num">{{ deptTotals.closes.toLocaleString('vi-VN') }}</div>
                </div>
                <div v-if="!hub.loadingSystem.value && !departments.length" class="dh-empty">
                  <div class="dh-empty__t">Chưa có phòng ban nào</div>
                </div>
              </div>
            </div>

            <div class="dh-side">
              <div class="dh-card dh-panelcard">
                <div class="dh-panelcard__head">
                  <span class="dh-card__title">Tình trạng nick</span>
                  <span class="dh-card__spacer"></span>
                  <span class="dh-panelcard__total">{{ system?.orgKpi.totalNicks ?? 0 }} nick</span>
                </div>
                <div class="dh-health">
                  <div v-for="h in nickHealthRows" :key="h.label" class="dh-health__row">
                    <span class="dh-health__dot" :style="{ background: h.color }"></span>
                    <span class="dh-health__lb">{{ h.label }}</span>
                    <span class="dh-health__track">
                      <span class="dh-health__fill" :style="{ width: h.pct + '%', background: h.color }"></span>
                    </span>
                    <span class="dh-health__v">{{ h.count }}</span>
                  </div>
                </div>
              </div>

              <div class="dh-card dh-panelcard">
                <div class="dh-panelcard__head">
                  <span class="dh-card__title">Khách hàng theo trạng thái</span>
                  <span class="dh-card__spacer"></span>
                  <span class="dh-panelcard__total">{{ funnelTotal.toLocaleString('vi-VN') }}</span>
                </div>
                <div v-if="funnelBars.length" class="dh-funnelbar">
                  <span v-for="f in funnelBars" :key="'seg' + f.status" :style="{ width: f.pct + '%', background: f.color }"></span>
                </div>
                <div v-for="f in funnelBars" :key="f.status" class="dh-funnel__row">
                  <span class="dh-funnel__sw" :style="{ background: f.color }"></span>
                  <span class="dh-funnel__lb">{{ f.label }}</span>
                  <span class="dh-funnel__v">{{ f.count.toLocaleString('vi-VN') }}</span>
                  <span class="dh-funnel__pct">{{ f.pct }}%</span>
                </div>
                <div v-if="!hub.loadingSystem.value && !funnelBars.length" class="dh-empty">
                  <div class="dh-empty__t">Chưa có dữ liệu trạng thái</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { useDashboardActionHub } from '@/composables/use-dashboard-action-hub';
import Avatar from '@/components/ui/Avatar.vue';
import PrivValue from '@/components/dashboard/PrivValue.vue';
import StatValue from '@/components/dashboard/StatValue.vue';
import { ChevronDown, Lock, Search } from 'lucide-vue-next';
// atlas-v2-dashboard.css is gone: no .at-* markup left on this page, and nothing else in
// the repo imports it (UsersRbacView defines its own .at-table locally).
import '@/assets/dashboard-v5.css';

const auth = useAuthStore();
const router = useRouter();
const hub = useDashboardActionHub();

const me = computed(() => hub.me.value);
const team = computed(() => hub.team.value);
const system = computed(() => hub.system.value);

// Tab state — mặc định 'me'. Sale chỉ có me (thanh tab ẩn).
const activeTab = ref<'me' | 'team' | 'system'>('me');

// Picker state
const userPickerOpen = ref(false);
const userPickerSearch = ref('');

const canPickUser = computed(() => hub.hasTeamSection.value || hub.hasSystemSection.value);
const viewedName = computed(() => {
  if (!hub.viewAsUserId.value) return auth.user?.fullName ?? '';
  return hub.pickerUsers.value.find((u) => u.id === hub.viewAsUserId.value)?.fullName ?? '';
});
const currentViewedUserName = computed(() =>
  hub.viewAsUserId.value ? viewedName.value : `Tôi (${firstName(auth.user?.fullName)})`,
);
const filteredPickerUsers = computed(() => {
  const q = userPickerSearch.value.trim().toLowerCase();
  return hub.pickerUsers.value.filter((u) => !u.isSelf).filter((u) => !q || u.fullName.toLowerCase().includes(q));
});

// ── Derived personal metrics ──
const kpiPending = computed(() => hub.loadingMe.value && !me.value);
const teamPending = computed(() => hub.loadingTeam.value && !team.value);
const systemPending = computed(() => hub.loadingSystem.value && !system.value);
const totalUnreplied = computed(() =>
  me.value ? me.value.kpi.unreplied.public + me.value.kpi.unreplied.private : 0,
);
const totalAppts = computed(() =>
  me.value ? me.value.kpi.todayAppointments.public + me.value.kpi.todayAppointments.private : 0,
);
const teamBacklog = computed(() =>
  team.value ? team.value.teamKpi.unreplied.public + team.value.teamKpi.unreplied.private : 0,
);
const urgentRows = computed(() => me.value?.urgent ?? []);
const newLeadsToday = computed(() => me.value?.interactionToday?.newLeads ?? 0);

// Design shows "Gần nhất 14:30" — derive from the first of today's appointment reminders.
const nextApptLabel = computed(() => {
  const next = me.value?.reminders?.today?.[0];
  if (!next) return 'Không có lịch hẹn hôm nay';
  return `Gần nhất ${apptHM(next.appointmentDate, next.appointmentTime)}`;
});

// Quota is per nick, so an aggregate would be meaningless. Show the nick closest to its
// ceiling — that's the one that will throttle first.
const QUOTA_LIMIT = 300;
const focusNick = computed(() => {
  const nicks = (me.value?.quotaNicks ?? []).filter((n) => !n.isPrivate);
  if (!nicks.length) return null;
  return nicks.reduce((a, b) => ((b.messagesToday ?? 0) > (a.messagesToday ?? 0) ? b : a));
});
const otherNickCount = computed(() => Math.max(0, (me.value?.quotaNicks?.length ?? 0) - 1));
const quotaPct = computed(() =>
  Math.min(100, Math.round(((focusNick.value?.messagesToday ?? 0) / QUOTA_LIMIT) * 100)),
);
const quotaClass = computed(() => {
  const v = focusNick.value?.messagesToday ?? 0;
  if (v > 270) return 'dh-bar__fill--over';
  if (v > 210) return 'dh-bar__fill--warn';
  return '';
});

// Flatten the four reminder buckets into one chronological list, matching the design's
// single stream with a bucket label per row.
const reminderRows = computed(() => {
  const r = me.value?.reminders;
  if (!r) return [];
  const apptTitle = (a: { title: string | null; contactName?: string | null }) =>
    a.contactName ? `${a.title || 'Lịch hẹn'} · ${a.contactName}` : a.title || 'Lịch hẹn';
  const rows: Array<{ key: string; bucket: string; overdue?: boolean; title: string; sub: string; when: string; go: () => void }> = [];
  for (const a of r.overdue) {
    rows.push({ key: 'ov' + a.id, bucket: 'Quá hạn', overdue: true, title: apptTitle(a), sub: a.location || 'Chưa có địa điểm', when: shortDate(a.appointmentDate), go: goToAppts });
  }
  for (const a of r.today) {
    rows.push({ key: 'td' + a.id, bucket: 'Hôm nay', title: apptTitle(a), sub: a.location || 'Chưa có địa điểm', when: apptHM(a.appointmentDate, a.appointmentTime), go: goToAppts });
  }
  for (const a of r.tomorrow) {
    rows.push({ key: 'tm' + a.id, bucket: 'Ngày mai', title: apptTitle(a), sub: a.location || 'Chưa có địa điểm', when: apptHM(a.appointmentDate, a.appointmentTime), go: goToAppts });
  }
  for (const b of r.birthdays) {
    rows.push({ key: 'bd' + b.id, bucket: 'Sinh nhật', title: b.contactName, sub: 'Khách của bạn · gửi lời chúc', when: 'Hôm nay', go: goToContacts });
  }
  return rows;
});

const greetingHour = computed(() => {
  const h = new Date().getHours();
  if (h < 11) return 'buổi sáng';
  if (h < 14) return 'buổi trưa';
  if (h < 18) return 'buổi chiều';
  return 'buổi tối';
});

// ── Status labels ──
const STATUS_MAP: Record<string, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  nurturing: 'Đang chăm',
  caring: 'Đang chăm',
  negotiating: 'Đang tư vấn',
  interested: 'Quan tâm',
  closed_won: 'Chốt',
  closed: 'Chốt',
  chot: 'Chốt',
  cold: 'Nguội',
  lost: 'Mất',
  archived: 'Lưu trữ',
};
function urgentStatus(status?: string): string | null {
  if (!status) return null;
  return STATUS_MAP[status] ?? status;
}

// ════════════ TEAM ════════════
const teamShowAll = ref(false);
const TEAM_PREVIEW_ROWS = 9;

const teamMembers = computed(() => team.value?.perUser ?? []);
// The endpoint returns every visible user with no paging, so a large org would render
// hundreds of unvirtualised rows. Show the design's 9 and expand on demand.
const visibleTeamMembers = computed(() =>
  teamShowAll.value ? teamMembers.value : teamMembers.value.slice(0, TEAM_PREVIEW_ROWS),
);
function userUnreplied(u: { unreplied: { public: number; private: number } }): number {
  return u.unreplied.public + u.unreplied.private;
}
const teamApptTotal = computed(() =>
  team.value ? team.value.teamKpi.todayAppointments.public + team.value.teamKpi.todayAppointments.private : 0,
);
const teamApptSpread = computed(() => {
  const n = teamMembers.value.filter((u) => u.todayAppointments.public + u.todayAppointments.private > 0).length;
  return n > 0 ? `Trên ${n} nhân viên` : 'Chưa ai có lịch hôm nay';
});
const teamTopLabel = computed(() => {
  const t = team.value?.topUser;
  if (!t || t.closedThisWeek <= 0) return 'Chưa có ai chốt tuần này';
  return `Dẫn đầu: ${firstName(t.fullName)} · ${t.closedThisWeek} chốt`;
});
function drillIntoUser(userId: string) {
  activeTab.value = 'me';
  return selectUser(userId);
}

// ════════════ SYSTEM ════════════
const nickFaulted = computed(() => {
  const h = system.value?.orgKpi.nickHealth;
  return (h?.banned ?? 0) + (h?.offline ?? 0);
});
const nickHealthyLabel = computed(() => {
  const total = system.value?.orgKpi.totalNicks ?? 0;
  if (!total) return 'Chưa có nick nào';
  const pct = ((system.value?.orgKpi.nickHealth.healthy ?? 0) / total) * 100;
  return `${pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% fleet đang kết nối`;
});
const nickHealthRows = computed(() => {
  const h = system.value?.orgKpi.nickHealth;
  const total = Math.max(1, system.value?.orgKpi.totalNicks ?? 0);
  const rows = [
    { label: 'Đang kết nối', count: h?.healthy ?? 0, color: '#0E9F6E' },
    { label: 'Mất kết nối', count: h?.offline ?? 0, color: '#DC3A5B' },
    { label: 'Bị khoá', count: h?.banned ?? 0, color: '#8E1F37' },
    { label: 'Riêng tư', count: h?.private ?? 0, color: '#5B4BE6' },
  ];
  return rows.map((r) => ({ ...r, pct: Math.round((r.count / total) * 100) }));
});
const currentMonth = computed(() => new Date().getMonth() + 1);
const latestAudit = computed(() => {
  const a = system.value?.recentAudit?.[0];
  if (!a) return null;
  return `${a.actorName} · ${a.action} · ${ago(a.createdAt)} trước`;
});

const departments = computed(() => system.value?.deptRanking ?? []);
const deptTotals = computed(() =>
  departments.value.reduce(
    (acc, d) => ({
      members: acc.members + d.memberCount,
      leads: acc.leads + d.newLeadsThisMonth,
      closes: acc.closes + d.closedThisMonth,
    }),
    { members: 0, leads: 0, closes: 0 },
  ),
);
// Departments have no artwork, so the tint is derived from the id — stable across reloads.
const DEPT_TINTS = [
  { bg: '#E6E3FB', fg: '#4438C9' },
  { bg: '#E7F6F0', fg: '#0B7A55' },
  { bg: '#FBEDF0', fg: '#A82744' },
  { bg: '#EEECF5', fg: '#5A5570' },
];
function deptTint(seed: string): string {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s += seed.charCodeAt(i);
  const t = DEPT_TINTS[s % DEPT_TINTS.length];
  return `background:${t.bg};color:${t.fg}`;
}

// ── Status funnel (system) ──
const FUNNEL_ORDER = ['new', 'contacted', 'negotiating', 'nurturing', 'caring', 'interested', 'closed_won', 'closed', 'chot', 'cold', 'lost', 'archived'];
const FUNNEL_COLOR: Record<string, string> = {
  new: '#5B4BE6',
  contacted: '#8177EC',
  negotiating: '#8177EC',
  nurturing: '#A9A2F2',
  caring: '#A9A2F2',
  interested: '#A9A2F2',
  closed_won: '#0E9F6E',
  closed: '#0E9F6E',
  chot: '#0E9F6E',
  cold: '#D8D4E4',
  lost: '#D8D4E4',
  archived: '#D8D4E4',
};
const funnelTotal = computed(() =>
  (system.value?.funnel ?? []).reduce((sum, x) => sum + (x.count ?? 0), 0),
);
const funnelBars = computed(() => {
  const f = (system.value?.funnel ?? []).filter((x) => x.status && x.count > 0);
  const total = Math.max(1, funnelTotal.value);
  return f
    .sort((a, b) => FUNNEL_ORDER.indexOf(a.status ?? '') - FUNNEL_ORDER.indexOf(b.status ?? ''))
    .slice(0, 5)
    .map((x) => ({
      status: x.status ?? 'khac',
      label: STATUS_MAP[x.status ?? ''] ?? x.status ?? 'Khác',
      count: x.count,
      pct: Math.round((x.count / total) * 100),
      color: FUNNEL_COLOR[x.status ?? ''] ?? '#D8D4E4',
    }));
});

// ── Picker actions ──
function togglePicker() {
  userPickerOpen.value = !userPickerOpen.value;
}
async function selectUser(userId: string | null) {
  userPickerOpen.value = false;
  userPickerSearch.value = '';
  await hub.fetchMe(userId);
}
function retryMe() {
  return hub.fetchMe(hub.viewAsUserId.value);
}

// The click-outside listener is attached only while the dropdown is open, so a KeepAlive'd
// Dashboard can't keep handling document clicks from another route.
function onOutsideClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.dh-picker')) userPickerOpen.value = false;
}
watch(userPickerOpen, (open) => {
  if (open) document.addEventListener('click', onOutsideClick);
  else document.removeEventListener('click', onOutsideClick);
});
onUnmounted(() => document.removeEventListener('click', onOutsideClick));

// ── Navigation ──
// /lead-pool and the audit log live in the extension edition; the catch-all NotFound route
// would otherwise swallow the click and land the user on a 404.
function routeExists(path: string): boolean {
  return router.resolve(path).name !== 'NotFound';
}
const hasLeadPool = computed(() => routeExists('/lead-pool'));
const hasAuditLog = computed(() => routeExists('/settings/org/audit'));
const hasNickAdmin = computed(() => routeExists('/settings/channels/zalo'));
const hasMarketing = computed(() => routeExists('/marketing'));

function goToInbox() { router.push('/chat'); }
// Each KPI opens the exact set it counted, instead of dropping the user in an unfiltered
// inbox to find those conversations again. Params are the ones ChatView hydrates.
function goToUnreplied() { router.push({ path: '/chat', query: { unreplied: '1' } }); }
function goToDormant() { router.push({ path: '/chat', query: { lastMessageWithin: '>7d' } }); }
function goToTeamUnreplied() { router.push({ path: '/chat', query: { unreplied: '1', assignee: 'all' } }); }
function goToAppts() { router.push('/appointments'); }
function goToContacts() { router.push('/contacts'); }
function goToConv(id: string) { router.push(`/chat?conv=${id}`); }
function goToLeadPool() { router.push('/lead-pool'); }
function goToMarketing() { router.push('/marketing'); }
function goToAuditLog() { router.push('/settings/org/audit'); }
function goToNickAdmin() { router.push('/settings/channels/zalo'); }

// ── Format helpers ──
function firstName(full?: string | null): string {
  if (!full) return 'bạn';
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1];
}
function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return 'vừa xong';
  if (ms < 3600000) return Math.floor(ms / 60000) + ' phút';
  if (ms < 86400000) return Math.floor(ms / 3600000) + ' giờ';
  return Math.floor(ms / 86400000) + ' ngày';
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
function apptHM(iso: string, time: string | null): string {
  if (time) return time;
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}
onMounted(() => hub.fetchAll());
</script>

<style scoped>
.dh-v5 {
  /* App khoá cuộn cấp trang (main.css overflow:hidden) → dashboard PHẢI tự cuộn,
     không thì nội dung tràn không kéo xuống được (anh báo 2026-06-17). */
  height: calc(100vh - var(--smax-topnav-h));
  overflow-y: auto;
  padding: 20px 26px 32px;
}
.dh-tabbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.dh-body { max-width: 1400px; margin: 0 auto; }
.dh-panel { display: flex; flex-direction: column; gap: 20px; }
/* Only the Personal screen fills the viewport; System's columns size to their content. */
.dh-panel .dh-cols:not(.dh-cols--start) { min-height: 420px; }
</style>
