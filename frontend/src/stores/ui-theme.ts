/**
 * stores/ui-theme.ts — cờ nền tối, đặt từ nút trăng trên nav.
 *
 * Token tối CHỈ có ở màn Khách hàng; app còn lại bị ép sáng. Nên cờ này
 * chỉ đổi màu màn đã khai báo [data-theme='dark'], không phải dark toàn app.
 * Dùng lại key 'peopleview.theme.v1' để giữ lựa chọn đã lưu.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

const LS_KEY = 'peopleview.theme.v1';

function readStored(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === 'dark';
  } catch {
    return false;
  }
}

export const useUiThemeStore = defineStore('uiTheme', () => {
  const isDark = ref(readStored());

  function toggle() {
    isDark.value = !isDark.value;
    try {
      localStorage.setItem(LS_KEY, isDark.value ? 'dark' : 'light');
    } catch { /* private mode — giữ trạng thái trong phiên */ }
  }

  return { isDark, toggle };
});
