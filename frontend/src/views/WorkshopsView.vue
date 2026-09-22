<template>
  <div
    ref="workshopViewRef"
    class="workshop-view pa-4"
    @scroll="handleScroll"
  >
    <!-- Header Page -->
    <div class="d-flex flex-wrap align-center justify-space-between mb-4 ga-3">
      <div>
        <h1 class="text-h4 font-weight-bold d-flex align-center">
          <v-icon color="primary" class="mr-3">mdi-school-outline</v-icon>
          Sự kiện &amp; Workshop
        </h1>
        <p class="text-body-2 text-medium-emphasis mt-1">
          Quản lý toàn diện 4 nhóm dữ liệu Workshop Public API v1 &amp; Phân tích Chuyển đổi Doanh thu POS.
        </p>
      </div>

      <div class="d-flex align-center ga-2">
        <v-btn
          v-if="authStore.isAdmin"
          color="primary"
          prepend-icon="mdi-cloud-sync"
          to="/sync-center"
          class="text-none font-weight-medium"
        >
          Trung tâm đồng bộ
        </v-btn>
        <v-chip
          v-else
          color="success"
          variant="tonal"
          size="small"
          prepend-icon="mdi-database-check"
          class="font-weight-medium"
        >
          Dữ liệu đồng bộ sẵn sàng
        </v-chip>
        <v-btn
          variant="tonal"
          icon="mdi-refresh"
          title="Tải lại toàn bộ dữ liệu"
          :loading="loadingWorkshops"
          @click="loadAllData"
        />
      </div>
    </div>

    <!-- Alert thông báo lỗi / thành công -->
    <v-alert
      v-if="errorMessage"
      type="error"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="errorMessage = ''"
    >
      {{ errorMessage }}
    </v-alert>

    <v-alert
      v-if="successMessage"
      type="success"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="successMessage = ''"
    >
      {{ successMessage }}
    </v-alert>

    <!-- Connection Status Card -->
    <v-card class="mb-4 pa-4" variant="outlined" rounded="lg">
      <div class="d-flex flex-wrap align-center justify-space-between ga-3">
        <div class="d-flex align-center flex-wrap ga-3">
          <v-chip
            :color="status?.configured ? 'success' : 'warning'"
            variant="flat"
            size="small"
            class="font-weight-medium text-no-wrap"
          >
            <v-icon start size="14">{{ status?.configured ? 'mdi-check-circle' : 'mdi-alert-circle' }}</v-icon>
            {{ status?.configured ? 'Đã cấu hình API' : 'Chưa cấu hình API' }}
          </v-chip>

          <span v-if="status?.baseUrl" class="text-body-2 font-weight-medium text-no-wrap">
            Base URL: <code class="px-2 py-1 bg-surface-variant rounded">{{ status.baseUrl }}</code>
          </span>

          <span v-if="status?.keyHint" class="text-caption text-medium-emphasis text-no-wrap">
            API Key: <code>{{ status.keyHint }}</code>
          </span>

          <!-- Rate Limit Quota (Quy định 120 req/min) -->
          <v-chip
            v-if="status?.rateLimit?.limit"
            size="small"
            variant="tonal"
            color="info"
            class="text-no-wrap font-weight-medium"
          >
            <v-icon start size="14">mdi-speedometer</v-icon>
            Quota: {{ status.rateLimit.remaining ?? '—' }}&nbsp;/&nbsp;{{ status.rateLimit.limit }} req/phút
          </v-chip>
        </div>

        <div class="d-flex align-center flex-wrap ga-2">
          <!-- Documentation Links theo quy chuẩn public-api (2).md -->
          <template v-if="status?.docs">
            <v-btn
              :href="status.docs.swagger"
              target="_blank"
              size="x-small"
              variant="outlined"
              color="primary"
              prepend-icon="mdi-api"
              class="text-no-wrap"
            >
              Swagger UI
            </v-btn>
            <v-btn
              :href="status.docs.redoc"
              target="_blank"
              size="x-small"
              variant="outlined"
              color="secondary"
              prepend-icon="mdi-book-open-outline"
              class="text-no-wrap"
            >
              ReDoc
            </v-btn>
            <v-btn
              :href="status.docs.openapi"
              target="_blank"
              size="x-small"
              variant="text"
              prepend-icon="mdi-code-json"
              class="text-no-wrap"
            >
              OpenAPI JSON
            </v-btn>
          </template>

          <v-chip
            v-if="status?.health"
            :color="status.health.ok ? 'success' : 'error'"
            size="small"
            variant="tonal"
            class="text-no-wrap"
          >
            {{ status.health.ok ? 'API Kết nối OK' : 'Không kết nối được' }}
          </v-chip>

          <span v-if="lastSyncAt" class="text-caption text-medium-emphasis text-no-wrap">
            Đồng bộ: {{ lastSyncAt }}
          </span>
        </div>
      </div>
    </v-card>

    <!-- HỆ THỐNG 5 TAB CHUYÊN BIỆT (PHASE 2 & PHASE 3) -->
    <v-tabs
      v-model="activeTab"
      color="primary"
      density="comfortable"
      class="mb-4 border-b"
    >
      <v-tab value="workshops" class="text-none font-weight-bold">
        <v-icon start>mdi-school-outline</v-icon>
        1. Sự kiện &amp; Chi tiết ({{ workshops.length }})
      </v-tab>
      <v-tab value="guests" class="text-none font-weight-bold">
        <v-icon start>mdi-account-group-outline</v-icon>
        2. Khách mời &amp; Tra cứu
      </v-tab>
      <v-tab value="checkins" class="text-none font-weight-bold">
        <v-icon start>mdi-clipboard-check-outline</v-icon>
        3. Nhật ký Check-in
        <v-chip v-if="checkinLogs.length > 0" size="x-small" color="primary" class="ml-2 font-weight-bold">
          {{ checkinLogs.length }}
        </v-chip>
      </v-tab>
      <v-tab value="forms" class="text-none font-weight-bold">
        <v-icon start>mdi-form-select</v-icon>
        4. Biểu mẫu Đăng ký
        <v-chip v-if="registrationForms.length > 0" size="x-small" color="secondary" class="ml-2 font-weight-bold">
          {{ registrationForms.length }}
        </v-chip>
      </v-tab>
      <v-tab value="sales" class="text-none font-weight-bold">
        <v-icon start color="success">mdi-cash-multiple</v-icon>
        5. Hiệu quả Doanh thu &amp; Chuyển đổi POS
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- TAB 1: SỰ KIỆN & WORKSHOP (NHÓM 1)                                -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <v-window-item value="workshops">
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between px-4 py-3 ga-2">
            <div class="d-flex align-center ga-2 flex-wrap">
              <v-icon color="primary" size="20">mdi-format-list-bulleted</v-icon>
              <span class="text-subtitle-1 font-weight-bold">Danh sách Workshop ({{ workshops.length }})</span>
            </div>
            <div class="d-flex align-center ga-2" style="max-width: 320px; width: 100%;">
              <v-text-field
                v-model="workshopSearch"
                placeholder="Tìm tên hoặc chi nhánh..."
                prepend-inner-icon="mdi-magnify"
                density="compact"
                variant="outlined"
                hide-details
                clearable
              />
            </div>
          </v-card-title>

          <v-divider />

          <v-data-table
            :headers="workshopHeaders"
            :items="filteredWorkshops"
            :loading="loadingWorkshops"
            hover
            density="comfortable"
            class="elevation-0 workshop-table"
            no-data-text="Chưa có dữ liệu workshop nào. Vui lòng bấm 'Đồng bộ ngay' để kéo dữ liệu về."
          >
            <template #item="{ item }">
              <tr
                :class="{ 'selected-row': selectedWorkshop?.id === item.id }"
                class="cursor-pointer"
                @click="selectWorkshop(item)"
              >
                <td>
                  <div class="font-weight-bold text-body-1">{{ item.title }}</div>
                  <div class="text-caption text-medium-emphasis font-mono">
                    slug: {{ item.slug }}
                  </div>
                </td>
                <td class="text-no-wrap">
                  <div>{{ formatDateTime(item.startsAt) }}</div>
                  <div class="text-caption text-medium-emphasis">đến {{ formatDateTime(item.endsAt) }}</div>
                </td>
                <td>
                  <span v-if="item.location" class="text-body-2">
                    <v-icon size="14" class="mr-1">mdi-map-marker-outline</v-icon>
                    {{ item.location }}
                  </span>
                  <span v-else class="text-medium-emphasis text-caption">—</span>
                </td>
                <td class="text-center text-no-wrap">
                  <v-chip size="small" variant="tonal" color="primary">
                    {{ item.guestCount }}&nbsp;khách
                    <template v-if="item.capacity > 0">&nbsp;/&nbsp;{{ item.capacity }}</template>
                  </v-chip>
                </td>
                <td class="text-center text-no-wrap">
                  <v-chip
                    :color="getStatusColor(item.status)"
                    size="small"
                    variant="flat"
                    class="text-uppercase font-weight-medium"
                  >
                    {{ getStatusLabel(item.status) }}
                  </v-chip>
                </td>
                <td class="text-right text-no-wrap">
                  <v-btn
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-arrow-right-circle"
                    class="text-none"
                    @click.stop="goToWorkshopDetails(item)"
                  >
                    Xem chi tiết
                  </v-btn>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>

        <!-- Panel chi tiết của Workshop đang chọn -->
        <v-card
          v-if="selectedWorkshop"
          class="mb-5"
          variant="outlined"
          rounded="lg"
        >
          <v-card-title class="d-flex flex-wrap align-center justify-space-between px-4 py-3 ga-2 bg-surface-variant">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary">mdi-information-outline</v-icon>
              <span class="text-subtitle-1 font-weight-bold">{{ selectedWorkshop.title }}</span>
              <v-chip size="x-small" variant="outlined">{{ selectedWorkshop.slug }}</v-chip>
            </div>
            <div class="d-flex align-center ga-2">
              <v-btn
                size="small"
                variant="flat"
                color="primary"
                prepend-icon="mdi-account-group"
                class="text-none"
                @click="goToTabGuests(selectedWorkshop)"
              >
                Xem khách mời ({{ selectedWorkshop.guestCount }})
              </v-btn>
              <v-btn
                size="small"
                variant="outlined"
                color="secondary"
                prepend-icon="mdi-clipboard-check-outline"
                class="text-none"
                @click="goToTabCheckins(selectedWorkshop)"
              >
                Xem nhật ký điểm danh
              </v-btn>
              <v-btn
                size="small"
                variant="flat"
                color="success"
                prepend-icon="mdi-cash-multiple"
                class="text-none"
                @click="goToTabSales(selectedWorkshop)"
              >
                Xem doanh thu POS
              </v-btn>
            </div>
          </v-card-title>

          <v-card-text class="pa-4">
            <v-row dense>
              <v-col cols="12" md="6">
                <div class="mb-2">
                  <span class="text-caption text-medium-emphasis">Địa điểm:</span>
                  <div class="text-body-1 font-weight-medium mt-1">
                    {{ selectedWorkshop.location || 'Chưa cập nhật địa điểm' }}
                  </div>
                </div>
                <div class="mb-2">
                  <span class="text-caption text-medium-emphasis">Thời gian tổ chức:</span>
                  <div class="text-body-1 font-weight-medium mt-1">
                    {{ formatDateTime(selectedWorkshop.startsAt) }}
                  </div>
                </div>
                <div v-if="selectedWorkshop.metadata?.branch" class="mb-2">
                  <span class="text-caption text-medium-emphasis">Chi nhánh phụ trách:</span>
                  <div class="text-body-1 font-weight-medium mt-1">
                    {{ selectedWorkshop.metadata.branch }}
                  </div>
                </div>
              </v-col>

              <v-col cols="12" md="6">
                <div class="mb-3">
                  <span class="text-caption text-medium-emphasis">Liên kết sự kiện:</span>
                  <div class="d-flex flex-wrap align-center ga-2 mt-2">
                    <v-btn
                      v-if="selectedWorkshop.metadata?.maps_url"
                      :href="selectedWorkshop.metadata.maps_url"
                      target="_blank"
                      size="small"
                      variant="outlined"
                      color="primary"
                      prepend-icon="mdi-map-marker-radius"
                      class="text-none"
                    >
                      Bản đồ Google Maps
                    </v-btn>
                    <v-btn
                      v-if="selectedWorkshop.metadata?.zalo_group_url"
                      :href="selectedWorkshop.metadata.zalo_group_url"
                      target="_blank"
                      size="small"
                      variant="outlined"
                      color="success"
                      prepend-icon="mdi-chat"
                      class="text-none"
                    >
                      Nhóm Zalo hỗ trợ
                    </v-btn>
                    <v-btn
                      v-if="selectedWorkshop.metadata?.registration_short_url"
                      :href="selectedWorkshop.metadata.registration_short_url"
                      target="_blank"
                      size="small"
                      variant="outlined"
                      color="secondary"
                      prepend-icon="mdi-link-variant"
                      class="text-none"
                    >
                      Trang đăng ký
                    </v-btn>
                  </div>
                </div>

                <div v-if="selectedWorkshop.description">
                  <span class="text-caption text-medium-emphasis">Mô tả / Thông tin thêm:</span>
                  <div class="text-body-2 text-medium-emphasis mt-1 pa-2 bg-surface-variant rounded">
                    {{ selectedWorkshop.description }}
                  </div>
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-window-item>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- TAB 2: KHÁCH MỜI & TRA CỨU (NHÓM 2)                               -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <v-window-item value="guests">
        <!-- Khung Tra cứu Khách mời Trực tiếp (Live Lookup) -->
        <v-card class="mb-5 pa-4" variant="outlined" rounded="lg">
          <div class="d-flex align-center ga-2 mb-3">
            <v-icon color="primary">mdi-account-search-outline</v-icon>
            <span class="text-subtitle-1 font-weight-bold">Tra cứu Khách mời Trực tiếp (Live Guest Lookup)</span>
            <v-chip size="x-small" color="info" variant="tonal">GET /guests/lookup</v-chip>
          </div>
          <p class="text-caption text-medium-emphasis mb-3">
            Tra cứu theo thời gian thực từ máy chủ Workshop Public API theo Workshop và Số điện thoại / Email.
          </p>

          <v-row dense class="align-center">
            <v-col cols="12" md="5">
              <v-autocomplete
                v-model="lookupWorkshopSlug"
                :items="workshops"
                item-title="title"
                item-value="slug"
                label="Chọn Workshop cần tra cứu *"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Chọn một sự kiện..."
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="lookupQuery"
                label="Số điện thoại hoặc Email *"
                placeholder="vd: 0987654321..."
                prepend-inner-icon="mdi-cellphone"
                density="compact"
                variant="outlined"
                hide-details
                @keyup.enter="performLiveLookup"
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-btn
                color="primary"
                prepend-icon="mdi-magnify"
                block
                :loading="lookingUp"
                class="text-none"
                @click="performLiveLookup"
              >
                Tra cứu ngay
              </v-btn>
            </v-col>
          </v-row>

          <!-- Kết quả tra cứu Live -->
          <div v-if="lookupResult" class="mt-4 pa-3 bg-surface-variant rounded-lg">
            <div v-if="lookupResult.found && lookupResult.guest" class="d-flex flex-wrap justify-space-between align-center ga-3">
              <div>
                <div class="d-flex align-center ga-2">
                  <span class="text-subtitle-1 font-weight-bold">{{ lookupResult.guest.full_name }}</span>
                  <v-chip size="small" :color="getGuestStatusColor(lookupResult.guest.checkin_status === 'checked_in' ? 'ATTENDED' : 'REGISTERED')">
                    {{ lookupResult.guest.checkin_status === 'checked_in' ? 'Đã Check-in' : 'Đã đăng ký vé' }}
                  </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis mt-1">
                  SĐT: <strong>{{ lookupResult.guest.phone }}</strong>
                  <span v-if="lookupResult.guest.email" class="ml-2">Email: {{ lookupResult.guest.email }}</span>
                  <span v-if="lookupResult.guest.business_model" class="ml-2">• Mô hình: {{ lookupResult.guest.business_model }}</span>
                  <span v-if="lookupResult.guest.company" class="ml-2">• Đơn vị: {{ lookupResult.guest.company }}</span>
                </div>
              </div>
              <div class="text-right">
                <div class="text-caption text-medium-emphasis">Số vé đi cùng: <strong>{{ lookupResult.guest.party_size || 1 }}</strong></div>
                <div class="text-caption text-medium-emphasis">Đăng ký: {{ formatDateTime(lookupResult.guest.registered_at) }}</div>
              </div>
            </div>
            <div v-else class="text-body-2 text-medium-emphasis">
              <v-icon color="warning" class="mr-1">mdi-information-outline</v-icon>
              Không tìm thấy khách mời nào phù hợp với thông tin đã nhập trên buổi workshop này.
            </div>
          </div>
        </v-card>

        <!-- Bảng Khách mời theo Workshop được chọn -->
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between px-4 py-3 ga-3 bg-surface-variant">
            <div class="d-flex align-center flex-wrap ga-3">
              <v-icon color="primary">mdi-account-multiple</v-icon>
              <div style="min-width: 280px;">
                <v-select
                  v-model="selectedWorkshopId"
                  :items="workshops"
                  item-title="title"
                  item-value="id"
                  density="compact"
                  variant="solo"
                  hide-details
                  class="workshop-selector"
                  @update:model-value="onSelectWorkshopChange"
                />
              </div>
              <v-chip v-if="selectedWorkshop" size="small" variant="outlined">
                {{ selectedWorkshop.slug }}
              </v-chip>
            </div>

            <div class="d-flex align-center ga-2">
              <v-btn
                v-if="authStore.isAdmin"
                size="small"
                color="primary"
                variant="flat"
                prepend-icon="mdi-sync"
                :loading="syncingGuests"
                class="text-none"
                @click="syncGuestsForSelected"
              >
                Đồng bộ khách buổi này
              </v-btn>
              <v-btn
                size="small"
                variant="outlined"
                icon="mdi-refresh"
                title="Tải lại danh sách khách từ DB"
                :loading="loadingGuests"
                @click="selectedWorkshop && loadGuestsForWorkshop(selectedWorkshop.id)"
              />
            </div>
          </v-card-title>

          <!-- KPI Mini Bar -->
          <v-card-text class="py-3 px-4 border-b">
            <v-row dense>
              <v-col cols="6" sm="3" md="2">
                <div class="text-caption text-medium-emphasis">Tổng khách đăng ký</div>
                <div class="text-h6 font-weight-bold">{{ guestStats.totalGuests }}</div>
              </v-col>
              <v-col cols="6" sm="3" md="2">
                <div class="text-caption text-medium-emphasis">Đã check-in (Tham gia)</div>
                <div class="text-h6 font-weight-bold text-success">{{ guestStats.attendedCount }}</div>
              </v-col>
              <v-col cols="6" sm="3" md="2">
                <div class="text-caption text-medium-emphasis">Chờ điểm danh</div>
                <div class="text-h6 font-weight-bold text-warning">{{ guestStats.registeredCount }}</div>
              </v-col>
              <v-col cols="6" sm="3" md="2">
                <div class="text-caption text-medium-emphasis">Đã khớp CRM Contact</div>
                <div class="text-h6 font-weight-bold text-primary">{{ guestStats.linkedCount }}</div>
              </v-col>
              <v-col cols="6" sm="3" md="2">
                <div class="text-caption text-medium-emphasis">Tỷ lệ tham dự</div>
                <div class="text-h6 font-weight-bold">{{ guestStats.attendanceRate }}%</div>
              </v-col>
            </v-row>
          </v-card-text>

          <!-- Filter & Search Toolbar -->
          <div class="px-4 py-3 d-flex flex-wrap align-center justify-space-between ga-3 border-b">
            <div class="d-flex align-center ga-2">
              <v-btn-toggle
                v-model="guestStatusFilter"
                mandatory
                density="compact"
                color="primary"
                variant="outlined"
              >
                <v-btn value="ALL" size="small" class="text-none">Tất cả ({{ guests.length }})</v-btn>
                <v-btn value="ATTENDED" size="small" class="text-none">Đã Check-in ({{ guestStats.attendedCount }})</v-btn>
                <v-btn value="REGISTERED" size="small" class="text-none">Chưa check-in ({{ guestStats.registeredCount }})</v-btn>
              </v-btn-toggle>
            </div>

            <div style="max-width: 320px; width: 100%;">
              <v-text-field
                v-model="guestSearch"
                placeholder="Tìm khách theo tên, SĐT, mã QR..."
                prepend-inner-icon="mdi-magnify"
                density="compact"
                variant="outlined"
                hide-details
                clearable
              />
            </div>
          </div>

          <!-- Guest Data Table -->
          <v-data-table
            :headers="guestHeaders"
            :items="filteredGuests"
            :loading="loadingGuests"
            density="comfortable"
            hover
            class="elevation-0 guest-table"
            fixed-header
            height="550px"
            no-data-text="Không có khách mời nào phù hợp."
          >
            <template #item="{ item }">
              <tr>
                <td>
                  <div class="font-weight-bold">{{ item.fullName }}</div>
                  <div class="text-caption text-medium-emphasis d-flex align-center ga-2">
                    <span>{{ item.phone }}</span>
                    <span v-if="item.email">| {{ item.email }}</span>
                  </div>
                  <div v-if="item.notes" class="text-caption text-primary text-truncate" style="max-width: 280px;" :title="item.notes">
                    {{ item.notes }}
                  </div>
                </td>
                <td class="text-center text-no-wrap">
                  <v-chip
                    :color="getGuestStatusColor(item.status)"
                    size="small"
                    variant="flat"
                    class="font-weight-medium text-uppercase"
                  >
                    {{ getGuestStatusLabel(item.status) }}
                  </v-chip>
                  <div v-if="item.checkedInAt" class="text-caption text-medium-emphasis mt-1">
                    {{ formatDateTime(item.checkedInAt) }}
                  </div>
                </td>
                <td class="text-center font-weight-bold">
                  {{ item.partySize }}
                </td>
                <td>
                  <span v-if="item.source" class="text-body-2">{{ item.source }}</span>
                  <span v-else class="text-medium-emphasis text-caption">—</span>
                </td>
                <td class="text-no-wrap">
                  <div class="text-body-2">{{ formatDateTime(item.registeredAt) }}</div>
                </td>
                <td>
                  <div v-if="item.contact" class="d-flex align-center ga-2">
                    <v-avatar size="28" color="primary" variant="tonal">
                      <v-img v-if="item.contact.avatarUrl" :src="item.contact.avatarUrl" />
                      <span v-else class="text-caption font-weight-bold">
                        {{ item.contact.fullName ? item.contact.fullName.charAt(0).toUpperCase() : 'C' }}
                      </span>
                    </v-avatar>
                    <div>
                      <div class="text-body-2 font-weight-medium">{{ item.contact.fullName }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.contact.phone }}</div>
                    </div>
                  </div>
                  <v-chip v-else size="x-small" variant="outlined" color="medium-emphasis">
                    Chưa khớp
                  </v-chip>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- TAB 3: NHẬT KÝ CHECK-IN (NHÓM 3)                                  -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <v-window-item value="checkins">
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between px-4 py-3 ga-3 bg-surface-variant">
            <div class="d-flex align-center flex-wrap ga-3">
              <v-icon color="primary">mdi-history</v-icon>
              <span class="text-subtitle-1 font-weight-bold">Nhật ký Check-in Thời gian thực (Live Logs)</span>
              <div style="min-width: 320px;">
                <v-select
                  v-model="selectedCheckinWorkshopId"
                  :items="workshopsWithLogsList"
                  item-title="titleWithCount"
                  item-value="externalOrId"
                  density="compact"
                  variant="solo"
                  hide-details
                  placeholder="Chọn Workshop để xem nhật ký..."
                  @update:model-value="loadCheckinLogs"
                />
              </div>
            </div>

            <div class="d-flex align-center ga-2">
              <v-btn
                size="small"
                variant="outlined"
                color="primary"
                prepend-icon="mdi-refresh"
                :loading="loadingCheckinLogs"
                class="text-none"
                @click="loadCheckinLogs"
              >
                Làm mới nhật ký
              </v-btn>
            </div>
          </v-card-title>

          <!-- Thống kê Logs -->
          <v-card-text class="py-3 px-4 border-b">
            <div class="d-flex flex-wrap align-center justify-space-between ga-3">
              <div class="d-flex align-center ga-4 flex-wrap">
                <div>
                  <span class="text-caption text-medium-emphasis">Tổng lượt quét ghi nhận:</span>
                  <span class="text-h6 font-weight-bold ml-2 text-primary">{{ checkinLogsMeta?.total || checkinLogs.length }}&nbsp;lượt</span>
                </div>
                <div>
                  <span class="text-caption text-medium-emphasis">Quét bởi Admin:</span>
                  <span class="text-body-1 font-weight-bold ml-2">{{ countLogsByMethod('admin') }}</span>
                </div>
                <div>
                  <span class="text-caption text-medium-emphasis">Quét tự động (Self-QR):</span>
                  <span class="text-body-1 font-weight-bold ml-2">{{ countLogsByMethod('self_qr') }}</span>
                </div>
              </div>
              <div style="max-width: 300px; width: 100%;">
                <v-text-field
                  v-model="checkinLogSearch"
                  placeholder="Lọc tên khách, người quét..."
                  prepend-inner-icon="mdi-magnify"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                />
              </div>
            </div>
          </v-card-text>

          <!-- Check-in Logs Data Table -->
          <v-data-table
            :headers="checkinLogHeaders"
            :items="filteredCheckinLogs"
            :loading="loadingCheckinLogs"
            density="comfortable"
            hover
            class="elevation-0"
            fixed-header
            height="550px"
            no-data-text="Không có nhật ký check-in nào cho workshop này."
          >
            <template #item="{ item }">
              <tr>
                <td class="text-no-wrap">
                  <div class="font-weight-medium text-body-2">{{ formatDateTime(item.checkedInAt) }}</div>
                </td>
                <td>
                  <div class="font-weight-bold">{{ item.guestName }}</div>
                  <div v-if="item.guestPhone" class="text-caption text-medium-emphasis">
                    {{ item.guestPhone }}
                  </div>
                </td>
                <td class="text-center text-no-wrap">
                  <v-chip
                    :color="item.method === 'self_qr' ? 'secondary' : 'primary'"
                    size="small"
                    variant="tonal"
                    class="font-weight-medium"
                  >
                    <v-icon start size="14">{{ item.method === 'self_qr' ? 'mdi-qrcode-scan' : 'mdi-shield-account' }}</v-icon>
                    {{ item.method === 'self_qr' ? 'Khách quét QR' : 'Admin check-in' }}
                  </v-chip>
                </td>
                <td>
                  <span class="text-body-2">{{ item.checkedInBy || 'Hệ thống' }}</span>
                </td>
                <td class="text-center">
                  <v-chip size="small" variant="outlined" color="primary">
                    {{ getActualPartySize(item) }}&nbsp;người
                  </v-chip>
                </td>
                <td class="text-center text-no-wrap">
                  <v-chip color="success" size="small" variant="flat">
                    Thành công
                  </v-chip>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- TAB 4: BIỂU MẪU ĐĂNG KÝ (NHÓM 4)                                  -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <v-window-item value="forms">
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between px-4 py-3 ga-3 bg-surface-variant">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary">mdi-form-select</v-icon>
              <span class="text-subtitle-1 font-weight-bold">Danh sách Biểu mẫu Đăng ký (Registration Forms)</span>
              <v-chip size="x-small" color="secondary" variant="tonal">GET /registration-forms/{token}</v-chip>
            </div>

            <v-btn
              size="small"
              variant="outlined"
              color="primary"
              prepend-icon="mdi-refresh"
              :loading="loadingForms"
              class="text-none"
              @click="loadRegistrationForms"
            >
              Làm mới danh sách
            </v-btn>
          </v-card-title>

          <v-card-text class="pa-4 border-b">
            <p class="text-body-2 text-medium-emphasis mb-0">
              Các biểu mẫu đăng ký thu thập được từ cấu hình sự kiện. Mỗi biểu mẫu chứa lời chào, trạng thái mở đơn và danh sách các sự kiện con thuộc chuỗi workshop.
            </p>
          </v-card-text>

          <v-data-table
            :headers="formHeaders"
            :items="registrationForms"
            :loading="loadingForms"
            density="comfortable"
            hover
            class="elevation-0"
            no-data-text="Không tìm thấy biểu mẫu đăng ký nào."
          >
            <template #item="{ item }">
              <tr>
                <td>
                  <div class="font-weight-bold text-body-1">{{ item.title }}</div>
                  <div v-if="item.greeting" class="text-caption text-medium-emphasis mt-1 text-truncate" style="max-width: 400px;" :title="item.greeting">
                    {{ item.greeting }}
                  </div>
                </td>
                <td class="font-mono text-caption">
                  <code class="px-2 py-1 bg-surface-variant rounded">{{ item.token }}</code>
                </td>
                <td class="text-center text-no-wrap">
                  <v-chip
                    :color="item.isActive ? 'success' : 'default'"
                    size="small"
                    variant="flat"
                    class="font-weight-medium"
                  >
                    {{ item.isActive ? 'Đang mở đăng ký' : 'Đã đóng form' }}
                  </v-chip>
                </td>
                <td class="text-center">
                  <v-chip v-if="item.workshops && item.workshops.length > 0" size="small" variant="tonal" color="primary">
                    {{ item.workshops.length }}&nbsp;sự kiện con
                  </v-chip>
                  <span v-else class="text-caption text-medium-emphasis">1 sự kiện</span>
                </td>
                <td class="text-right text-no-wrap">
                  <v-btn
                    v-if="item.registrationUrl"
                    :href="item.registrationUrl"
                    target="_blank"
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-open-in-new"
                    class="text-none mr-2"
                  >
                    Mở form
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="outlined"
                    color="secondary"
                    prepend-icon="mdi-eye-outline"
                    class="text-none"
                    @click="viewFormDetail(item)"
                  >
                    Chi tiết
                  </v-btn>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>

        <!-- Dialog xem chi tiết Form Đăng ký -->
        <v-dialog v-model="showFormDialog" max-width="750px">
          <v-card v-if="selectedForm">
            <v-card-title class="d-flex align-center justify-space-between bg-surface-variant pa-4">
              <span class="text-h6 font-weight-bold">{{ selectedForm.title }}</span>
              <v-btn icon="mdi-close" variant="text" size="small" @click="showFormDialog = false" />
            </v-card-title>
            <v-card-text class="pa-4">
              <div class="mb-3">
                <span class="text-caption text-medium-emphasis">Trạng thái:</span>
                <v-chip :color="selectedForm.isActive ? 'success' : 'default'" size="small" class="ml-2">
                  {{ selectedForm.isActive ? 'Đang hoạt động' : 'Đã đóng' }}
                </v-chip>
              </div>
              <div v-if="selectedForm.greeting" class="mb-3">
                <span class="text-caption text-medium-emphasis">Lời chào giới thiệu:</span>
                <div class="pa-3 bg-surface-variant rounded mt-1 text-body-2 whitespace-pre-line">
                  {{ selectedForm.greeting }}
                </div>
              </div>
              <div v-if="selectedForm.workshops && selectedForm.workshops.length > 0">
                <span class="text-caption text-medium-emphasis font-weight-bold">Danh sách sự kiện trực thuộc biểu mẫu:</span>
                <v-list density="compact" class="mt-2 border rounded">
                  <v-list-item
                    v-for="(w, idx) in selectedForm.workshops"
                    :key="idx"
                    :title="w.name"
                    :subtitle="`${w.event_date || 'Chưa rõ ngày'} • ${w.location || 'Địa điểm cập nhật sau'}`"
                  >
                    <template #prepend>
                      <v-icon color="primary">mdi-calendar-check</v-icon>
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </v-card-text>
            <v-card-actions class="pa-4 border-t justify-end">
              <v-btn
                v-if="selectedForm.registrationUrl"
                :href="selectedForm.registrationUrl"
                target="_blank"
                color="primary"
                variant="flat"
                prepend-icon="mdi-open-in-new"
                class="text-none"
              >
                Mở link đăng ký công khai
              </v-btn>
              <v-btn variant="text" @click="showFormDialog = false">Đóng</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-window-item>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- TAB 5: HIỆU QUẢ DOANH THU & CHUYỂN ĐỔI POS (PHASE 3)              -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <v-window-item value="sales">
        <!-- Control Toolbar Card -->
        <v-card class="mb-4 pa-4" variant="outlined" rounded="lg">
          <div class="d-flex flex-wrap align-center justify-space-between ga-3">
            <div class="d-flex align-center flex-wrap ga-3">
              <div style="min-width: 300px;">
                <v-select
                  v-model="selectedSalesWorkshopId"
                  :items="salesWorkshopFilterList"
                  item-title="title"
                  item-value="id"
                  label="Lọc theo Workshop"
                  density="compact"
                  variant="outlined"
                  hide-details
                  @update:model-value="loadSalesConversion"
                />
              </div>

              <!-- Attribution Window Toggle -->
              <div class="d-flex align-center ga-1">
                <span class="text-caption text-medium-emphasis mr-1">Cửa sổ thời gian:</span>
                <v-btn-toggle
                  v-model="selectedWindowDays"
                  mandatory
                  density="compact"
                  color="primary"
                  variant="outlined"
                  @update:model-value="loadSalesConversion"
                >
                  <v-btn :value="7" size="small" class="text-none">7 ngày</v-btn>
                  <v-btn :value="14" size="small" class="text-none">14 ngày</v-btn>
                  <v-btn :value="30" size="small" class="text-none">30 ngày</v-btn>
                  <v-btn value="ALL" size="small" class="text-none">Tất cả</v-btn>
                </v-btn-toggle>
              </div>
            </div>

            <div class="d-flex align-center ga-2">
              <v-btn
                size="small"
                :variant="showFormulaCard ? 'flat' : 'outlined'"
                color="secondary"
                prepend-icon="mdi-calculator-variant"
                class="text-none"
                @click="showFormulaCard = !showFormulaCard"
              >
                {{ showFormulaCard ? 'Ẩn Thuyết minh Công thức' : 'Xem Thuyết minh Công thức' }}
              </v-btn>

              <v-btn
                size="small"
                variant="outlined"
                color="primary"
                prepend-icon="mdi-refresh"
                :loading="loadingSales"
                class="text-none"
                @click="loadSalesConversion"
              >
                Làm mới phân tích
              </v-btn>
            </div>
          </div>
        </v-card>

        <!-- Khối Thuyết minh Công thức & Nguồn Dữ liệu (Collapsible Card) -->
        <v-expand-transition>
          <v-card
            v-if="showFormulaCard"
            class="mb-5 formula-card"
            variant="outlined"
            rounded="lg"
          >
            <v-card-title class="d-flex align-center justify-space-between px-4 py-3 bg-surface-variant">
              <div class="d-flex align-center ga-2">
                <v-icon color="secondary">mdi-book-open-page-variant</v-icon>
                <span class="text-subtitle-1 font-weight-bold">Thuyết minh Công thức Tính Toán &amp; Nguồn Dữ liệu Quy kết</span>
                <v-chip size="x-small" color="primary" variant="tonal">Module Độc Lập: workshop-attribution-engine.ts</v-chip>
              </div>
              <v-btn
                icon="mdi-close"
                size="small"
                variant="text"
                @click="showFormulaCard = false"
              />
            </v-card-title>

            <v-card-text class="pa-4">
              <!-- Nguồn dữ liệu -->
              <div class="mb-4">
                <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
                  1. Nguồn Dữ Liệu &amp; Điều Kiện Liên Kết (Data Sources)
                </div>
                <v-row dense>
                  <v-col
                    v-for="ds in salesData?.dataSources || []"
                    :key="ds.table"
                    cols="12"
                    md="4"
                    sm="6"
                  >
                    <div class="pa-3 border rounded bg-surface h-100">
                      <div class="d-flex align-center justify-space-between mb-1">
                        <span class="font-weight-bold text-body-2 text-primary">{{ ds.displayName }}</span>
                        <code class="text-caption">{{ ds.table }}</code>
                      </div>
                      <p class="text-caption text-medium-emphasis mb-2">{{ ds.description }}</p>
                      <div class="text-caption">
                        <strong>Trường khóa:</strong> <code class="font-mono">{{ ds.keyFields.slice(0, 4).join(', ') }}...</code>
                      </div>
                      <div class="text-caption text-truncate text-medium-emphasis mt-1" :title="ds.joinCondition">
                        <strong>Join:</strong> {{ ds.joinCondition }}
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </div>

              <v-divider class="my-3" />

              <!-- Danh mục công thức -->
              <div>
                <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
                  2. Danh Mục Công thức Chuẩn hóa (Formula Catalog)
                </div>
                <v-row dense>
                  <v-col
                    v-for="f in salesData?.formulaDefinitions || []"
                    :key="f.id"
                    cols="12"
                    md="6"
                  >
                    <div class="pa-3 border rounded bg-surface h-100 d-flex flex-column justify-space-between">
                      <div>
                        <div class="d-flex align-center justify-space-between mb-1">
                          <span class="font-weight-bold text-body-2">{{ f.name }}</span>
                          <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-bold">{{ f.symbol }}</v-chip>
                        </div>
                        <div class="pa-2 bg-surface-variant rounded font-mono text-caption my-2 text-primary">
                          {{ f.formulaText }}
                        </div>
                        <div class="text-caption text-medium-emphasis mb-1">
                          <strong>Quy tắc lọc:</strong> {{ f.rule }}
                        </div>
                      </div>
                      <div class="text-caption text-success font-weight-medium mt-2 pt-2 border-t">
                        <v-icon start size="14" color="success">mdi-lightbulb-on-outline</v-icon>
                        {{ f.interpretation }}
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </div>
            </v-card-text>
          </v-card>
        </v-expand-transition>

        <!-- Hàng 4 Thẻ KPI Tổng quan -->
        <v-row dense class="mb-4">
          <!-- KPI 1: Doanh thu chuyển đổi -->
          <v-col cols="12" sm="6" md="3">
            <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption text-medium-emphasis">Doanh thu Chuyển đổi</span>
                <v-tooltip location="top" text="Tổng giá trị finalAmount của các đơn POS có orderDate >= ngày sự kiện">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="16" color="medium-emphasis">mdi-information-outline</v-icon>
                  </template>
                </v-tooltip>
              </div>
              <div class="text-h5 font-weight-bold text-success text-no-wrap">
                {{ formatCurrency(salesData?.summary?.totalRevenue) }}
              </div>
              <div class="text-caption text-medium-emphasis mt-1">
                Từ <strong>{{ salesData?.summary?.totalOrders || 0 }}</strong>&nbsp;đơn hàng POS thành công
              </div>
            </v-card>
          </v-col>

          <!-- KPI 2: Tỷ lệ chuyển đổi -->
          <v-col cols="12" sm="6" md="3">
            <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption text-medium-emphasis">Tỷ lệ Chuyển đổi (CR)</span>
                <v-tooltip location="top" text="CR = (Số khách mua hàng / Tổng số khách tham dự) × 100%">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="16" color="medium-emphasis">mdi-information-outline</v-icon>
                  </template>
                </v-tooltip>
              </div>
              <div class="text-h5 font-weight-bold text-primary text-no-wrap">
                {{ salesData?.summary?.overallConversionRate || 0 }}%
              </div>
              <div class="text-caption text-medium-emphasis mt-1">
                <strong>{{ salesData?.summary?.totalBuyers || 0 }}</strong>&nbsp;khách mua&nbsp;/&nbsp;<strong>{{ salesData?.summary?.totalAttended || 0 }}</strong>&nbsp;khách tham dự
              </div>
            </v-card>
          </v-col>

          <!-- KPI 3: AOV -->
          <v-col cols="12" sm="6" md="3">
            <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption text-medium-emphasis">Giá trị Đơn trung bình (AOV)</span>
                <v-tooltip location="top" text="AOV = Tổng doanh thu chuyển đổi / Tổng số đơn hàng chuyển đổi">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="16" color="medium-emphasis">mdi-information-outline</v-icon>
                  </template>
                </v-tooltip>
              </div>
              <div class="text-h5 font-weight-bold text-no-wrap">
                {{ formatCurrency(salesData?.summary?.overallAov) }}
              </div>
              <div class="text-caption text-medium-emphasis mt-1">
                Bình quân trên 1 đơn hàng chuyển đổi
              </div>
            </v-card>
          </v-col>

          <!-- KPI 4: Lift ROI -->
          <v-col cols="12" sm="6" md="3">
            <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption text-medium-emphasis">Tăng trưởng ROI (Lift)</span>
                <v-tooltip location="top" text="Lift = ((CR_Attended - CR_NoShow) / CR_NoShow) × 100%">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="16" color="medium-emphasis">mdi-information-outline</v-icon>
                  </template>
                </v-tooltip>
              </div>
              <div class="text-h5 font-weight-bold text-secondary text-no-wrap">
                +{{ salesData?.summary?.liftRoi || 0 }}%
              </div>
              <div class="text-caption text-medium-emphasis mt-1">
                Tham dự: <strong>{{ salesData?.summary?.attendedCr || 0 }}%</strong> vs Vắng: <strong>{{ salesData?.summary?.noShowCr || 0 }}%</strong>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Bảng 1: So sánh 4 mốc thời gian quy kết -->
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="px-4 py-3 bg-surface-variant d-flex align-center ga-2">
            <v-icon color="primary" size="20">mdi-timeline-clock-outline</v-icon>
            <span class="text-subtitle-1 font-weight-bold">So sánh Doanh thu theo 4 Cửa sổ Thời gian (Attribution Windows)</span>
          </v-card-title>
          <v-data-table
            :headers="windowHeaders"
            :items="windowComparisonList"
            :loading="loadingSales"
            density="comfortable"
            hover
            class="elevation-0"
            no-data-text="Không có dữ liệu cửa sổ thời gian."
          >
            <template #item="{ item }">
              <tr>
                <td class="font-weight-bold text-body-2">
                  {{ item.windowLabel }}
                </td>
                <td class="text-success font-weight-bold text-no-wrap">
                  {{ formatCurrency(item.revenue) }}
                </td>
                <td class="text-center font-weight-bold">
                  {{ item.buyersCount }}&nbsp;khách
                </td>
                <td class="text-center">
                  {{ item.ordersCount }}&nbsp;đơn
                </td>
                <td class="text-no-wrap">
                  {{ formatCurrency(item.aov) }}
                </td>
                <td class="text-center text-no-wrap font-weight-bold text-primary">
                  {{ item.conversionRate }}%
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>

        <!-- Bảng 2: Hiệu quả theo từng Workshop -->
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="px-4 py-3 bg-surface-variant d-flex align-center justify-space-between ga-2">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary" size="20">mdi-chart-box-outline</v-icon>
              <span class="text-subtitle-1 font-weight-bold">Hiệu quả Chuyển đổi theo từng Workshop</span>
            </div>
          </v-card-title>
          <v-data-table
            :headers="workshopSalesHeaders"
            :items="workshopPerformanceList"
            :loading="loadingSales"
            density="comfortable"
            hover
            class="elevation-0"
            no-data-text="Không có dữ liệu hiệu quả workshop."
          >
            <template #item="{ item }">
              <tr>
                <td>
                  <div class="font-weight-bold text-body-2">{{ item.workshopTitle }}</div>
                  <div class="text-caption text-medium-emphasis font-mono">
                    {{ formatDateTime(item.workshopDate) }} • {{ item.branch }}
                  </div>
                </td>
                <td class="text-center">
                  <v-chip size="small" variant="tonal" color="primary">
                    {{ item.attendedGuests }}&nbsp;tham gia
                  </v-chip>
                </td>
                <td class="text-center font-weight-bold">
                  {{ item.buyersCount }}&nbsp;khách
                </td>
                <td class="text-no-wrap text-caption">
                  {{ formatCurrency(item.revenue7d) }}
                </td>
                <td class="text-no-wrap text-caption">
                  {{ formatCurrency(item.revenue14d) }}
                </td>
                <td class="text-no-wrap text-caption">
                  {{ formatCurrency(item.revenue30d) }}
                </td>
                <td class="text-no-wrap font-weight-bold text-success">
                  {{ formatCurrency(item.totalRevenue) }}
                </td>
                <td class="text-center font-weight-bold text-primary text-no-wrap">
                  {{ item.conversionRate }}%
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>

        <!-- Bảng 3: Danh sách Đơn hàng POS Quy kết Chi tiết -->
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="px-4 py-3 bg-surface-variant d-flex flex-wrap align-center justify-space-between ga-2">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary" size="20">mdi-receipt-text-outline</v-icon>
              <span class="text-subtitle-1 font-weight-bold">
                Danh sách Đơn hàng POS Quy kết ({{ salesData?.attributedOrders?.length || 0 }} đơn)
              </span>
            </div>
            <div style="max-width: 320px; width: 100%;">
              <v-text-field
                v-model="orderSearch"
                placeholder="Tìm mã đơn, tên khách, SĐT..."
                prepend-inner-icon="mdi-magnify"
                density="compact"
                variant="outlined"
                hide-details
                clearable
              />
            </div>
          </v-card-title>
          <v-data-table
            :headers="attributedOrderHeaders"
            :items="filteredAttributedOrders"
            :loading="loadingSales"
            density="comfortable"
            hover
            class="elevation-0"
            fixed-header
            height="500px"
            no-data-text="Chưa có đơn hàng POS nào phát sinh từ các buổi workshop."
          >
            <template #item="{ item }">
              <tr>
                <td>
                  <code class="font-weight-bold text-primary px-2 py-1 bg-surface-variant rounded">{{ item.orderCode }}</code>
                  <div class="text-caption text-medium-emphasis mt-1">{{ formatDateTime(item.orderDate) }}</div>
                </td>
                <td>
                  <div class="font-weight-bold">{{ item.customerName }}</div>
                  <div class="text-caption text-medium-emphasis">{{ item.customerPhone }}</div>
                </td>
                <td>
                  <div class="text-body-2 font-weight-medium">{{ item.workshopTitle }}</div>
                  <div class="text-caption text-medium-emphasis">Ngày tổ chức: {{ formatDateTime(item.workshopDate) }}</div>
                </td>
                <td class="text-center">
                  <v-chip size="small" variant="tonal" color="info" class="font-weight-medium">
                    {{ item.daysToConvert }}&nbsp;ngày sau
                  </v-chip>
                </td>
                <td class="text-success font-weight-bold text-no-wrap">
                  {{ formatCurrency(item.finalAmount) }}
                </td>
                <td>
                  <span class="text-body-2">{{ item.branchName }}</span>
                </td>
                <td class="text-center text-no-wrap">
                  <v-chip
                    :color="item.guestCohort === 'ATTENDED' ? 'success' : 'warning'"
                    size="small"
                    variant="flat"
                    class="font-weight-medium"
                  >
                    {{ item.guestCohort === 'ATTENDED' ? 'Đã tham dự' : 'Vắng mặt' }}
                  </v-chip>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>

        <!-- Bảng 4: Top Sản phẩm Bán chạy sau Workshop -->
        <v-card class="mb-5" variant="outlined" rounded="lg">
          <v-card-title class="px-4 py-3 bg-surface-variant d-flex align-center ga-2">
            <v-icon color="primary" size="20">mdi-star-outline</v-icon>
            <span class="text-subtitle-1 font-weight-bold">Top Sản phẩm Bán chạy nhất cho Khách sau Workshop</span>
          </v-card-title>
          <v-data-table
            :headers="topProductHeaders"
            :items="topProductsList"
            :loading="loadingSales"
            density="comfortable"
            hover
            class="elevation-0"
            no-data-text="Chưa có dữ liệu sản phẩm bán chạy."
          >
            <template #item="{ item }">
              <tr>
                <td>
                  <code class="px-2 py-1 bg-surface-variant rounded">{{ item.productCode }}</code>
                </td>
                <td class="font-weight-bold text-body-2">
                  {{ item.productName }}
                </td>
                <td class="text-center font-weight-bold">
                  {{ item.quantitySold }}
                </td>
                <td class="text-success font-weight-bold text-no-wrap">
                  {{ formatCurrency(item.totalRevenue) }}
                </td>
                <td class="text-center">
                  {{ item.ordersCount }}&nbsp;đơn
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Nút Floating cuộn lên đầu trang -->
    <v-fade-transition>
      <v-btn
        v-if="showScrollTop"
        class="scroll-top-btn elevation-6"
        color="primary"
        icon="mdi-arrow-up"
        size="large"
        title="Cuộn lên đầu trang"
        @click="scrollToTop"
      />
    </v-fade-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

// Scroll management
const workshopViewRef = ref<HTMLElement | null>(null);
const showScrollTop = ref(false);

function handleScroll() {
  if (!workshopViewRef.value) return;
  showScrollTop.value = workshopViewRef.value.scrollTop > 220;
}

function scrollToTop() {
  if (workshopViewRef.value) {
    workshopViewRef.value.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Active Tab (workshops | guests | checkins | forms | sales)
const activeTab = ref('workshops');

interface WorkshopItem {
  id: string;
  externalId?: string | null;
  slug: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string;
  bannerUrl?: string | null;
  guestCount: number;
  metadata?: Record<string, any>;
}

interface GuestItem {
  id: string;
  fullName: string;
  phone: string;
  phoneNormalized: string;
  email?: string | null;
  partySize: number;
  status: string;
  checkinQrCode?: string | null;
  registeredAt: string;
  checkedInAt?: string | null;
  source?: string | null;
  notes?: string | null;
  contact?: {
    id: string;
    fullName?: string;
    phone?: string;
    avatarUrl?: string;
  } | null;
}

interface CheckinLogItem {
  id: string;
  workshopId: string;
  guestId: string;
  guestName: string;
  guestPhone?: string | null;
  guestPartySize?: number;
  contact?: any;
  status: string;
  method: string;
  checkedInBy: string;
  checkedInAt: string;
  note?: string | null;
}

interface RegistrationFormItem {
  token: string;
  title: string;
  greeting?: string | null;
  isActive: boolean;
  workshopId?: string | null;
  eventDate?: string | null;
  location?: string | null;
  registrationUrl?: string | null;
  workshops?: Array<{ id: string; name: string; event_date?: string; location?: string }>;
}

interface WindowMetric {
  windowDays: number | 'ALL';
  windowLabel: string;
  revenue: number;
  ordersCount: number;
  buyersCount: number;
  aov: number;
  conversionRate: number;
}

interface WorkshopPerformanceMetric {
  workshopId: string;
  workshopTitle: string;
  workshopSlug: string;
  workshopDate: string;
  branch: string;
  attendedGuests: number;
  noShowGuests: number;
  buyersCount: number;
  ordersCount: number;
  revenue7d: number;
  revenue14d: number;
  revenue30d: number;
  totalRevenue: number;
  conversionRate: number;
  aov: number;
}

interface AttributedOrderResult {
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  workshopId: string;
  workshopTitle: string;
  workshopDate: string;
  orderDate: string;
  daysToConvert: number;
  finalAmount: number;
  branchName: string;
  guestCohort: 'ATTENDED' | 'NO_SHOW' | 'REGISTERED';
  itemsCount: number;
}

interface TopProductMetric {
  productCode: string;
  productName: string;
  quantitySold: number;
  totalRevenue: number;
  ordersCount: number;
}

interface ApiStatus {
  configured: boolean;
  baseUrl: string | null;
  keyHint: string | null;
  rateLimit?: {
    limit: number | null;
    remaining: number | null;
    reset: number | null;
  };
  docs?: {
    swagger: string;
    redoc: string;
    openapi: string;
  } | null;
  health?: { ok: boolean; message: string };
}

// Global States
const status = ref<ApiStatus | null>(null);
const workshops = ref<WorkshopItem[]>([]);
const selectedWorkshop = ref<WorkshopItem | null>(null);
const selectedWorkshopId = ref<string>('');
const workshopSearch = ref('');

// Guests Tab States
const guests = ref<GuestItem[]>([]);
const guestStats = ref({
  totalGuests: 0,
  attendedCount: 0,
  registeredCount: 0,
  noShowCount: 0,
  linkedCount: 0,
  attendanceRate: 0,
});
const guestSearch = ref('');
const guestStatusFilter = ref('ALL');

// Live Lookup States
const lookupWorkshopSlug = ref('');
const lookupQuery = ref('');
const lookingUp = ref(false);
const lookupResult = ref<any>(null);

// Check-in Logs States
const checkinLogs = ref<CheckinLogItem[]>([]);
const checkinLogsMeta = ref<any>(null);
const selectedCheckinWorkshopId = ref<string>('');
const checkinLogSearch = ref('');
const loadingCheckinLogs = ref(false);

// Forms States
const registrationForms = ref<RegistrationFormItem[]>([]);
const loadingForms = ref(false);
const selectedForm = ref<RegistrationFormItem | null>(null);
const showFormDialog = ref(false);

// Sales Conversion States (Phase 3)
const salesData = ref<any>(null);
const selectedSalesWorkshopId = ref<string>('ALL');
const selectedWindowDays = ref<number | 'ALL'>('ALL');
const showFormulaCard = ref(true);
const loadingSales = ref(false);
const orderSearch = ref('');

// Loading indicators
const loadingWorkshops = ref(false);
const loadingGuests = ref(false);
const syncingAll = ref(false);
const syncingGuests = ref(false);

const errorMessage = ref('');
const successMessage = ref('');
const lastSyncAt = ref('');

// Table Headers
const workshopHeaders = [
  { title: 'Workshop / Chủ đề', key: 'title', sortable: true },
  { title: 'Thời gian', key: 'startsAt', sortable: true },
  { title: 'Địa điểm', key: 'location' },
  { title: 'Số lượng vé', key: 'guestCount', align: 'center' as const, sortable: true },
  { title: 'Trạng thái', key: 'status', align: 'center' as const, sortable: true },
  { title: 'Thao tác', key: 'actions', align: 'end' as const, sortable: false },
];

const guestHeaders = [
  { title: 'Khách mời', key: 'fullName', sortable: true },
  { title: 'Trạng thái vé', key: 'status', align: 'center' as const, sortable: true },
  { title: 'Số vé', key: 'partySize', align: 'center' as const },
  { title: 'Mô hình / Đơn vị', key: 'source' },
  { title: 'Thời gian đăng ký', key: 'registeredAt', sortable: true },
  { title: 'Đối soát CRM', key: 'contact' },
];

const checkinLogHeaders = [
  { title: 'Thời gian quét', key: 'checkedInAt', sortable: true },
  { title: 'Khách mời', key: 'guestName', sortable: true },
  { title: 'Phương thức', key: 'method', align: 'center' as const },
  { title: 'Người thực hiện', key: 'checkedInBy' },
  { title: 'Đi cùng thực tế', key: 'note', align: 'center' as const },
  { title: 'Trạng thái', key: 'status', align: 'center' as const },
];

const formHeaders = [
  { title: 'Tên Form / Workshop', key: 'title', sortable: true },
  { title: 'Mã Token', key: 'token' },
  { title: 'Trạng thái', key: 'isActive', align: 'center' as const },
  { title: 'Cụm Workshop', key: 'workshops', align: 'center' as const },
  { title: 'Thao tác', key: 'actions', align: 'end' as const, sortable: false },
];

const windowHeaders = [
  { title: 'Cửa sổ thời gian', key: 'windowLabel', sortable: false },
  { title: 'Doanh thu quy kết', key: 'revenue', sortable: true },
  { title: 'Khách mua hàng', key: 'buyersCount', align: 'center' as const, sortable: true },
  { title: 'Số lượng đơn', key: 'ordersCount', align: 'center' as const, sortable: true },
  { title: 'Giá trị đơn TB (AOV)', key: 'aov', sortable: true },
  { title: 'Tỷ lệ chuyển đổi (CR)', key: 'conversionRate', align: 'center' as const, sortable: true },
];

const workshopSalesHeaders = [
  { title: 'Sự kiện / Workshop', key: 'workshopTitle', sortable: true },
  { title: 'Tham dự', key: 'attendedGuests', align: 'center' as const, sortable: true },
  { title: 'Khách mua', key: 'buyersCount', align: 'center' as const, sortable: true },
  { title: 'Doanh thu 7d', key: 'revenue7d', sortable: true },
  { title: 'Doanh thu 14d', key: 'revenue14d', sortable: true },
  { title: 'Doanh thu 30d', key: 'revenue30d', sortable: true },
  { title: 'Tổng Doanh thu', key: 'totalRevenue', sortable: true },
  { title: 'Tỷ lệ CR', key: 'conversionRate', align: 'center' as const, sortable: true },
];

const attributedOrderHeaders = [
  { title: 'Mã đơn POS', key: 'orderCode', sortable: true },
  { title: 'Khách hàng', key: 'customerName', sortable: true },
  { title: 'Sự kiện quy kết', key: 'workshopTitle', sortable: true },
  { title: 'Thời gian chuyển đổi', key: 'daysToConvert', align: 'center' as const, sortable: true },
  { title: 'Tổng tiền', key: 'finalAmount', sortable: true },
  { title: 'Chi nhánh POS', key: 'branchName' },
  { title: 'Phân loại Cohort', key: 'guestCohort', align: 'center' as const },
];

const topProductHeaders = [
  { title: 'Mã sản phẩm', key: 'productCode', sortable: true },
  { title: 'Tên sản phẩm', key: 'productName', sortable: true },
  { title: 'Số lượng bán', key: 'quantitySold', align: 'center' as const, sortable: true },
  { title: 'Doanh số thu được', key: 'totalRevenue', sortable: true },
  { title: 'Số đơn hàng', key: 'ordersCount', align: 'center' as const, sortable: true },
];

// Computed
const filteredWorkshops = computed(() => {
  if (!workshopSearch.value?.trim()) return workshops.value;
  const q = workshopSearch.value.trim().toLowerCase();
  return workshops.value.filter((w) =>
    w.title?.toLowerCase().includes(q) ||
    w.slug?.toLowerCase().includes(q) ||
    w.location?.toLowerCase().includes(q) ||
    w.metadata?.branch?.toLowerCase().includes(q)
  );
});

const filteredGuests = computed(() => {
  let list = guests.value;
  if (guestStatusFilter.value !== 'ALL') {
    list = list.filter((g) => g.status === guestStatusFilter.value);
  }
  if (guestSearch.value?.trim()) {
    const q = guestSearch.value.trim().toLowerCase();
    list = list.filter((g) =>
      g.fullName?.toLowerCase().includes(q) ||
      g.phone?.includes(q) ||
      (g.email && g.email.toLowerCase().includes(q)) ||
      (g.source && g.source.toLowerCase().includes(q))
    );
  }
  return list;
});

const workshopsWithLogsList = computed(() => {
  return workshops.value.map((w) => {
    const externalOrId = w.externalId || w.id;
    return {
      id: w.id,
      externalOrId,
      title: w.title,
      titleWithCount: `${w.title} (${w.guestCount} khách)`,
    };
  });
});

const salesWorkshopFilterList = computed(() => {
  return [
    { id: 'ALL', title: 'Toàn bộ Workshop (Tổng hợp toàn hệ thống)' },
    ...workshops.value.map((w) => ({
      id: w.id,
      title: `${w.title} (${w.guestCount} khách)`,
    })),
  ];
});

const filteredCheckinLogs = computed(() => {
  if (!checkinLogSearch.value?.trim()) return checkinLogs.value;
  const q = checkinLogSearch.value.trim().toLowerCase();
  return checkinLogs.value.filter((l) =>
    l.guestName?.toLowerCase().includes(q) ||
    l.guestPhone?.includes(q) ||
    l.checkedInBy?.toLowerCase().includes(q) ||
    l.method?.toLowerCase().includes(q)
  );
});

const windowComparisonList = computed<WindowMetric[]>(() => {
  return (salesData.value?.windowComparison as WindowMetric[]) || [];
});

const workshopPerformanceList = computed<WorkshopPerformanceMetric[]>(() => {
  return (salesData.value?.workshopComparison as WorkshopPerformanceMetric[]) || [];
});

const filteredAttributedOrders = computed<AttributedOrderResult[]>(() => {
  const list: AttributedOrderResult[] = (salesData.value?.attributedOrders as AttributedOrderResult[]) || [];
  if (!orderSearch.value?.trim()) return list;
  const q = orderSearch.value.trim().toLowerCase();
  return list.filter((o) =>
    o.orderCode?.toLowerCase().includes(q) ||
    o.customerName?.toLowerCase().includes(q) ||
    o.customerPhone?.includes(q) ||
    o.workshopTitle?.toLowerCase().includes(q) ||
    (o.branchName && o.branchName.toLowerCase().includes(q))
  );
});

const topProductsList = computed<TopProductMetric[]>(() => {
  return (salesData.value?.topProducts as TopProductMetric[]) || [];
});

// Formatters & Helpers
function formatDateTime(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

function formatCurrency(amount?: number | null): string {
  if (typeof amount !== 'number') return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function getStatusColor(statusStr?: string): string {
  switch ((statusStr || '').toUpperCase()) {
    case 'OPEN':
    case 'PUBLISHED':
      return 'success';
    case 'COMPLETED':
      return 'primary';
    case 'IN_PROGRESS':
      return 'warning';
    case 'CANCELLED':
      return 'error';
    default:
      return 'default';
  }
}

function getStatusLabel(statusStr?: string): string {
  switch ((statusStr || '').toUpperCase()) {
    case 'OPEN':
    case 'PUBLISHED':
      return 'Đang mở';
    case 'COMPLETED':
      return 'Đã hoàn thành';
    case 'IN_PROGRESS':
      return 'Đang diễn ra';
    case 'CANCELLED':
      return 'Đã hủy';
    case 'DRAFT':
      return 'Bản nháp';
    default:
      return statusStr || '—';
  }
}

function getGuestStatusColor(statusStr?: string): string {
  switch ((statusStr || '').toUpperCase()) {
    case 'ATTENDED':
      return 'success';
    case 'REGISTERED':
      return 'warning';
    case 'NO_SHOW':
      return 'error';
    case 'CANCELLED':
      return 'default';
    default:
      return 'default';
  }
}

function getGuestStatusLabel(statusStr?: string): string {
  switch ((statusStr || '').toUpperCase()) {
    case 'ATTENDED':
      return 'Đã Check-in';
    case 'REGISTERED':
      return 'Đã đăng ký';
    case 'NO_SHOW':
      return 'Vắng mặt';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return statusStr || '—';
  }
}

function countLogsByMethod(method: string): number {
  return checkinLogs.value.filter((l) => l.method === method).length;
}

function getActualPartySize(item: CheckinLogItem): number {
  if (item.note && item.note.includes('actual_party_size=')) {
    const match = item.note.match(/actual_party_size=(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return item.guestPartySize || 1;
}

// Navigation across tabs
function goToWorkshopDetails(item: WorkshopItem) {
  selectedWorkshop.value = item;
}

function goToTabGuests(item: WorkshopItem) {
  selectedWorkshop.value = item;
  selectedWorkshopId.value = item.id;
  activeTab.value = 'guests';
  loadGuestsForWorkshop(item.id);
}

function goToTabCheckins(item: WorkshopItem) {
  selectedCheckinWorkshopId.value = item.externalId || item.id;
  activeTab.value = 'checkins';
  loadCheckinLogs();
}

function goToTabSales(item: WorkshopItem) {
  selectedSalesWorkshopId.value = item.id;
  activeTab.value = 'sales';
  loadSalesConversion();
}

function selectWorkshop(item: WorkshopItem) {
  selectedWorkshop.value = item;
  selectedWorkshopId.value = item.id;
  lookupWorkshopSlug.value = item.slug;
}

function onSelectWorkshopChange(id: string) {
  const found = workshops.value.find((w) => w.id === id);
  if (found) {
    selectedWorkshop.value = found;
    lookupWorkshopSlug.value = found.slug;
    loadGuestsForWorkshop(id);
  }
}

function viewFormDetail(form: RegistrationFormItem) {
  selectedForm.value = form;
  showFormDialog.value = true;
}

// API Calls
async function loadStatus() {
  try {
    const { data } = await api.get('/workshops/status');
    status.value = data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Không thể tải trạng thái Workshop API';
  }
}

async function loadWorkshops() {
  loadingWorkshops.value = true;
  try {
    const { data } = await api.get('/workshops');
    workshops.value = data.data || [];
    if (!selectedWorkshop.value && workshops.value.length > 0) {
      const sorted = [...workshops.value].sort((a, b) => b.guestCount - a.guestCount);
      const initial = sorted[0];
      selectedWorkshop.value = initial;
      selectedWorkshopId.value = initial.id;
      lookupWorkshopSlug.value = initial.slug;
      selectedCheckinWorkshopId.value = initial.externalId || initial.id;
      loadGuestsForWorkshop(initial.id);
    }
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Không thể tải danh sách workshop';
  } finally {
    loadingWorkshops.value = false;
  }
}

async function loadGuestsForWorkshop(workshopId: string) {
  loadingGuests.value = true;
  try {
    const { data } = await api.get(`/workshops/${workshopId}`);
    guests.value = data.guests || [];
    guestStats.value = data.stats || {
      totalGuests: 0,
      attendedCount: 0,
      registeredCount: 0,
      noShowCount: 0,
      linkedCount: 0,
      attendanceRate: 0,
    };
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Không thể tải chi tiết khách mời';
  } finally {
    loadingGuests.value = false;
  }
}

async function loadCheckinLogs() {
  loadingCheckinLogs.value = true;
  try {
    const workshopId = selectedCheckinWorkshopId.value || selectedWorkshop.value?.externalId || selectedWorkshop.value?.id;
    const { data } = await api.get('/workshops/checkins/logs', {
      params: {
        workshop_id: workshopId,
        per_page: 100,
      },
    });
    checkinLogs.value = data.data || [];
    checkinLogsMeta.value = data.meta || null;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Không thể tải nhật ký check-in';
  } finally {
    loadingCheckinLogs.value = false;
  }
}

async function loadRegistrationForms() {
  loadingForms.value = true;
  try {
    const { data } = await api.get('/workshops/forms');
    registrationForms.value = data.data || [];
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Không thể tải danh sách biểu mẫu đăng ký';
  } finally {
    loadingForms.value = false;
  }
}

async function loadSalesConversion() {
  loadingSales.value = true;
  try {
    const params: Record<string, any> = {};
    if (selectedSalesWorkshopId.value && selectedSalesWorkshopId.value !== 'ALL') {
      params.workshop_id = selectedSalesWorkshopId.value;
    }
    if (selectedWindowDays.value) {
      params.window_days = selectedWindowDays.value;
    }

    const { data } = await api.get('/workshops/sales-conversion', { params });
    salesData.value = data.data || null;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Không thể tải dữ liệu chuyển đổi doanh thu POS';
  } finally {
    loadingSales.value = false;
  }
}

async function performLiveLookup() {
  if (!lookupWorkshopSlug.value) {
    errorMessage.value = 'Vui lòng chọn Workshop cần tra cứu';
    return;
  }
  if (!lookupQuery.value?.trim()) {
    errorMessage.value = 'Vui lòng nhập Số điện thoại hoặc Email để tra cứu';
    return;
  }

  lookingUp.value = true;
  lookupResult.value = null;
  errorMessage.value = '';

  try {
    const isEmail = lookupQuery.value.includes('@');
    const params: Record<string, string> = {
      workshop_slug: lookupWorkshopSlug.value,
    };
    if (isEmail) {
      params.email = lookupQuery.value.trim();
    } else {
      params.phone = lookupQuery.value.trim();
    }

    const { data } = await api.get('/workshops/guests/lookup', { params });
    lookupResult.value = data.data || null;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Tra cứu khách mời thất bại';
  } finally {
    lookingUp.value = false;
  }
}

async function syncAllWorkshops() {
  syncingAll.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { data } = await api.post('/workshops/sync');
    successMessage.value = data.message || 'Đồng bộ workshops thành công!';
    lastSyncAt.value = new Date().toLocaleTimeString('vi-VN');
    await loadAllData();
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Đồng bộ workshops thất bại. Vui lòng kiểm tra API URL và Key.';
  } finally {
    syncingAll.value = false;
  }
}

async function syncGuestsForSelected() {
  if (!selectedWorkshop.value) return;
  syncingGuests.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { data } = await api.post(`/workshops/${selectedWorkshop.value.id}/sync-guests`);
    successMessage.value = data.message || 'Đồng bộ khách mời thành công!';
    await loadGuestsForWorkshop(selectedWorkshop.value.id);
    await loadCheckinLogs();
    await loadSalesConversion();
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Đồng bộ khách mời thất bại';
  } finally {
    syncingGuests.value = false;
  }
}

async function loadAllData() {
  await Promise.all([
    loadStatus(),
    loadWorkshops(),
    loadRegistrationForms(),
    loadSalesConversion(),
  ]);
  if (selectedWorkshop.value) {
    await loadCheckinLogs();
  }
}

onMounted(async () => {
  await loadAllData();
});
</script>

<style scoped>
.workshop-view {
  height: calc(100vh - var(--smax-topnav-h, 58px));
  overflow-y: auto;
  overflow-x: hidden;
  max-width: 1600px;
  margin: 0 auto;
  scroll-behavior: smooth;
  padding-bottom: 90px;
}

/* Thanh cuộn hiện đại thanh mảnh */
.workshop-view::-webkit-scrollbar {
  width: 8px;
}
.workshop-view::-webkit-scrollbar-track {
  background: transparent;
}
.workshop-view::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 4px;
}
.workshop-view::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.35);
}

.selected-row {
  background-color: rgba(var(--v-theme-primary), 0.08) !important;
}

.cursor-pointer {
  cursor: pointer;
}

.font-mono {
  font-family: monospace;
}

.whitespace-pre-line {
  white-space: pre-line;
}

.formula-card {
  border-color: rgba(var(--v-theme-secondary), 0.35) !important;
  background-color: rgba(var(--v-theme-surface), 0.98);
}

/* Nút cuộn lên đầu trang */
.scroll-top-btn {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 99;
  border-radius: 50% !important;
}
</style>
