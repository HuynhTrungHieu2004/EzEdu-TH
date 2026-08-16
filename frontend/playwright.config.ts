import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

/** Các bộ cần điều kiện riêng: đo hiệu năng chạy một mình, ba bộ còn lại cần backend thật. */
const NEEDS_OWN_RUNNER = /motion-performance|live-smoke|live-crud|live-ai|mobile-audit/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  // Sáu project viewport chạy song song trên cùng một dev server: các khẳng định
  // chờ dữ liệu bất đồng bộ rải rác fail ở hạn mặc định 5s (mỗi lượt chạy một
  // bài khác nhau, chạy lại riêng thì luôn pass). Nới hạn chờ cho toàn bộ
  // `expect` thay vì vá từng bài.
  expect: { timeout: 15_000 },
  // Cùng lý do: các bài quét axe trên trang chủ chạm hạn 30s mặc định khi máy
  // đang chạy sáu project. Bài nào thật sự treo vẫn dừng, chỉ chậm hơn.
  timeout: 60_000,
  use: {
    baseURL,
    locale: 'vi-VN',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_API_BASE_URL: baseURL,
      // Google Identity Services từ chối origin 127.0.0.1:4173 và log lỗi ra
      // console, làm mọi bài kiểm "không lỗi trình duyệt" fail trên máy có
      // client ID thật trong .env. Bộ kiểm thử không dùng đăng nhập Google:
      // chạy với client ID rỗng để nút hiện đúng trạng thái "chưa cấu hình"
      // và console sạch. Ai cần thử luồng Google thì chạy dev server thường.
      VITE_GOOGLE_CLIENT_ID: '',
    },
  },
  projects: [
    // Ma trận viewport bỏ qua bài đo hiệu năng — số đo sẽ nhiễu khi sáu project
    // chạy song song, và nhịp khung hình không phụ thuộc bề rộng cửa sổ.
    { name: 'desktop-1440', testIgnore: NEEDS_OWN_RUNNER, use: { viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1280', testIgnore: NEEDS_OWN_RUNNER, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'tablet-landscape-1024', testIgnore: NEEDS_OWN_RUNNER, use: { viewport: { width: 1024, height: 768 } } },
    { name: 'tablet-portrait-768', testIgnore: NEEDS_OWN_RUNNER, use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-390', testIgnore: NEEDS_OWN_RUNNER, use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-360', testIgnore: NEEDS_OWN_RUNNER, use: { viewport: { width: 360, height: 800 } } },
    // Project riêng cho bài đo hiệu năng, chạy tuần tự một mình.
    {
      name: 'perf',
      testMatch: /motion-performance/,
      workers: 1,
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
});
