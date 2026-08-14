import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Tách vendor khỏi chunk chính.
         *
         * Trang đã lazy-load theo route, nhưng React + Router + GSAP + icon vẫn
         * nằm chung một chunk 632 kB nên lần tải đầu phải chờ hết mới chạy được.
         * Tách theo thư viện để phần đổi thường xuyên (mã ứng dụng) không làm
         * mất cache của phần gần như không đổi (vendor).
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('gsap')) return 'vendor-gsap'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('/react-dom/') || id.includes('/react/')) return 'vendor-react'
          if (id.includes('axios')) return 'vendor-http'
          return 'vendor'
        },
      },
    },
  },
})
