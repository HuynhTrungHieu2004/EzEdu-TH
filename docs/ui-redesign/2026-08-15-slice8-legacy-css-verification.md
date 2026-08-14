# Lát 8 — Xoá CSS legacy hết consumer (2026-08-15)

Bước 8 trong lộ trình `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10,
tiếp sau lát 7 (`2026-08-14-slice7-public-verification.md`).

Ràng buộc từ spec §3: "CSS legacy được cô lập và di trú theo từng lát, **sau đó loại bỏ khi không còn consumer**".

## Cách rà consumer

Không xoá theo cảm tính. Quy trình:

1. Trích mọi class khai báo trong `src/index.css` (258 class).
2. Quét toàn bộ `src/**` (trừ chính `index.css`) và `e2e/**` tìm nơi dùng.
3. **Chặn dương tính giả của bước 2**: nhiều class được ghép động, ví dụ
   `` `knowledge-map-${item.status}` `` (PersonalizationPage) và
   `` `verification-issue--${issue.issue_type}` `` (IssueCard). Nếu chỉ so khớp nguyên chuỗi thì
   `knowledge-map-weak`, `verification-badge--high`… bị coi là chết oan. Bước rà bổ sung kiểm tra
   tiền tố kết thúc bằng `-` có xuất hiện ngay trước `${` hay không, và giữ lại 25 class dạng này.
4. Xoá bằng **postcss** thay vì regex tự viết: bản regex đầu tiên bỏ sót 40+ rule (rule nằm sau comment,
   selector con kiểu `.welcome-panel h2`, danh sách selector nhiều phần). postcss cho phép xử lý đúng ba
   trường hợp: rule chết hoàn toàn thì xoá, selector chết lẫn trong danh sách thì chỉ cắt phần chết,
   `@media` rỗng sau khi cắt thì xoá luôn.
5. Vòng hai: rule mà **class gốc** đã chết (`.sidebar-collapsed .theme-toggle`) cũng chết theo, vì gốc
   không bao giờ khớp nữa.
6. Cuối cùng rà biến CSS: 5 biến (`--chat-bg`, `--glass-white-ultra`, `--header-h`, `--sidebar-collapsed`,
   `--success-text`) không còn ai `var()` tới, xoá cả 8 khai báo (light + dark).

## Kết quả

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| Dòng `src/index.css` | 2905 | 2144 |
| Class khai báo | 258 | 186 |
| Biến CSS khai báo | 84 | 79 |

116 rule bị xoá, 11 selector bị cắt bớt phần chết, 2 at-rule rỗng bị xoá. Sau khi xoá, rà lại lần nữa:
**0 class trong `index.css` còn thiếu consumer**.

Nhóm bị xoá lớn nhất là tàn dư của các đợt trước: khung `.app-header`/`.app-nav`/`.sidebar-*` cũ (đã thay
bằng `app-layout.css`), `.auth-page`/`.auth-card`/`.form-input` (lát 7 vừa bỏ), `.hero-*`/`.feature-*`/
`.welcome-panel` của landing cũ, `.table-card`/`.data-table` của kho học liệu (lát 5), và toàn bộ khối
`.verification-*` của một panel kiểm chứng học liệu đã bị gỡ khỏi UI từ trước.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run test:foundation` | PASS — 438/438 trên 6 project viewport |
| `npx playwright test e2e/authenticated-responsive.spec.ts e2e/public-responsive.spec.ts` | PASS — 360/360 |
| `npm run test:chat` | PASS — 11/11 |

Chụp lại bằng mắt sau khi xoá (desktop-1440): dashboard học sinh, chat, kho học liệu, danh sách người dùng
quản trị, landing, đăng nhập — không khối nào mất nền, mất viền hay đổ layout.

## Nợ còn lại

- `index.css` vẫn còn 2144 dòng và **vẫn là hệ màu Crystal cũ ở tầng biến** (`--accent`, `--surface`,
  `--glass-*`…). Chúng còn sống vì `tokens.css` nạp sau và trỏ alias đè lên, nên component cũ vẫn chạy đúng
  màu học thuật. Muốn xoá tiếp phải di trú từng trang còn dùng alias (`QuestionHistoryPage`,
  `ExamBlueprintDetailPage`, `QuestionSetEditorPage`, `ClassesPage`, `WebKnowledgePage`, `FileUpload`) —
  đúng phần nợ đã ghi ở lát 5.
- Nợ khác giữ nguyên: onboarding chưa phải stepper (spec §6.3), landing chưa có pinned data pipeline
  (spec §7.2), `public-responsive` fail khi máy có `VITE_GOOGLE_CLIENT_ID` thật,
  `PathnameNavigationEpoch`, mật độ `KnowledgeScopeSelector` trên mobile.

## Hoãn sang lát sau

- Lát 9: QA toàn hệ thống và tinh chỉnh motion — lát cuối của lộ trình.
