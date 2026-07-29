# EzEdu AI — Danh mục trang (Giai đoạn 2)

- **Ngày:** 2026-07-28
- **Dựa trên:** [01-audit-report.md](01-audit-report.md), [02-information-architecture.md](02-information-architecture.md), [03-role-navigation.md](03-role-navigation.md)
- **Trạng thái:** Tài liệu đặc tả. Chưa triển khai giao diện.

Mỗi trang được đặc tả theo 11 mục: vai trò truy cập · mục tiêu chính · primary action · secondary action · dữ liệu cần hiển thị · loading · empty · error · permission-denied · mobile · component tái sử dụng.

Ký hiệu API: đường dẫn rút gọn, tiền tố đầy đủ là `/api/v1`.

---

## A. KHU VỰC PUBLIC

### A1. Trang chủ — `/`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Khách. Người đã đăng nhập vẫn xem được nhưng header đổi thành "Vào khu vực của tôi" |
| **Mục tiêu chính** | Hiểu EzEdu AI làm gì trong vòng một màn hình, và bắt đầu dùng |
| **Primary action** | "Bắt đầu miễn phí" → `/register` |
| **Secondary action** | "Xem cách hoạt động" → `/how-it-works` (cuộn tới section nếu ở trên trang chủ) |
| **Dữ liệu** | `GET /website-content` (công khai, không cần token). Fallback `DEFAULT_WEBSITE_CONTENT` khi API lỗi |
| **Loading** | Skeleton cho hero (tiêu đề, mô tả, 2 nút) và các section. Không chặn toàn trang — nội dung fallback hiện ngay, CMS ghi đè khi về |
| **Empty** | Không áp dụng — luôn có nội dung mặc định |
| **Error** | Im lặng dùng fallback. Không hiện thông báo lỗi kỹ thuật cho khách |
| **Permission-denied** | Không áp dụng |
| **Mobile** | Một cột. Hero giảm còn 36–40px tiêu đề. Lưới thẻ 3 cột → 1 cột. FAQ accordion đóng sẵn. Footer accordion |
| **Component** | `PublicHeader`, `Hero`, `UploadDropzone`, `ExampleCard`, `BenefitCard`, `StepItem`, `RoleFeatureBlock`, `TrustBlock`, `FaqAccordion`, `CtaBanner`, `PublicFooter` |

Cấu trúc section: Header → Hero → Công cụ chính (upload) → Ví dụ nhanh → Vì sao EzEdu AI → Cách hoạt động → Tính năng theo vai trò → Chất lượng & tin cậy → FAQ → CTA cuối → Footer.

### A2. Cách hoạt động — `/how-it-works`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Khách + mọi role |
| **Mục tiêu chính** | Giải thích đủ chi tiết bốn bước để người dùng biết mình sẽ phải làm gì |
| **Primary action** | "Bắt đầu miễn phí" → `/register` |
| **Secondary action** | "Xem tính năng" → `/features` |
| **Dữ liệu** | Nội dung tĩnh trong frontend. Không gọi API |
| **Loading** | Không áp dụng |
| **Empty / Error / Permission-denied** | Không áp dụng |
| **Mobile** | Bốn bước xếp dọc, mỗi bước là một khối có số thứ tự |
| **Component** | `PublicHeader`, `PageHeader`, `StepItem`, `CtaBanner`, `PublicFooter` |

### A3. Tính năng — `/features`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Khách + mọi role |
| **Mục tiêu chính** | Người đọc tự nhận ra mình thuộc nhóm nào (học sinh hay giáo viên) và tính năng nào dành cho mình |
| **Primary action** | "Bắt đầu miễn phí" → `/register` |
| **Secondary action** | "Câu hỏi thường gặp" → `/faq` |
| **Dữ liệu** | Tĩnh. **Chỉ liệt kê tính năng backend thực sự có** — không nêu báo cáo lớp, OAuth, xác thực email |
| **Loading / Empty / Error / Permission-denied** | Không áp dụng |
| **Mobile** | Hai nhóm (học sinh / giáo viên) xếp dọc, mỗi nhóm là danh sách |
| **Component** | `PublicHeader`, `PageHeader`, `RoleFeatureBlock`, `BenefitCard`, `CtaBanner`, `PublicFooter` |

### A4. FAQ — `/faq`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Khách + mọi role |
| **Mục tiêu chính** | Trả lời các lo ngại thật: định dạng nào được, dữ liệu có bị dùng để huấn luyện không, kết quả AI có đáng tin không |
| **Primary action** | "Bắt đầu miễn phí" |
| **Secondary action** | "Liên hệ hỗ trợ" (mailto) |
| **Dữ liệu** | Tĩnh |
| **Loading / Empty / Error / Permission-denied** | Không áp dụng |
| **Mobile** | Accordion đóng sẵn, một câu mở tại một thời điểm |
| **Component** | `PublicHeader`, `PageHeader`, `FaqAccordion`, `CtaBanner`, `PublicFooter` |

### A5. Đăng nhập — `/login`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Khách. Người đã đăng nhập bị chuyển về khu vực của mình |
| **Mục tiêu chính** | Vào được tài khoản với ít ma sát nhất |
| **Primary action** | "Đăng nhập" → `POST /auth/login`, rồi `GET /auth/me` để điều hướng theo role |
| **Secondary action** | "Chưa có tài khoản? Đăng ký" → `/register` |
| **Dữ liệu** | Email, mật khẩu. Hiện thông báo thành công nếu vừa đăng ký xong |
| **Loading** | Nút chuyển sang trạng thái loading, vô hiệu hoá form, giữ nguyên giá trị đã nhập |
| **Empty** | Không áp dụng |
| **Error** | Lỗi từng trường hiện **ngay dưới trường đó** (`aria-describedby`, `aria-invalid`). Lỗi chung (sai mật khẩu, tài khoản bị khoá) hiện trong `Alert` phía trên nút. Không hiện mã lỗi HTTP |
| **Permission-denied** | Tài khoản bị khoá → thông báo rõ ràng bằng tiếng Việt kèm hướng liên hệ hỗ trợ |
| **Mobile** | Form một cột, `inputMode="email"`, `autocomplete="email"`/`current-password`. Nội dung cuộn được để bàn phím ảo không che nút |
| **Component** | `PublicLayout`, `Card`, `Input`, `Button`, `Alert`, `FormField` |

### A6. Đăng ký — `/register`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Khách |
| **Mục tiêu chính** | Tạo tài khoản đúng vai trò |
| **Primary action** | "Tạo tài khoản" → `POST /auth/register` rồi tự đăng nhập |
| **Secondary action** | "Đã có tài khoản? Đăng nhập" |
| **Dữ liệu** | Họ tên, email, mật khẩu, chọn vai trò (học sinh / giáo viên) |
| **Loading** | Nút loading, form bị vô hiệu hoá |
| **Empty** | Không áp dụng |
| **Error** | Lỗi cạnh từng trường. Email đã tồn tại → gợi ý chuyển sang đăng nhập. Nếu `registration_enabled = false` → thông báo đăng ký đang tạm tắt và **ẩn form** |
| **Permission-denied** | Đăng ký bị tắt bởi admin → khối thông báo thay cho form |
| **Mobile** | Một cột. Chọn vai trò dạng hai thẻ chọn lớn (không dùng `<select>` nhỏ) |
| **Component** | `PublicLayout`, `Card`, `Input`, `RadioCard`, `Button`, `Alert`, `FormField` |

Sau đăng ký: **cả hai vai trò đều tự đăng nhập** (sửa lỗi L4). Học sinh → `/hs/onboarding`, giáo viên → `/gv`.

### A7. Không tìm thấy — `/404` (trang mới)

| Mục | Nội dung |
|---|---|
| **Vai trò** | Tất cả |
| **Mục tiêu chính** | Cho biết URL sai và đưa về chỗ đúng |
| **Primary action** | "Về trang chủ" (khách) hoặc "Về tổng quan" (đã đăng nhập, theo role) |
| **Secondary action** | "Quay lại trang trước" |
| **Dữ liệu** | Không |
| **Loading / Empty / Error / Permission-denied** | Không áp dụng |
| **Mobile** | Một cột, canh giữa |
| **Component** | `ErrorState`, `Button` |

Sửa lỗi H4 — hiện route `*` đang render trang chủ.

### A8. Bảo trì — `/maintenance`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Tất cả, tới qua axios interceptor khi backend trả 503 |
| **Mục tiêu chính** | Cho biết hệ thống đang bảo trì, không phải máy người dùng lỗi |
| **Primary action** | "Thử lại" — gọi lại `GET /health` |
| **Secondary action** | Không |
| **Dữ liệu** | Không |
| **Loading** | Nút "Thử lại" có trạng thái loading |
| **Empty / Permission-denied** | Không áp dụng |
| **Error** | Nếu thử lại vẫn 503 → giữ nguyên trang, cập nhật thời điểm thử gần nhất |
| **Mobile** | Một cột canh giữa |
| **Component** | `ErrorState`, `Button` |

---

## B. KHU VỰC HỌC SINH

### B1. Tổng quan học tập — `/hs`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Chỉ `student` |
| **Mục tiêu chính** | Trả lời "giờ tôi nên làm gì" trong một màn hình |
| **Primary action** | "Tiếp tục học" — mở bài luyện tập đang dở, hoặc bài mới nhất chưa làm |
| **Secondary action** | "Hỏi AI một câu" → `/hs/hoi-dap` |
| **Dữ liệu** | Lời chào + tên (`GET /auth/me`) · số bài chưa làm (`GET /questions/published/pending-count`) · danh sách bài chưa làm (`GET /questions/published`) · lần làm bài gần nhất (`GET /questions/attempts/my-history`) · gợi ý học tập (`GET /personalization/recommendations/me`, **chỉ khi flag bật**) · banner thông báo nếu có |
| **Loading** | Skeleton từng khối độc lập — khối nào có dữ liệu trước thì hiện trước, không chờ tất cả |
| **Empty** | Người mới: khối chào mừng giải thích ba việc có thể làm ngay, thay vì bốn thẻ trống. Nếu chưa có bài nào được ban hành: "Chưa có bài luyện tập nào. Bài mới từ giáo viên sẽ xuất hiện ở đây." |
| **Error** | Lỗi từng khối được xử lý riêng — một khối lỗi không làm trắng cả trang. Mỗi khối lỗi có nút "Tải lại" |
| **Permission-denied** | Không áp dụng (đã qua `RoleRoute`) |
| **Mobile** | Một cột. Khối "Tiếp tục học" luôn ở trên cùng. Bottom tab bar |
| **Component** | `PageHeader`, `Card`, `StatTile`, `ContinueLearningCard`, `PracticeListItem`, `Skeleton`, `EmptyState`, `ErrorState`, `Alert` |

**Không** liệt kê lại các mục đã có trong sidebar (sửa lỗi H6 — dashboard hiện là 4 thẻ 01–04 trỏ về đúng 4 mục nav).

### B2. Bài luyện tập — `/hs/bai-tap`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Chỉ `student` |
| **Mục tiêu chính** | Tìm và bắt đầu bài cần làm |
| **Primary action** | "Làm bài" trên từng bài → `/hs/bai-tap/:setId` |
| **Secondary action** | "Xem lại" với bài đã hoàn thành · chuyển tab Chưa hoàn thành / Đã hoàn thành |
| **Dữ liệu** | `GET /questions/published` + `GET /questions/attempts/my-history` để xác định đã làm hay chưa. Mỗi bài: tên, môn/tài liệu nguồn, số câu, dạng câu hỏi, độ khó, điểm gần nhất nếu đã làm |
| **Loading** | Skeleton 3–5 dòng danh sách |
| **Empty** | Tab "Chưa hoàn thành" rỗng → "Bạn đã làm hết bài hiện có." kèm link sang tab Đã hoàn thành. Chưa có bài nào → giải thích bài đến từ giáo viên |
| **Error** | `ErrorState` trong vùng danh sách, giữ nguyên tab bar, có nút "Tải lại" |
| **Permission-denied** | Không áp dụng |
| **Mobile** | Danh sách dạng thẻ xếp dọc, nút "Làm bài" full-width trong thẻ. Tab bar dính phía trên danh sách |
| **Component** | `PageHeader`, `Tabs`, `PracticeListItem`, `Badge`, `Skeleton`, `EmptyState`, `ErrorState` |

Gộp từ `/published-questions`.

### B3. Làm bài — `/hs/bai-tap/:setId`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Chỉ `student` |
| **Mục tiêu chính** | Làm và nộp bài, sau đó xem kết quả |
| **Primary action** | "Nộp bài" → `POST /questions/{setId}/attempts` |
| **Secondary action** | Điều hướng giữa các câu · "Thoát" (có xác nhận nếu đang làm dở) |
| **Dữ liệu** | `GET /questions/{setId}` (câu hỏi, đáp án lựa chọn) · `GET /questions/{setId}/attempts/my` (lần làm trước). Sau nộp: điểm, số câu đúng, đáp án đúng kèm giải thích |
| **Loading** | Skeleton khung câu hỏi. Khi nộp: nút loading + chặn nộp lại |
| **Empty** | Bộ đề không có câu hỏi nào → "Bộ đề này chưa có câu hỏi." + nút quay lại |
| **Error** | Lỗi tải → `ErrorState` toàn trang có nút quay lại. Lỗi nộp bài → `Alert` giữ nguyên câu trả lời đã chọn, cho nộp lại. **Không được mất dữ liệu đã nhập** |
| **Permission-denied** | Bộ đề chưa ban hành hoặc không dành cho học sinh này → `ErrorState` "Bài này hiện không mở cho bạn" + nút về `/hs/bai-tap` |
| **Mobile** | Một câu một màn hình, thanh tiến trình trên cùng, nút điều hướng dính đáy. Vùng nhập tự lên khi bàn phím mở |
| **Component** | `QuestionCard`, `ProgressBar`, `Button`, `Dialog` (xác nhận thoát/nộp), `Alert`, `Skeleton`, `ErrorState`, `ResultSummary` |

Tách từ `QuestionSetDetailPage` — hiện trang này phục vụ cả giáo viên soạn đề và học sinh làm bài.

### B4. Hỏi đáp AI — `/hs/hoi-dap`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `student` (và `lecturer` qua `/gv`) |
| **Mục tiêu chính** | Hỏi và nhận câu trả lời có nguồn trích dẫn |
| **Primary action** | "Gửi câu hỏi" → `POST /chat/ask-advanced` |
| **Secondary action** | Chọn phạm vi kiến thức · bật/tắt tìm kiếm web · chọn phong cách trả lời · đổi tên/xoá hội thoại (menu ngữ cảnh) |
| **Dữ liệu** | `GET /chat/conversations` · `GET /chat/conversations/{id}/messages` · nguồn trích dẫn theo từng câu trả lời |
| **Loading** | Danh sách hội thoại: skeleton. Câu trả lời đang sinh: chỉ báo đang trả lời, nút Gửi bị vô hiệu hoá |
| **Empty** | Chưa có hội thoại → khối gợi ý 3–4 câu hỏi mẫu bấm được ngay, thay vì ô trống |
| **Error** | Lỗi gửi → `Alert` trong luồng hội thoại, **giữ lại nội dung đã nhập**, có nút "Thử lại". Quá hạn mức AI → thông báo rõ bằng tiếng Việt |
| **Permission-denied** | `enable_advanced_chat = false` → khối thông báo tính năng đang tắt, ẩn ô nhập. Mục nav cũng bị ẩn |
| **Mobile** | Danh sách hội thoại thành drawer. Ô nhập dính đáy, tự đẩy lên khi bàn phím mở. Panel nguồn trích dẫn thành bottom sheet |
| **Component** | `ChatMessageList`, `ChatComposer`, `ConversationSidebar`, `CitationPanel`, `KnowledgeScopeSelector`, `Drawer`, `EmptyState`, `Alert`, `Skeleton` |

Tái dùng phần lớn `frontend/src/components/chat-advanced/*` đã có.

### B5. Tiến độ — `/hs/tien-do`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Chỉ `student` |
| **Mục tiêu chính** | Thấy mình đang tiến bộ hay không, và bài nào cần làm lại |
| **Primary action** | "Ôn lại bài yếu nhất" → mở bài có điểm thấp nhất |
| **Secondary action** | Lọc theo khoảng thời gian · mở chi tiết một lần làm bài |
| **Dữ liệu** | `GET /questions/attempts/my-history` + `GET /questions/published`. Phần tổng quan: số bài hoàn thành, số bài chưa làm, điểm trung bình, kết quả cao nhất. Phần chi tiết: danh sách lần làm bài kèm điểm và thời điểm |
| **Loading** | Skeleton cho hàng số liệu và cho danh sách |
| **Empty** | "Bạn chưa có lần làm bài nào." + nút "Bắt đầu bài luyện tập đầu tiên" → `/hs/bai-tap`. **Không** hiện hàng số liệu toàn số 0 |
| **Error** | `ErrorState` với nút "Tải lại" |
| **Permission-denied** | Không áp dụng |
| **Mobile** | Số liệu 2×2, danh sách dạng thẻ |
| **Component** | `PageHeader`, `StatTile`, `AttemptListItem`, `Skeleton`, `EmptyState`, `ErrorState`, `Select` (lọc thời gian) |

Gộp `/learning-history` + `/student-statistics` (sửa lỗi M4 — hai trang gọi cùng API rồi tự tính lại).

### B6. Cá nhân hóa — `/hs/ca-nhan-hoa` *(phụ thuộc feature flag)*

| Mục | Nội dung |
|---|---|
| **Vai trò** | Chỉ `student`, **và chỉ khi `enable_personalization = true`** |
| **Mục tiêu chính** | Biết điểm mạnh/yếu của mình và việc nên làm tiếp theo |
| **Primary action** | Mở gợi ý học tập đầu tiên |
| **Secondary action** | Gửi phản hồi về gợi ý (hữu ích / không) · sửa mục tiêu học tập |
| **Dữ liệu** | `GET /personalization/me` · `GET /personalization/me/knowledge` · `GET /personalization/recommendations/me` · `PATCH /personalization/me/goals` · `POST /personalization/recommendations/me/feedback` |
| **Loading** | Skeleton cho ba khối: điểm mạnh, điểm yếu, gợi ý |
| **Empty** | Chưa đủ dữ liệu học tập → "Hoàn thành vài bài luyện tập để EzEdu AI hiểu bạn hơn." + nút sang `/hs/bai-tap`. Đây là empty state quan trọng nhất vì học sinh mới luôn gặp |
| **Error** | `ErrorState` từng khối |
| **Permission-denied** | Flag tắt → mục nav **bị ẩn hoàn toàn**. Nếu vẫn vào URL trực tiếp: khối thông báo "Tính năng cá nhân hóa hiện đang tắt" + nút về `/hs`. **Không** để trang trắng kèm 403 như hiện tại |
| **Mobile** | Ba khối xếp dọc |
| **Component** | `PageHeader`, `Card`, `KnowledgeSignalList`, `RecommendationCard`, `FeedbackControls`, `Skeleton`, `EmptyState`, `ErrorState`, `FeatureDisabledState` |

Ghi nhận: flag này **đang tắt** ở môi trường hiện tại, nên trang phải xử lý đúng trường hợp tắt.

### B7. Hồ sơ & cài đặt — `/hs/ho-so` (trang mới)

| Mục | Nội dung |
|---|---|
| **Vai trò** | Chỉ `student` |
| **Mục tiêu chính** | Xem/sửa thông tin cá nhân, thiết lập học tập, và giao diện |
| **Primary action** | "Lưu thay đổi" |
| **Secondary action** | "Cập nhật thiết lập học tập" → `/hs/onboarding` · đổi giao diện · đăng xuất |
| **Dữ liệu** | `GET /auth/me` (tên, email, vai trò, ngày tạo) · `GET /personalization/me/onboarding` (lớp, môn mạnh/yếu, tổ hợp) · **`GET /classes/mine`** (lớp đang thuộc — backend đã có, UI chưa từng dùng) |
| **Loading** | Skeleton từng khối |
| **Empty** | Chưa thuộc lớp nào → "Bạn chưa được thêm vào lớp nào. Giáo viên sẽ thêm bạn khi cần." Chưa có thiết lập học tập → nút thiết lập |
| **Error** | `ErrorState` từng khối; khối "Lớp của tôi" lỗi không ảnh hưởng khối thông tin cá nhân |
| **Permission-denied** | Không áp dụng |
| **Mobile** | Các khối xếp dọc, nút Lưu dính đáy khi có thay đổi chưa lưu |
| **Component** | `PageHeader`, `Card`, `FormField`, `Input`, `Button`, `ThemeSelector`, `ClassListItem`, `Skeleton`, `EmptyState`, `ErrorState` |

### B8. Thiết lập ban đầu — `/hs/onboarding`

| Mục | Nội dung |
|---|---|
| **Vai trò** | Chỉ `student` |
| **Mục tiêu chính** | Thu thập lớp, môn mạnh/yếu, tổ hợp thi để cá nhân hoá nội dung |
| **Primary action** | "Hoàn tất thiết lập" → `PUT /personalization/me/onboarding` |
| **Secondary action** | **"Để sau"** → `/hs` (mới) |
| **Dữ liệu** | `GET /personalization/me/onboarding/options` (7 lớp, 11 môn, danh sách tổ hợp) · `GET /personalization/me/onboarding` (giá trị đang có) |
| **Loading** | Skeleton các nhóm lựa chọn |
| **Empty** | Không áp dụng |
| **Error** | Lỗi validate hiện cạnh nhóm liên quan. Trường hợp thật đã gặp: chọn một môn vừa là mạnh vừa là yếu → backend trả lỗi rõ ràng, phải hiện cạnh nhóm môn chứ không phải ở đầu trang |
| **Permission-denied** | Không áp dụng |
| **Mobile** | Các nhóm chọn dạng chip xếp nhiều dòng, tối thiểu 44px chiều cao. Nút hành động dính đáy |
| **Component** | `PageHeader`, `Card`, `ChipGroup`, `Select`, `Button`, `Alert`, `Skeleton` |

Sửa lỗi H3: hiện trang này **khoá cứng mọi route khác** và render không có header/sidebar. Sau thay đổi: có chrome đầy đủ, có "Để sau", và khi chưa hoàn tất thì `/hs` hiện banner nhắc chứ không chặn.

---

## C. KHU VỰC GIÁO VIÊN

### C1. Tổng quan — `/gv`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` |
| **Mục tiêu chính** | Tiếp tục việc đang làm và bắt đầu việc mới nhanh nhất |
| **Primary action** | "Tạo đề mới" → `/gv/de-thi?new=1` |
| **Secondary action** | "Tải học liệu lên" → `/gv/hoc-lieu` |
| **Dữ liệu** | Lời chào (`GET /auth/me`) · học liệu gần đây (`GET /documents`) · bộ đề gần đây (`GET /questions/my-history`) · học liệu đang xử lý (trạng thái pipeline chưa xong) · số lớp (`GET /classes`) · banner thông báo |
| **Loading** | Skeleton từng khối, hiện độc lập |
| **Empty** | Người mới: khối hướng dẫn ba bước đầu tiên (tải học liệu → sinh câu hỏi → ban hành) với nút cho từng bước. **Không** hiện lưới thẻ trống |
| **Error** | Lỗi từng khối riêng, mỗi khối có nút "Tải lại" |
| **Permission-denied** | Không áp dụng |
| **Mobile** | Một cột, khối "đang xử lý" lên trên nếu có |
| **Component** | `PageHeader`, `Card`, `StatTile`, `DocumentListItem`, `QuestionSetListItem`, `ProcessingStatusBadge`, `Skeleton`, `EmptyState`, `ErrorState`, `Alert` |

Thông tin kỹ thuật cần tránh: không hiện tên model, không hiện số chiều vector, không hiện thuật ngữ embedding. Trạng thái xử lý dùng ngôn ngữ người dùng: "Đang đọc nội dung", "Đang chuẩn bị để hỏi đáp", "Sẵn sàng".

### C2. Học liệu — `/gv/hoc-lieu`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` |
| **Mục tiêu chính** | Tải học liệu lên và tìm lại học liệu đã có |
| **Primary action** | "Tải học liệu lên" — vùng kéo thả ngay trên trang → `POST /documents/upload` |
| **Secondary action** | Tìm kiếm/lọc theo loại · mở chi tiết · menu ngữ cảnh mỗi học liệu (Sinh đề từ học liệu này · Xoá) |
| **Dữ liệu** | `GET /documents`. Mỗi học liệu: tên, loại file, kích thước, ngày tải, trạng thái xử lý (đọc nội dung / chuyển lời video / sẵn sàng hỏi đáp) |
| **Loading** | Skeleton danh sách. Học liệu đang xử lý có chỉ báo tiến trình, tự cập nhật |
| **Empty** | "Chưa có học liệu nào." + vùng kéo thả nổi bật + dòng nêu định dạng và giới hạn dung lượng |
| **Error** | Lỗi tải danh sách → `ErrorState`. Lỗi upload từng file → hiện ngay tại dòng file đó, các file khác không bị ảnh hưởng. File quá lớn / sai định dạng → chặn trước khi gửi, nêu rõ giới hạn |
| **Permission-denied** | Học sinh không tới được (chặn bởi `RoleRoute`). Nếu backend trả 403 → `ErrorState` "Chỉ giáo viên mới quản lý được học liệu" |
| **Mobile** | Vùng kéo thả thành nút "Chọn tệp". Danh sách dạng thẻ. Menu ngữ cảnh thành bottom sheet |
| **Component** | `PageHeader`, `UploadDropzone`, `DocumentListItem`, `ProcessingStatusBadge`, `Dropdown`, `Input` (tìm kiếm), `Select` (lọc), `Skeleton`, `EmptyState`, `ErrorState`, `Dialog` (xác nhận xoá), `Toast` |

**Gỡ panel K-Means** khỏi trang này (sửa lỗi M2).

### C3. Chi tiết học liệu — `/gv/hoc-lieu/:id`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` (và admin qua khu vực riêng) |
| **Mục tiêu chính** | Kiểm tra nội dung đã đọc đúng chưa, rồi dùng nó để sinh đề |
| **Primary action** | "Sinh câu hỏi từ học liệu này" → `/gv/de-thi?documentId=:id` |
| **Secondary action** | Chuyển tab · menu ngữ cảnh (Tải lại nội dung · Xoá) |
| **Dữ liệu** | `GET /documents/{id}` · tab Nội dung: `GET /documents/{id}/content`, `GET /documents/{id}/transcript` · tab Tìm kiếm: `POST /documents/{id}/search` · tab Kiểm chứng: `GET/POST /documents/{id}/verify*` · tab Hỏi đáp: `POST /chat/ask-advanced` với scope tài liệu này |
| **Loading** | Skeleton theo tab đang mở. Không tải dữ liệu tab chưa mở |
| **Empty** | Nội dung chưa trích xuất → nút "Đọc nội dung". Video chưa chuyển lời → nút "Chuyển lời video". Tab Kiểm chứng chưa có phiên → "Chưa kiểm chứng học liệu này" + nút "Bắt đầu kiểm chứng" |
| **Error** | Lỗi từng tab riêng. **Sửa lỗi M3**: `GET /verify/status` trả 404 khi chưa có phiên phải được hiểu là empty state, không log lỗi ra console |
| **Permission-denied** | Không phải chủ sở hữu → `ErrorState` "Học liệu này không thuộc tài khoản của bạn" |
| **Mobile** | Tab thành thanh cuộn ngang trong khối riêng. Nội dung trích xuất trong khối cuộn dọc có chiều cao giới hạn |
| **Component** | `PageHeader`, `Tabs`, `Card`, `DocumentContentViewer`, `SemanticSearchPanel`, `VerificationPanel`, `IssueCard`, `ChatMessageList`, `ChatComposer`, `Dropdown`, `Skeleton`, `EmptyState`, `ErrorState` |

Bốn tab thay cho việc xếp mọi panel dọc trên một trang. Tab Hỏi đáp là nơi `ChatBox` cơ bản được gộp vào (sửa lỗi M1).

### C4. Đề & câu hỏi — `/gv/de-thi`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` |
| **Mục tiêu chính** | Tạo đề mới và tìm lại đề đã tạo — **một** vị trí duy nhất cho cả hai |
| **Primary action** | "Tạo đề mới" — mở wizard: chọn học liệu đã có **hoặc** tải học liệu mới → chọn số câu/độ khó/dạng → `POST /questions/generate` |
| **Secondary action** | Tìm kiếm/lọc theo dạng và độ khó · mở bộ đề · menu ngữ cảnh (Xuất DOCX · Xuất PDF · Xoá) |
| **Dữ liệu** | `GET /questions/my-history` (phân trang cursor). Mỗi bộ đề: tên, học liệu nguồn, số câu, dạng, độ khó, trạng thái ban hành, ngày tạo |
| **Loading** | Skeleton danh sách. Trong lúc sinh đề: các bước có nhãn tiếng Việt dễ hiểu, có thể huỷ |
| **Empty** | "Chưa có bộ đề nào." + nút "Tạo đề đầu tiên". Nếu chưa có học liệu: wizard tự mở ở bước tải học liệu |
| **Error** | Lỗi sinh đề → `Alert` trong wizard, giữ nguyên lựa chọn đã chọn, cho thử lại. Hết hạn mức AI → thông báo rõ ràng |
| **Permission-denied** | Chặn bởi `RoleRoute`. Nếu backend 403 → `ErrorState` |
| **Mobile** | Wizard toàn màn hình theo từng bước. Danh sách dạng thẻ |
| **Component** | `PageHeader`, `Button`, `Dialog`/`Drawer` (wizard), `UploadDropzone`, `DocumentSelector`, `Select`, `RadioCard`, `QuestionSetListItem`, `Badge`, `Dropdown`, `Skeleton`, `EmptyState`, `ErrorState`, `ProgressSteps`, `Toast` |

Gộp `/question-history` + `/generate` + `/documents/:id/questions` (sửa lỗi M1 — hai luồng sinh đề song song).

### C5. Soạn & ban hành đề — `/gv/de-thi/:setId`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` |
| **Mục tiêu chính** | Rà soát, sửa từng câu, rồi ban hành cho học sinh |
| **Primary action** | "Ban hành cho học sinh" → `POST /questions/{setId}/publish` |
| **Secondary action** | Sửa từng câu (`PATCH /{setId}/items/{idx}`) · đổi trạng thái câu (`POST /{setId}/items/{idx}/workflow`) · menu ngữ cảnh (Xuất DOCX · Xuất PDF · Xoá) |
| **Dữ liệu** | `GET /questions/{setId}`: danh sách câu hỏi, đáp án, giải thích, trạng thái từng câu, trạng thái ban hành |
| **Loading** | Skeleton danh sách câu. Lưu từng câu: chỉ báo loading tại đúng câu đó |
| **Empty** | Bộ đề không có câu nào → "Bộ đề này chưa có câu hỏi" + nút sinh lại |
| **Error** | Lỗi lưu một câu → `Alert` tại câu đó, giữ nội dung đang sửa. Lỗi ban hành → `Alert` phía trên, nêu lý do (ví dụ chưa có câu nào được duyệt) |
| **Permission-denied** | Không phải chủ sở hữu → `ErrorState` + nút về `/gv/de-thi` |
| **Mobile** | Một câu một khối, mở rộng để sửa. Nút "Ban hành" dính đáy |
| **Component** | `PageHeader`, `QuestionEditorCard`, `Badge`, `Button`, `Dropdown`, `Dialog` (xác nhận ban hành), `Alert`, `Skeleton`, `EmptyState`, `ErrorState`, `Toast` |

Tách từ `QuestionSetDetailPage` — bỏ nhánh "làm bài" khỏi trang này.

### C6. Lớp học — `/gv/lop-hoc`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` |
| **Mục tiêu chính** | Nhóm học sinh để giao đề theo lớp |
| **Primary action** | "Tạo lớp" → `POST /classes` |
| **Secondary action** | Mở chi tiết lớp · menu ngữ cảnh (**Đổi tên** `PATCH /classes/{id}` · **Xoá lớp** `DELETE /classes/{id}`) |
| **Dữ liệu** | `GET /classes`. Mỗi lớp: tên, số học sinh, ngày tạo |
| **Loading** | Skeleton danh sách |
| **Empty** | "Bạn chưa tạo lớp nào." + giải thích lớp dùng để làm gì + nút "Tạo lớp đầu tiên" |
| **Error** | `ErrorState` + nút "Tải lại" |
| **Permission-denied** | Chặn bởi `RoleRoute`. Nếu 403 → `ErrorState` |
| **Mobile** | Danh sách thẻ, form tạo lớp thành bottom sheet |
| **Component** | `PageHeader`, `Card`, `ClassListItem`, `Input`, `Button`, `Dropdown`, `Dialog` (xác nhận xoá), `Skeleton`, `EmptyState`, `ErrorState`, `Toast` |

Bổ sung đổi tên và xoá lớp — backend đã có nhưng UI chưa từng gọi (sửa lỗi M8).

### C7. Chi tiết lớp — `/gv/lop-hoc/:id`

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` |
| **Mục tiêu chính** | Thêm/bớt học sinh trong lớp |
| **Primary action** | "Thêm học sinh" → tìm (`GET /classes/search-students`) rồi `POST /classes/{id}/students` |
| **Secondary action** | Xoá học sinh khỏi lớp (`DELETE /classes/{id}/students/{sid}`) · đổi tên lớp |
| **Dữ liệu** | `GET /classes/{id}`: tên lớp, danh sách học sinh (tên, email) |
| **Loading** | Skeleton danh sách học sinh. Tìm kiếm có debounce + chỉ báo đang tìm |
| **Empty** | Lớp chưa có học sinh → "Lớp này chưa có học sinh." + ô tìm kiếm nổi bật. Tìm không ra → "Không tìm thấy học sinh nào khớp." |
| **Error** | Lỗi thêm/xoá → `Toast` lỗi, danh sách trở về trạng thái trước đó |
| **Permission-denied** | Không phải chủ sở hữu → `ErrorState` |
| **Mobile** | Ô tìm kiếm trên cùng, danh sách dạng thẻ, nút xoá trong menu ngữ cảnh (tránh bấm nhầm) |
| **Component** | `PageHeader`, `Card`, `Input` (tìm kiếm), `StudentListItem`, `Button`, `Dropdown`, `Dialog`, `Skeleton`, `EmptyState`, `ErrorState`, `Toast` |

### C8. Hồ sơ & cài đặt — `/gv/ho-so` (trang mới)

| Mục | Nội dung |
|---|---|
| **Vai trò** | `lecturer`, `user` |
| **Mục tiêu chính** | Xem/sửa thông tin cá nhân và giao diện |
| **Primary action** | "Lưu thay đổi" |
| **Secondary action** | Đổi giao diện · đăng xuất |
| **Dữ liệu** | `GET /auth/me`: tên, email, vai trò, ngày tạo, lần đăng nhập gần nhất |
| **Loading** | Skeleton |
| **Empty** | Không áp dụng |
| **Error** | `ErrorState` cho khối lỗi |
| **Permission-denied** | Không áp dụng |
| **Mobile** | Khối xếp dọc |
| **Component** | `PageHeader`, `Card`, `FormField`, `Input`, `Button`, `ThemeSelector`, `Skeleton`, `ErrorState` |

**Không** có mục nào thuộc nhóm học tập cá nhân trên trang này.

---

## D. KHU VỰC ADMIN

Toàn bộ 16 trang admin **giữ nguyên nghiệp vụ và API**. Chỉ ba thay đổi ở tầng trình bày, nên phần này đặc tả gọn hơn.

| Trang | Thay đổi |
|---|---|
| `/admin/dashboard` | **Gỡ tab "Quản lý người dùng" và tab "Nhật ký hệ thống"** (trùng và yếu hơn trang chuyên biệt). Thay bằng thẻ số liệu + link. Giữ các tab Overview/Usage/Quality/Errors/Evaluation/System Health |
| `/admin/users`, `/admin/users/:id` | Giữ nguyên. Áp dụng component nền tảng mới (Table, Badge, Dialog, Toast) |
| `/admin/documents`, `/admin/questions`, `/admin/exams` + trang chi tiết | Giữ nguyên, gom vào nhóm nav "Nội dung" |
| `/admin/ai` | Giữ nguyên |
| `/admin/website-content` | Giữ nguyên |
| `/admin/settings`, `/admin/feature-flags`, `/admin/notifications` | Giữ nguyên, gom vào nhóm "Hệ thống" |
| `/admin/reports`, `/admin/activity-logs`, `/admin/audit-logs` | Giữ nguyên, gom vào nhóm "Báo cáo & log" |

Đặc tả trạng thái dùng chung cho mọi trang admin:

| Trạng thái | Quy ước |
|---|---|
| **Loading** | Skeleton dạng bảng (header + 5–10 dòng), giữ nguyên khung bảng để tránh layout shift |
| **Empty** | "Không có dữ liệu khớp bộ lọc." + nút "Xoá bộ lọc" khi đang có filter; phân biệt với "chưa có dữ liệu nào" |
| **Error** | `ErrorState` trong vùng bảng, giữ nguyên thanh filter, có nút "Tải lại" |
| **Permission-denied** | Thiếu `hasPermission` cho mục cụ thể → mục bị ẩn khỏi nav; nếu vào URL trực tiếp thì hiện `PermissionDeniedState` giải thích cần quyền gì, **không** chuyển hướng im lặng |
| **Mobile** | Bảng cuộn ngang **trong khối riêng** có `overflow-x: auto` — body không bao giờ cuộn ngang. Bộ lọc thành drawer |
| **Hành động nguy hiểm** | Xoá/khoá/reset luôn qua `Dialog` xác nhận; các thao tác đã yêu cầu "lý do" giữ nguyên yêu cầu đó |

---

## E. Tổng hợp trạng thái theo trang

Bảng kiểm tra: mỗi trang phải có đủ năm trạng thái trước khi coi là hoàn thành.

| Trang | Loading | Empty | Error | Permission-denied | Mobile |
|---|:---:|:---:|:---:|:---:|:---:|
| `/` | ✓ | — | ✓ (im lặng, fallback) | — | ✓ |
| `/how-it-works`, `/features`, `/faq` | — | — | — | — | ✓ |
| `/login`, `/register` | ✓ | — | ✓ (cạnh trường) | ✓ (khoá / tắt đăng ký) | ✓ |
| `/404`, `/maintenance` | — | — | ✓ | — | ✓ |
| `/hs` | ✓ | ✓ | ✓ | — | ✓ |
| `/hs/bai-tap` | ✓ | ✓ | ✓ | — | ✓ |
| `/hs/bai-tap/:setId` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/hs/hoi-dap` | ✓ | ✓ | ✓ | ✓ (flag) | ✓ |
| `/hs/tien-do` | ✓ | ✓ | ✓ | — | ✓ |
| `/hs/ca-nhan-hoa` | ✓ | ✓ | ✓ | ✓ (flag) | ✓ |
| `/hs/ho-so` | ✓ | ✓ | ✓ | — | ✓ |
| `/hs/onboarding` | ✓ | — | ✓ | — | ✓ |
| `/gv` | ✓ | ✓ | ✓ | — | ✓ |
| `/gv/hoc-lieu` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/gv/hoc-lieu/:id` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/gv/de-thi` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/gv/de-thi/:setId` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/gv/lop-hoc` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/gv/lop-hoc/:id` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/gv/ho-so` | ✓ | — | ✓ | — | ✓ |
| `/admin/*` (16 trang) | ✓ | ✓ | ✓ | ✓ | ✓ |

## F. Số lượng trang

| Khu vực | Trang | Ghi chú |
|---|---|---|
| Public | 8 | thêm mới: `/how-it-works`, `/features`, `/faq`, `/404` |
| Học sinh | 8 | thêm mới: `/hs/ho-so`; gộp 2 trang thành `/hs/tien-do` |
| Giáo viên | 8 | thêm mới: `/gv/ho-so`; gộp 3 đường sinh đề thành `/gv/de-thi` |
| Admin | 16 | giữ nguyên |
| **Tổng** | **40** | trước: 36 route (trong đó `*` trả về trang chủ) |
