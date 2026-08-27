import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

/**
 * Vuetify theme — Hi-CRM.
 * `hsLight` (default) = bộ token HS (teal-navy shell + metallic blue #1786be),
 * mirror PART 1 của hs-crm-theme.css. `smax-light`/`legacy-dark` giữ fallback
 * cho các view chưa migrate; sẽ rút ở cụm cleanup cuối.
 */
export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    // hsLight làm mặc định. Bỏ đọc localStorage cũ (tránh kẹt 'smax-light').
    defaultTheme: 'hsLight',
    themes: {
      'hsLight': {
        dark: false,
        colors: {
          primary: '#0068FF',          // Zalo Blue #0068FF
          'primary-darken-1': '#0057d6',
          secondary: '#2980ff',        // Zalo tint
          accent: '#0046b8',
          background: '#f7f9fb',       // Surface light
          surface: '#ffffff',
          'surface-variant': '#f1f4f9',
          success: '#12b76a',
          warning: '#f5a524',
          error: '#f04438',
          info: '#0068FF',
          'nav-a': '#0068FF',
          'nav-b': '#0046b8',
          'nav-accent': '#2980ff',
          'on-surface': '#141a24',
          'on-background': '#141a24',
          'on-primary': '#ffffff',
        },
        variables: {
          'border-color': '#e7eaf0',
          'border-opacity': 1,
          'high-emphasis-opacity': 1,
          'medium-emphasis-opacity': 0.78,
          'theme-radius': '8px',
        },
      },
      'smax-light': {
        dark: false,
        colors: {
          background: '#f5f6fa',
          surface: '#ffffff',
          'surface-variant': '#fafbfc',
          primary: '#1786be',
          secondary: '#1f2330',
          accent: '#1786be',
          error: '#ff3d00',
          warning: '#ff9100',
          success: '#00c853',
          info: '#2196f3',
          'on-background': '#212121',
          'on-surface': '#212121',
          'on-primary': '#ffffff',
          'on-secondary': '#ffffff',
        },
      },
      'legacy-dark': {
        dark: true,
        colors: {
          background: '#0A192F',
          surface: '#112240',
          'surface-variant': '#1D2D50',
          primary: '#00F2FF',
          secondary: '#E6F1FF',
          accent: '#00F2FF',
          error: '#FF5252',
          warning: '#FFB74D',
          success: '#4CAF50',
          info: '#00F2FF',
          'on-background': '#E6F1FF',
          'on-surface': '#E6F1FF',
          'on-primary': '#0A192F',
        },
      },
    },
  },
  defaults: {
    // HS defaults: nút bo md không uppercase, card bo lg viền, chip pill.
    // Mật độ mặc định là 'compact' cho mọi control nhập liệu — CRM hiển thị
    // nhiều trường trên một hàng, để 'default' làm form cao gấp rưỡi và mỗi
    // màn lại tự khai báo density riêng, dẫn tới cao thấp so le giữa các trang.
    VBtn: { variant: 'flat', rounded: 'md', style: 'text-transform:none;letter-spacing:0;' },
    VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VAutocomplete: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VCombobox: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VCheckbox: { density: 'compact', hideDetails: 'auto', color: 'primary' },
    VRadioGroup: { density: 'compact', hideDetails: 'auto' },
    VSwitch: { density: 'compact', hideDetails: 'auto', color: 'primary', inset: true },
    VCard: { rounded: 'lg', variant: 'flat' },
    VChip: { rounded: 'pill', size: 'small' },
    VDialog: { maxWidth: 600 },
    VList: { density: 'compact' },
    VTooltip: { location: 'bottom' },
  },
});

/* ── HS helpers (mirror hs-vuetify-theme.ts) — dùng trong template ── */
export function scoreLevel(score: number): 'zero' | 'low' | 'mid' | 'high' {
  if (score === 0) return 'zero';
  if (score < 40) return 'low';
  if (score < 70) return 'mid';
  return 'high';
}
export const SCORE_COLORS = {
  zero: { bg: '#eef1f6', fg: '#94a3b8' },
  low: { bg: '#fdf3e2', fg: '#b45309' },
  mid: { bg: '#e9f3ff', fg: '#1565c0' },
  high: { bg: '#e7f7ef', fg: '#157f3c' },
} as const;
export const REL_KIND = {
  friend: { label: 'Đã kết bạn', dot: '#12b76a', bg: '#e7f7ef', fg: '#157f3c' },
  pending_friend: { label: 'Đã gửi mời', dot: '#f5a524', bg: '#fdf3e2', fg: '#b45309' },
  chatting_stranger: { label: 'Đang nhắn lạ', dot: '#1786be', bg: '#e4f1f8', fg: '#1565c0' },
  ghost: { label: 'Đã ngắt', dot: '#9aa3b2', bg: '#f1f4f9', fg: '#475066' },
} as const;
