<template>
  <!-- login 2 cột — banner thương hiệu trái + form phải.
       Bỏ container 450px cũ, để LoginView tự dựng 2 cột full màn. -->
  <v-app class="auth-shell">
    <v-main class="d-flex align-center justify-center" style="min-height: 100vh;">
      <slot />
    </v-main>
  </v-app>
</template>

<style scoped>
/* Nền tổng teal-navy nhạt — đồng bộ thương hiệu */
.auth-shell {
  background: linear-gradient(135deg, #e8eef1 0%, #d3dde2 100%);
}
</style>
