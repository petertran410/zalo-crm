<!--
  Design Read: Reading this as: POS Hub & Management slice for CRM users/sales agents,
  with a clean corporate-modern and slightly glassmorphic design language,
  leaning toward Vuetify 3 unified components + curated slate neutrals.
  Dials: DESIGN_VARIANCE: 5, MOTION_INTENSITY: 4, VISUAL_DENSITY: 5
-->
<template>
  <div class="pos-hub-container pa-6">
    <!-- Page Header -->
    <header class="hub-header d-flex justify-space-between align-center mb-8 pb-4 border-b">
      <div class="header-title">
        <div class="d-flex align-center gap-2 mb-1">
          <v-icon color="primary" size="28">mdi-storefront-outline</v-icon>
          <h1 class="text-h4 font-weight-bold slate-dark">KiotViet POS Hub</h1>
        </div>
        <p class="text-body-2 grey--text text--darken-1 mb-0">
          Trung tâm điều hành đồng bộ và quản lý dữ liệu từ hệ thống KiotViet POS
        </p>
      </div>
      <div class="header-actions">
        <v-btn
          v-if="authStore.isAdmin"
          to="/sync-center"
          color="primary"
          variant="tonal"
          class="sync-btn text-capitalize px-4"
          elevation="0"
          rounded="lg"
        >
          <v-icon start size="18" class="mr-1">mdi-database-sync</v-icon> Trung tâm đồng bộ
        </v-btn>
        <v-chip
          v-else
          color="success"
          size="small"
          variant="tonal"
          prepend-icon="mdi-check-circle-outline"
          class="font-weight-medium"
        >
          Dữ liệu đồng bộ sẵn sàng
        </v-chip>
      </div>
    </header>

    <!-- Bento Grid Section -->
    <v-row class="hub-grid" justify="start">
      <!-- Customers Card -->
      <v-col cols="12" md="6" class="animate-fade-in-left">
        <v-card
          class="hub-card pa-6 fill-height d-flex flex-column justify-space-between"
          outlined
          hover
          to="/pos/customers"
        >
          <div>
            <div class="icon-box mb-6 bg-blue-glow">
              <v-icon color="info" size="32">mdi-account-group-outline</v-icon>
            </div>
            <h2 class="text-h5 font-weight-bold mb-2">Khách hàng</h2>
            <p class="text-body-2 grey--text text--darken-2 mb-4 pr-4">
              Xem và tra cứu danh sách khách hàng được đồng bộ từ POS. Hỗ trợ tìm kiếm theo tên, số điện thoại, lọc nhóm và phân trang bằng con trỏ tối ưu hiệu suất.
            </p>
          </div>
          <div class="card-footer d-flex align-center primary--text font-weight-medium">
            <span>Quản lý khách hàng</span>
            <v-icon right size="16" class="ml-1 arrow-icon">mdi-arrow-right</v-icon>
          </div>
        </v-card>
      </v-col>

      <!-- Products Card -->
      <v-col cols="12" md="6" class="animate-fade-in-right">
        <v-card
          class="hub-card pa-6 fill-height d-flex flex-column justify-space-between"
          outlined
          hover
          to="/pos/products"
        >
          <div>
            <div class="icon-box mb-6 bg-teal-glow">
              <v-icon color="success" size="32">mdi-package-variant-closed</v-icon>
            </div>
            <h2 class="text-h5 font-weight-bold mb-2">Sản phẩm</h2>
            <p class="text-body-2 grey--text text--darken-2 mb-4 pr-4">
              Theo dõi danh mục sản phẩm của cửa hàng. Quản lý thông tin mã SKU, tên mặt hàng và đơn giá cơ sở đồng bộ tự động từ hệ thống quản lý bán hàng.
            </p>
          </div>
          <div class="card-footer d-flex align-center primary--text font-weight-medium">
            <span>Xem danh mục sản phẩm</span>
            <v-icon right size="16" class="ml-1 arrow-icon">mdi-arrow-right</v-icon>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
</script>

<style scoped>
.pos-hub-container {
  min-height: calc(100vh - var(--smax-topnav-h));
  background-color: #f8fafc;
}

.border-b {
  border-bottom: 1px solid #e2e8f0;
}

.slate-dark {
  color: #1e293b;
}

.gap-1 {
  gap: 4px;
}

.gap-2 {
  gap: 8px;
}

/* ── Sync Progress Panel ── */
.sync-progress-panel .v-card {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
}

.progress-bar {
  border-radius: 6px;
}

/* ── Bento Cards ── */
.hub-card {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background-color: #ffffff;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.hub-card:hover {
  transform: translateY(-4px);
  border-color: rgba(23, 134, 190, 0.3) !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05) !important;
}

.hub-card:hover .arrow-icon {
  transform: translateX(4px);
}

.arrow-icon {
  transition: transform 0.2s ease;
}

.icon-box {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-blue-glow {
  background-color: rgba(3, 169, 244, 0.08);
  border: 1px solid rgba(3, 169, 244, 0.15);
}

.bg-teal-glow {
  background-color: rgba(76, 175, 80, 0.08);
  border: 1px solid rgba(76, 175, 80, 0.15);
}

.sync-btn {
  font-weight: 600;
  letter-spacing: 0.2px;
}

/* Entry animations */
.animate-fade-in-left {
  animation: fadeInLeft 0.4s ease-out;
}

.animate-fade-in-right {
  animation: fadeInRight 0.4s ease-out;
}

@keyframes fadeInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
