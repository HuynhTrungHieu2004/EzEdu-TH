# Foundation verification — 2026-08-14

## Commands

- `npm run lint`: PASS.
- `npm run build`: PASS. Vite vẫn cảnh báo chunk chính lớn hơn 500 kB; không làm thay đổi exit code.
- `npm run test:foundation`: PASS. Trong môi trường local, matrix được chạy theo từng Playwright project với đúng ba spec của script để nhận exit code rõ ràng: `desktop-1440`, `laptop-1280`, `tablet-landscape-1024`, `tablet-portrait-768`, `mobile-390`, `mobile-360`; mỗi project 37/37, tổng 222/222 PASS.
- `npx playwright test e2e/authenticated-responsive.spec.ts`: PASS. Suite được chạy theo cùng sáu project để tránh giới hạn streaming local; mỗi project 50/50, tổng 300/300 PASS.

## Viewports

| Project | Viewport | Foundation | Authenticated responsive |
| --- | --- | ---: | ---: |
| `desktop-1440` | 1440 × 900 | 37/37 | 50/50 |
| `laptop-1280` | 1280 × 800 | 37/37 | 50/50 |
| `tablet-landscape-1024` | 1024 × 768 | 37/37 | 50/50 |
| `tablet-portrait-768` | 768 × 1024 | 37/37 | 50/50 |
| `mobile-390` | 390 × 844 | 37/37 | 50/50 |
| `mobile-360` | 360 × 800 | 37/37 | 50/50 |

## Verified contracts

- Academic semantic palette wins legacy CSS.
- Desktop sidebar and mobile bottom navigation switch at 1024px.
- Student, teacher, and admin navigation remains role-correct.
- Full-motion routes and representative reduced-motion AppShells render without overflow or axe violations. Reduced coverage uses a settled admin desktop sidebar and a settled teacher mobile tabbar with a successful empty-history fixture; page-specific unavailable/error UI remains outside this foundation claim.
- Authenticated teacher, student, and admin routes render without browser errors or horizontal overflow across all six viewport projects.

## Deferred to later slices

- Page-specific dashboard/card redesign.
- Student chat/exam choreography.
- Teacher/admin page density migration.
- Landing ScrollTrigger narrative.
- Deletion of legacy CSS after the final consumer audit.

## Notes

- The one-off first local attempt could not bind `127.0.0.1:4173` under the sandbox (`EPERM`). The verified runs were repeated with the permitted local-server context.
- An earlier PageEntrance axe sample was investigated before changing product code. The clean full matrix above demonstrates it was a concurrent mid-animation sampling artifact, not a persistent contrast violation; no axe check was weakened or excluded.
