# Task 4 — Motion primitives dùng lại được

## Phạm vi đã thực hiện

- Tạo `PageEntrance`, `StaggerGroup`, `AnimatedCounter`, và `MotionCard` trong `frontend/src/motion`.
- Mỗi primitive dùng `useGSAP` với `scope` và `revertOnUpdate` để GSAP cleanup khi dependency thay đổi hoặc component unmount.
- `PageEntrance` và `StaggerGroup` bỏ animation trong reduced-motion mode; `AnimatedCounter` render final value ngay trong mode đó; `MotionCard` không tilt với reduced motion hoặc coarse pointer.
- Bọc đúng một `PageEntrance` trong `AppLayout`, keyed theo `location.pathname`, làm fixture tạm thời cho route contract.
- Public barrel chỉ export đúng API yêu cầu.
- Thêm e2e assertion cho `[data-page-entrance]`, route cleanup, và không có React unmount warning/error trong browser console.

## TDD evidence

### Red

Sau khi thêm test route contract nhưng trước khi tạo primitive/wrapper, đã chạy:

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
```

Kết quả: exit 1. Hai test preference pass; test route contract fail đúng nguyên nhân: locator `[data-page-entrance]` không tìm thấy tại `motion-foundation.spec.ts:27`.

Lần chạy sandbox đầu không mở được port `127.0.0.1:4173` (`EPERM`); đã chạy lại với local dev-server permission và thu được failure functional ở trên.

### Green / verification

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
```

Kết quả: exit 0, 3/3 passed. Test route contract cũng assert `unmountWarnings` rỗng.

```bash
cd frontend && npm run lint -- src/motion
```

Kết quả: exit 0, không có lint error.

```bash
cd frontend && npm run build
```

Kết quả: exit 0. Vite build hoàn thành; chỉ có cảnh báo kích thước bundle đã tồn tại (`index` 614.34 kB minified), không thuộc phạm vi Task 4.

## Self-review

- Interfaces đúng brief, gồm default selector `[data-motion-item]` và forwarding `div` props cho `MotionCard`.
- `PageEntrance`/`StaggerGroup` dùng motion values 0→18px, 0.58s, stagger 0.07, `power3.out`, và clear visual props sau tween.
- `AnimatedCounter` animate object `{ current: 0 }`, render `Math.round`, và set exact final value lúc complete/reduced mode.
- `MotionCard` dùng `gsap.quickTo()` cho `rotationX`, `rotationY`, và `y`; pointer leave về 0. Không xoá `transform` inline do caller truyền vào; GSAP context thực hiện cleanup/revert.
- Không thay CSS, token, hay navigation ngoài wrapper được preflight cho phép.

## Commit

Các thay đổi Task 4 được commit cùng message `feat: add reusable motion primitives`.

## Fix round 1/5 — counter precision and SPA cleanup

### Changes

- `AnimatedCounter` vẫn làm tròn các frame trung gian, nhưng reduced mode và `onComplete` nay dùng `formatter(value)` với input chính xác. Giá trị `12.5` với formatter một chữ số thập phân kết thúc là `12.5`.
- `AppLayout` key `PageEntrance` theo pathname. Một click router thực sự sẽ unmount entrance cũ, để GSAP context revert toàn bộ visual styles do animation sở hữu trước khi node detached.
- Thay test `page.goto()`/`evaluateAll()` tautological bằng SPA click qua `Link` “Học liệu”. Test giữ reference node cũ, xác nhận nó detached, và xác nhận `opacity`, `transform`, `visibility` inline đã được revert/clear.
- Thêm harness hẹp tại `frontend/e2e/fixtures/motion-harness.html` và `.tsx`. Harness chỉ được Vite phục vụ cho Playwright, mount `AnimatedCounter` thật trong `MotionProvider`, và không được import bởi production app/bundle. Nó cho coverage component thật của decimal formatter ở full và reduced mode mà không thêm test-only route hoặc product UI ẩn.

### Red evidence

Sau khi thay tests/harness nhưng trước khi sửa production code, đã chạy:

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
```

Kết quả: exit 1; 2 passed, 3 failed.

- SPA cleanup nhận `{ detached: false, animationStylesRemoved: false }`.
- Full-mode decimal counter nhận `13.0`, expected `12.5`.
- Reduced-mode decimal counter nhận `13.0`, expected `12.5`.

### Final verification

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
```

Kết quả: exit 0, 5/5 passed.

```bash
cd frontend && npm run lint -- src/motion e2e/motion-foundation.spec.ts e2e/fixtures/motion-harness.tsx
```

Kết quả: exit 0, không lint error.

```bash
cd frontend && npm run build
```

Kết quả: exit 0. Vite vẫn chỉ báo warning bundle chính 614.35 kB minified, ngoài phạm vi fix này.

### Fix self-review

- Final value không đi qua `Math.round`; chỉ intermediate frame đi qua rounding như brief yêu cầu.
- Navigation assertion dùng client-side Link (không document reload), retain reference DOM của entrance cũ, và chứng minh node detached + inline visual styles đã được cleanup.
- Không thêm hidden production route/component; fixture nằm hoàn toàn trong e2e test tree.
- Không thay CSS/token/navigation ngoài `PageEntrance` key cần thiết cho lifecycle contract.

### Commit

Fix được commit với message `fix: correct motion counter completion and cleanup tests`.
