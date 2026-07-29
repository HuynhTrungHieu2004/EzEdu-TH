# EzEdu AI — Navigation theo vai trò (Giai đoạn 2)

- **Ngày:** 2026-07-28
- **Dựa trên:** [01-audit-report.md](01-audit-report.md), [02-information-architecture.md](02-information-architecture.md)
- **Trạng thái:** Tài liệu thiết kế. Chưa triển khai giao diện.

---

## 1. Quy tắc chung cho navigation

| Quy tắc | Áp dụng |
|---|---|
| Tối đa 5–7 nhóm ở navigation chính | Học sinh 5–6, Giáo viên 5, Admin 7 nhóm |
| Một tác vụ = một vị trí chính | Không có CTA nào trỏ tới đích đã có trong nav |
| Chức năng ít dùng → menu phụ / trang chi tiết / menu ngữ cảnh | Xem §6 |
| Nav không chứa mục dẫn tới trang chắc chắn 403 | Mục phụ thuộc feature flag bị ẩn khi flag tắt |
| Icon dùng một thư viện duy nhất | `lucide-react` (đã có trong `package.json`) — **không dùng emoji** |
| Icon-only button phải có `aria-label` + tooltip | Ví dụ: nút thu gọn sidebar, nút menu ngữ cảnh |
| Mục đang active phải nhận biết được không chỉ bằng màu | Thêm chỉ báo hình dạng (thanh dọc bên trái) + `aria-current="page"` |

### 1.1 Thay thế emoji bằng icon

Sửa lỗi H1 của audit. Toàn bộ emoji trong navigation được thay bằng icon `lucide-react`:

| Hiện tại | Thay bằng (lucide) |
|---|---|
| `📊 Dashboard` | `LayoutDashboard` |
| `📚 Học liệu & Upload` | `Library` |
| `💬 Hỏi đáp AI` | `MessageSquare` |
| `📋 Ngân hàng câu hỏi` | `FileQuestion` |
| `🏫 Lớp học của tôi` | `Users` |
| `✨ Sinh đề nhanh` | `Sparkles` (nếu còn dùng như nút hành động) |
| `📝 Bài thi của bạn` | `ClipboardList` |
| `🕘 Lịch sử học tập` | `History` |
| `🎯 Cá nhân hóa` | `Target` |
| `📈 Thống kê kết quả` | `TrendingUp` |
| `☀️ Sáng` / `🌙 Tối` / `🖥️ Hệ thống` | `Sun` / `Moon` / `Monitor` — chuyển vào Cài đặt |
| `🚪 Đăng xuất` | `LogOut` — chuyển vào menu người dùng |
| `🔬 Phân cụm (K-Means)` | Gỡ khỏi UI giáo viên hoàn toàn |

---

## 2. Navigation — KHÁCH

### 2.1 Header desktop

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [EzEdu AI]     Cách hoạt động   Tính năng   FAQ        Đăng nhập  [Bắt │
│   logo+chữ                                                       đầu    │
│                                                                  miễn   │
│                                                                  phí]   │
└──────────────────────────────────────────────────────────────────────────┘
     ↑ trái                ↑ giữa                          ↑ phải
```

- **3 link giữa** — đúng ngưỡng "không để quá nhiều menu".
- **Đăng nhập** dạng text link (hành động phụ).
- **Bắt đầu miễn phí** dạng nút primary → `/register`.
- Header dính khi cuộn, chiều cao 64px desktop / 56px mobile.

### 2.2 Header mobile (< 768px)

```
┌────────────────────────────────┐
│  [EzEdu AI]              [☰]   │   ☰ = icon Menu, aria-label="Mở menu"
└────────────────────────────────┘
        ↓ khi mở
┌────────────────────────────────┐
│  [EzEdu AI]              [✕]   │
├────────────────────────────────┤
│  Cách hoạt động             →  │
│  Tính năng                  →  │
│  FAQ                        →  │
├────────────────────────────────┤
│  Đăng nhập                     │
│  [ Bắt đầu miễn phí ]          │
└────────────────────────────────┘
```

Drawer trượt từ phải, chiếm toàn màn hình, `role="dialog"` + `aria-modal="true"`, focus trap, đóng bằng `Esc` và bằng nút ✕. Khoá cuộn body khi mở.

### 2.3 Footer khách

Năm nhóm, xếp lưới 5 cột desktop → 2 cột tablet → 1 cột (accordion) mobile.

| Nhóm | Mục |
|---|---|
| Sản phẩm | Cách hoạt động · Tính năng cho học sinh · Tính năng cho giáo viên |
| Tài nguyên | FAQ · Hướng dẫn bắt đầu |
| Hỗ trợ | Liên hệ hỗ trợ · Báo lỗi |
| Pháp lý | Điều khoản sử dụng · Chính sách quyền riêng tư |
| Liên hệ | Email · (thông tin trường/đơn vị) |

Hàng dưới cùng: tên sản phẩm + năm + ghi chú "Nội dung do AI tạo cần được kiểm chứng trước khi dùng chính thức".

**Không** có link nào dẫn tới khu vực admin.

---

## 3. Navigation — HỌC SINH

### 3.1 Sidebar desktop

```
┌──────────────────────────┐
│ [Ez] EzEdu AI        [«] │  « = thu gọn, aria-label="Thu gọn thanh điều hướng"
├──────────────────────────┤
│                          │
│ ▌⌂  Tổng quan            │  ▌ = chỉ báo active (thanh dọc)
│  ▤  Bài luyện tập    (3) │  (3) = badge số bài chưa làm
│  ⌸  Hỏi đáp AI           │
│  ↗  Tiến độ              │
│  ◎  Cá nhân hóa          │  ← chỉ hiện khi enable_personalization = true
│                          │
├──────────────────────────┤
│ [QA] QA Hoc Sinh      ⋮  │  ⋮ = menu người dùng
│      Học sinh            │
└──────────────────────────┘
```

Icon lần lượt: `LayoutDashboard`, `ClipboardList`, `MessageSquare`, `TrendingUp`, `Target`.

**Menu người dùng (⋮)** chứa các mục ít dùng, thay vì chiếm chỗ trong nav:

```
┌─────────────────────────┐
│ Hồ sơ & cài đặt         │  → /hs/ho-so
│ Giao diện        Sáng ▸ │  → submenu Sáng/Tối/Hệ thống
├─────────────────────────┤
│ Đăng xuất               │
└─────────────────────────┘
```

Đây là nơi tiếp nhận ba nút theme và nút đăng xuất hiện đang chiếm chỗ cố định trong sidebar.

### 3.2 Số nhóm nav

| Điều kiện | Số mục |
|---|---|
| `enable_personalization = false` (hiện tại) | **4** mục + menu người dùng |
| `enable_personalization = true` | **5** mục + menu người dùng |

Cả hai đều nằm trong ngưỡng 5–7.

### 3.3 Mobile (< 1024px)

Sidebar chuyển thành **bottom tab bar** cho 4 mục chính, mục thứ 5 và hồ sơ vào tab "Thêm":

```
┌────────────────────────────────┐
│  Tiến độ                   ⋮   │  ← top bar: tiêu đề trang + menu
├────────────────────────────────┤
│                                │
│         nội dung trang         │
│                                │
├────────────────────────────────┤
│  ⌂      ▤(3)     ⌸      ⋯      │  ← bottom tab, min 44×44px mỗi tab
│ Tổng   Luyện   Hỏi đáp  Thêm   │
│ quan   tập                     │
└────────────────────────────────┘
```

Tab "Thêm" mở drawer từ dưới chứa: Tiến độ, Cá nhân hóa (nếu bật), Hồ sơ & cài đặt, Giao diện, Đăng xuất.

Lý do dùng bottom tab thay vì hamburger: học sinh chủ yếu dùng điện thoại và chuyển qua lại giữa "bài tập" và "hỏi đáp" liên tục — đích đến thường xuyên nên luôn hiển thị.

### 3.4 Học sinh **không** thấy

Không có bất kỳ mục nào dẫn tới: upload/quản lý học liệu, sinh câu hỏi, ngân hàng câu hỏi, quản lý lớp, kiểm chứng học liệu, quản lý người dùng, thống kê hệ thống, cấu hình AI, quản lý vai trò, khu vực admin.

---

## 4. Navigation — GIÁO VIÊN

### 4.1 Sidebar desktop

```
┌──────────────────────────┐
│ [Ez] EzEdu AI        [«] │
├──────────────────────────┤
│                          │
│ ▌⌂  Tổng quan            │
│  ▣  Học liệu             │
│  ▤  Đề & câu hỏi         │
│  ⚇  Lớp học              │
│                          │
├──────────────────────────┤
│ [QA] QA Giao Vien     ⋮  │
│      Giáo viên           │
└──────────────────────────┘
```

Icon: `LayoutDashboard`, `Library`, `FileQuestion`, `Users`.

**4 mục** + menu người dùng (Hồ sơ & cài đặt, Giao diện, Đăng xuất).

### 4.2 Hỏi đáp AI đặt ở đâu

Hỏi đáp AI của giáo viên **không** là mục nav riêng, mà là:
- Một tab trong `/gv/hoc-lieu/:id` (hỏi về đúng tài liệu đang xem) — đây là ngữ cảnh dùng thật.
- Một nút trên trang Học liệu để hỏi trên nhiều tài liệu.

Lý do: với giáo viên, hỏi đáp là công cụ phụ trợ khi đọc học liệu, không phải đích đến độc lập. Với học sinh thì ngược lại — hỏi đáp là đích đến chính, nên nó ở nav học sinh. Cùng một backend, hai vị trí khác nhau theo nhu cầu thật của từng vai trò.

### 4.3 Nút hành động chính

Nút "Tạo đề mới" đặt **trong trang** `/gv/de-thi` (page header, bên phải tiêu đề), không đặt trong sidebar. Sửa lỗi "một tác vụ hai vị trí" — CTA `✨ Sinh đề nhanh` trong sidebar hiện tại trỏ tới cùng nghiệp vụ với luồng upload ở "Học liệu".

### 4.4 Mobile (< 1024px)

```
┌────────────────────────────────┐
│  Học liệu                  ⋮   │
├────────────────────────────────┤
│         nội dung trang         │
├────────────────────────────────┤
│  ⌂      ▣      ▤      ⚇       │
│ Tổng   Học   Đề &   Lớp        │
│ quan   liệu  câu hỏi học       │
└────────────────────────────────┘
```

Bốn mục vừa đủ cho bottom bar, không cần tab "Thêm". Hồ sơ/Giao diện/Đăng xuất nằm trong menu ⋮ ở top bar.

### 4.5 Giáo viên **không** thấy

Không có mục nào dẫn tới: bài thi của bạn, lịch sử học tập cá nhân, thống kê kết quả cá nhân, cá nhân hóa, số liệu hệ thống, cấu hình kỹ thuật, khu vực admin.

---

## 5. Navigation — ADMIN

### 5.1 Sidebar desktop — layout riêng biệt

```
┌────────────────────────────────┐
│ [Ez] EzEdu AI  · QUẢN TRỊ      │  ← nhãn khu vực, phân biệt rõ bằng thị giác
├────────────────────────────────┤
│  ⌂  Tổng quan                  │
│  ⚇  Người dùng                 │
│  ▤  Nội dung              ▾    │  ← nhóm mở rộng
│      Học liệu                  │
│      Câu hỏi                   │
│      Đề thi                    │
│  ✧  AI                         │
│  ⌘  Website                    │
│  ⚙  Hệ thống              ▾    │
│      Cấu hình                  │
│      Feature flags             │
│      Thông báo                 │
│  ▦  Báo cáo & log         ▾    │
│      Reports                   │
│      Nhật ký hoạt động         │
│      Nhật ký quản trị          │
├────────────────────────────────┤
│ [QA] QA Admin              ⋮   │
│      Quản trị viên             │
└────────────────────────────────┘
```

**7 nhóm cấp 1** (Tổng quan, Người dùng, Nội dung, AI, Website, Hệ thống, Báo cáo & log) thay vì 11–16 mục phẳng như hiện tại. Ba nhóm có nhóm con dạng accordion, chỉ mở nhóm đang dùng.

Từng mục vẫn lọc bằng `hasPermission()` như hiện tại — không thay đổi logic RBAC. Nhóm cấp 1 chỉ hiện nếu có ít nhất một mục con được phép.

### 5.2 Điểm khác biệt so với hiện tại

| Hiện tại | Sau |
|---|---|
| Admin thấy thêm nhóm "Giảng viên" (5 mục) | **Gỡ hoàn toàn** — sửa lỗi H2 |
| 11 mục admin phẳng | 7 nhóm, có nhóm con |
| Dùng chung `AppLayout` với người dùng thường | `AdminLayout` riêng, có nhãn "QUẢN TRỊ" |
| Quản lý người dùng có 2 nơi | Chỉ còn `/admin/users` |
| Nhật ký có 2 nơi | Chỉ còn `/admin/audit-logs` |

### 5.3 Mobile admin

Admin là công việc trên máy tính. Ở mobile, sidebar chuyển thành drawer mở bằng nút ☰ ở top bar, **không** dùng bottom tab (7 nhóm không vừa). Các bảng dữ liệu chuyển sang dạng thẻ xếp dọc, cuộn ngang trong khối riêng có `overflow-x: auto` — không để body cuộn ngang.

---

## 6. Nơi tiếp nhận các chức năng ít dùng

Bảng này quyết định chỗ ở cho mọi tác vụ **không** lên navigation chính.

| Tác vụ | Trước | Sau — đặt ở đâu |
|---|---|---|
| Đổi giao diện Sáng/Tối/Hệ thống | 3 nút cố định trong sidebar | Menu người dùng → Giao diện, và trang Hồ sơ & cài đặt |
| Đăng xuất | Nút cố định trong sidebar | Menu người dùng |
| Xuất DOCX | Nút trên trang bộ đề | Menu ngữ cảnh (⋮) của bộ đề |
| Xuất PDF | Nút trên trang bộ đề | Menu ngữ cảnh (⋮) của bộ đề |
| Xoá bộ đề | Nút trên trang | Menu ngữ cảnh, có dialog xác nhận |
| Đổi tên lớp | **Chưa có UI** | Menu ngữ cảnh của lớp |
| Xoá lớp | **Chưa có UI** | Menu ngữ cảnh, có dialog xác nhận |
| Xoá học liệu | Nút trên danh sách | Menu ngữ cảnh của từng học liệu |
| Tìm kiếm ngữ nghĩa trong tài liệu | Khối riêng trên trang chi tiết | Tab "Tìm kiếm" của trang chi tiết |
| Kiểm chứng chất lượng | Panel trên trang chi tiết | Tab "Kiểm chứng" của trang chi tiết |
| Phân cụm K-Means | Panel trên trang học liệu giáo viên | **Gỡ khỏi UI giáo viên.** Nếu cần, đặt trong khu vực admin |
| Lớp của tôi (học sinh) | **Chưa có UI** | Khối trong `/hs/ho-so` |
| Xem lại bài đã làm | Trộn trong lịch sử | Trang Tiến độ, phần chi tiết theo từng lần làm |

---

## 7. Role guard — thực thi ở hai tầng

Sửa lỗi Critical C1/C2. Ẩn menu **không phải** là phân quyền.

### 7.1 Tầng route (mới)

```
<RoleRoute allow={['student']}>            → bọc toàn bộ /hs/*
<RoleRoute allow={['lecturer','user']}>    → bọc toàn bộ /gv/*
<AdminRoute>                               → bọc toàn bộ /admin/*  (giữ nguyên, đã đúng)
```

Hành vi khi role không khớp: **chuyển ngay** về trang chủ khu vực đúng của người đó (`/hs`, `/gv`, hoặc `/admin/dashboard`), kèm một thông báo ngắn dạng toast. Không render trang rồi để API trả 403 như hiện tại.

Trong lúc chờ `/auth/me`: render skeleton của layout, **không** render nội dung trang. Tránh việc trang giáo viên hiện lên trong tích tắc rồi mới chuyển đi.

### 7.2 Tầng UI (giữ, nhưng không còn là hàng rào duy nhất)

Sidebar tiếp tục chỉ hiện mục thuộc khu vực của người dùng. Điểm khác: nếu tầng route đã đúng thì tầng UI chỉ còn nhiệm vụ trình bày, không phải nhiệm vụ bảo vệ.

### 7.3 Tầng backend (không thay đổi)

Backend vẫn là nơi có quyền quyết định cuối cùng. Không sửa `ensure_lecturer_or_admin`, `_can_manage_questions`, `rbac.py`. Ghi nhận: `chat.py` hiện không kiểm tra role — đúng với thiết kế mới, vì cả học sinh và giáo viên đều được dùng hỏi đáp.

### 7.4 Bảng kiểm chứng dự kiến cho giai đoạn QA

| Kịch bản | Kết quả mong đợi |
|---|---|
| Học sinh mở `/gv/hoc-lieu` | Chuyển về `/hs`, có toast, **không** thấy nội dung trang |
| Học sinh mở `/gv/de-thi` | Chuyển về `/hs` |
| Học sinh mở `/admin/users` | Chuyển về `/hs` |
| Giáo viên mở `/hs/bai-tap` | Chuyển về `/gv` |
| Giáo viên mở `/hs/tien-do` | Chuyển về `/gv` |
| Giáo viên mở `/admin/dashboard` | Chuyển về `/gv` |
| Admin mở `/hs` hoặc `/gv` | Chuyển về `/admin/dashboard` |
| Khách mở bất kỳ `/hs/*`, `/gv/*`, `/admin/*` | Chuyển về `/login` |
| Học sinh chưa onboarding mở `/hs/bai-tap` | Cho vào, có banner nhắc thiết lập — **không** khoá cứng như hiện tại |

---

## 8. Điều hướng sau đăng nhập

Sửa lỗi L3 (chỉ so `role === 'admin'`) và L4 (luồng đăng ký không đối xứng).

| Vai trò | Sau đăng nhập tới | Sau đăng ký tới |
|---|---|---|
| `student` | `/hs` (kèm banner thiết lập nếu chưa onboarding) | Tự đăng nhập → `/hs/onboarding` |
| `lecturer`, `user` | `/gv` | Tự đăng nhập → `/gv` kèm hướng dẫn bắt đầu |
| `admin`, `super_admin`, `moderator`, `support`, `analyst` | `/admin/dashboard` | — (không tự đăng ký được vai trò admin) |

Đăng ký giáo viên hiện bị đẩy về `/login` với thông báo thành công, còn học sinh thì tự đăng nhập. Sau thay đổi: **cả hai đều tự đăng nhập** và vào khu vực của mình.

---

## 9. Trạng thái của navigation

| Trạng thái | Biểu hiện |
|---|---|
| Default | Chữ màu text-secondary, icon cùng màu |
| Hover | Nền surface-hover, chữ đổi sang text-primary, chuyển tiếp 150ms |
| Focus (bàn phím) | Viền focus rõ 2px, offset 2px, **không** bị `outline: none` |
| Active (trang hiện tại) | Thanh dọc màu primary bên trái + nền nhạt + chữ primary + `aria-current="page"` |
| Có badge | Badge số ở cuối mục (ví dụ số bài chưa làm), có `aria-label` diễn giải bằng chữ |
| Disabled | Không dùng trong nav — mục không dùng được thì ẩn, không để mờ |
| Loading (chờ `/auth/me`) | Skeleton các mục nav, không hiện mục nào cụ thể |
| Sidebar thu gọn | Chỉ icon, tooltip khi hover/focus, `aria-label` trên mỗi mục |

---

## 10. Accessibility của navigation

| Yêu cầu | Cách đáp ứng |
|---|---|
| Semantic HTML | `<nav aria-label="Điều hướng chính">`, danh sách `<ul>/<li>`, link là `<a>` không phải `<div onClick>` |
| Keyboard | Tab đi qua mọi mục theo thứ tự thị giác; `Esc` đóng drawer/menu; mũi tên di chuyển trong dropdown |
| Skip link | "Bỏ qua tới nội dung chính" là phần tử focus được đầu tiên, dẫn tới `<main id="main">` |
| Focus visible | Viền focus không bị tắt ở bất kỳ trạng thái nào |
| Focus management | Mở drawer → focus vào phần tử đầu; đóng → focus trả về nút đã mở |
| Touch target | Mọi mục nav và tab tối thiểu 44×44px |
| Icon-only | Bắt buộc `aria-label` + tooltip (nút thu gọn, nút menu ⋮, nút ☰) |
| Badge | `aria-label="3 bài luyện tập chưa làm"` thay vì để screen reader đọc trơ số "3" |
| Trạng thái active | Không chỉ dựa vào màu — có thêm thanh chỉ báo và `aria-current` |
| Reduced motion | Drawer/accordion bỏ animation khi `prefers-reduced-motion: reduce` |

---

## 11. Bốn sơ đồ navigation cạnh nhau

```
   KHÁCH                HỌC SINH             GIÁO VIÊN            ADMIN
─────────────────   ──────────────────   ──────────────────   ──────────────────
 Header ngang        Sidebar dọc          Sidebar dọc          Sidebar dọc riêng

 Cách hoạt động      Tổng quan            Tổng quan            Tổng quan
 Tính năng           Bài luyện tập  (n)   Học liệu             Người dùng
 FAQ                 Hỏi đáp AI           Đề & câu hỏi         Nội dung      ▾
 ─────────────       Tiến độ              Lớp học              AI
 Đăng nhập           Cá nhân hóa [flag]   ─────────────        Website
 [Bắt đầu miễn phí]  ─────────────        menu ⋮:              Hệ thống      ▾
                     menu ⋮:               · Hồ sơ & cài đặt   Báo cáo & log ▾
 Footer 5 cột         · Hồ sơ & cài đặt    · Giao diện         ─────────────
                      · Giao diện          · Đăng xuất         menu ⋮
                      · Đăng xuất

 4 mục + 2 hành động 4–5 mục + menu       4 mục + menu         7 nhóm + menu
```

---

## 12. Bảng tổng hợp: mục nav nào biến mất và đi đâu

| Mục nav hiện tại | Ai đang thấy | Quyết định | Đi đâu |
|---|---|---|---|
| `📊 Dashboard` | Mọi role | Giữ, đổi icon | `/hs` hoặc `/gv` hoặc `/admin/dashboard` |
| `📚 Học liệu & Upload` | GV + **Admin** | Giữ cho GV, **gỡ khỏi Admin** | `/gv/hoc-lieu` |
| `💬 Hỏi đáp AI` | GV + **Admin** | Chuyển thành tab/nút trong trang; thêm vào nav **học sinh** | `/gv/hoc-lieu/:id` tab · `/hs/hoi-dap` |
| `📋 Ngân hàng câu hỏi` | GV + **Admin** | Gộp với sinh đề, gỡ khỏi Admin | `/gv/de-thi` |
| `🏫 Lớp học của tôi` | GV + **Admin** | Giữ cho GV, gỡ khỏi Admin | `/gv/lop-hoc` |
| `✨ Sinh đề nhanh` (CTA) | GV + **Admin** | **Gỡ khỏi sidebar** — trùng vị trí | Nút "Tạo đề mới" trong `/gv/de-thi` |
| `📝 Bài thi của bạn` | HS | Giữ, đổi tên | `/hs/bai-tap` |
| `🕘 Lịch sử học tập` | HS | **Gộp** | `/hs/tien-do` |
| `📈 Thống kê kết quả` | HS | **Gộp** | `/hs/tien-do` |
| `🎯 Cá nhân hóa` | HS | Giữ, thêm điều kiện flag | `/hs/ca-nhan-hoa` |
| `☀️🌙🖥️` theme (3 nút) | Mọi role | Chuyển vào menu phụ | Menu người dùng + Hồ sơ |
| `🚪 Đăng xuất` | Mọi role | Chuyển vào menu phụ | Menu người dùng |
| 11 mục admin phẳng | Admin | Nhóm lại thành 7 | `/admin/*` |
