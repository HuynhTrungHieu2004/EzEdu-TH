# Lát 9 — QA toàn hệ thống và tinh chỉnh motion (2026-08-15)

Bước cuối của lộ trình `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10.
Lát này không thêm giao diện mới: kiểm lại toàn hệ thống theo §11 "Tiêu chuẩn hoàn thành" và thống nhất
thang chuyển động.

## Tinh chỉnh motion

Trước lát này mỗi component tự chọn một con số: 0.24 / 0.28 / 0.32 / 0.34 / 0.42 / 0.58 / 0.62 giây, nên
cùng một loại chuyển động lại chạy khác nhau giữa các trang. `tokens.css` có `--ez-motion-fast|base|slow`
nhưng GSAP không đọc được biến CSS.

Thêm `src/motion/timing.ts` làm thang dùng chung, khớp đúng token CSS:

| Bậc | Giá trị | Dùng cho |
| --- | ---: | --- |
| `fast` | 0.16s | phản hồi trực tiếp thao tác |
| `base` | 0.28s | đổi trạng thái trong cùng khung — chuyển câu, thẻ cấu hình, active indicator, tilt card |
| `slow` | 0.52s | nội dung mới vào màn hình — page entrance, stagger, scroll reveal |

`MOTION_EASE.standard`/`emphasized` khớp `--ez-ease-standard`/`--ez-ease-emphasized`; `MOTION_STAGGER`
(0.07s) thay ba giá trị stagger khác nhau trước đây. Đã áp cho `PageEntrance`, `StaggerGroup`, `ScrollReveal`,
`MotionCard`, active indicator trong `AppLayout`, chuyển câu trong `ExamAttemptPage`, và `StudyExamCard`.
`Confetti` giữ 1.1s + 0.3s vì đó là quỹ đạo rơi một lần, không thuộc thang trạng thái.

## Kiểm QA mới (`e2e/system-qa.spec.ts`)

Spec §11 yêu cầu "route nghiệp vụ được bảo vệ đúng vai trò, không chỉ ẩn menu". Trước lát này chỉ có
`RoleRoute`/`AdminRoute` trong code mà không có bài kiểm nào chứng minh. Nay khoá lại bằng ma trận vai trò:

- học sinh gõ thẳng 6 URL của giáo viên (`/documents`, `/question-bank`, `/exam-blueprints`,
  `/question-history`, `/classes`, `/teacher/content-history`) đều bị đưa về `/dashboard`;
- giáo viên gõ thẳng 3 URL của học sinh (`/published-questions`, `/learning-history`, `/take-exam/:id`) cũng vậy;
- giáo viên không vào được `/admin/*`; quản trị viên mở `/documents` bị đưa về `/admin/dashboard`;
- trang bị chặn **không lộ nội dung** trước khi chuyển hướng (kiểm tiêu đề trang trái phép không tồn tại).

Thêm hai bài về dọn dẹp chuyển động (§11 "không còn timeline/listener sau khi route unmount"): sau 5 lượt
điều hướng, và sau khi rời landing (nơi có ScrollTrigger), không phần tử nào còn giữ `opacity`/`visibility`/
`transform` inline do GSAP đặt tạm. Cuối cùng, ba vai trò đi hết luồng chính của mình: `#main` không rỗng,
không tràn ngang, không lỗi trình duyệt.

## Kết quả kiểm chứng toàn hệ thống

| Lệnh | Kết quả |
| --- | --- |
| `npx tsc -b --force` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS (còn cảnh báo chunk > 500 kB — xem nợ) |
| `npm run test:chat` | PASS — 11/11 |
| `npx playwright test` (toàn bộ, 6 project viewport) | PASS — **858/858** |
| `pytest` (toàn bộ backend) | PASS — **673 passed, 17 subtests** |

11 file spec, 77 bài kiểm × các project viewport. Trong lần chạy áp chót có 1 bài fail do **hạ tầng test**
(`ENOENT ... .playwright-artifacts-26/traces/...` khi hai lần chạy Playwright song song ghi chung
`test-results/`), không phải lỗi ứng dụng; chạy lại riêng thì 6/6 PASS, và lần chạy sạch cuối cùng 858/858.

## Đối chiếu §11 "Tiêu chuẩn hoàn thành"

| Tiêu chuẩn | Trạng thái |
| --- | --- |
| TypeScript và production build thành công | ĐẠT |
| Không horizontal overflow ở viewport chuẩn | ĐẠT — kiểm ở 6 viewport trong `authenticated-responsive`, `public-responsive`, `system-qa` |
| Luồng chính của ba vai trò được Playwright kiểm tra | ĐẠT |
| Axe không có lỗi accessibility nghiêm trọng | ĐẠT — trang công khai, khung app, kho học liệu, làm bài/kết quả, quản trị (có dữ liệu) |
| Giao diện hoạt động với `prefers-reduced-motion` | ĐẠT — kiểm ở foundation, dashboard, làm bài, landing |
| Không còn timeline/listener sau khi route unmount | ĐẠT ở mức quan sát được từ DOM (không còn prop inline của GSAP); chưa đo trực tiếp số tween/ScrollTrigger vì lớp motion không lộ instance ra ngoài |
| Animation kiểm tra trên thiết bị yếu và mobile | MỘT PHẦN — có nhánh `coarsePointer` (giảm nửa số mảnh confetti, bỏ tilt) và chạy đủ ở viewport mobile-360/390, nhưng chưa đo FPS trên máy thật |
| Ảnh so sánh trước/sau cho trang trọng yếu | MỘT PHẦN — có ảnh trước/sau cho chat, dashboard học sinh, kho học liệu; các trang khác chỉ có ảnh sau |
| Không mất chức năng hiện có | ĐẠT — 858 bài e2e + 11 bài unit chat + bộ test backend |
| Route nghiệp vụ bảo vệ đúng vai trò | ĐẠT — ma trận vai trò trong `system-qa.spec.ts` |

## Nợ còn lại sau toàn bộ lộ trình

1. **Onboarding chưa phải stepper** (spec §6.3) — cần API lưu theo từng bước.
2. **Landing chưa có pinned data pipeline** (spec §7.2) — hiện chỉ reveal theo khối và stagger card.
3. **Các trang giáo viên chưa di trú**: `QuestionHistoryPage`, `ExamBlueprintDetailPage`,
   `QuestionSetEditorPage`, `ClassesPage`/`ClassDetailPage`, `WebKnowledgePage`, và `FileUpload`. Chúng còn
   sống nhờ lớp alias trong `tokens.css`, nên `index.css` (2144 dòng) chưa xoá tiếp được.
4. **`public-responsive` fail 18 bài khi máy có `VITE_GOOGLE_CLIENT_ID` thật** — GSI báo origin
   `http://127.0.0.1:4173` chưa được phép. Sửa ở Google Cloud console, không che log trong helper.
5. **Cảnh báo chunk > 500 kB** khi build — chưa code-split; không chặn nhưng ảnh hưởng tải lần đầu.
6. **`PathnameNavigationEpoch`** vẫn bọc `UNSAFE_NavigationContext` của React Router để reset trạng thái thu
   gọn nhóm nav — 75 dòng cho một hành vi kế hoạch không yêu cầu.
7. **Mật độ `KnowledgeScopeSelector`** trên mobile vẫn chiếm ~280px trước khi tới hội thoại.
