import { defineConfig, devices } from '@playwright/test';

/**
 * Rà soát trải nghiệm di động trên BACKEND THẬT, dùng dev server đang chạy ở 5173.
 *
 * Hai máy để đúng hai lý do khác nhau:
 * - iPhone 12 chạy WebKit — đây mới là nơi luật "chạm vào ô nhập nhỏ hơn 16px
 *   thì tự phóng to cả trang" áp dụng. Cần `npx playwright install webkit`.
 * - Pixel 5 chạy Chromium, đại diện máy Android.
 */
const baseURL = 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: /mobile-audit/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'vi-VN',
    trace: 'off',
  },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 12'] } },
    { name: 'android-chromium', use: { ...devices['Pixel 5'] } },
  ],
});
