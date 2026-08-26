<template>
  <aside class="info-panel">
    <!-- Close button for Sales/CS workspace -->
    <button
      v-if="currentRole && currentRole !== 'manager'"
      class="ip-close"
      title="Đóng"
      @click="$emit('close')">
      ×
    </button>
    <!-- ════════ ROLE-BASED WORKSPACE: Sales & Customer Service ════════ -->
    <template v-if="currentRole && currentRole !== 'manager'">
      <!-- ══════════════════════════════════════════
           SP PROFILE HEADER — Glass Card Premium
           ══════════════════════════════════════════ -->
      <div class="sp-header">
        <!-- Top row: Avatar + Name + UID -->
        <div class="sp-header-top">
          <div class="sp-avatar-wrap">
            <Avatar
              :src="props.contact?.avatarUrl"
              :name="headerFullName"
              :size="56"
              :gradient-seed="props.contact?.id || headerFullName"
              class="sp-avatar" />
            <!-- VIP ring indicator -->
            <span
              v-if="customerType === 'VIP'"
              class="sp-vip-ring"
              title="Khách VIP"></span>
          </div>
          <div class="sp-name-block">
            <input
              v-model="form.fullName"
              placeholder="Tên Zalo"
              class="sp-name-input"
              @blur="saveContact" />
            <div v-if="props.contact?.zaloUid" class="sp-uid-row">
              <span class="sp-uid-badge">Id: {{ props.contact.zaloUid }}</span>
            </div>
            <div class="sp-pos-badge-row">
              <span
                v-if="posLinkStatus.linked"
                class="sp-pos-badge sp-pos-badge-linked"
                :title="
                  posLinkStatus.posCustomerCode
                    ? `Mã KH: ${posLinkStatus.posCustomerCode}`
                    : undefined
                ">
                <span class="material-symbols-outlined sp-pos-badge-icon"
                  >verified</span
                >
                Đã liên kết POS
              </span>
              <span
                v-else-if="posLinkStatus.autoSuggest"
                class="sp-pos-badge sp-pos-badge-suggest">
                <span class="material-symbols-outlined sp-pos-badge-icon"
                  >find_replace</span
                >
                Trùng SĐT trên POS
              </span>
              <span v-else class="sp-pos-badge sp-pos-badge-unlinked">
                <span class="material-symbols-outlined sp-pos-badge-icon"
                  >link_off</span
                >
                Chưa liên kết POS
              </span>
            </div>
          </div>
        </div>

        <!-- Detail grid: SĐT / Giới tính -->
        <div class="sp-detail-grid">
          <div class="sp-field">
            <span class="sp-field-icon">📞</span>
            <span class="sp-field-label">SĐT</span>
            <input
              v-model="form.phone"
              placeholder="Chưa có"
              class="sp-field-input"
              @blur="saveContact" />
          </div>
          <div class="sp-field">
            <span class="sp-field-icon">⚧</span>
            <span class="sp-field-label">Giới tính</span>
            <select
              v-model="form.gender"
              class="sp-field-select"
              @change="saveContact">
              <option :value="null">Không rõ</option>
              <option value="female">Nữ</option>
              <option value="male">Nam</option>
              <option value="other">Khác</option>
            </select>
          </div>
        </div>

        <!-- ── POS Status Block (Header) ── -->
        <section v-if="props.contactId" class="sp-pos-overview-block mt-2">
          <!-- Loading -->
          <div v-if="loadingStatus" class="sp-pos-loading">
            <v-progress-circular
              indeterminate
              size="14"
              width="2"
              color="primary" />
            <span>Đang kiểm tra POS...</span>
          </div>

          <!-- Đã liên kết -->
          <template
            v-else-if="posLinkStatus.linked && posLinkStatus.posCustomer">
            <div class="sp-pos-linked-row">
              <div class="sp-pos-linked-info">
                <div class="sp-pos-linked-name">
                  {{ posLinkStatus.posCustomer.name }}
                </div>
                <div class="sp-pos-linked-meta">
                  <span class="sp-pos-code-chip">{{
                    posLinkStatus.posCustomerCode
                  }}</span>
                  <span
                    v-if="
                      posLinkStatus.posCustomer.phone ||
                      posLinkStatus.posCustomer.contactNumber
                    ">
                    ·
                    {{
                      posLinkStatus.posCustomer.phone ||
                      posLinkStatus.posCustomer.contactNumber
                    }}
                  </span>
                </div>
                <div
                  v-if="posLinkStatus.posCustomer.address"
                  class="sp-pos-address">
                  📍 {{ posLinkStatus.posCustomer.address }}
                </div>
              </div>
              <div class="sp-pos-linked-actions">
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  density="comfortable"
                  class="text-none font-weight-medium"
                  @click="openEditCustomerForm">
                  <span
                    class="material-symbols-outlined mr-1"
                    style="font-size: 13px"
                    >edit</span
                  >
                  Sửa
                </v-btn>

                <v-menu location="bottom end">
                  <template #activator="{ props: menuProps }">
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      color="grey-darken-1"
                      density="comfortable"
                      v-bind="menuProps"
                      title="Thao tác khác"
                      class="ml-1">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 18px"
                        >more_vert</span
                      >
                    </v-btn>
                  </template>
                  <v-list
                    density="compact"
                    class="py-1 rounded-lg shadow-md"
                    style="min-width: 140px">
                    <v-list-item
                      @click="posLinkSearchOpen = true"
                      class="text-caption">
                      <template #prepend>
                        <span
                          class="material-symbols-outlined mr-2 text-primary"
                          style="font-size: 16px"
                          >sync_alt</span
                        >
                      </template>
                      <v-list-item-title class="font-weight-medium"
                        >Đổi liên kết</v-list-item-title
                      >
                    </v-list-item>

                    <v-divider class="my-1" />

                    <v-list-item
                      @click="performUnlink"
                      :disabled="unlinking"
                      class="text-caption text-error">
                      <template #prepend>
                        <span
                          class="material-symbols-outlined mr-2 text-error"
                          style="font-size: 16px"
                          >link_off</span
                        >
                      </template>
                      <v-list-item-title class="font-weight-medium"
                        >Hủy liên kết</v-list-item-title
                      >
                    </v-list-item>
                  </v-list>
                </v-menu>
              </div>
            </div>
          </template>

          <!-- Auto-suggest: tìm thấy trùng SĐT -->
          <template
            v-else-if="posLinkStatus.autoSuggest && posLinkStatus.posCustomer">
            <div class="sp-pos-suggest-banner">
              <div class="sp-pos-suggest-text">
                Tìm thấy trùng SĐT trên POS:
                <strong>{{ posLinkStatus.posCustomer.name }}</strong>
                ({{ posLinkStatus.posCustomer.code }})
              </div>
              <div class="sp-pos-suggest-actions">
                <v-btn
                  size="x-small"
                  color="primary"
                  variant="flat"
                  class="text-none"
                  @click="performQuickLink"
                  :loading="linking">
                  Liên kết ngay
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  class="text-none"
                  @click="posLinkSearchOpen = true">
                  Tìm khách khác
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="grey-darken-1"
                  class="text-none"
                  @click="openCreateCustomerForm">
                  Tạo mới
                </v-btn>
              </div>
            </div>
          </template>

          <!-- Chưa liên kết -->
          <template v-else>
            <div class="sp-pos-unlinked">
              <span class="sp-pos-unlinked-text">Chưa có trên POS</span>
              <div class="sp-pos-unlinked-actions">
                <v-btn
                  size="x-small"
                  color="primary"
                  variant="flat"
                  class="text-none"
                  @click="posLinkSearchOpen = true">
                  🔍 Liên kết KH
                </v-btn>
                <v-btn
                  size="x-small"
                  color="grey"
                  variant="outlined"
                  class="text-none"
                  @click="openCreateCustomerForm">
                  ➕ Tạo mới
                </v-btn>
              </div>
            </div>
          </template>
        </section>

        <!-- ── CTA chính: Tạo đơn hàng ── -->
        <button
          class="sp-cta-primary mt-3"
          :disabled="!posLinkStatus.linked || !orderDraftStore.canOpenNew"
          :class="{
            'sp-cta-disabled':
              !posLinkStatus.linked || !orderDraftStore.canOpenNew,
          }"
          :title="
            !orderDraftStore.canOpenNew
              ? !orderDraftStore.drafts.some((d) => !d.isMinimized)
                ? 'Hàng đợi đầy (tối đa 3 đơn). Xóa một đơn để tiếp tục.'
                : 'Hãy thu nhỏ đơn hiện tại trước'
              : ''
          "
          @click="openOrderForContact">
          <span class="material-symbols-outlined sp-cta-icon"
            >add_shopping_cart</span
          >
          Tạo đơn hàng
        </button>
      </div>

      <!-- ══════════════════════════════════════════
           SP PILL TABS — bo tròn pill-style
           ══════════════════════════════════════════ -->
      <!-- ══ SP PILL TABS — Material Symbols ══ -->
      <nav class="sp-pill-nav">
        <div class="sp-pill-tabs">
          <button
            class="sp-pill-tab"
            :class="{ active: salesTab === 'overview' }"
            @click="salesTab = 'overview'">
            <span class="material-symbols-outlined sp-tab-icon">dashboard</span>
            Overview
          </button>
          <button
            class="sp-pill-tab"
            :class="{ active: salesTab === 'orders' }"
            @click="salesTab = 'orders'">
            <span class="material-symbols-outlined sp-tab-icon"
              >receipt_long</span
            >
            Đơn hàng
          </button>
          <button
            class="sp-pill-tab"
            :class="{ active: salesTab === 'appointment' }"
            @click="salesTab = 'appointment'">
            <span class="material-symbols-outlined sp-tab-icon"
              >calendar_month</span
            >
            Lịch hẹn
          </button>
          <button
            class="sp-pill-tab"
            :class="{ active: salesTab === 'notes' }"
            @click="salesTab = 'notes'">
            <span class="material-symbols-outlined sp-tab-icon">edit_note</span>
            Ghi chú
          </button>
        </div>
      </nav>

      <!-- ══════════════════════════════════════════
           SP TAB CONTENT
           ══════════════════════════════════════════ -->
      <div class="sp-tab-content">
        <!-- ─── OVERVIEW TAB ─── -->
        <div v-show="salesTab === 'overview'" class="sp-pane">
          <!-- ── Customer 360: section header ── -->
          <div class="sp-section-header">
            <span class="material-symbols-outlined sp-section-icon"
              >monitoring</span
            >
            <span class="sp-section-title">Customer 360</span>
          </div>

          <div v-if="customer360Loading" class="sp-c360-loading">
            <v-progress-circular indeterminate size="18" width="2" color="primary" />
            <span>Đang tải hồ sơ khách hàng...</span>
          </div>

          <!-- ── Phân loại + công ty (Phương án C): liên kết POS → nhóm POS; chưa → trạng thái CRM ── -->
          <div v-else-if="customer360" class="sp-c360-grid">
            <div class="sp-c360-stat sp-c360-full">
              <span class="sp-c360-label">Loại khách</span>
              <span class="sp-c360-val">
                {{ customer360.profile.segment || crmStatusLabel(customer360.profile.crmStatus) }}
                <template v-if="customer360.profile.isOrganization !== null">
                  · {{ customer360.profile.isOrganization ? 'Tổ chức' : 'Cá nhân' }}
                </template>
              </span>
              <span v-if="customer360.profile.organization" class="sp-c360-sublabel">
                {{ customer360.profile.organization }}<template v-if="customer360.profile.taxCode"> · MST {{ customer360.profile.taxCode }}</template>
              </span>
              <span v-if="customer360.profile.posSaleUser || customer360.profile.posSaleCode" class="sp-c360-sublabel">
                Sale POS: {{ customer360.profile.posSaleUser?.fullName || customer360.profile.posSaleCode }}
              </span>
            </div>

            <div class="sp-c360-stat">
              <span class="sp-c360-label">LTV / Doanh số</span>
              <span class="sp-c360-val sp-val-primary">{{ fmtVnd(customer360.commerce.orders.lifetimeValue) }}</span>
              <span class="sp-c360-sublabel">
                {{ customer360.commerce.orders.total }} đơn
                <template v-if="customer360.journey.avgOrderValue > 0"> · TB {{ fmtVnd(customer360.journey.avgOrderValue) }}/đơn</template>
              </span>
            </div>
            <div class="sp-c360-stat">
              <span class="sp-c360-label">Công nợ hiện tại</span>
              <span class="sp-c360-val" :class="customer360.commerce.debt.totalDebt > 0 ? 'sp-val-danger' : 'sp-val-ok'">
                {{ fmtVnd(customer360.commerce.debt.totalDebt) }}
              </span>
              <span class="sp-c360-sublabel">Quá hạn: {{ fmtVnd(customer360.commerce.debt.overdueDebt) }}</span>
            </div>
            <div class="sp-c360-stat sp-c360-full">
              <span class="sp-c360-label">Đơn gần nhất</span>
              <span class="sp-c360-val">
                <template v-if="customer360.commerce.orders.latestOrder">
                  {{ customer360.commerce.orders.latestOrder.code }}
                  <span class="sp-c360-sublabel ml-1">{{ shortDate(customer360.commerce.orders.latestOrder.orderDate) }}</span>
                </template>
                <template v-else>Chưa có đơn hàng</template>
              </span>
            </div>
            <div class="sp-c360-stat sp-c360-full">
              <span class="sp-c360-label">Sale phụ trách</span>
              <span class="sp-c360-val">{{ customer360.access.assignedUser?.fullName || 'Chưa phân công' }}</span>
              <span class="sp-c360-sublabel">
                {{ customer360.service.tickets.length }} khiếu nại · {{ customer360.service.appointments.length }} lịch hẹn
              </span>
            </div>
          </div>

          <div v-else-if="customer360Error" class="sp-c360-unlinked-state">
            <span class="material-symbols-outlined sp-c360-unlinked-icon">cloud_off</span>
            <div class="sp-c360-unlinked-text">Chưa tải được Customer 360</div>
            <button class="sp-c360-retry" @click="fetchCustomer360">Thử lại</button>
          </div>

          <!-- Customer 360 stats — fallback cho dữ liệu POS cũ -->
          <div v-else-if="posLinkStatus.linked" class="sp-c360-grid">
            <!-- Hàng 1: Công nợ thực tế | Công nợ dự tính -->
            <div class="sp-c360-stat">
              <span class="sp-c360-label">Nợ thực tế</span>
              <div class="sp-c360-debt-row">
                <span
                  v-if="(orderSummary?.actualDebt ?? 0) > 0"
                  class="material-symbols-outlined sp-debt-warn"
                  >warning</span
                >
                <span
                  class="sp-c360-val"
                  :class="
                    (orderSummary?.actualDebt ?? 0) > 0
                      ? 'sp-val-danger'
                      : 'sp-val-ok'
                  "
                  >{{
                    orderSummary
                      ? fmtVnd(orderSummary.actualDebt)
                      : posLinkStatus.posCustomer?.debt || "0đ"
                  }}</span
                >
              </div>
              <span class="sp-c360-sublabel">Đơn đã xác nhận</span>
            </div>

            <div class="sp-c360-stat">
              <span class="sp-c360-label">Nợ dự tính</span>
              <span
                class="sp-c360-val"
                :class="
                  (orderSummary?.estimatedDebt ?? 0) > 0 ? 'sp-val-warn' : ''
                "
                >{{
                  orderSummary ? fmtVnd(orderSummary.estimatedDebt) : "—"
                }}</span
              >
              <span class="sp-c360-sublabel">Phiếu tạm chưa chốt</span>
            </div>

            <!-- Hàng 2: Đơn xác nhận | Phiếu tạm -->
            <div class="sp-c360-stat">
              <span class="sp-c360-label">Đơn xác nhận</span>
              <span class="sp-c360-val sp-val-primary">
                {{
                  orderSummary
                    ? orderSummary.confirmedCount + orderSummary.doneCount
                    : posLinkStatus.posCustomer?.totalOrders || "0"
                }}
                đơn
              </span>
            </div>

            <div class="sp-c360-stat">
              <span class="sp-c360-label">Phiếu tạm</span>
              <span
                class="sp-c360-val"
                :class="
                  (orderSummary?.draftCount ?? 0) > 0 ? 'sp-val-warn' : ''
                "
                >{{ orderSummary?.draftCount ?? "—" }} đơn</span
              >
            </div>

            <!-- Hàng 3: Đơn gần nhất (full width) -->
            <div class="sp-c360-stat sp-c360-full">
              <span class="sp-c360-label">Đơn gần nhất</span>
              <span class="sp-c360-val">
                <template v-if="orderSummary?.lastOrderCode">
                  {{ orderSummary.lastOrderCode }}
                  <span class="sp-c360-sublabel ml-1">{{
                    orderSummary.lastOrderAt
                      ? shortDate(orderSummary.lastOrderAt)
                      : ""
                  }}</span>
                </template>
                <template v-else>{{
                  posLinkStatus.posCustomer?.lastOrder || "Chưa có"
                }}</template>
              </span>
            </div>

            <!-- Hàng 4: Tương tác cuối (full width) -->
            <div class="sp-c360-stat sp-c360-full">
              <span class="sp-c360-label">Tương tác cuối</span>
              <span class="sp-c360-val">{{
                cockpit?.lastInboundAt
                  ? relativeTime(cockpit.lastInboundAt)
                  : "Chưa rõ"
              }}</span>
            </div>
          </div>

          <!-- Empty state khi chưa liên kết POS -->
          <div v-else class="sp-c360-unlinked-state">
            <span class="material-symbols-outlined sp-c360-unlinked-icon"
              >link_off</span
            >
            <div class="sp-c360-unlinked-text">Chưa liên kết POS</div>
            <div class="sp-c360-unlinked-hint">
              Liên kết khách hàng POS để xem thống kê đơn hàng
            </div>
          </div>

          <!-- Sản phẩm đã mua: dùng read model Customer 360, không gọi POS riêng lẻ. -->
          <section v-if="customer360?.commerce.purchasedProducts.items.length" class="sp-purchased-products">
            <div class="sp-section-header">
              <span class="material-symbols-outlined sp-section-icon">inventory_2</span>
              <span class="sp-section-title">Sản phẩm đã mua</span>
            </div>
            <div class="sp-product-list">
              <div v-for="product in customer360.commerce.purchasedProducts.items" :key="product.key" class="sp-product-row">
                <div class="sp-product-name">
                  {{ product.productName }}
                  <span v-if="product.orderCount > 1" class="sp-repeat-badge">Mua lại</span>
                </div>
                <div class="sp-product-meta">
                  {{ product.quantity }} SP · {{ fmtVnd(product.grossRevenue) }} · {{ shortDate(product.lastPurchasedAt) }}
                </div>
              </div>
            </div>
            <div v-if="customer360.commerce.purchasedProducts.truncated" class="sp-c360-sublabel">
              Hiển thị theo 200 đơn gần nhất
            </div>
          </section>

          <!-- ── Tín hiệu hành trình: tự tính từ đơn hàng, không ai nhập tay ── -->
          <section v-if="customer360?.journey" class="sp-purchased-products">
            <div class="sp-section-header">
              <span class="material-symbols-outlined sp-section-icon">timeline</span>
              <span class="sp-section-title">Tín hiệu hành trình</span>
            </div>

            <!-- Thâm niên + nhịp mua 2 tháng gần nhất -->
            <div v-if="customer360.journey.firstOrderAt" class="sp-journey-line">
              <span class="material-symbols-outlined sp-timeline-icon">flag</span>
              <span>
                Khách từ {{ monthYear(customer360.journey.firstOrderAt) }} · {{ customer360.journey.tenureDays }} ngày
                <template v-if="journeyTrendText(customer360.journey)"> · {{ journeyTrendText(customer360.journey) }}</template>
              </span>
            </div>

            <!-- Đã ngưng mua >30 ngày dù từng mua đều — cơ hội gọi lại -->
            <div v-if="customer360.journey.churnedProducts.length" class="sp-product-list sp-churn-list">
              <div v-for="p in customer360.journey.churnedProducts.slice(0, 3)" :key="'c' + p.productName" class="sp-product-row">
                <div class="sp-product-name">
                  {{ p.productName }}
                  <span class="sp-churn-badge">{{ p.quietDays }} ngày chưa mua</span>
                </div>
                <div class="sp-product-meta">Từng mua {{ p.orderCount }} đơn · lần cuối {{ shortDate(p.lastPurchasedAt) }}</div>
              </div>
            </div>

            <!-- Mới bắt đầu mua trong 90 ngày -->
            <div v-if="customer360.journey.newProducts.length" class="sp-product-list sp-churn-list">
              <div v-for="p in customer360.journey.newProducts.slice(0, 3)" :key="'n' + p.productName" class="sp-product-row">
                <div class="sp-product-name">
                  {{ p.productName }}
                  <span class="sp-new-badge">Mới quan tâm</span>
                </div>
                <div class="sp-product-meta">Bắt đầu {{ shortDate(p.firstPurchasedAt) }} · {{ p.orderCount }} đơn</div>
              </div>
            </div>

            <!-- Tuổi nợ — thứ kế toán cần để đòi nợ -->
            <div v-if="customer360.journey.debtAging.length" class="sp-journey-line">
              <span class="material-symbols-outlined sp-timeline-icon">schedule</span>
              <span>
                Tuổi nợ:
                <template v-for="(b, i) in customer360.journey.debtAging" :key="b.bucket">
                  <template v-if="i > 0"> · </template>{{ b.bucket }} ngày {{ fmtVnd(b.debt) }} ({{ b.invoices }} HĐ)
                </template>
              </span>
            </div>
          </section>

          <section v-if="customer360?.service.recentTimeline.length" class="sp-recent-timeline">
            <div class="sp-section-header">
              <span class="material-symbols-outlined sp-section-icon">history</span>
              <span class="sp-section-title">Hoạt động gần đây</span>
            </div>
            <div class="sp-timeline-list">
              <div v-for="item in customer360.service.recentTimeline.slice(0, 5)" :key="`${item.type}:${item.id}`" class="sp-timeline-row">
                <span class="material-symbols-outlined sp-timeline-icon">{{ customerTimelineIcon(item.type) }}</span>
                <div class="sp-timeline-copy">
                  <span>{{ item.title }}</span>
                  <small>{{ customerTimelineLabel(item.type, item.status) }} · {{ shortDate(item.occurredAt) }}</small>
                </div>
              </div>
            </div>
            <button class="sp-c360-retry" @click="salesTab = 'notes'">Xem timeline đầy đủ</button>
          </section>

          <!-- ── Customer 360 POS Widgets (Debt & Branch Inventory) ── -->
          <div class="my-3">
            <CustomerDebtWidget
              :contact-id="props.contactId"
              :customer-name="props.contact?.fullName || headerFullName"
              :is-pos-linked="posLinkStatus.linked"
              @insert-debt-reminder="onInsertSuggestionText" />
          </div>

          <div class="my-3">
            <BranchInventoryWidget
              @insert-inventory-info="onInsertSuggestionText" />
          </div>

          <!-- ── Coming Soon: 1 dòng xám nhạt ── -->
          <div class="sp-future-hint">
            <span class="material-symbols-outlined sp-future-icon"
              >auto_awesome</span
            >
            Customer Intelligence · Timeline — Sắp ra mắt
          </div>
        </div>
        <!-- /OVERVIEW TAB -->

        <!-- ─── ORDERS TAB ─── -->
        <div v-show="salesTab === 'orders'" class="sp-pane sp-pane-padded">
          <!-- Header: tiêu đề (không có nút Tạo đơn — đặt ở Overview tab) -->
          <div class="sp-orders-header">
            <div class="sp-orders-title">
              <span
                class="material-symbols-outlined"
                style="font-size: 16px; color: #64a8d8"
                >receipt_long</span
              >
              <span>Đơn hàng</span>
              <span
                v-if="posLinkStatus.linked && contactOrders.length > 0"
                class="sp-orders-count"
                >{{ contactOrders.length }}</span
              >
            </div>
          </div>

          <!-- Orders list from Read Model — chỉ hiển khi đã liên kết POS -->
          <section class="ip-section">
            <div
              v-if="ordersLoading"
              class="d-flex align-center justify-center py-4">
              <v-progress-circular
                indeterminate
                size="18"
                width="2"
                color="primary"
                class="mr-2" />
              <span class="text-caption text-grey-darken-1"
                >Đang tải đơn hàng...</span
              >
            </div>

            <!-- Chưa liên kết POS -->
            <div v-else-if="!posLinkStatus.linked" class="sp-orders-unlinked">
              <span class="material-symbols-outlined sp-orders-unlinked-icon"
                >link_off</span
              >
              <div class="sp-orders-unlinked-title">Chưa liên kết POS</div>
              <div class="sp-orders-unlinked-hint">
                Liên kết khách hàng với POS để xem lịch sử đơn hàng
              </div>
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                class="text-none mt-2"
                @click="posLinkSearchOpen = true">
                <span
                  class="material-symbols-outlined mr-1"
                  style="font-size: 14px"
                  >link</span
                >
                Liên kết ngay
              </v-btn>
            </div>

            <!-- Đã có đơn hàng -->
            <template v-else-if="contactOrders.length > 0">
              <!-- KHUNG DANH SÁCH THẺ ĐƠN HÀNG -->
              <div class="sp-orders-cards-container">
                <div
                  v-for="order in paginatedOrders"
                  :key="order.id"
                  class="sp-order-card"
                  @click="openOrderDetail(order)">
                  <!-- Card Header -->
                  <div class="sp-order-card__header">
                    <div class="sp-order-card__code-wrap">
                      <span
                        class="material-symbols-outlined sp-order-card__code-icon"
                        >receipt_long</span
                      >
                      <span class="sp-order-card__code">{{ order.code }}</span>
                    </div>

                    <!-- Status Badge -->
                    <span
                      class="sp-order-card__status"
                      :class="getOrderStatusClass(order.orderStatus)">
                      <span class="sp-order-card__status-dot"></span>
                      <span>{{ getOrderStatusLabel(order.orderStatus) }}</span>
                    </span>
                  </div>

                  <!-- Products Summary -->
                  <div class="sp-order-card__products">
                    <div
                      v-for="(item, idx) in order.items.slice(0, 2)"
                      :key="idx"
                      class="sp-order-card__item-row">
                      <span
                        class="sp-order-card__item-name"
                        :title="item.productName"
                        >{{ item.productName }}</span
                      >
                      <span class="sp-order-card__item-qty"
                        >(SL: {{ item.quantity }})</span
                      >
                    </div>
                    <div
                      v-if="order.items.length > 2"
                      class="sp-order-card__more">
                      +{{ order.items.length - 2 }} sản phẩm khác
                    </div>
                  </div>

                  <!-- Footer Row -->
                  <div class="sp-order-card__footer">
                    <div class="sp-order-card__date">
                      <span
                        class="material-symbols-outlined sp-order-card__date-icon"
                        >schedule</span
                      >
                      <span>{{ shortDate(order.createdAt) }}</span>
                    </div>
                    <div class="sp-order-card__price">
                      {{ formatVndFull(order.grandTotal) }}
                    </div>
                  </div>

                  <!-- Hover hint -->
                  <div class="sp-order-card__hover-hint">
                    <span>Chi tiết</span>
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 12px"
                      >arrow_forward</span
                    >
                  </div>
                </div>
              </div>

              <!-- THANH PHÂN TRANG CỐ ĐỊNH NẰM NGOÀI BOX ĐƠN HÀNG -->
              <div class="sp-orders-pagination-bar">
                <button
                  class="sp-pg-btn"
                  :disabled="ordersPage <= 1"
                  @click="ordersPage--"
                  title="Trang trước">
                  ‹
                </button>
                <span class="sp-pg-text">
                  Trang <strong>{{ ordersPage }}</strong> /
                  {{ totalOrdersPages }}
                </span>
                <button
                  class="sp-pg-btn"
                  :disabled="ordersPage >= totalOrdersPages"
                  @click="ordersPage++"
                  title="Trang sau">
                  ›
                </button>
              </div>
            </template>
            <div
              v-else
              class="text-caption text-grey-darken-1 text-center py-4">
              Chưa có đơn hàng nào.
            </div>
          </section>
        </div>
        <!-- /ORDERS TAB -->

        <!-- ─── APPOINTMENT TAB ─── -->
        <div v-show="salesTab === 'appointment'" class="sp-pane">
          <ChatAppointments
            v-if="props.contactId"
            :contact-id="props.contactId"
            :contact-name="headerFullName"
            :appointments="contactAppointments"
            @refresh="reloadAppointments" />
        </div>

        <!-- ─── NOTES TAB ─── -->
        <div v-show="salesTab === 'notes'" class="sp-pane">
          <CustomerTimelineSection
            :contact-id="props.contactId"
            :contact-name="headerFullName"
            @appointment-created="onAppointmentCreated" />
        </div>
      </div>
      <!-- /sp-tab-content -->

      <!-- Create Order Dialog is now handled globally via useOrderDraftStore + DefaultLayout -->

      <!-- Customer Form Dialog (Tạo/Sửa khách hàng POS) — phải có ở đây để hoạt động với Sales workspace -->
      <PosCustomerForm
        v-model="customerFormOpen"
        :contact-id="props.contactId"
        :customer-data="selectedPosCustomer"
        @success="onCustomerFormSuccess" />

      <!-- POS Link Search Dialog — tìm kiếm và liên kết KH POS (2-layer search + confirm) -->
      <PosLinkSearchDialog
        v-if="props.contactId"
        v-model="posLinkSearchOpen"
        :contact-id="props.contactId!"
        :contact-name="headerFullName"
         :contact-phone="props.contact?.phone || undefined"
        @linked="onPosLinked"
        @create-new="openCreateCustomerForm" />

      <!-- Order Detail Modal -->
      <OrderDetailModal
        v-model="showOrderDetailDialog"
        :order="selectedOrderForDetail" /> </template
    ><!-- /Sales & CS panel -->

    <!-- ════════ Compact manager profile — Smax fields + POS only ════════ -->
    <template v-else>
      <header class="ip-header">
        <button class="ip-close" title="Đóng" @click="$emit('close')">×</button>
        <div class="ip-smax-identity">
          <Avatar
            :src="props.contact?.avatarUrl"
            :name="headerFullName"
            :size="56"
            :gradient-seed="props.contact?.id || headerFullName"
            class="ip-avatar-big" />
          <div class="ip-smax-name-block">
            <div class="ip-name-line" :title="headerFullName">
              {{ headerFullName }}
            </div>
            <div v-if="props.contact?.zaloUid" class="ip-id">
              Id: {{ props.contact.zaloUid }}
            </div>
            <div class="ip-care-row-inline">
              <ContactDealStageSelector
                v-if="props.contact?.id"
                :contact-id="props.contact.id"
                :current-status-id="
                  (props.contact as { statusId?: string | null }).statusId ??
                  null
                "
                :org-id="orgId"
                @updated="onDealStageUpdatedPanel" />
            </div>
          </div>
        </div>
      </header>

      <div class="ip-tab-content ip-compact-content">
        <section class="ip-form ip-form--compact">
          <div class="ip-form-row">
            <span class="ip-icon">👤</span><span class="ip-label">Tên Zalo</span
            ><input
              v-model="form.fullName"
              placeholder="Tên Zalo"
              @blur="saveContact" />
          </div>
          <div class="ip-form-row">
            <span class="ip-icon">📅</span
            ><span class="ip-label">Ngày sinh</span
            ><input type="date" v-model="form.birthDate" @blur="saveContact" />
          </div>
          <div class="ip-form-row">
            <span class="ip-icon">📞</span><span class="ip-label">SĐT</span>
            <input
              :value="phoneFocused ? form.phone : displayPhone(form.phone)"
              :title="form.phone ? displayPhoneIntl(form.phone) : ''"
              placeholder="SĐT chính"
              @focus="phoneFocused = true"
              @input="form.phone = ($event.target as HTMLInputElement).value"
              @blur="
                phoneFocused = false;
                saveContact();
              " />
          </div>
        </section>

        <v-alert
          v-if="saveSuccess"
          type="success"
          density="compact"
          class="mx-3 my-2"
          closable
          @click:close="saveSuccess = false"
          >Đã lưu thành công!</v-alert
        >
        <v-alert
          v-if="saveError"
          type="error"
          density="compact"
          class="mx-3 my-2"
          closable
          @click:close="saveError = false"
          >Lưu thất bại, thử lại.</v-alert
        >

        <!-- POS is retained because it is business-critical and has no Smax equivalent. -->
        <section v-if="props.contactId" class="ip-section ip-pos-section">
          <div class="ip-section-title">
            <span class="accent" />🛒 KiotViet POS<span
              class="ip-section-spacer" /><span
              class="pos-status-chip"
              :class="{ linked: posLinkStatus.linked }"
              >{{
                posLinkStatus.linked
                  ? posLinkStatus.posCustomerCode || "Đã liên kết"
                  : "Chưa liên kết"
              }}</span
            >
          </div>
          <div class="ip-pos-card">
            <div
              v-if="loadingStatus"
              class="d-flex align-center justify-center py-2">
              <v-progress-circular
                indeterminate
                size="18"
                width="2"
                color="primary"
                class="mr-2" /><span class="text-caption text-grey-darken-1"
                >Đang kiểm tra POS...</span
              >
            </div>
            <template
              v-else-if="posLinkStatus.linked && posLinkStatus.posCustomer">
              <div class="pos-linked-info">
                <div class="text-subtitle-2 font-weight-bold slate-dark">
                  {{ posLinkStatus.posCustomer.name }}
                </div>
                <div class="text-caption text-grey-darken-1 font-mono">
                  SĐT:
                  {{
                    posLinkStatus.posCustomer.phone ||
                    posLinkStatus.posCustomer.contactNumber ||
                    "—"
                  }}
                </div>
                <div
                  v-if="posLinkStatus.posCustomer.address"
                  class="text-caption text-grey-darken-2 mt-1">
                  📍 {{ posLinkStatus.posCustomer.address }}
                </div>
              </div>
              <div class="ip-pos-actions">
                <v-btn
                  size="small"
                  variant="tonal"
                  color="primary"
                  density="comfortable"
                  class="text-none font-weight-medium"
                  @click="openEditCustomerForm"
                  ><span
                    class="material-symbols-outlined mr-1"
                    style="font-size: 14px"
                    >edit</span
                  >Sửa</v-btn
                ><v-btn
                  size="small"
                  variant="text"
                  color="grey-darken-1"
                  density="comfortable"
                  class="text-none"
                  @click="posLinkSearchOpen = true"
                  >Đổi liên kết</v-btn
                ><v-btn
                  size="small"
                  variant="text"
                  color="error"
                  density="comfortable"
                  class="text-none"
                  :loading="unlinking"
                  @click="performUnlink"
                  >Hủy</v-btn
                >
              </div>
            </template>
            <template
              v-else-if="
                posLinkStatus.autoSuggest && posLinkStatus.posCustomer
              ">
              <p class="text-caption text-grey-darken-1 mb-2">
                Tìm thấy
                <strong>{{ posLinkStatus.posCustomer.name }}</strong> trùng SĐT
                trên POS.
              </p>
              <div class="ip-pos-actions">
                <v-btn
                  size="small"
                  color="primary"
                  variant="flat"
                  class="text-none"
                  :loading="linking"
                  @click="performQuickLink"
                  >Liên kết ngay</v-btn
                ><v-btn
                  size="small"
                  variant="text"
                  color="grey-darken-1"
                  class="text-none"
                  @click="openCreateCustomerForm"
                  >Tạo mới</v-btn
                >
              </div>
            </template>
            <template v-else>
              <p class="text-caption text-grey-darken-1 mb-2">
                Khách hàng này chưa có trên POS.
              </p>
              <div class="ip-pos-actions">
                <v-btn
                  size="small"
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-plus"
                  class="text-none"
                  @click="openCreateCustomerForm"
                  >Tạo khách hàng POS</v-btn
                ><v-btn
                  size="small"
                  variant="text"
                  color="grey-darken-1"
                  class="text-none"
                  @click="posLinkSearchOpen = true"
                  >Liên kết KH</v-btn
                >
              </div>
            </template>
          </div>
        </section>
      </div>

      <PosCustomerForm
        v-model="customerFormOpen"
        :contact-id="props.contactId"
        :customer-data="selectedPosCustomer"
        @success="onCustomerFormSuccess" />
    </template>
  </aside>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  watch,
  onBeforeUnmount,
  onMounted,
} from "vue";
import { useRouter } from "vue-router";
import type { Contact } from "@/composables/use-contacts";
import { useChatContactPanel } from "@/composables/use-chat-contact-panel";
import { useCustomer360 } from "@/composables/use-customer-360";
import { displayPhone, displayPhoneIntl } from "@/composables/use-phone-format";
import ChatAppointments from "./ChatAppointments.vue";
import { usePosCommands } from "@/composables/use-pos-commands";
import PosCustomerForm from "@/components/pos/PosCustomerForm.vue";
import PosLinkSearchDialog from "@/components/pos/PosLinkSearchDialog.vue";
import CustomerDebtWidget from "@/components/pos/CustomerDebtWidget.vue";
import BranchInventoryWidget from "@/components/pos/BranchInventoryWidget.vue";
import AutomationCardList from "./AutomationCardList.vue";
import AddFlowModal from "./AddFlowModal.vue";
import MediaTabPanel from "./MediaTabPanel.vue";
import Avatar from "@/components/ui/Avatar.vue";
import ContactDealStageSelector from "@/components/chat/ContactDealStageSelector.vue";
import OrderDetailModal from "./OrderDetailModal.vue";
import { useOrderDraftStore } from "@/stores/use-workspace-sessions";

const orderDraftStore = useOrderDraftStore();

import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/use-toast";
import { api } from "@/api";
import {
  useContactCockpit,
  type Teammate,
} from "@/composables/use-contact-cockpit";

const props = defineProps<{
  contactId: string | null;
  contact: Contact | null;
  // Nick CRM đang xem KH này — dùng để xác định Friend row "active" cho per-pair tag.
  activeZaloAccountId?: string | null;
  // Tên hiển thị nick CRM đang online — hiển thị trong modal handoff ("Từ nick: ...")
  activeZaloAccountName?: string | null;
  // Conversation hiện tại — dùng cho POS order draft.
  conversationId?: string | null;
  // Friendship per-pair (nick × KH) — chứa aliasInNick để sync 2-way với Zalo Real.
  friendship?: { id?: string; aliasInNick?: string | null } | null;
  currentRole?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
  "insert-suggestion": [text: string];
  "status-changed": [statusId: string | null];
}>();

// orgId cho ContactDealStageSelector (trạng thái cột 4 cạnh UID — sync với cột 3).
const _authStorePanel = useAuthStore();
const orgId = computed(() => _authStorePanel.user?.orgId ?? null);

// Đổi trạng thái ở cột 4 → cập nhật local contact + emit để cột 3 sync (cùng tab).
// Cross-device đã do BE emit friend:updated lo (ChatView listen).
function onDealStageUpdatedPanel(newStatusId: string | null) {
  if (props.contact) {
    (props.contact as { statusId?: string | null }).statusId = newStatusId;
  }
  emit("status-changed", newStatusId);
}

const {
  form,
  saveSuccess,
  saveError,
  contactAppointments,
  saveContact,
  reloadAppointments,
} = useChatContactPanel(
  () => props.contactId,
  () => props.contact,
  () => emit("saved")
);

// ════════ KiotViet POS Integration ════════
const { getLinkStatus, linkContactToPos, unlinkContact } = usePosCommands();
// Dùng chung biến toast đã khai báo ở bên dưới
const loadingStatus = ref(false);
const linking = ref(false);
const unlinking = ref(false);
const customerFormOpen = ref(false);
const posLinkSearchOpen = ref(false);
const posLinkStatus = ref<{
  linked: boolean;
  autoSuggest: boolean;
  posCustomerId?: number;
  posCustomerCode?: string;
  posCustomer?: any;
}>({ linked: false, autoSuggest: false });

const selectedPosCustomer = ref<any>(null);

const {
  customer360,
  customer360Loading,
  customer360Error,
  fetchCustomer360,
} = useCustomer360(() => props.contactId);

async function checkPosStatus() {
  if (!props.contactId) return;
  loadingStatus.value = true;
  try {
    const res = await getLinkStatus(props.contactId);
    if (res) {
      posLinkStatus.value = res;
      // Auto-inherit phone from POS into CRM Contact form if empty
      if (res.linked && res.posCustomer) {
        const posPhone = res.posCustomer.phone || res.posCustomer.contactNumber;
        if (posPhone && !form.phone) {
          form.phone = posPhone;
          saveContact();
        }
      }
    }
  } catch (err) {
    console.error("checkPosStatus failed:", err);
  } finally {
    loadingStatus.value = false;
  }
}

watch(
  () => props.contactId,
  (newId) => {
    if (newId) {
      checkPosStatus();
    }
  },
  { immediate: true }
);

function openCreateCustomerForm() {
  selectedPosCustomer.value = {
    name: props.contact?.fullName || props.contact?.crmName || "",
    phone: props.contact?.phone || "",
    email: props.contact?.email || "",
    address: props.contact?.addressLine || "",
  };
  customerFormOpen.value = true;
}

function openEditCustomerForm() {
  if (posLinkStatus.value.linked && posLinkStatus.value.posCustomer) {
    selectedPosCustomer.value = {
      id: posLinkStatus.value.posCustomerId,
      code: posLinkStatus.value.posCustomerCode,
      name: posLinkStatus.value.posCustomer.name,
      phone:
        posLinkStatus.value.posCustomer.phone ||
        posLinkStatus.value.posCustomer.contactNumber,
      email: posLinkStatus.value.posCustomer.email || "",
      address: posLinkStatus.value.posCustomer.address || "",
    };
    customerFormOpen.value = true;
  }
}

async function performQuickLink() {
  if (!props.contactId || !posLinkStatus.value.posCustomer?.id) return;
  linking.value = true;
  try {
    const res = await linkContactToPos(
      props.contactId,
      posLinkStatus.value.posCustomer.id,
      posLinkStatus.value.posCustomer.code,
      posLinkStatus.value.posCustomer.name,
      posLinkStatus.value.posCustomer.phone
    );
    if (res && res.success) {
      toast.success("Liên kết khách hàng thành công!");
      checkPosStatus();
      void fetchCustomer360();
      emit("saved");
    }
  } catch (err) {
    console.error("performQuickLink failed:", err);
  } finally {
    linking.value = false;
  }
}

function onCustomerFormSuccess() {
  checkPosStatus();
  emit("saved");
}

/** Callback khi PosLinkSearchDialog liên kết thành công */
function onPosLinked(data: {
  posCustomerId: number;
  posCustomerCode?: string;
  posCustomerName?: string;
}) {
  // Cập nhật local state ngay (không cần gọi lại API)
  posLinkStatus.value = {
    linked: true,
    autoSuggest: false,
    posCustomerId: data.posCustomerId,
    posCustomerCode: data.posCustomerCode || undefined,
    posCustomer: {
      id: data.posCustomerId,
      name: data.posCustomerName || "",
      code: data.posCustomerCode || "",
    },
  };
  checkPosStatus(); // Reload để lấy thông tin đầy đủ
  emit("saved");
}

/** Hủy liên kết POS */
async function performUnlink() {
  if (!props.contactId) return;
  if (
    !confirm("Bạn chắc chắn muốn hủy liên kết khách hàng này khỏi POS không?")
  )
    return;

  unlinking.value = true;
  try {
    const res = await unlinkContact(props.contactId);
    if (res && res.success) {
      toast.success("Hủy liên kết POS thành công");
      // Reset POS link state
      posLinkStatus.value = { linked: false, autoSuggest: false };
      // Xóa sạch dữ liệu đơn hàng + Customer 360 — không còn thuộc KH này nữa
      contactOrders.value = [];
      orderSummary.value = null;
      emit("saved");
    } else {
      toast.error("Không thể hủy liên kết, vui lòng thử lại");
    }
  } catch (err) {
    console.error("performUnlink failed:", err);
    toast.error("Lỗi hủy liên kết");
  } finally {
    unlinking.value = false;
  }
}

// ════════ Order Detail Modal ════════
const showOrderDetailDialog = ref(false);
const selectedOrderForDetail = ref<any>(null);

function openOrderDetail(order: any) {
  selectedOrderForDetail.value = order;
  showOrderDetailDialog.value = true;
}

// ════════ Tên gợi nhớ Zalo (per-pair, sync 2-way với Zalo Real) ════════
// Bound to Friend.aliasInNick — PATCH /friends/:id sẽ:
//   1. Update DB
//   2. Fire-and-forget call api.changeFriendAlias / removeFriendAlias → push Zalo Real
const aliasDraft = ref("");
watch(
  () => props.friendship?.aliasInNick,
  (v) => {
    aliasDraft.value = v || "";
  },
  { immediate: true }
);

const aliasToast = useToast();
async function saveAlias() {
  const friendId = props.friendship?.id;
  if (!friendId) return;
  const trimmed = aliasDraft.value.trim();
  const newAlias = trimmed.length ? trimmed : null;
  if (newAlias === (props.friendship?.aliasInNick || null)) return; // no-op
  try {
    await api.patch(`/friends/${friendId}`, { aliasInNick: newAlias });
    aliasToast.success(
      newAlias ? `Đã đổi tên gợi nhớ → "${newAlias}"` : "Đã xoá tên gợi nhớ"
    );
    emit("saved"); // parent refetch để lấy alias mới + reflect lên cột 2 + header
  } catch (err) {
    aliasToast.error("Lưu tên gợi nhớ thất bại");
  }
}

// ════════ Tab state (persist sang tab khác KH khác) ════════
// 2026-06-01: Refactor cột 4 4-tab — bottom strip Profile/Media/AI/Follow-up.
// 2026-06-12 (anh chốt): tab 'automation' → 'media' (gộp Picker Media + Automation:
//   Ảnh/Video/Tệp/Khối trong MediaTabPanel). `activeTab` (sub-tab) chỉ active scope 'profile'.
const mainTab = ref<"profile" | "media" | "followup">("profile");
const activeTab = ref<"profile" | "crm" | "activity">("profile");

// Sales & Customer Service Workspace Optimization state:
const salesTab = ref<"overview" | "orders" | "appointment" | "notes">(
  "overview"
);
// showCreateOrderDialog is now managed by orderDraftStore

function openOrderForContact() {
  if (!posLinkStatus.value.linked) return;
  const avatar =
    props.contact?.avatarUrl || activeFriend.value?.zaloAvatarUrl || undefined;
  orderDraftStore.openDraft({
    contactId: props.contactId || undefined,
    contactName: headerFullName.value,
    contactAvatar: avatar,
    contactPhone: props.contact?.phone || undefined,
    posCustomerId: posLinkStatus.value.posCustomerId || undefined,
    posCustomerCode: posLinkStatus.value.posCustomerCode || undefined,
    conversationId: props.conversationId || undefined,
  });
}
const customerType = ref<string | null>("VIP");

// Order list from local Read Model
interface OrderListItem {
  id: string;
  code: string;
  grandTotal: number;
  debtAmount: number;
  orderStatus: string;
  createdAt: string;
  items: { productName: string; quantity: number }[];
}
interface OrderSummary {
  totalCount: number;
  draftCount: number;
  confirmedCount: number;
  doneCount: number;
  cancelledCount: number;
  totalGrandTotal: number;
  estimatedDebt: number; // Công nợ dự tính (Phiếu tạm)
  actualDebt: number; // Công nợ thực tế (Đã xác nhận)
  lastOrderAt: string | null;
  lastOrderCode: string | null;
}
const contactOrders = ref<OrderListItem[]>([]);
const orderSummary = ref<OrderSummary | null>(null);
const ordersLoading = ref(false);

// Phân trang 4 đơn / trang cho tab Đơn hàng
const ordersPage = ref(1);
const ordersPageSize = 4;
const totalOrdersPages = computed(
  () => Math.ceil(contactOrders.value.length / ordersPageSize) || 1
);
const paginatedOrders = computed(() => {
  const start = (ordersPage.value - 1) * ordersPageSize;
  return contactOrders.value.slice(start, start + ordersPageSize);
});

// Format tiền VNĐ ngắn gọn: 1.245.200 → "1,24tr" | 85.000 → "85k"
function fmtVnd(n: number): string {
  if (!n || n === 0) return "0đ";
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}đ`;
}

function customerTimelineIcon(type: string): string {
  return ({ note: 'edit_note', task: 'task_alt', ticket: 'confirmation_number', appointment: 'calendar_month', order: 'receipt_long' } as Record<string, string>)[type] || 'history';
}

function customerTimelineLabel(type: string, status: string | null): string {
  const base = ({ note: 'Ghi chú', task: 'Công việc', ticket: 'Khiếu nại', appointment: 'Lịch hẹn', order: 'Đơn hàng' } as Record<string, string>)[type] || 'Hoạt động';
  return status ? `${base}: ${status}` : base;
}

/** Trạng thái chăm sóc CRM — phân loại cho khách CHƯA liên kết POS (Phương án C). */
function crmStatusLabel(status: string | null): string {
  if (!status) return 'Chưa phân loại';
  const map: Record<string, string> = {
    new: 'Khách mới', contacted: 'Đã tiếp cận', interested: 'Quan tâm',
    converted: 'Đã chuyển đổi', lost: 'Thất bại',
  };
  return map[status] || status;
}

function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** So doanh thu tháng gần nhất vs tháng trước → đang tăng/giảm. */
function journeyTrendText(j: { monthlyTrend: Array<{ month: string; revenue: number }> }): string | null {
  if (j.monthlyTrend.length < 2) return null;
  const [latest, prev] = j.monthlyTrend;
  if (!prev.revenue || !latest.revenue) return null;
  const delta = latest.revenue - prev.revenue;
  const pct = Math.round(Math.abs(delta) / prev.revenue * 100);
  return delta >= 0
    ? `Tăng ~${pct}% so với ${prev.month}`
    : `Giảm ~${pct}% so với ${prev.month}`;
}

function getOrderStatusClass(status: string) {
  if (["Completed", "Done", "Hoàn thành"].includes(status))
    return "sp-status--success";
  if (["Confirmed", "Đã xác nhận"].includes(status))
    return "sp-status--confirmed";
  if (["Cancelled", "Đã hủy"].includes(status)) return "sp-status--cancelled";
  return "sp-status--draft";
}

function getOrderStatusLabel(status: string) {
  if (["Completed", "Done", "Hoàn thành"].includes(status)) return "Hoàn thành";
  if (["Confirmed", "Đã xác nhận"].includes(status)) return "Đã xác nhận";
  if (["Cancelled", "Đã hủy"].includes(status)) return "Đã hủy";
  if (["Draft", "Pending", "Phiếu tạm"].includes(status)) return "Phiếu tạm";
  return status;
}

function formatVndFull(amount: number): string {
  if (!amount) return "0 đ";
  return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
}

async function fetchContactOrders() {
  if (!props.contactId) return;
  ordersLoading.value = true;
  try {
    const { data } = await api.get<any>(
      `/pos/orders/contact/${props.contactId}`
    );
    const payload = data?.data?.data ?? data?.data ?? data;
    contactOrders.value = payload?.orders || [];
    orderSummary.value = payload?.summary || null;
    ordersPage.value = 1;
  } catch (err) {
    console.error("fetchContactOrders failed:", err);
  } finally {
    ordersLoading.value = false;
  }
}

function onOrderCreated(_data: any) {
  toast.success("Đơn hàng đã được tạo thành công!");
  fetchContactOrders();
  checkPosStatus();
}

// Fetch ngay khi load contact (để Customer 360 có data ngay ở Overview tab)
// + re-fetch khi chuyển sang tab Orders
watch(
  () => props.contactId,
  (id) => {
    if (id) fetchContactOrders();
  },
  { immediate: true }
);
watch(
  () => salesTab.value,
  (tab) => {
    if (tab === "orders" && props.contactId) fetchContactOrders();
  }
);

// Cho phép cha (ChatView) mở tab Media từ nút "Chèn từ kho" ở composer cột 3.
function setMainTab(t: "profile" | "media" | "followup") {
  mainTab.value = t;
}
defineExpose({ setMainTab });

// ════════════════════════════════════════════════════════════════════════
// Info section state machine — 3 modes, in-memory only (KHÔNG persist):
//   'auto'   → expand + countdown 5s → auto-hide
//   'sticky' → user click 2nd time để ghim → KHÔNG auto-hide
//   'hidden' → ẩn (mặc định, hoặc sau countdown, hoặc user thu gọn)
//
// Flow toggle button (1 nút, 3-state cycle):
//   hidden → click → 'auto' (5s countdown)
//   'auto' (đang countdown) → click → 'sticky' (cancel countdown, ghim 📌)
//   'sticky' → click → 'hidden'
//
// Reload page / switch conv / switch tab → RESET về hidden (KHÔNG persist).
// Sticky chỉ giữ trong cùng conv + cùng tab Hồ Sơ.
// ════════════════════════════════════════════════════════════════════════
type ExpandMode = "auto" | "sticky" | "hidden";
const expandMode = ref<ExpandMode>("hidden");
const infoExpanded = computed(() => expandMode.value !== "hidden");
const isSticky = computed(() => expandMode.value === "sticky");
const collapseRemain = ref(5);
let collapseTimer: ReturnType<typeof setInterval> | null = null;

function clearCollapseTimer() {
  if (collapseTimer) {
    clearInterval(collapseTimer);
    collapseTimer = null;
  }
}
function startAutoCollapse() {
  clearCollapseTimer();
  collapseRemain.value = 5;
  collapseTimer = setInterval(() => {
    collapseRemain.value--;
    if (collapseRemain.value <= 0) {
      // Chỉ tự hide khi đang ở mode 'auto'. Sticky thì never timeout.
      if (expandMode.value === "auto") expandMode.value = "hidden";
      clearCollapseTimer();
    }
  }, 1000);
}

// 3-state cycle trên 1 nút toggle (theo user spec):
//   hidden → 'auto' (countdown 5s)
//   'auto' → 'sticky' (ghim, cancel countdown)
//   'sticky' → 'hidden'
function toggleInfoExpand() {
  if (expandMode.value === "hidden") {
    // Open lần đầu → auto countdown 5s
    expandMode.value = "auto";
    startAutoCollapse();
  } else if (expandMode.value === "auto") {
    // Click lần nữa khi đang auto → ghim sticky (cancel countdown)
    expandMode.value = "sticky";
    clearCollapseTimer();
  } else {
    // sticky → hidden
    expandMode.value = "hidden";
    clearCollapseTimer();
  }
}

// Khi click tab Hồ Sơ: auto-expand + countdown (KHÔNG sticky default).
// Khi switch tab khác: hidden.
watch(activeTab, (tab) => {
  if (tab === "profile") {
    expandMode.value = "auto";
    startAutoCollapse();
  } else {
    clearCollapseTimer();
    expandMode.value = "hidden";
  }
});

// Animation: khi NotesSection emit 'appointment-created' (fly anim đã xong) → +1 badge với bump effect.
// pendingAptBump giữ count cho tới khi reloadAppointments() refresh data thực từ backend.
const pendingAptBump = ref(0);
const badgeBump = ref(false);
function onAppointmentCreated() {
  pendingAptBump.value++;
  badgeBump.value = true;
  setTimeout(() => {
    badgeBump.value = false;
  }, 600);
  // Reset bump NGAY trong .then() (không setTimeout 300ms) để Vue batch cùng frame
  //   activityBadgeCount: 0 → 1  (do reload)
  //   pendingAptBump:     1 → 0  (do reset)
  // Cả 2 update cùng microtask → 1 re-render duy nhất, badge từ 1 (bump) → 1 (real),
  // không flash số 2. Bug cũ: setTimeout 300ms giữ bump=1 sau khi data đã = 1 → badge = 2.
  reloadAppointments().then(() => {
    pendingAptBump.value = 0;
  });
}

// Listen global 'appointment-created' event — fire khi MessageThread (cột 3) tạo
// nhắc hẹn qua icon 📅 trong toolbar. Cùng pattern với zalo-labels-synced.
function onGlobalAppointmentCreated() {
  onAppointmentCreated();
}
onMounted(() =>
  window.addEventListener("appointment-created", onGlobalAppointmentCreated)
);
onBeforeUnmount(() => {
  clearCollapseTimer();
  window.removeEventListener("appointment-created", onGlobalAppointmentCreated);
});

// ════════ Relations data (friends per nick = KH Con) — fetch khi đổi contact ═══
interface FriendItem {
  id: string;
  zaloUidInNick: string;
  relationshipKind: string;
  hasConversation: boolean;
  totalInbound: number;
  totalOutbound: number;
  becameFriendAt: string | null;
  lastInboundAt: string | null;
  leadScore: number;
  zaloDisplayName: string | null;
  zaloAvatarUrl: string | null;
  crmTagsPerNick: string[];
  statusRef: {
    id: string;
    name: string;
    order: number;
    color: string | null;
  } | null;
  zaloAccount: {
    id: string;
    displayName: string | null;
    avatarUrl?: string | null;
    owner: { id: string; fullName: string } | null;
  };
}
interface RelationsState {
  friends: FriendItem[];
}
const relations = ref<RelationsState>({ friends: [] });

async function fetchRelations(contactId: string) {
  try {
    const res = await api.get<{ friends?: FriendItem[] }>(
      `/contacts/${contactId}`
    );
    // Sort: "đang chat" lên đầu — sale chỉ care nick đã thực sự nhắn 1-1.
    const all = res.data.friends || [];
    all.sort((a, b) => {
      if (a.hasConversation !== b.hasConversation)
        return a.hasConversation ? -1 : 1;
      const at = a.lastInboundAt || "";
      const bt = b.lastInboundAt || "";
      return bt.localeCompare(at);
    });
    relations.value = { friends: all };
  } catch (err) {
    console.error("[ChatContactPanel] fetchRelations error:", err);
    relations.value = { friends: [] };
  }
}

// Care status legacy (CareStatusBadge) GỠ 2026-06-06 — cột 4 dùng ContactDealStageSelector
// (statusId dynamic) cạnh UID để sync với cột 3. onChangeCareStatus + import bỏ.

// ════════ Header name (Avatar component handle initials + gender + gradient) ════════
// B7 fix — Contact stub có thể fullName='Unknown'; fallback qua aliasInNick (props.friendship)
// rồi activeFriend.zaloDisplayName (nick đang chăm) trước khi hiện 'Khách hàng'.
const headerFullName = computed(() => {
  const isUsable = (s: string | null | undefined): s is string =>
    !!s && s.trim().length > 0 && s.trim().toLowerCase() !== "unknown";
  if (isUsable(props.contact?.crmName)) return props.contact!.crmName!;
  if (isUsable(props.contact?.fullName)) return props.contact!.fullName!;
  if (isUsable(props.friendship?.aliasInNick))
    return props.friendship!.aliasInNick!;
  const af = activeFriend.value as { zaloDisplayName?: string | null } | null;
  if (isUsable(af?.zaloDisplayName)) return af!.zaloDisplayName!;
  return "Khách hàng";
});

// Lead score tier để màu badge overlay trên avatar (thấp/TB/cao)
// ════════ Header name (Avatar component handle initials + gender + gradient) ════════

// ════════ Phones extras ════════
const showExtraPhones = ref(false);
// SĐT chính: hiển thị format đẹp '0359 944 488' khi KHÔNG focus; khi focus thì show raw để
// sale gõ/sửa tự nhiên. Tooltip = '+84...' (Anh chốt 2026-06-06). Giá trị lưu vẫn raw.
const phoneFocused = ref(false);

// SĐT phụ — list động (form.phonesExtra). Thêm/xoá dòng, lưu khi blur.
function addExtraPhone() {
  form.phonesExtra.push({ label: "", phone: "" });
  showExtraPhones.value = true;
}
function removeExtraPhone(idx: number) {
  form.phonesExtra.splice(idx, 1);
  saveContact();
}

// Tag CRM hệ thống đã chuyển sang TagCrmBar trên chat input (Cột 3).
// Zalo Real labels chuyển sang dropdown trong header Cột 3 (MessageThread).

// ════════ Tab FOLLOW-UP — Luồng Mục Tiêu M9 (2026-06-02) ════════
// AutomationCardList tự fetch /api/v1/contacts/:cid/automation-status
// + tự poll 30s với Page Visibility API. Modal "+ Gắn thêm luồng" qua AddFlowModal.
const automationCardListRef = ref<InstanceType<
  typeof AutomationCardList
> | null>(null);
const showAddFlowModal = ref(false);

function openAddFlowModal(): void {
  showAddFlowModal.value = true;
}

function closeAddFlowModal(): void {
  showAddFlowModal.value = false;
}

function onEnrolled(): void {
  showAddFlowModal.value = false;
  // Refresh card list để hiện luồng mới enroll
  if (automationCardListRef.value?.refetch) {
    void automationCardListRef.value.refetch();
  }
}

// ════════ Hồ sơ KH tổng hợp ════════
// 2026-07-31: ContactProfileView (skeleton, data mock) đã xoá — drawer của
// PeopleView là surface chi tiết duy nhất và đã render đủ email/địa chỉ/nghề.
// Điều hướng sang /contacts?focus=<id> để mở thẳng drawer đó.
function openFullProfile() {
  if (!props.contact?.id) return;
  router.push({ path: "/contacts", query: { focus: props.contact.id } });
}

// activeFriend dùng cho headerFullName fallback (zaloDisplayName cho KH stub).
const activeFriend = computed<FriendItem | null>(() => {
  if (!props.activeZaloAccountId) return null;
  return (
    relations.value.friends.find(
      (f) => f.zaloAccount.id === props.activeZaloAccountId
    ) || null
  );
});

const toast = useToast();
const router = useRouter();

// Khi đổi sang contact mới, reset về tab Hồ sơ + refetch relations
// (NotesSection tự fetch khi prop contactId đổi).
// Cũng force reset infoExpanded + start countdown — nếu activeTab đã = 'profile',
// watch(activeTab) sẽ KHÔNG fire khi cùng giá trị → form section stuck ở state cũ.
watch(
  () => props.contactId,
  (id) => {
    activeTab.value = "profile";
    // Switch conv hoặc reload page → reset về 'auto' (countdown 5s).
    // KHÔNG persist sticky giữa các conv (theo spec: sticky chỉ trong cùng conv).
    expandMode.value = "auto";
    startAutoCollapse();
    if (id) void fetchRelations(id);
    else relations.value = { friends: [] };
    // Tab CRM cockpit data — fetch chỉ khi tab CRM được mở (xem watch(activeTab) bên dưới)
    if (!id) {
      cockpit.value = null;
      teammates.value = [];
    }
  },
  { immediate: true }
);

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  return `${days} ngày trước`;
}

// ════════════════════════════════════════════════════════════════════════
// Tab CRM (Mini CRM cockpit) — 7 widget, anh chốt design 2026-05-22
// docs/designs/CHAT-COL4-CRM-TAB.md
// ════════════════════════════════════════════════════════════════════════
const {
  cockpit,
  teammates,
  loading: cockpitLoading,
  fetchCockpit,
  fetchTeammates,
  generateHandoffMessage,
} = useContactCockpit();

// Fetch cockpit + teammates khi tab CRM được mở lần đầu (lazy load tiết kiệm request)
const crmTabLoaded = ref(false);
watch(
  [activeTab, () => props.contactId],
  async ([tab, id]) => {
    if (tab === "crm" && id) {
      crmTabLoaded.value = true;
      await Promise.all([
        fetchCockpit(id),
        fetchTeammates(id, props.activeZaloAccountId || undefined),
      ]);
    }
  },
  { immediate: false }
);

// Reload teammates khi đổi nick active
watch(
  () => props.activeZaloAccountId,
  (zaloId) => {
    if (activeTab.value === "crm" && props.contactId) {
      void fetchTeammates(props.contactId, zaloId || undefined);
    }
  }
);

// ─── Computed cho widgets ────────────────────────────────────────────────
const teammatesFiltered = computed<Teammate[]>(() => {
  const arr = teammates.value || [];
  // Backend đã filter excludeZaloAccountId; thêm dedup theo owner user (1 sale có thể có nhiều nick)
  const seen = new Set<string>();
  const out: Teammate[] = [];
  for (const t of arr) {
    const key = t.owner?.id || `nick:${t.zaloAccountId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
});

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Widget 2: AI suggest ────────────────────────────────────────────────
function onInsertSuggestionText(text: string) {
  if (!text) return;
  emit("insert-suggestion", text);
  window.dispatchEvent(
    new CustomEvent("chat:insert-suggestion", { detail: { text } })
  );
}
</script>

<style scoped>
.info-panel {
  background: var(--app-surface-panel);
  border-left: 1px solid var(--app-border-subtle);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  flex-shrink: 0;
}

/* ════════ Sales & Customer Service Workspace UI ════════ */
.customer-summary-header {
  border-bottom: 1px solid var(--app-border-subtle);
}
.csh-avatar {
  border: 2px solid var(--app-surface-panel);
  box-shadow: var(--app-shadow-sm);
}
.csh-details-grid {
  row-gap: 8px;
}
.csh-grid-item {
  min-width: 45%;
}
.csh-item-label {
  font-weight: 500;
  color: var(--app-text-secondary);
}
.csh-item-val {
  font-weight: 600;
  color: var(--app-text-primary);
}
.csh-item-val.inline-select :deep(.v-field) {
  border-radius: var(--app-radius-sm) !important;
  background-color: var(--app-surface-panel) !important;
  border: 1px solid var(--app-border-subtle);
}

/* Tab bar: trước đây hover tím #5E6AD2 còn active teal #0284c7 — hai màu này
   không thuộc bảng màu nào của app. Gom hết về accent để cột 4 cùng hệ với
   cột 1/2/3. */
.flat-tabs {
  background: var(--app-surface-sunken);
}
.flat-tab {
  background: none;
  border: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
  outline: none;
}
.flat-tab:hover {
  background-color: var(--app-surface-hover);
  color: var(--app-accent) !important;
}
.flat-tab.active {
  border-bottom-color: var(--app-accent);
  color: var(--app-accent) !important;
  background-color: var(--app-surface-panel);
}
.flat-tab:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: -2px;
}

.sales-pane {
  height: 100%;
}
.compact-overview .ip-form-row {
  border-bottom: 1px solid var(--app-surface-canvas);
  padding: 8px 0;
}
.compact-overview input,
.compact-overview select {
  font-size: 13px;
  color: var(--app-text-primary);
  background: transparent;
  border: none;
  outline: none;
  flex-grow: 1;
}

.c360-grid {
  row-gap: 8px;
  background: var(--app-surface-sunken);
  padding: 12px;
  border-radius: var(--app-radius-lg);
  border: 1px dashed var(--app-border-default);
}

/* ════════ Header (pinned) ════════ */
.ip-header {
  padding: 12px 14px;
  text-align: left;
  background: #fff;
  border-bottom: 1px solid #e8eaef;
  position: relative;
  flex-shrink: 0;
}
.ip-smax-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 26px;
}
.ip-smax-name-block {
  min-width: 0;
  flex: 1;
}
.ip-header .ip-name-line {
  font-size: 15px;
  font-weight: 700;
  color: #172b4d;
  line-height: 1.2;
  margin-top: 0;
  padding: 0;
  text-align: left;
}
.ip-header .ip-id {
  font-size: 11px;
  color: #7a869a;
  margin-top: 2px;
  padding: 0;
  text-align: left;
}
.ip-care-row-inline {
  margin-top: 5px;
  display: flex;
}
/* Tab 4 "Điểm" — score panel content full-width 280px, vertical stack */
.tab-pane-score {
  padding: 12px 14px 18px;
}
/* Tab badge cho score (khác badge số tin chưa đọc) */
.tab-badge-score {
  background: #fef3c7 !important;
  color: #b45309 !important;
  font-weight: 700 !important;
  min-width: 24px;
}

.ip-close {
  position: absolute;
  top: 7px;
  right: 9px;
  width: 26px;
  height: 26px;
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--app-text-secondary);
  border-radius: 50%;
  z-index: 5;
}
.ip-close:hover {
  background: var(--app-surface-hover);
  color: var(--app-text-primary);
}
.ip-close:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 1px;
}

.ip-avatar-wrap {
  position: relative;
  display: inline-block;
}
.ip-avatar-big {
  display: block;
  margin: 0 auto;
}

/* Lead score badge — overlay trên avatar (góc dưới-phải), Smax-style "điểm KH" */
.lead-score-badge {
  position: absolute;
  bottom: -3px;
  right: -8px;
  background: var(--smax-bg, #fff);
  border: 2px solid #fff;
  border-radius: 11px;
  padding: 1px 7px 1px 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  cursor: help;
}
.lead-score-badge.tier-hot {
  background: #ffebee;
  color: #c62828;
  border-color: #ffcdd2;
}
.lead-score-badge.tier-warm {
  background: #fff3e0;
  color: #ef6c00;
  border-color: #ffe0b2;
}
.lead-score-badge.tier-cool {
  background: #e3f2fd;
  color: #1565c0;
  border-color: #bbdefb;
}
.lead-score-badge.tier-cold {
  background: #f5f6fa;
  color: var(--smax-grey-600);
  border-color: #e0e0e0;
}

.ip-name-line {
  margin-top: 7px;
  font-size: 14px;
  font-weight: 600;
  color: var(--smax-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 17px;
}
.ip-id {
  font-size: 10.5px;
  color: var(--smax-grey-700);
  margin-top: 3px;
  font-family: ui-monospace, "Cascadia Code", Menlo, monospace;
  word-break: break-all;
  padding: 0 17px;
}
.ip-care-row {
  margin-top: 7px;
}
.care-status-select {
  background: rgba(255, 145, 0, 0.15);
  color: #ef6c00;
  border: 1px solid rgba(255, 145, 0, 0.3);
  padding: 4px 11px;
  border-radius: 13px;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.care-status-select:hover {
  background: rgba(255, 145, 0, 0.22);
}

/* ════════ Tab bar ════════ */
.ip-tabs {
  display: flex;
  border-bottom: 1px solid var(--smax-grey-200);
  background: var(--smax-grey-50);
  flex-shrink: 0;
}
.ip-tab {
  flex: 1;
  background: transparent;
  border: none;
  padding: 9px 7px;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--smax-grey-700);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: inherit;
  position: relative;
  transition: color 0.15s;
}
.ip-tab .ic {
  font-size: 13px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}
.ip-tab .ic > svg {
  display: block;
}
.ip-tab:hover {
  color: var(--smax-primary);
  background: var(--smax-grey-100);
}
.ip-tab.active {
  color: var(--smax-primary);
  border-bottom-color: var(--smax-primary);
  background: var(--smax-bg);
  font-weight: 600;
}
.tab-badge {
  position: absolute;
  top: 5px;
  right: 9px;
  background: var(--smax-primary);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 8px;
  min-width: 16px;
  line-height: 14px;
  text-align: center;
  transition: transform 0.18s ease;
}
/* Bump effect — khi NotesSection báo created → scale + glow để feedback +1 */
.ip-tab.badge-bump .tab-badge {
  animation: badgeBump 0.6s ease;
}
@keyframes badgeBump {
  0% {
    transform: scale(1);
    background: var(--smax-primary);
  }
  30% {
    transform: scale(1.5);
    background: #f57c00;
    box-shadow: 0 0 0 6px rgba(245, 124, 0, 0.25);
  }
  60% {
    transform: scale(1.1);
    background: #f57c00;
  }
  100% {
    transform: scale(1);
    background: var(--smax-primary);
    box-shadow: none;
  }
}

/* ════════ Tab content (scroll) ════════ */
.ip-tab-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.tab-pane {
  display: flex;
  flex-direction: column;
}
.tab-empty {
  padding: 26px 17px;
  font-size: 12px;
  color: var(--smax-grey-700);
  text-align: center;
  font-style: italic;
}
.tab-empty ul {
  text-align: left;
  padding: 0 0 0 18px;
  margin: 6px auto 0;
  max-width: 250px;
}
.tab-empty li {
  margin: 4px 0;
}
.parent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--smax-grey-200);
  border-radius: 8px;
  background: rgba(0, 242, 255, 0.04);
}
.parent-info {
  flex: 1;
  min-width: 0;
}
.parent-name {
  font-weight: 600;
  font-size: 13px;
}
.parent-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.friends-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.friend-card {
  border: 1px solid var(--smax-grey-200);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--smax-bg);
}
.friend-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.friend-card-title {
  flex: 1;
  min-width: 0;
}
.friend-name {
  font-weight: 600;
  font-size: 13px;
}
.friend-sub {
  font-size: 11px;
  color: var(--smax-grey-600);
  margin-top: 2px;
}
.sale-name {
  font-weight: 500;
}
.friend-card-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  padding: 3px 0;
  flex-wrap: wrap;
}
.friend-card-row .lbl {
  color: var(--smax-grey-600);
}
.friend-card-row .ml-auto {
  margin-left: auto;
}
.friend-card-row.meta-line {
  padding-top: 6px;
  border-top: 1px dashed var(--smax-grey-200);
  margin-top: 4px;
  color: var(--smax-grey-700);
}
.friend-card-row.meta-line strong {
  color: var(--smax-text);
}
.conv-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
}
.conv-badge--on {
  background: rgba(0, 200, 83, 0.15);
  color: #00897b;
}
.conv-badge--off {
  background: rgba(0, 0, 0, 0.06);
  color: #999;
}
.friend-customer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin: 4px 0 6px;
  background: var(--smax-grey-50);
  border-radius: 6px;
  border-left: 3px solid var(--smax-primary);
}
.friend-customer-info {
  flex: 1;
  min-width: 0;
}
.friend-customer-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--smax-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.friend-customer-row .uid {
  display: inline-block;
  margin-top: 2px;
}
.friend-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--smax-grey-200);
  margin-top: 6px;
}
.btn-sm-danger {
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid #ffcdd2;
  color: #c62828;
  border-radius: 4px;
  background: rgba(255, 82, 82, 0.05);
  cursor: pointer;
}
.btn-sm-danger:hover {
  background: rgba(255, 82, 82, 0.15);
}
.status-edit {
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}
.status-edit:hover {
  filter: brightness(1.1);
}
.uid {
  font-family: monospace;
  font-size: 10.5px;
  color: var(--smax-grey-700);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 4px;
  border-radius: 3px;
}
.chip-grey {
  background: rgba(90, 100, 120, 0.1);
  color: var(--smax-grey-700);
  padding: 1px 7px;
  border-radius: 9px;
  font-size: 10.5px;
}
.tab-empty code {
  background: var(--smax-grey-100);
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10.5px;
}

/* ════════ Inline form ════════ */
.ip-form {
  padding: 4px 0;
  border-bottom: 1px solid var(--smax-grey-200);
}
.info-expand-toggle {
  width: 100%;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  color: var(--smax-primary, #2962ff);
  font-weight: 500;
  padding: 6px 13px;
  text-align: left;
  transition: background 0.12s;
}
.info-expand-toggle:hover {
  background: var(--smax-primary-soft, #e3f2fd);
}
.info-expand-toggle.is-sticky {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #92400e;
  border-color: #fcd34d;
}
.info-expand-toggle .sticky-badge {
  font-size: 11px;
  margin-left: 3px;
}

/* Link Hồ sơ KH tổng hợp — thay thế 3 field email/address/occupation ẩn ở cột 4 */
.info-fullprofile-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: calc(100% - 24px);
  margin: 6px 12px 4px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #6366f1;
  background: #eef2ff;
  border: 1px dashed #c7d2fe;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
  font-family: inherit;
}
.info-fullprofile-link:hover {
  background: #e0e7ff;
  border-color: #818cf8;
  border-style: solid;
}
.ip-form-row {
  display: grid;
  grid-template-columns: 22px 80px 1fr;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-bottom: 1px solid var(--smax-grey-100);
}
.ip-form-row.sub {
  grid-template-columns: 22px 80px 1fr;
  padding-left: 32px;
}
.ip-form-row:last-child {
  border-bottom: none;
}
.ip-icon {
  font-size: 14px;
  opacity: 0.85;
  text-align: center;
}
.ip-label {
  font-size: 12px;
  color: var(--smax-grey-700);
}
.ip-form-row input,
.ip-form-row select {
  border: none;
  outline: none;
  font-size: 13px;
  background: transparent;
  width: 100%;
  min-width: 0;
  padding: 3px 4px;
  border-radius: 4px;
  font-family: inherit;
  color: var(--smax-text);
}
.ip-form-row input:hover,
.ip-form-row select:hover {
  background: var(--smax-grey-50);
}
.ip-form-row input:focus,
.ip-form-row select:focus {
  background: var(--smax-primary-soft);
}
.phone-cell {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
}
.phone-cell input {
  flex: 1;
}
.show-extra-phones {
  background: var(--smax-grey-100);
  border: 1px solid var(--smax-grey-300);
  border-radius: 9px;
  padding: 1px 7px;
  font-size: 11px;
  color: var(--smax-grey-700);
  cursor: pointer;
  flex-shrink: 0;
}
.show-extra-phones:hover {
  background: var(--smax-primary-soft);
  color: var(--smax-primary);
}

/* ════════ SĐT phụ — list động nhãn tự nhập (2026-06-06) ════════
   Override grid của .ip-form-row.sub: dùng flex để nhãn + số + nút xoá nằm 1 hàng,
   không vỡ như 2 ô cố định cũ (label 80px wrap). */
.phone-extra-row {
  display: flex !important;
  align-items: center;
  gap: 6px;
  padding-left: 32px;
}
.phone-extra-row .pex-label {
  flex: 0 0 96px;
  min-width: 0;
  font-size: 12px;
  color: var(--smax-grey-700);
}
.phone-extra-row .pex-phone {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
}
.phone-extra-row .pex-remove {
  flex: 0 0 auto;
  background: none;
  border: none;
  color: var(--smax-grey-500);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.phone-extra-row .pex-remove:hover {
  color: var(--smax-danger, #e53935);
}
.pex-add {
  margin: 4px 0 4px 32px;
  background: none;
  border: 1px dashed var(--smax-grey-300);
  border-radius: 8px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--app-accent);
  cursor: pointer;
}
.pex-add:hover {
  background: var(--smax-primary-soft);
}

/* ════════ Section ════════ */
.ip-section {
  padding: 11px 17px;
  border-bottom: 1px solid var(--smax-grey-200);
}
.ip-section:last-child {
  border-bottom: none;
}
.ip-section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--smax-text);
  margin-bottom: 7px;
}
.ip-section-title .accent {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--smax-grey-300);
}

/* ════════ Compact manager panel — Smax-aligned ════════
   Smax keeps the details column to identity + a short field list. We add only
   the POS block on top of that, so everything here stays flat and borderless. */
.ip-compact-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: #fff;
}
.ip-form--compact {
  padding: 10px 14px;
  border-bottom: 1px solid #e8eaef;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* Field rows mirror the Smax pill inputs rather than the old label/underline grid. */
.ip-form--compact .ip-form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-bottom: 1px solid transparent;
  border-radius: 8px;
  background: #f4f5f7;
  transition:
    background 0.14s ease,
    border-color 0.14s ease;
}
.ip-form--compact .ip-form-row:hover {
  background: #eef0f3;
}
.ip-form--compact .ip-form-row:focus-within {
  background: #fff;
  border-color: #2f6fed;
}
.ip-form--compact .ip-icon {
  font-size: 13px;
  opacity: 0.7;
  flex-shrink: 0;
}
.ip-form--compact .ip-label {
  font-size: 11px;
  font-weight: 500;
  color: #7a869a;
  flex-shrink: 0;
  white-space: nowrap;
}
.ip-form--compact .ip-form-row input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #172b4d;
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
}
.ip-form--compact .ip-form-row input:hover,
.ip-form--compact .ip-form-row input:focus {
  background: transparent;
}
.ip-form--compact .ip-form-row input::placeholder {
  color: #a5adba;
  font-weight: 400;
}

/* POS block — the one section Smax has no counterpart for. */
.ip-pos-section {
  border-bottom: none;
  padding: 12px 14px;
}
.ip-section-spacer {
  flex: 1;
}
.pos-status-chip {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  white-space: nowrap;
}
.pos-status-chip.linked {
  background: #dcfce7;
  color: #15803d;
}
.ip-pos-card {
  background: #f4f5f7;
  border-radius: 10px;
  padding: 10px 12px;
}
.ip-pos-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.scope-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  letter-spacing: 0.3px;
}
.scope-tag.global {
  background: rgba(33, 150, 243, 0.12);
  color: #1565c0;
}
.scope-tag.pernick {
  background: rgba(255, 145, 0, 0.18);
  color: #ef6c00;
}
.refresh-mini {
  margin-left: auto;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--smax-grey-300);
  background: var(--smax-bg);
  cursor: pointer;
  font-size: 12px;
  color: var(--smax-grey-700);
}
.refresh-mini:hover:not(:disabled) {
  background: var(--smax-grey-50);
  color: var(--smax-primary);
}
.refresh-mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sentiment-reason {
  font-size: 12px;
  color: var(--smax-grey-700);
  margin-top: 7px;
  padding: 7px 9px;
  background: var(--smax-grey-50);
  border-radius: 5px;
  font-style: italic;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag-chip {
  background: var(--smax-grey-100);
  color: var(--smax-grey-700);
  padding: 3px 7px;
  border-radius: 7px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: default;
}
.tag-chip .x {
  cursor: pointer;
  opacity: 0.55;
  font-weight: 700;
}
.tag-chip .x:hover {
  opacity: 1;
  color: var(--smax-error);
}
.tag-chip.add {
  background: transparent;
  border: 1px dashed var(--smax-grey-300);
  cursor: pointer;
  color: var(--smax-grey-700);
}
.tag-chip.add:hover {
  background: var(--smax-grey-50);
  border-color: var(--smax-primary);
  color: var(--smax-primary);
}
.tag-input {
  border: 1px solid var(--smax-primary);
  outline: none;
  padding: 2px 7px;
  border-radius: 7px;
  font-size: 11px;
  width: 110px;
  font-family: inherit;
}
.tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--smax-grey-200);
}
.suggestion-label {
  font-size: 10.5px;
  color: var(--smax-grey-700);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}
.tag-chip.suggestion {
  background: transparent;
  border: 1px dashed var(--smax-primary);
  color: var(--smax-primary);
  font-size: 10.5px;
  padding: 2px 7px;
  cursor: pointer;
  border-radius: 7px;
  font-family: inherit;
}
.tag-chip.suggestion:hover {
  background: var(--smax-primary-soft);
}

.metrics-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 13px;
}
.metric-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--smax-success);
}
.metric-label {
  color: var(--smax-grey-700);
}
.metric-aux {
  color: var(--smax-grey-700);
  font-size: 12px;
}

/* ════════ Per-nick state section ════════ */
.kv-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.55;
}
.kv-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-wrap: wrap;
}
.kv-row .k {
  color: var(--smax-grey-700);
  min-width: 100px;
}
.kv-row .v {
  color: var(--smax-text);
  font-weight: 500;
}
.kv-row .muted {
  color: var(--smax-grey-300);
  font-size: 10.5px;
  font-style: italic;
}
.kv-row code {
  font-family: ui-monospace, "Cascadia Code", Menlo, monospace;
  background: var(--smax-grey-100);
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 500;
}
.pill-success {
  background: rgba(0, 200, 83, 0.12);
  color: #00897b;
}
.pill-warning {
  background: rgba(255, 145, 0, 0.12);
  color: #ef6c00;
}
.pill-info {
  background: rgba(33, 150, 243, 0.12);
  color: #1565c0;
}

.empty-section {
  font-size: 11px;
  color: var(--smax-grey-700);
  font-style: italic;
  padding: 4px 0;
}

/* ════════ Other nicks list ════════ */
.nick-rows {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.nick-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 0;
}
.ni-name {
  flex: 1;
  font-size: 12px;
  color: var(--smax-text);
}

/* ════════ Notes section in Tab Hồ Sơ ════════ */
.ip-notes-section {
  margin-top: 10px;
}

/* ════════════════════════════════════════════════════════════════════════
   Tab CRM (Mini cockpit, 7 widgets) — 2026-05-22
   ════════════════════════════════════════════════════════════════════════ */
.crm-tab {
  padding: 10px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.crm-widget {
  background: #fff;
  border: 1px solid var(--smax-grey-200);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.crm-w-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.crm-w-row-status {
  justify-content: space-between;
}
.crm-w-icon {
  font-size: 15px;
  flex-shrink: 0;
}
.crm-w-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--smax-grey-800);
  flex: 1;
}
.crm-w-refresh {
  background: transparent;
  border: 1px solid var(--smax-grey-300);
  border-radius: 6px;
  width: 24px;
  height: 22px;
  font-size: 11.5px;
  cursor: pointer;
  color: var(--smax-grey-600);
}
.crm-w-refresh:hover:not(:disabled) {
  background: var(--smax-grey-100);
}
.crm-w-refresh:disabled {
  opacity: 0.5;
  cursor: wait;
}

.crm-w-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  color: var(--smax-grey-600);
  font-size: 12px;
}
.crm-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--smax-grey-200);
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: crm-spin 700ms linear infinite;
}
@keyframes crm-spin {
  to {
    transform: rotate(360deg);
  }
}

.crm-w-empty {
  color: var(--smax-grey-500);
  font-size: 11.5px;
  padding: 4px 0;
}

/* ── Widget 1: Getfly link ── */
.getfly-pill {
  font-size: 11.5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-weight: 600;
}
.getfly-pill.ok {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.getfly-pill.off {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.crm-btn-ghost {
  background: #fff;
  border: 1px solid var(--smax-grey-300);
  border-radius: 7px;
  padding: 4px 10px;
  font-size: 11.5px;
  cursor: pointer;
  color: var(--smax-grey-700);
}
.crm-btn-ghost:hover:not(:disabled) {
  background: var(--smax-grey-100);
}
.crm-btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Widget 2: AI suggest ── */
.crm-suggest-box {
  background: linear-gradient(180deg, #faf5ff, #f5f3ff);
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.crm-suggest-text {
  font-size: 12px;
  line-height: 1.45;
  color: #312e81;
  white-space: pre-wrap;
  word-break: break-word;
}
.crm-btn-primary {
  background: #4f46e5;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}
.crm-btn-primary:hover {
  background: #4338ca;
}

/* ── Widget 3: Nhiệt KH ── */
.heat-stack {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.heat-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.heat-bar {
  flex: 1;
  height: 10px;
  background: var(--smax-grey-200);
  border-radius: 999px;
  overflow: hidden;
}
.heat-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition:
    width 300ms ease,
    background-color 300ms ease;
}
.heat-bar-num {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--smax-grey-700);
  min-width: 54px;
  text-align: right;
}
.heat-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11.5px;
}
.heat-pattern {
  font-weight: 600;
  color: var(--smax-grey-800);
}
.heat-trend {
  font-weight: 600;
  color: var(--smax-grey-600);
}
.heat-trend.up {
  color: #15803d;
}
.heat-trend.down {
  color: #b91c1c;
}
.heat-stuck {
  font-size: 11px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 6px;
  padding: 3px 7px;
}

/* ── Widget 4: Timeline ── */
.timeline-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11.5px;
  color: var(--smax-grey-700);
}
.tl-line {
  line-height: 1.4;
}
.tl-sep {
  margin: 0 5px;
  color: var(--smax-grey-400);
}
.tl-appt {
  color: #065f46;
  font-weight: 600;
}
.tl-appt-rel {
  font-weight: 500;
  color: var(--smax-grey-600);
}

/* ── Widget 5: Placeholder interest ── */
.crm-w-placeholder {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 11.5px;
  color: var(--smax-grey-600);
  background: var(--smax-grey-100);
  border-radius: 7px;
  padding: 7px 9px;
  line-height: 1.45;
}
.ph-icon {
  font-style: italic;
  color: var(--smax-grey-500);
  flex-shrink: 0;
}

/* ── Widget 6: Đồng đội ── */
.team-banner {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  color: #155e75;
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 7px;
}
.team-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* M55 2026-05-30 — Cùng chăm theo ContactAccess */
.cung-cham-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cung-cham-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #fafbfc;
  border: 1px solid var(--smax-grey-200);
  border-radius: 6px;
}
.cc-avatar-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  text-transform: uppercase;
}
.cc-info {
  flex: 1;
  min-width: 0;
}
.cc-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--smax-text);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cc-role-primary {
  background: #fef3c7;
  color: #92400e;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid #fcd34d;
}
.cc-role-collab {
  background: #dbeafe;
  color: #1e40af;
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid #93c5fd;
}
.cc-meta {
  font-size: 10px;
  color: var(--smax-grey-700);
  margin-top: 1px;
}
.team-card {
  border: 1px solid var(--smax-grey-200);
  border-radius: 8px;
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  background: #fafafa;
}
.team-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-card-info {
  flex: 1;
  min-width: 0;
}
.team-name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--smax-grey-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.team-sub {
  font-size: 11px;
  color: var(--smax-grey-600);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.team-status.active {
  color: #15803d;
}
.team-status.warm {
  color: #b45309;
}
.team-status.cold {
  color: #1d4ed8;
}
.team-status.grey {
  color: var(--smax-grey-500);
}
.team-counts {
  display: flex;
  gap: 12px;
  font-size: 11.5px;
  color: var(--smax-grey-700);
}
.crm-btn-handoff {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 6px 10px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}
.crm-btn-handoff:hover:not(:disabled) {
  filter: brightness(1.05);
}
.crm-btn-handoff:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Widget 7: Push Getfly ── */
.crm-btn-push {
  background: #f8fafc;
  border: 1px dashed #94a3b8;
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  color: var(--smax-grey-600);
  cursor: not-allowed;
  width: 100%;
}
.crm-w-hint {
  font-size: 10.5px;
  color: var(--smax-grey-500);
  text-align: center;
  font-style: italic;
}

/* ═════════ 2026-06-01: Bottom 4-tab strip + placeholder panels ═════════ */
.bottom-tabs {
  display: flex;
  border-top: 1px solid #dddddd;
  background: white;
  flex-shrink: 0;
  margin-top: auto;
}
.bottom-tab {
  flex: 1;
  padding: 10px 4px 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: #6b7280;
  transition: all 0.15s;
  border-top: 3px solid transparent;
  margin-top: -1px;
  font-family: inherit;
}
.bottom-tab:hover {
  background: #fafbfc;
}
.bottom-tab.active {
  color: #0068ff;
  border-top-color: #0068ff;
}
.bottom-tab svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.75;
}
.bottom-tab.active svg {
  stroke-width: 2;
}
.bt-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.main-tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* FOLLOW-UP tab — AutomationCardList tự handle padding (16px nội bộ) + align-start */
.main-tab-body.main-tab-body--no-padding {
  padding: 0;
  display: block;
  align-items: stretch;
  justify-content: stretch;
}
.main-tab-placeholder {
  text-align: center;
  max-width: 280px;
}
.mtp-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.6;
}
.main-tab-placeholder h3 {
  font-size: 16px;
  font-weight: 700;
  color: #181d26;
  margin: 0 0 6px;
}
.main-tab-placeholder p {
  font-size: 13px;
  color: #41454d;
  line-height: 1.5;
  margin: 0 0 16px;
}
.mtp-coming {
  display: inline-block;
  padding: 6px 12px;
  background: #fff4e6;
  border: 1px solid #ffa726;
  color: #e65100;
  font-size: 11px;
  border-radius: 6px;
  font-weight: 500;
  margin-bottom: 12px;
}
.mtp-link {
  display: inline-block;
  margin-top: 8px;
  padding: 8px 16px;
  background: #0068ff;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.mtp-link:hover {
  background: #0050cc;
}

/* ════════════════════════════════════════════════════════════
   SP (Sales Panel) — Visual Hierarchy v2
   2026-07-27 — Redesign: #f0f7ff base, borderless sections,
   3-size typography (18/14/11px), 20px metrics, pill CTA
   ════════════════════════════════════════════════════════════ */

/* ── Typography scale — 3 sizes only ── */
.sp-text-header {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}
.sp-text-body {
  font-size: 14px;
  font-weight: 400;
  color: #334155;
  line-height: 1.5;
}
.sp-text-caption {
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
}
.sp-text-metric {
  font-size: 20px;
  font-weight: 800;
  font-family: "Inter", "Roboto", monospace;
  line-height: 1.2;
}

/* ── Profile Header — Smax reference: white surface, flat rounded fields ── */
.sp-header {
  background: #fff;
  border-bottom: 1px solid #e8eaef;
  padding: 12px 14px 12px;
  flex-shrink: 0;
}
.sp-header-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.sp-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}
.sp-avatar {
  border: 2.5px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.sp-vip-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid #7c3aed;
  pointer-events: none;
}
.sp-name-block {
  flex: 1;
  min-width: 0;
}
.sp-name-input {
  width: 100%;
  font-size: 15px;
  font-weight: 700;
  color: #172b4d;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  outline: none;
  padding: 1px 0;
}
.sp-name-input:hover {
  border-bottom-color: #d6dae2;
}
.sp-name-input:focus {
  border-bottom-color: #2f6fed;
}
.sp-uid-row {
  margin-top: 2px;
}
.sp-uid-badge {
  font-size: 11px;
  color: #7a869a;
  background: transparent;
  padding: 0;
  border-radius: 0;
  letter-spacing: 0.01em;
}

/* Detail fields — Smax stacks full-width pill rows with a leading icon */
.sp-detail-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.sp-field {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f4f5f7;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 10px;
  min-width: 0;
  height: 38px;
  box-sizing: border-box;
  transition:
    background 0.14s ease,
    border-color 0.14s ease;
}
.sp-field:hover {
  background: #eef0f3;
}
.sp-field:focus-within {
  background: #fff;
  border-color: #2f6fed;
}
.sp-field-icon {
  font-size: 13px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: #7a869a;
  opacity: 0.75;
}
.sp-field-label {
  font-size: 11px;
  font-weight: 500;
  color: #7a869a;
  flex-shrink: 0;
  white-space: nowrap;
}
.sp-field-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #172b4d;
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
}
.sp-field-input::placeholder {
  color: #a5adba;
  font-weight: 400;
}
.sp-field-select {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #172b4d;
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  cursor: pointer;
  text-align-last: right;
}

/* Customer type chip row */
.sp-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}
.sp-type-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
  flex-shrink: 0;
}
.sp-type-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  transition: all 0.2s;
  cursor: pointer;
}
.sp-chip-vip {
  background: #ede9fe;
  color: #6d28d9;
}
.sp-chip-loyal {
  background: #cffafe;
  color: #0e7490;
}
.sp-chip-new {
  background: #dcfce7;
  color: #15803d;
}
.sp-type-ghost-select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
}

/* ── Pill Tabs — Material Symbols ── */
.sp-pill-nav {
  background: #fff;
  border-bottom: 1px solid #e8eaef;
  padding: 8px 10px;
  flex-shrink: 0;
}
.sp-pill-tabs {
  display: flex;
  gap: 3px;
  background: #f4f5f7;
  border-radius: 10px;
  padding: 3px;
}
.sp-pill-tab {
  flex: 1;
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 5px 2px;
  font-size: 10px;
  font-weight: 600;
  color: #7a869a;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  outline: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-family: inherit;
}
.sp-pill-tab:hover {
  background: #fff;
  color: #2f6fed;
}
.sp-pill-tab.active {
  background: #2f6fed;
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(47, 111, 237, 0.28);
}
.sp-tab-icon {
  font-size: 16px !important;
  font-variation-settings:
    "FILL" 0,
    "wght" 400,
    "GRAD" 0,
    "opsz" 20;
  line-height: 1;
}
.sp-pill-tab.active .sp-tab-icon {
  font-variation-settings:
    "FILL" 1,
    "wght" 500,
    "GRAD" 0,
    "opsz" 20;
}

/* ── Tab Content — neutral Smax canvas ── */
.sp-tab-content {
  flex: 1;
  overflow-y: auto;
  background: #fff;
}
.sp-pane {
  padding: 14px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sp-pane-padded {
  padding: 12px;
}

/* ── Section Header — Smax uses a left accent bar, not an underline ── */
.sp-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 0 8px;
  border-bottom: none;
  border-left: 3px solid #2f6fed;
}
.sp-section-icon {
  font-size: 16px !important;
  color: #2f6fed;
  font-variation-settings:
    "FILL" 0,
    "wght" 400,
    "GRAD" 0,
    "opsz" 20;
}
.sp-section-title {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  color: #172b4d;
}

/* Legacy sp-glass-card kept for other tabs; stripped in Overview -->
.sp-glass-card {
  background: #fff;
  border: 1px solid #e8eaef;
  border-radius: 12px;
  padding: 12px 14px;
}
.sp-card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.sp-card-icon { font-size: 14px; }
.sp-card-title { flex: 1; font-size: 12px; font-weight: 700; color: #1E293B; }
.sp-card-badge-mvp {
  font-size: 9px; font-weight: 800; background: #FEF3C7; color: #B45309;
  padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase;
}
.sp-card-badge-count {
  font-size: 10px; font-weight: 700; background: #0068FF; color: #FFF;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
}

/* ── Customer 360 — borderless stat grid ── */
.sp-c360-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 116px;
  color: #7a869a;
  font-size: 12px;
}
.sp-c360-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.sp-c360-stat {
  background: #f4f5f7;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: none;
}
.sp-c360-full {
  grid-column: 1 / -1;
}

/* ── Typography inside stats ── */
.sp-c360-label {
  font-size: 11px;
  color: #7a869a;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sp-c360-val {
  font-size: 20px;
  font-weight: 800;
  color: #172b4d;
  font-family: "Inter", "Roboto", monospace;
  line-height: 1.2;
}
.sp-c360-debt-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sp-debt-warn {
  font-size: 18px !important;
  color: #dc2626;
  font-variation-settings:
    "FILL" 1,
    "wght" 600,
    "GRAD" 0,
    "opsz" 20;
}
.sp-val-danger {
  color: #dc2626 !important;
}
.sp-val-ok {
  color: #16a34a !important;
}
.sp-val-primary {
  color: #2f6fed !important;
}
/* Vàng/cam — cảnh báo nhẹ cho Phiếu tạm */
.sp-val-warn {
  color: #d97706 !important;
}
/* Chú thích nhỏ bên dưới giá trị stat */
.sp-c360-sublabel {
  font-size: 10px;
  color: #a5adba;
  font-weight: 500;
  margin-top: 1px;
}
.sp-purchased-products,
.sp-recent-timeline {
  margin-top: 14px;
}
.sp-product-list,
.sp-timeline-list {
  border: 1px solid #e8eaef;
  border-radius: 10px;
  overflow: hidden;
}
.sp-product-row,
.sp-timeline-row {
  padding: 9px 10px;
  border-bottom: 1px solid #eef0f3;
}
.sp-product-row:last-child,
.sp-timeline-row:last-child {
  border-bottom: 0;
}
.sp-product-name {
  color: #172b4d;
  font-size: 12px;
  font-weight: 700;
}
.sp-product-meta,
.sp-timeline-copy small {
  display: block;
  margin-top: 2px;
  color: #7a869a;
  font-size: 11px;
}
.sp-repeat-badge {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 8px;
  background: #e8f0fe;
  color: #2f6fed;
  font-size: 9px;
  font-weight: 700;
}
.sp-journey-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 8px;
  color: #172b4d;
  font-size: 11.5px;
  line-height: 1.5;
}
.sp-churn-badge {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 9px;
  font-weight: 700;
}
.sp-new-badge {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 8px;
  background: #ecfdf5;
  color: #047857;
  font-size: 9px;
  font-weight: 700;
}
.sp-churn-list {
  margin-bottom: 8px;
}
.sp-timeline-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.sp-timeline-icon {
  color: #2f6fed;
  font-size: 17px;
}
.sp-timeline-copy {
  min-width: 0;
  color: #172b4d;
  font-size: 12px;
  font-weight: 600;
}

/* ── CTA Primary Button — Smax uses a flat rounded-rect, not a glowing pill ── */
.sp-cta-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 20px;
  background: #2f6fed;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: none;
  transition: background 0.18s ease;
  letter-spacing: 0.01em;
}
.sp-cta-primary:hover {
  background: #2559c9;
  box-shadow: none;
  transform: none;
}
.sp-cta-primary:active {
  transform: none;
  box-shadow: none;
  background: #1f4baa;
}
.sp-cta-icon {
  font-size: 18px !important;
  font-variation-settings:
    "FILL" 0,
    "wght" 400,
    "GRAD" 0,
    "opsz" 20;
}

/* ── Appointment list ── */
.sp-appt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sp-appt-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #f4f5f7;
  border-left: 3px solid #2f6fed;
  border-radius: 0 8px 8px 0;
  padding: 8px 12px;
}
.sp-appt-icon-ms {
  font-size: 16px !important;
  color: #2f6fed;
  flex-shrink: 0;
  margin-top: 1px;
  font-variation-settings:
    "FILL" 0,
    "wght" 400,
    "GRAD" 0,
    "opsz" 20;
}
.sp-appt-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sp-appt-date {
  font-size: 13px;
  font-weight: 700;
  color: #0369a1;
}
.sp-appt-note {
  font-size: 11px;
  color: #475569;
}

/* Empty state */
.sp-empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.sp-empty-icon-ms {
  font-size: 18px !important;
  opacity: 0.4;
  color: #64748b;
  font-variation-settings:
    "FILL" 0,
    "wght" 300,
    "GRAD" 0,
    "opsz" 20;
}
.sp-empty-text {
  font-size: 13px;
  color: #94a3b8;
}

/* ── Coming Soon — 1 dòng xám nhạt ── */
.sp-future-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #b0c4de;
  padding: 4px 2px;
  border-top: 1px dashed #dbeafe;
  margin-top: 4px;
}
.sp-future-icon {
  font-size: 13px !important;
  opacity: 0.6;
  font-variation-settings:
    "FILL" 0,
    "wght" 300,
    "GRAD" 0,
    "opsz" 20;
}

/* ══ POS Status Block (Overview Tab) ══ */
.sp-pos-overview-block {
  background: #f4f5f7;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
}
/* Linked state */
.sp-pos-linked-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.sp-pos-linked-info {
  flex: 1;
  min-width: 0;
}
.sp-pos-linked-name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-pos-linked-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: #64748b;
  margin-top: 2px;
}
.sp-pos-code-chip {
  background: #e6edfd;
  color: #2f6fed;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.sp-pos-address {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Loading state */
.sp-pos-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}
/* Suggest state */
.sp-pos-suggest-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sp-pos-suggest-text {
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}
.sp-pos-suggest-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
/* Unlinked state */
.sp-pos-unlinked {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sp-pos-unlinked-text {
  font-size: 12px;
  color: #94a3b8;
}
.sp-pos-unlinked-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
/* Linked actions row */
.sp-pos-linked-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* ── Customer 360 / Orders: POS not linked empty states ── */
.sp-c360-unlinked-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 12px;
  text-align: center;
  gap: 4px;
}
.sp-c360-unlinked-icon {
  font-size: 28px;
  color: #cbd5e1;
  margin-bottom: 4px;
}
.sp-c360-unlinked-text {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
}
.sp-c360-unlinked-hint {
  font-size: 11px;
  color: #cbd5e1;
  line-height: 1.4;
}
.sp-c360-retry {
  margin-top: 6px;
  border: 0;
  background: transparent;
  color: #2f6fed;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.sp-orders-unlinked {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  text-align: center;
  gap: 4px;
}
.sp-orders-unlinked-icon {
  font-size: 32px;
  color: #cbd5e1;
  margin-bottom: 6px;
}
.sp-orders-unlinked-title {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
}
.sp-orders-unlinked-hint {
  font-size: 11px;
  color: #cbd5e1;
  line-height: 1.4;
  max-width: 180px;
}
/* Disabled CTA button */
.sp-cta-primary.sp-cta-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* ══ Orders Tab Header ══ */
.sp-orders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 8px;
  margin-bottom: 4px;
}
.sp-orders-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}
.sp-orders-count {
  background: #0068ff;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

/* ══ SP Orders Cards Container (Khung chứa các thẻ đơn hàng) ══ */
.sp-orders-cards-container {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 340px;
}

.sp-order-card {
  position: relative;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 11px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.sp-order-card:hover {
  border-color: #0068ff;
  transform: translateY(-1.5px);
  box-shadow: 0 4px 14px rgba(0, 104, 255, 0.1);
}

.sp-order-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}

.sp-order-card__code-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
}

.sp-order-card__code-icon {
  font-size: 14px !important;
  color: #0068ff;
}

.sp-order-card__code {
  font-size: 12px;
  font-weight: 800;
  color: #0068ff;
  letter-spacing: -0.01em;
}

/* Status Badges */
.sp-order-card__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.sp-order-card__status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sp-status--draft {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fef3c7;
}
.sp-status--draft .sp-order-card__status-dot {
  background: #f59e0b;
}

.sp-status--confirmed {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}
.sp-status--confirmed .sp-order-card__status-dot {
  background: #3b82f6;
}

.sp-status--success {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.sp-status--success .sp-order-card__status-dot {
  background: #10b981;
}

.sp-status--cancelled {
  background: #fff1f2;
  color: #e11d48;
  border: 1px solid #fecdd3;
}
.sp-status--cancelled .sp-order-card__status-dot {
  background: #f43f5e;
}

/* Products */
.sp-order-card__products {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 5px;
  padding-left: 1px;
}

.sp-order-card__item-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #334155;
  min-width: 0;
}

.sp-order-card__item-name {
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.sp-order-card__item-qty {
  font-size: 10px;
  color: #64748b;
  font-weight: 600;
  flex-shrink: 0;
}

.sp-order-card__more {
  font-size: 10px;
  color: #0068ff;
  font-weight: 600;
  margin-top: 1px;
}

/* Footer */
.sp-order-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 5px;
  border-top: 1px dashed #e2e8f0;
}

.sp-order-card__date {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #94a3b8;
  font-weight: 500;
}

.sp-order-card__date-icon {
  font-size: 12px !important;
  color: #94a3b8;
}

.sp-order-card__price {
  font-size: 12px;
  font-weight: 800;
  color: #0068ff;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

/* Hover hint */
.sp-order-card__hover-hint {
  display: none;
  align-items: center;
  gap: 3px;
  position: absolute;
  bottom: 5px;
  right: 10px;
  font-size: 10px;
  font-weight: 700;
  color: #0068ff;
  background: #ffffff;
  padding-left: 4px;
}

.sp-order-card:hover .sp-order-card__hover-hint {
  display: flex;
}

/* ══ SP Orders Pagination Bar (Tách riêng ngoài box đơn hàng, vị trí cố định) ══ */
.sp-orders-pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
}

.sp-pg-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sp-pg-btn:hover:not(:disabled) {
  border-color: #0068ff;
  color: #0068ff;
  background: #eff6ff;
  transform: translateY(-1px);
}

.sp-pg-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: #f8fafc;
  border-color: #e2e8f0;
}

.sp-pg-text {
  font-size: 11px;
  color: #64748b;
  user-select: none;
}

.sp-pg-text strong {
  color: #0068ff;
  font-weight: 700;
}

/* ══ Header POS Status Badge ══ */
.sp-pos-badge-row {
  display: flex;
  align-items: center;
  margin-top: 4px;
}
.sp-pos-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1.2;
}
.sp-pos-badge-icon {
  font-size: 13px !important;
}
.sp-pos-badge-linked {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}
.sp-pos-badge-suggest {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}
.sp-pos-badge-unlinked {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}
</style>
