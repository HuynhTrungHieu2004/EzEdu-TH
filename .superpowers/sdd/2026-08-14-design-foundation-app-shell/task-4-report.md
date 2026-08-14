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
