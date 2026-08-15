import { defineConfig } from '@playwright/test';

/**
 * Cấu hình cho các luồng TỐN HẠN MỨC AI với backend thật.
 *
 * Giống `playwright.live.config.ts` nhưng chạy `live-ai.spec.ts` và nới hạn giờ:
 * mỗi lượt gọi Gemini thật (embedding, sinh câu hỏi, chấm tự luận) và đẩy tệp
 * lên Cloudinary, nên chỉ chạy khi thực sự muốn tiêu hạn mức.
 */
const baseURL = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: /live-ai/,
  timeout: 600_000,
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
