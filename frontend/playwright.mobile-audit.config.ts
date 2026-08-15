import { defineConfig, devices } from '@playwright/test';

/** Audit tạm thời trên thiết bị di động thật (emulation), dùng dev server đang chạy ở 5173. */
export default defineConfig({
  testDir: './e2e',
  testMatch: /mobile-audit/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'vi-VN',
    // Pixel 5 dùng Chromium (WebKit chưa cài trên máy này): 393x851, có cảm ứng.
    ...devices['Pixel 5'],
    trace: 'off',
  },
});
