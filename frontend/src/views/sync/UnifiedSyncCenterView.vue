<template>
  <div
    ref="syncContainerRef"
    class="unified-sync-center-container pa-6"
    @scroll="handleScroll"
  >
    <!-- Header -->
    <header class="sync-header d-flex flex-wrap justify-space-between align-center mb-6 pb-4 border-b gap-4">
      <div>
        <div class="d-flex align-center flex-wrap gap-2 mb-1">
          <v-avatar color="primary" size="40" rounded="lg" class="elevation-2">
            <v-icon color="white" size="24">mdi-database-sync</v-icon>
          </v-avatar>
          <h1 class="text-h4 font-weight-bold text-slate-dark tracking-tight mb-0">
            Trung tâm Đồng bộ Dữ liệu Hệ thống
          </h1>
          <v-chip
            :color="healthStatusColor"
            size="small"
            variant="flat"
            class="ml-2 font-weight-bold text-white text-nowrap"
          >
            <v-icon start size="14" class="mr-1">{{ healthStatusIcon }}</v-icon>
            {{ healthStatusText }}
          </v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Quản lý tập trung toàn diện tiến trình đồng bộ dữ liệu Bán hàng POS và Hội thảo Workshop vào Cơ sở dữ liệu CRM
        </p>
      </div>

      <div class="d-flex align-center flex-wrap gap-3">
        <v-btn
          variant="outlined"
          color="secondary"
          :loading="loadingStats"
          prepend-icon="mdi-refresh"
          class="text-nowrap"
          @click="fetchAllData"
        >
          Làm mới số liệu
        </v-btn>
        <v-btn
          color="primary"
          elevation="3"
          :loading="isTriggeringFullSync"
          :disabled="isAnySyncRunning"
          prepend-icon="mdi-cloud-sync"
          class="text-nowrap master-sync-btn font-weight-bold"
          @click="handleTriggerFullSync"
        >
          Đồng bộ tất cả hệ thống
        </v-btn>
      </div>
    </header>

    <!-- Active Sync Progress Banner -->
    <v-expand-transition>
      <v-card
        v-if="activeJob"
        variant="tonal"
        color="primary"
        class="mb-6 pa-4 border rounded-xl active-sync-banner elevation-1"
      >
        <div class="d-flex align-center justify-space-between flex-wrap gap-3">
          <div class="d-flex align-center gap-3">
            <v-progress-circular
              indeterminate
              color="primary"
              size="32"
              width="3"
            />
            <div>
              <div class="text-subtitle-1 font-weight-bold text-slate-dark">
                Đang thực thi đồng bộ: {{ formatEntityName(activeJob.entity) }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ activeJobProgressText }}
              </div>
            </div>
          </div>
          <div class="d-flex align-center gap-2">
            <v-chip size="small" color="primary" variant="outlined" class="font-weight-medium">
              Bắt đầu: {{ formatTime(activeJob.startTime || activeJob.createdAt) }}
            </v-chip>
            <v-btn
              color="error"
              variant="text"
              size="small"
              prepend-icon="mdi-stop-circle-outline"
              :loading="cancellingJobId === activeJob.id"
              @click="handleCancelJob(activeJob.id)"
            >
              Dừng tiến trình
            </v-btn>
          </div>
        </div>

        <v-progress-linear
          :model-value="activeJobPercent"
          :indeterminate="activeJob.total <= 0"
          color="primary"
          height="8"
          rounded
          class="mt-3"
        />
      </v-card>
    </v-expand-transition>

    <!-- Error Alert Bar (if failed rows exist) -->
    <v-alert
      v-if="failedRows.length > 0"
      type="warning"
      variant="tonal"
      class="mb-6 rounded-xl border"
      prominent
    >
      <template #title>
        <span class="font-weight-bold text-nowrap">
          Phát hiện {{ failedRows.length }} bản ghi đồng bộ gặp lỗi hoặc bị gián đoạn
        </span>
      </template>
      <div class="d-flex align-center justify-space-between flex-wrap gap-2">
        <span class="text-body-2">
          Các bản ghi lỗi được ghi nhận chi tiết để kiểm tra mã lỗi và hỗ trợ thử lại từng dòng độc lập mà không cần quét lại toàn bộ dữ liệu.
        </span>
        <v-btn
          color="warning"
          variant="flat"
          size="small"
          prepend-icon="mdi-alert-circle-outline"
          class="font-weight-bold text-nowrap"
          @click="openErrorDrawer(null)"
        >
          Xem danh sách lỗi ({{ failedRows.length }})
        </v-btn>
      </div>
    </v-alert>

    <!-- ════════ 2 KHỐI HERO BENTO: XEM CHI TIẾT DỮ LIỆU ĐỒNG BỘ ════════ -->
    <v-row class="mb-6">
      <!-- Hero Card 1: Dữ liệu Cửa hàng POS -->
      <v-col cols="12" md="6">
        <v-card
          variant="outlined"
          class="hero-bento-card hero-pos-card rounded-xl pa-5 h-100 elevation-1"
        >
          <div class="d-flex align-start justify-space-between gap-3 mb-3">
            <div class="d-flex align-center gap-3">
              <v-avatar color="primary" variant="tonal" size="48" rounded="lg">
                <v-icon size="28" color="primary">mdi-storefront-outline</v-icon>
              </v-avatar>
              <div>
                <h2 class="text-h6 font-weight-bold text-slate-dark mb-0">
                  Dữ liệu Cửa hàng POS
                </h2>
                <span class="text-caption text-medium-emphasis">
                  8 bảng dữ liệu: Sản phẩm, Đơn hàng, Khách hàng, Hóa đơn, Tồn kho...
                </span>
              </div>
            </div>
            <v-chip color="primary" variant="flat" size="small" class="font-weight-bold text-nowrap">
              {{ totalPosRecords.toLocaleString('vi-VN') }} bản ghi
            </v-chip>
          </div>

          <p class="text-body-2 text-medium-emphasis mb-4">
            Theo dõi chi tiết mạng lưới chi nhánh, danh mục sản phẩm, lịch sử giao dịch và đối soát công nợ khách hàng nạp từ Public API.
          </p>

          <div class="d-flex align-center justify-space-between flex-wrap gap-2 pt-3 border-t">
            <div class="text-caption text-medium-emphasis d-flex align-center text-nowrap">
              <v-icon size="14" class="mr-1">mdi-clock-outline</v-icon>
              Đồng bộ gần nhất: {{ lastPosSyncTimeText }}
            </div>
            <div class="d-flex align-center gap-2">
              <v-btn
                variant="tonal"
                color="primary"
                size="small"
                class="font-weight-medium text-none"
                @click="activeTab = 'pos'"
              >
                Cấu hình 8 bảng
              </v-btn>
              <v-btn
                color="primary"
                variant="flat"
                size="small"
                to="/pos"
                prepend-icon="mdi-open-in-new"
                class="font-weight-bold text-none shadow-sm text-nowrap"
              >
                Mở trang Cửa hàng POS ↗
              </v-btn>
            </div>
          </div>
        </v-card>
      </v-col>

      <!-- Hero Card 2: Dữ liệu Sự kiện & Workshop -->
      <v-col cols="12" md="6">
        <v-card
          variant="outlined"
          class="hero-bento-card hero-workshop-card rounded-xl pa-5 h-100 elevation-1"
        >
          <div class="d-flex align-start justify-space-between gap-3 mb-3">
            <div class="d-flex align-center gap-3">
              <v-avatar color="deep-purple" variant="tonal" size="48" rounded="lg">
                <v-icon size="28" color="deep-purple">mdi-school-outline</v-icon>
              </v-avatar>
              <div>
                <h2 class="text-h6 font-weight-bold text-slate-dark mb-0">
                  Dữ liệu Sự kiện &amp; Workshop
                </h2>
                <span class="text-caption text-medium-emphasis">
                  4 bảng dữ liệu: Sự kiện, Khách mời, Check-in, Biểu mẫu đăng ký
                </span>
              </div>
            </div>
            <v-chip color="deep-purple" variant="flat" size="small" class="font-weight-bold text-white text-nowrap">
              {{ totalWorkshopRecords.toLocaleString('vi-VN') }} bản ghi
            </v-chip>
          </div>

          <p class="text-body-2 text-medium-emphasis mb-4">
            Quản lý tập trung các buổi workshop, danh sách khách mời đăng ký, lịch sử quét mã điểm danh và hiệu quả chuyển đổi doanh thu.
          </p>

          <div class="d-flex align-center justify-space-between flex-wrap gap-2 pt-3 border-t">
            <div class="text-caption text-medium-emphasis d-flex align-center text-nowrap">
              <v-icon size="14" class="mr-1">mdi-clock-outline</v-icon>
              Đồng bộ gần nhất: {{ lastWorkshopSyncTimeText }}
            </div>
            <div class="d-flex align-center gap-2">
              <v-btn
                variant="tonal"
                color="deep-purple"
                size="small"
                class="font-weight-medium text-none"
                @click="activeTab = 'workshop'"
              >
                Cấu hình 4 bảng
              </v-btn>
              <v-btn
                color="deep-purple"
                variant="flat"
                size="small"
                to="/workshops"
                prepend-icon="mdi-open-in-new"
                class="font-weight-bold text-none text-white shadow-sm text-nowrap"
              >
                Mở trang Workshop ↗
              </v-btn>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- System Segment Tabs -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-3">
      <v-tabs
        v-model="activeTab"
        color="primary"
        align-tabs="start"
        class="sync-tabs"
      >
        <v-tab value="pos" class="font-weight-bold">
          <v-icon start size="18">mdi-point-of-sale</v-icon>
          Hệ thống Bán hàng POS ({{ posCards.length }} bảng)
        </v-tab>
        <v-tab value="workshop" class="font-weight-bold">
          <v-icon start size="18">mdi-account-group-outline</v-icon>
          Hội thảo Workshop ({{ workshopCards.length }} bảng)
        </v-tab>
      </v-tabs>

      <div class="text-caption text-medium-emphasis d-flex align-center gap-1">
        <v-icon size="14">mdi-information-outline</v-icon>
        Dữ liệu lưu trữ tập trung tại CRM và phân phối tự động cho toàn bộ nhân viên.
      </div>
    </div>

    <!-- POS Bento Grid -->
    <v-window v-model="activeTab">
      <v-window-item value="pos">
        <v-row>
          <v-col
            v-for="card in posCards"
            :key="card.key"
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-card class="bento-sync-card h-100 pa-4 border rounded-xl" elevation="1">
              <div class="d-flex align-center justify-space-between mb-3">
                <v-avatar :color="card.bg" size="42" rounded="lg">
                  <v-icon :color="card.color" size="22">{{ card.icon }}</v-icon>
                </v-avatar>
                <v-chip
                  size="x-small"
                  :color="getTableStatusColor(card.key)"
                  variant="tonal"
                  class="font-weight-bold text-nowrap"
                >
                  {{ getTableStatusText(card.key) }}
                </v-chip>
              </div>

              <div class="card-metric-title text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">
                {{ card.title }}
              </div>
              <div class="card-metric-number text-h4 font-weight-bold text-slate-dark mb-1">
                {{ formatNumber(getTableCount(card.key)) }}
              </div>
              <div class="text-caption text-medium-emphasis mb-4 text-truncate" :title="getLastSyncedText(card.key)">
                {{ getLastSyncedText(card.key) }}
              </div>

              <v-divider class="mb-3" />

              <div class="d-flex align-center justify-space-between gap-2">
                <v-btn
                  size="small"
                  variant="tonal"
                  :color="card.color"
                  :loading="syncingTables[card.key]"
                  :disabled="isAnySyncRunning"
                  prepend-icon="mdi-sync"
                  class="flex-grow-1 text-nowrap font-weight-medium"
                  @click="handleSyncSingleTable(card.key)"
                >
                  Đồng bộ bảng
                </v-btn>

                <v-btn
                  v-if="getTableErrorCount(card.key) > 0"
                  size="small"
                  color="error"
                  variant="text"
                  icon="mdi-alert-circle"
                  :title="`Có ${getTableErrorCount(card.key)} lỗi dòng`"
                  @click="openErrorDrawer(card.key)"
                />
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <!-- Workshop Bento Grid -->
      <v-window-item value="workshop">
        <v-row>
          <v-col
            v-for="card in workshopCards"
            :key="card.key"
            cols="12"
            sm="6"
            md="3"
          >
            <v-card class="bento-sync-card h-100 pa-4 border rounded-xl" elevation="1">
              <div class="d-flex align-center justify-space-between mb-3">
                <v-avatar :color="card.bg" size="42" rounded="lg">
                  <v-icon :color="card.color" size="22">{{ card.icon }}</v-icon>
                </v-avatar>
                <v-chip
                  size="x-small"
                  :color="getTableStatusColor(card.key)"
                  variant="tonal"
                  class="font-weight-bold text-nowrap"
                >
                  {{ getTableStatusText(card.key) }}
                </v-chip>
              </div>

              <div class="card-metric-title text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">
                {{ card.title }}
              </div>
              <div class="card-metric-number text-h4 font-weight-bold text-slate-dark mb-1">
                {{ formatNumber(getTableCount(card.key)) }}
              </div>
              <div class="text-caption text-medium-emphasis mb-4 text-truncate" :title="getLastSyncedText(card.key)">
                {{ getLastSyncedText(card.key) }}
              </div>

              <v-divider class="mb-3" />

              <div class="d-flex align-center justify-space-between gap-2">
                <v-btn
                  size="small"
                  variant="tonal"
                  :color="card.color"
                  :loading="syncingTables[card.key]"
                  :disabled="isAnySyncRunning"
                  prepend-icon="mdi-sync"
                  class="flex-grow-1 text-nowrap font-weight-medium"
                  @click="handleSyncSingleTable(card.key)"
                >
                  Đồng bộ bảng
                </v-btn>

                <v-btn
                  v-if="getTableErrorCount(card.key) > 0"
                  size="small"
                  color="error"
                  variant="text"
                  icon="mdi-alert-circle"
                  :title="`Có ${getTableErrorCount(card.key)} lỗi dòng`"
                  @click="openErrorDrawer(card.key)"
                />
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>
    </v-window>

    <!-- Bottom History & Logs Section -->
    <v-card class="mt-8 border rounded-xl" elevation="1">
      <v-tabs v-model="historyTab" color="primary" class="border-b px-4">
        <v-tab value="sync-jobs" class="font-weight-bold">
          <v-icon start size="18">mdi-history</v-icon>
          Lịch sử Tiến trình Đồng bộ
        </v-tab>
        <v-tab value="webhook-logs" class="font-weight-bold">
          <v-icon start size="18">mdi-webhook</v-icon>
          Nhật ký Sự kiện Webhook POS
        </v-tab>
      </v-tabs>

      <v-window v-model="historyTab">
        <!-- Sync Jobs Tab -->
        <v-window-item value="sync-jobs">
          <v-table class="sync-jobs-table">
            <thead>
              <tr>
                <th class="text-left font-weight-bold">Mã Job</th>
                <th class="text-left font-weight-bold">Thực thể</th>
                <th class="text-left font-weight-bold">Trạng thái</th>
                <th class="text-left font-weight-bold">Tiến độ bản ghi</th>
                <th class="text-left font-weight-bold">Khởi tạo</th>
                <th class="text-left font-weight-bold">Thời gian chạy</th>
                <th class="text-center font-weight-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingJobs">
                <td colspan="7" class="text-center py-6 text-medium-emphasis">
                  <v-progress-circular indeterminate size="24" class="mr-2" />
                  Đang tải danh sách tiến trình...
                </td>
              </tr>
              <tr v-else-if="syncJobs.length === 0">
                <td colspan="7" class="text-center py-6 text-medium-emphasis">
                  Chưa có tiến trình đồng bộ nào được ghi nhận.
                </td>
              </tr>
              <tr v-for="job in syncJobs" :key="job.id">
                <td class="font-mono text-caption font-weight-bold text-nowrap">
                  #{{ job.id.substring(0, 8) }}
                </td>
                <td>
                  <v-chip size="small" variant="tonal" color="indigo" class="font-weight-medium text-nowrap">
                    {{ formatEntityName(job.entity) }}
                  </v-chip>
                </td>
                <td>
                  <v-chip
                    size="small"
                    :color="getJobStatusColor(job.status)"
                    variant="flat"
                    class="font-weight-bold text-nowrap text-white"
                  >
                    {{ formatJobStatus(job.status) }}
                  </v-chip>
                </td>
                <td class="text-nowrap">
                  <span class="font-weight-bold">{{ job.processed || 0 }}</span>
                  <span v-if="job.total > 0" class="text-medium-emphasis"> / {{ job.total }}</span>
                </td>
                <td class="text-caption text-medium-emphasis text-nowrap">
                  {{ formatDate(job.createdAt) }}
                </td>
                <td class="text-caption text-medium-emphasis text-nowrap">
                  {{ formatDuration(job.startTime, job.endTime) }}
                </td>
                <td class="text-center text-nowrap">
                  <v-btn
                    v-if="job.status === 'Failed' || job.status === 'Cancelled'"
                    size="small"
                    variant="text"
                    color="primary"
                    prepend-icon="mdi-refresh"
                    :loading="retryingJobId === job.id"
                    @click="handleRetryJob(job.id)"
                  >
                    Chạy lại
                  </v-btn>
                  <v-btn
                    v-else-if="job.status === 'Running' || job.status === 'Pending'"
                    size="small"
                    variant="text"
                    color="error"
                    prepend-icon="mdi-stop"
                    :loading="cancellingJobId === job.id"
                    @click="handleCancelJob(job.id)"
                  >
                    Hủy
                  </v-btn>
                  <span v-else class="text-caption text-medium-emphasis">-</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>

        <!-- Webhook Logs Tab -->
        <v-window-item value="webhook-logs">
          <v-table class="webhook-logs-table">
            <thead>
              <tr>
                <th class="text-left font-weight-bold">Mã Sự kiện</th>
                <th class="text-left font-weight-bold">Loại Sự kiện</th>
                <th class="text-left font-weight-bold">Trạng thái</th>
                <th class="text-center font-weight-bold">Lượt thử</th>
                <th class="text-left font-weight-bold">Thông điệp lỗi</th>
                <th class="text-left font-weight-bold">Thời gian nhận</th>
                <th class="text-center font-weight-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingWebhooks">
                <td colspan="7" class="text-center py-6 text-medium-emphasis">
                  <v-progress-circular indeterminate size="24" class="mr-2" />
                  Đang tải nhật ký webhook...
                </td>
              </tr>
              <tr v-else-if="webhookLogs.length === 0">
                <td colspan="7" class="text-center py-6 text-medium-emphasis">
                  Chưa có sự kiện Webhook nào được ghi nhận.
                </td>
              </tr>
              <tr v-for="w in webhookLogs" :key="w.id">
                <td class="font-mono text-caption font-weight-bold text-nowrap">
                  #{{ w.id.substring(0, 8) }}
                </td>
                <td>
                  <v-chip size="x-small" color="blue-grey" variant="tonal" class="font-weight-medium text-nowrap">
                    {{ w.eventType }}
                  </v-chip>
                </td>
                <td>
                  <v-chip
                    size="small"
                    :color="w.status === 'PROCESSED' ? 'success' : w.status === 'FAILED' ? 'error' : 'warning'"
                    variant="tonal"
                    class="font-weight-bold text-nowrap"
                  >
                    {{ w.status }}
                  </v-chip>
                </td>
                <td class="text-center font-weight-medium">
                  {{ w.attempts }}/3
                </td>
                <td class="text-caption text-error text-truncate max-w-250">
                  {{ w.lastError || '-' }}
                </td>
                <td class="text-caption text-medium-emphasis text-nowrap">
                  {{ formatDate(w.createdAt) }}
                </td>
                <td class="text-center text-nowrap">
                  <v-btn
                    v-if="w.status === 'FAILED'"
                    size="small"
                    variant="text"
                    color="warning"
                    prepend-icon="mdi-refresh"
                    :loading="retryingWebhookId === w.id"
                    @click="handleRetryWebhook(w.id)"
                  >
                    Thử lại
                  </v-btn>
                  <span v-else class="text-caption text-medium-emphasis">-</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>
      </v-window>
    </v-card>

    <!-- Error Inspection Drawer / Sheet -->
    <v-navigation-drawer
      v-model="showErrorDrawer"
      location="right"
      temporary
      width="460"
      class="pa-4 error-inspection-drawer"
    >
      <div class="d-flex align-center justify-space-between pb-3 border-b mb-4">
        <div>
          <h3 class="text-h6 font-weight-bold text-slate-dark mb-0">
            Chi tiết Bản ghi Lỗi
          </h3>
          <span class="text-caption text-medium-emphasis">
            {{ selectedDrawerTable ? `Lọc theo bảng: ${selectedDrawerTable}` : 'Tất cả các bảng' }}
          </span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="showErrorDrawer = false" />
      </div>

      <div v-if="filteredFailedRows.length === 0" class="text-center py-10 text-medium-emphasis">
        <v-icon size="48" color="success" class="mb-2">mdi-check-circle-outline</v-icon>
        <div class="font-weight-medium">Không có bản ghi lỗi nào trong mục này</div>
      </div>

      <div v-else class="d-flex flex-column gap-3">
        <v-card
          v-for="(row, idx) in filteredFailedRows"
          :key="`${row.tableName}-${row.id}-${idx}`"
          variant="outlined"
          class="pa-3 rounded-lg border error-row-card"
        >
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="font-weight-bold text-subtitle-2 font-mono">
              {{ row.code || `#${String(row.id).substring(0, 8)}` }}
            </span>
            <v-chip size="x-small" color="error" variant="tonal" class="text-nowrap">
              {{ row.tableName }}
            </v-chip>
          </div>
          <div class="text-body-2 font-weight-medium mb-1">{{ row.name || 'Bản ghi lỗi' }}</div>
          <div class="text-caption text-error bg-red-lighten-5 pa-2 rounded mb-3">
            {{ row.error }}
          </div>

          <div class="d-flex align-center justify-space-between">
            <span class="text-caption text-medium-emphasis">
              {{ row.timestamp ? formatDate(row.timestamp) : 'Gần đây' }}
            </span>
            <v-btn
              size="small"
              color="primary"
              variant="flat"
              prepend-icon="mdi-refresh"
              :loading="retryingRowKey === `${row.tableName}-${row.id}`"
              class="text-nowrap"
              @click="handleRetryRow(row)"
            >
              Thử lại dòng này
            </v-btn>
          </div>
        </v-card>
      </div>
    </v-navigation-drawer>

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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { createAppSocket } from '@/api/socket';

// Scroll management
const syncContainerRef = ref<HTMLElement | null>(null);
const showScrollTop = ref(false);

function handleScroll() {
  if (!syncContainerRef.value) return;
  showScrollTop.value = syncContainerRef.value.scrollTop > 220;
}

function scrollToTop() {
  if (syncContainerRef.value) {
    syncContainerRef.value.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

interface TableStat {
  count: number;
  lastSyncedAt: string | null;
}

interface FailedRowItem {
  id: string | number;
  jobId?: string;
  tableName: string;
  code?: string;
  name?: string;
  error: string;
  timestamp?: string;
}

interface SyncJobItem {
  id: string;
  orgId: string;
  userId?: string | null;
  entity: string;
  status: 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  processed: number;
  total: number;
  startTime?: string | null;
  endTime?: string | null;
  lastError?: string | null;
  createdAt: string;
}

interface WebhookLogItem {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

const toast = useToast();
const socket = createAppSocket();

// Tabs state
const activeTab = ref<'pos' | 'workshop'>('pos');
const historyTab = ref<'sync-jobs' | 'webhook-logs'>('sync-jobs');

// Loading flags
const loadingStats = ref(false);
const loadingJobs = ref(false);
const loadingWebhooks = ref(false);
const isTriggeringFullSync = ref(false);
const syncingTables = ref<Record<string, boolean>>({});
const retryingJobId = ref<string | null>(null);
const cancellingJobId = ref<string | null>(null);
const retryingWebhookId = ref<string | null>(null);
const retryingRowKey = ref<string | null>(null);

// Data
const tableStats = ref<Record<string, TableStat>>({});
const failedRows = ref<FailedRowItem[]>([]);
const syncJobs = ref<SyncJobItem[]>([]);
const webhookLogs = ref<WebhookLogItem[]>([]);

// Drawer
const showErrorDrawer = ref(false);
const selectedDrawerTable = ref<string | null>(null);

// Definition of Bento Cards
const posCards = [
  { key: 'branches', title: 'Chi nhánh POS', icon: 'mdi-storefront-outline', color: 'primary', bg: 'blue-lighten-5' },
  { key: 'categories', title: 'Danh mục Sản phẩm', icon: 'mdi-shape-outline', color: 'deep-purple', bg: 'deep-purple-lighten-5' },
  { key: 'products', title: 'Sản phẩm Bán hàng', icon: 'mdi-package-variant-closed', color: 'teal', bg: 'teal-lighten-5' },
  { key: 'customers', title: 'Khách hàng POS', icon: 'mdi-account-group', color: 'cyan', bg: 'cyan-lighten-5' },
  { key: 'branch_inventory', title: 'Tồn kho Chi nhánh', icon: 'mdi-warehouse', color: 'indigo', bg: 'indigo-lighten-5' },
  { key: 'debts', title: 'Công nợ Khách hàng', icon: 'mdi-account-cash-outline', color: 'amber-darken-3', bg: 'amber-lighten-5' },
  { key: 'orders', title: 'Đơn hàng POS', icon: 'mdi-receipt-text-outline', color: 'blue-darken-2', bg: 'blue-lighten-5' },
  { key: 'invoices', title: 'Hóa đơn Thanh toán', icon: 'mdi-file-document-outline', color: 'purple', bg: 'purple-lighten-5' },
];

const workshopCards = [
  { key: 'workshops', title: 'Danh sách Hội thảo', icon: 'mdi-calendar-multiselect', color: 'primary', bg: 'blue-lighten-5' },
  { key: 'workshop_guests', title: 'Khách mời Đăng ký', icon: 'mdi-account-details-outline', color: 'teal', bg: 'teal-lighten-5' },
  { key: 'checkin_logs', title: 'Nhật ký Check-in', icon: 'mdi-qrcode-scan', color: 'green-darken-2', bg: 'green-lighten-5' },
  { key: 'registration_forms', title: 'Biểu mẫu Đăng ký', icon: 'mdi-form-select', color: 'deep-orange', bg: 'deep-orange-lighten-5' },
];

// Summary metrics for the 2 Hero Bento Cards
const totalPosRecords = computed(() => {
  return posCards.reduce((acc, c) => acc + (tableStats.value[c.key]?.count || 0), 0);
});

const totalWorkshopRecords = computed(() => {
  return workshopCards.reduce((acc, c) => acc + (tableStats.value[c.key]?.count || 0), 0);
});

const lastPosSyncTimeText = computed(() => {
  const dates = posCards
    .map(c => tableStats.value[c.key]?.lastSyncedAt)
    .filter(Boolean) as string[];
  if (dates.length === 0) return 'Chưa có lượt đồng bộ';
  dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return formatTime(dates[0]);
});

const lastWorkshopSyncTimeText = computed(() => {
  const dates = workshopCards
    .map(c => tableStats.value[c.key]?.lastSyncedAt)
    .filter(Boolean) as string[];
  if (dates.length === 0) return 'Chưa có lượt đồng bộ';
  dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return formatTime(dates[0]);
});

// Active running job
const activeJob = computed(() => {
  return syncJobs.value.find((j) => j.status === 'Running' || j.status === 'Pending') || null;
});

const isAnySyncRunning = computed(() => Boolean(activeJob.value));

const activeJobPercent = computed(() => {
  if (!activeJob.value || activeJob.value.total <= 0) return 0;
  return Math.min(100, Math.round((activeJob.value.processed / activeJob.value.total) * 100));
});

const activeJobProgressText = computed(() => {
  if (!activeJob.value) return '';
  if (activeJob.value.total <= 0) {
    return `Đang xử lý ${activeJob.value.processed || 0} bản ghi...`;
  }
  return `Tiến độ: ${activeJob.value.processed}/${activeJob.value.total} bản ghi (${activeJobPercent.value}%)`;
});

// System Health Badge
const healthStatusColor = computed(() => {
  if (failedRows.value.length > 0) return 'warning';
  if (isAnySyncRunning.value) return 'primary';
  return 'success';
});

const healthStatusIcon = computed(() => {
  if (failedRows.value.length > 0) return 'mdi-alert';
  if (isAnySyncRunning.value) return 'mdi-sync';
  return 'mdi-check-circle';
});

const healthStatusText = computed(() => {
  if (failedRows.value.length > 0) return `${failedRows.value.length} bản ghi lỗi`;
  if (isAnySyncRunning.value) return 'Đang chạy đồng bộ';
  return 'Hệ thống sẵn sàng';
});

// Filtered Failed Rows for Drawer
const filteredFailedRows = computed(() => {
  if (!selectedDrawerTable.value) return failedRows.value;
  return failedRows.value.filter((r) => r.tableName.toLowerCase() === selectedDrawerTable.value?.toLowerCase());
});

// Lifecycle
onMounted(() => {
  fetchAllData();

  // Socket.IO realtime listener
  socket.on('pos:sync:update', (data: any) => {
    if (data?.jobId) {
      const existingIndex = syncJobs.value.findIndex((j) => j.id === data.jobId);
      if (existingIndex >= 0) {
        syncJobs.value[existingIndex] = {
          ...syncJobs.value[existingIndex],
          ...data,
        };
      } else {
        fetchSyncJobs();
      }
    }
    if (data?.status === 'Completed' || data?.status === 'Failed') {
      fetchTableStats();
    }
  });

  socket.on('pos:sync:progress', () => {
    fetchTableStats();
  });

  socket.on('pos:data:updated', () => {
    fetchTableStats();
  });
});

onUnmounted(() => {
  socket.off('pos:sync:update');
  socket.off('pos:sync:progress');
  socket.off('pos:data:updated');
  socket.disconnect();
});

// Fetchers
async function fetchAllData() {
  await Promise.all([fetchTableStats(), fetchSyncJobs(), fetchWebhookLogs()]);
}

async function fetchTableStats() {
  loadingStats.value = true;
  try {
    const res = await api.get('/sync/table-stats');
    if (res.data) {
      tableStats.value = res.data.tables || {};
      failedRows.value = res.data.failedRows || [];
    }
  } catch (err: any) {
    toast.error('Không thể tải thống kê bảng đồng bộ');
  } finally {
    loadingStats.value = false;
  }
}

async function fetchSyncJobs() {
  loadingJobs.value = true;
  try {
    const res = await api.get('/sync/jobs');
    syncJobs.value = Array.isArray(res.data) ? res.data : [];
  } catch (err: any) {
    // Non-blocking
  } finally {
    loadingJobs.value = false;
  }
}

async function fetchWebhookLogs() {
  loadingWebhooks.value = true;
  try {
    const res = await api.get('/pos/webhook-logs?limit=30');
    if (res.data?.success && Array.isArray(res.data.data)) {
      webhookLogs.value = res.data.data;
    }
  } catch {
    // Non-blocking
  } finally {
    loadingWebhooks.value = false;
  }
}

// Actions
async function handleTriggerFullSync() {
  isTriggeringFullSync.value = true;
  try {
    await api.post('/sync/system/full');
    toast.success('Đã kích hoạt tiến trình đồng bộ toàn diện hệ thống');
    await fetchSyncJobs();
  } catch (err: any) {
    const msg = err.response?.data?.error || 'Không thể khởi chạy đồng bộ toàn hệ thống';
    toast.error(msg);
  } finally {
    isTriggeringFullSync.value = false;
  }
}

async function handleSyncSingleTable(tableName: string) {
  syncingTables.value[tableName] = true;
  try {
    await api.post(`/sync/table/${tableName}`);
    toast.success(`Đã bắt đầu đồng bộ bảng ${tableName}`);
    await fetchSyncJobs();
  } catch (err: any) {
    const msg = err.response?.data?.error || `Không thể kích hoạt đồng bộ ${tableName}`;
    toast.error(msg);
  } finally {
    syncingTables.value[tableName] = false;
  }
}

async function handleRetryJob(jobId: string) {
  retryingJobId.value = jobId;
  try {
    await api.post(`/sync/jobs/${jobId}/retry`);
    toast.success('Đã gửi yêu cầu chạy lại tiến trình');
    await fetchSyncJobs();
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Thử lại tiến trình thất bại');
  } finally {
    retryingJobId.value = null;
  }
}

async function handleCancelJob(jobId: string) {
  cancellingJobId.value = jobId;
  try {
    await api.post(`/sync/jobs/${jobId}/cancel`);
    toast.info('Đã gửi lệnh dừng tiến trình');
    await fetchSyncJobs();
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Hủy tiến trình thất bại');
  } finally {
    cancellingJobId.value = null;
  }
}

async function handleRetryRow(row: FailedRowItem) {
  const rowKey = `${row.tableName}-${row.id}`;
  retryingRowKey.value = rowKey;
  try {
    await api.post('/sync/retry-row', {
      tableName: row.tableName,
      rowId: row.id,
      jobId: row.jobId,
    });
    toast.success(`Đã xử lý thử lại bản ghi ${row.id}`);
    failedRows.value = failedRows.value.filter((r) => !(r.tableName === row.tableName && String(r.id) === String(row.id)));
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Thử lại bản ghi thất bại');
  } finally {
    retryingRowKey.value = null;
  }
}

async function handleRetryWebhook(webhookId: string) {
  retryingWebhookId.value = webhookId;
  try {
    await api.post(`/pos/webhook-logs/${webhookId}/retry`);
    toast.success('Đã gửi yêu cầu thực thi lại Webhook');
    await fetchWebhookLogs();
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Không thể thử lại Webhook');
  } finally {
    retryingWebhookId.value = null;
  }
}

function openErrorDrawer(tableName: string | null) {
  selectedDrawerTable.value = tableName;
  showErrorDrawer.value = true;
}

// Helpers
function getTableCount(key: string): number {
  return tableStats.value[key]?.count ?? 0;
}

function getLastSyncedText(key: string): string {
  const dateStr = tableStats.value[key]?.lastSyncedAt;
  if (!dateStr) return 'Chưa đồng bộ';
  return `Cập nhật: ${formatDate(dateStr)}`;
}

function getTableStatusColor(key: string): string {
  const errorCount = getTableErrorCount(key);
  if (errorCount > 0) return 'error';
  if (syncingTables.value[key]) return 'primary';
  if (tableStats.value[key]?.count > 0) return 'success';
  return 'grey';
}

function getTableStatusText(key: string): string {
  const errorCount = getTableErrorCount(key);
  if (errorCount > 0) return `${errorCount} lỗi`;
  if (syncingTables.value[key]) return 'Đang chạy';
  if (tableStats.value[key]?.count > 0) return 'Hoạt động';
  return 'Trống';
}

function getTableErrorCount(key: string): number {
  return failedRows.value.filter((r) => r.tableName.toLowerCase() === key.toLowerCase()).length;
}

function formatNumber(num: number): string {
  return (num || 0).toLocaleString('vi-VN');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) return '-';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diffSec = Math.max(0, Math.round((e - s) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const m = Math.floor(diffSec / 60);
  const remSec = diffSec % 60;
  return `${m}m ${remSec}s`;
}

function formatEntityName(entity: string): string {
  const map: Record<string, string> = {
    Branch: 'Chi nhánh POS',
    Category: 'Danh mục',
    Product: 'Sản phẩm',
    Customer: 'Khách hàng POS',
    CustomerInitialImport: 'Nhập KH POS ban đầu',
    CustomerPreview: 'Xem trước KH POS',
    Order: 'Đơn hàng',
    Invoice: 'Hóa đơn',
    BranchInventory: 'Tồn kho chi nhánh',
    Debt: 'Công nợ KH',
    Workshop: 'Hội thảo Workshop',
    WorkshopGuest: 'Khách mời Workshop',
    WorkshopCheckinLog: 'Nhật ký Check-in',
    WorkshopRegistrationForm: 'Biểu mẫu Đăng ký',
    WorkshopAll: 'Toàn bộ Workshop',
    All: 'Toàn bộ POS',
    SystemFull: 'Đồng bộ Toàn hệ thống',
  };
  return map[entity] || entity;
}

function formatJobStatus(status: string): string {
  const map: Record<string, string> = {
    Pending: 'Đang chờ',
    Running: 'Đang chạy',
    Completed: 'Hoàn tất',
    Failed: 'Thất bại',
    Cancelled: 'Đã hủy',
  };
  return map[status] || status;
}

function getJobStatusColor(status: string): string {
  const map: Record<string, string> = {
    Pending: 'amber-darken-2',
    Running: 'primary',
    Completed: 'success',
    Failed: 'error',
    Cancelled: 'grey-darken-1',
  };
  return map[status] || 'grey';
}
</script>

<style scoped>
.unified-sync-center-container {
  height: calc(100vh - var(--smax-topnav-h, 58px));
  overflow-y: auto;
  overflow-x: hidden;
  max-width: 1440px;
  margin: 0 auto;
  scroll-behavior: smooth;
  padding-bottom: 90px;
}

/* Thanh cuộn thanh mảnh hiện đại */
.unified-sync-center-container::-webkit-scrollbar {
  width: 8px;
}
.unified-sync-center-container::-webkit-scrollbar-track {
  background: transparent;
}
.unified-sync-center-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}
.unified-sync-center-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.scroll-top-btn {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 99;
  border-radius: 50% !important;
}

.text-slate-dark {
  color: #0f172a;
}

.tracking-tight {
  letter-spacing: -0.025em;
}

.master-sync-btn {
  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%) !important;
}

.hero-bento-card {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: #ffffff;
}

.hero-bento-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.08) !important;
}

.hero-pos-card {
  border-color: rgba(59, 130, 246, 0.25) !important;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.4) 0%, #ffffff 100%);
}

.hero-workshop-card {
  border-color: rgba(124, 58, 237, 0.25) !important;
  background: linear-gradient(180deg, rgba(245, 243, 255, 0.4) 0%, #ffffff 100%);
}

.bento-sync-card {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: #ffffff;
}

.bento-sync-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04) !important;
}

.active-sync-banner {
  background-color: rgba(79, 70, 229, 0.04) !important;
  border-color: rgba(79, 70, 229, 0.2) !important;
}

.error-row-card {
  transition: border-color 0.2s;
}

.error-row-card:hover {
  border-color: #ef4444 !important;
}

.max-w-250 {
  max-width: 250px;
}
</style>
