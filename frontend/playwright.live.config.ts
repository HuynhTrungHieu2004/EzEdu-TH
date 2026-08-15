import { defineConfig } from '@playwright/test';

/**
 * Cấu hình chạy thử với BACKEND THẬT.
 *
 * `playwright.config.ts` ép `VITE_API_BASE_URL` về chính cổng dev server (mọi
 * lời gọi API bị stub trong test), nên không dùng lại được cho lần chạy thật.
 * File này chạy dev server riêng ở cổng 5173 (nằm trong BACKEND_CORS_ORIGINS), trỏ thẳng vào FastAPI ở 8000.
 */
const baseURL = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: /live-smoke|live-crud/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'vi-VN',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_API_BASE_URL: 'http://127.0.0.1:8000',
      VITE_API_URL: 'http://127.0.0.1:8000',
      VITE_GOOGLE_CLIENT_ID: '',
    },
  },
});
