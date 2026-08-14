# EzEdu AI — Thiết kế tái cấu trúc giao diện chuyên nghiệp và giàu chuyển động

**Ngày duyệt:** 2026-08-14  
**Trạng thái:** Đã được người dùng duyệt  
**Phạm vi:** Toàn bộ frontend công khai và ứng dụng theo ba vai trò  
**Stack giữ nguyên:** React 19, TypeScript, Vite, React Router, Lucide

## 1. Mục tiêu

Tái thiết kế EzEdu AI thành một sản phẩm giáo dục có hình ảnh chuyên nghiệp, hấp dẫn, dễ hiểu và nhất quán. Giao diện phải phản ánh đúng cốt lõi của sản phẩm: dữ liệu học liệu có cấu trúc, thuật toán phân loại/lựa chọn câu hỏi và khả năng tạo phiên ôn tập trực tiếp cho học sinh.

Thiết kế mới phải:

- thống nhất toàn bộ màu sắc, typography, spacing, component và chuyển động;
- tổ chức chức năng theo đúng hành trình của học sinh, giáo viên và quản trị viên;
- cho học sinh nhắn yêu cầu ôn tập, chọn độ khó/số câu và bắt đầu làm bài không cần giáo viên duyệt;
- có nhiều hoạt ảnh và đồ họa chuyển động nhưng vẫn giữ hiệu năng, khả năng tiếp cận và tính học thuật;
- giữ nguyên chức năng/backend hiện có trừ khi một thay đổi kỹ thuật nhỏ là cần thiết để hỗ trợ UI;
- hoạt động tốt trên desktop, tablet và mobile.

## 2. Các quyết định đã duyệt

### 2.1 Hướng thị giác

Chọn **Học thuật hiện đại**:

- navy mực làm màu nền điều hướng và màu chữ chính;
- teal khoáng làm màu hành động, trạng thái active và tiến trình;
- vàng ấm làm điểm nhấn có kiểm soát;
- nền xám xanh rất nhạt, surface trắng, border mảnh;
- typography trưởng thành, rõ thứ bậc, hỗ trợ tiếng Việt tốt;
- không dùng glassmorphism tím–hồng làm ngôn ngữ chính;
- không lạm dụng gradient hoặc shadow nặng.

### 2.2 Kiến trúc ứng dụng

Chọn **sidebar theo vai trò**:

- desktop dùng sidebar cố định;
- admin dùng các nhóm menu có thể thu gọn;
- mobile dùng bottom navigation cho bốn chức năng chính và mục “Thêm”;
- mỗi trang theo khung: breadcrumb, page title, primary action, nội dung;
- cùng một design system nhưng mật độ và nội dung được điều chỉnh cho từng vai trò.

### 2.3 Luồng ôn tập của học sinh

Chọn **thẻ cấu hình đề ngay trong chat**:

- học sinh nhập môn/chủ đề muốn ôn;
- trợ lý hiển thị tiến trình xử lý;
- sau khi có dữ liệu phù hợp, thẻ cấu hình xuất hiện trong hội thoại;
- học sinh chọn độ khó và số lượng câu hỏi;
- học sinh bấm “Bắt đầu làm bài” để tạo phiên;
- không cần giáo viên duyệt.

## 3. Vấn đề hiện trạng cần giải quyết

Frontend đang có nhiều lớp thiết kế kế thừa. `tokens.css` định nghĩa một hệ màu giáo dục trong khi `index.css` vẫn chứa hệ “Crystal Luminous” tím–hồng, glassmorphism và hiệu ứng ambient cũ. Hai hệ cùng tham gia cascade khiến màu, shadow, radius, component và trạng thái không nhất quán.

Design mới coi `frontend/src/styles/tokens.css` là nguồn thật duy nhất. CSS legacy được cô lập và di trú theo từng lát, sau đó loại bỏ khi không còn consumer.

Các vấn đề khác phải xử lý trong phạm vi redesign:

- nhiều route chỉ ẩn khỏi menu nhưng chưa được bảo vệ đúng theo vai trò;
- dashboard dùng nhiều pattern hình ảnh và card không thống nhất;
- các trang giống nhau có filter, table, empty state và loading khác nhau;
- một số chức năng giáo viên/học sinh bị tách thành nhiều trang trùng nghiệp vụ;
- landing/auth/onboarding chưa cùng ngôn ngữ với app;
- animation hiện tại quá ít, rời rạc hoặc thuộc hệ thị giác cũ.

## 4. Design system

### 4.1 Token

`tokens.css` quản lý duy nhất:

- primitive và semantic colors;
- font family, type scale, line-height, font weight;
- spacing scale 4px;
- radius và elevation;
- breakpoint và container width;
- z-index layers;
- motion duration, easing và stagger;
- focus ring và touch target.

Các component không dùng mã màu thô. Alias legacy chỉ tồn tại trong giai đoạn di trú và phải có ghi chú consumer.

### 4.2 Typography

- Font UI phải dễ đọc tiếng Việt và có nhiều weight thực.
- Heading có độ tương phản rõ nhưng không mang phong cách quảng cáo quá mức.
- Body mặc định 16px; caption không nhỏ hơn 12–13px.
- Line-height đủ rộng cho dấu tiếng Việt.
- Số liệu dashboard dùng tabular numerals khi phù hợp.

### 4.3 Component dùng chung

- Layout: `AppShell`, `RoleSidebar`, `MobileNavigation`, `PageHeader`, `SectionHeader`.
- Foundation: `Button`, `IconButton`, `Input`, `Select`, `SegmentedControl`, `Checkbox`, `Radio`.
- Data: `Card`, `StatCard`, `DataTable`, `FilterBar`, `Pagination`, `Badge`, `Progress`, `Tabs`.
- Feedback: `Skeleton`, `EmptyState`, `ErrorState`, `Toast`, `Dialog`, `Drawer`.
- Learning: `ChatBubble`, `TypingIndicator`, `ProcessTimeline`, `ExamConfigCard`, `QuestionCard`, `ExamCard`, `KnowledgeSourceCard`.

Không tạo style riêng cho một trang nếu pattern đã có component chuẩn.

## 5. Kiến trúc thông tin theo vai trò

### 5.1 Học sinh

1. **Tổng quan**
   - mục tiêu hôm nay;
   - ô nhập nhanh yêu cầu ôn tập;
   - bài đang làm dở;
   - tiến độ tuần và điểm trung bình;
   - chủ đề nên ôn tiếp.
2. **Ôn tập AI**
   - chat là giao diện chính;
   - tiến trình tạo đề và thẻ cấu hình inline;
   - lịch sử phiên ôn gần đây ở vùng phụ khi đủ không gian.
3. **Bài của tôi**
   - chưa làm, đang làm, đã hoàn thành;
   - lọc theo môn, trạng thái và thời gian;
   - tiếp tục bài đang dở.
4. **Tiến độ**
   - điểm và tỷ lệ đúng theo môn/chủ đề;
   - nội dung còn yếu;
   - lịch sử và đề xuất ôn tiếp.
5. **Lớp học và hồ sơ**
   - lớp đang tham gia;
   - khối lớp, môn mạnh/yếu, mục tiêu và cài đặt.

### 5.2 Giáo viên

- Tổng quan.
- Học liệu: tải lên, xử lý, kiểm chứng, tìm kiếm và nguồn.
- Câu hỏi: tạo, chỉnh sửa, duyệt và nhập ngân hàng.
- Ngân hàng: môn → chương → chủ đề → kết quả học tập.
- Ma trận đề: yêu cầu, độ khó, cấu trúc và lời giải tối ưu.
- Đề thi: bản nháp, phát hành, lượt làm và kết quả.
- Lớp học: thành viên, giao đề và theo dõi.
- Trợ lý AI theo ngữ cảnh học liệu.

### 5.3 Quản trị viên

- Tổng quan hệ thống.
- Người dùng và phân quyền.
- Chương trình học và taxonomy.
- Nguồn thu thập, crawler và hàng chờ kiểm duyệt.
- Ngân hàng câu hỏi và chất lượng.
- Cấu hình AI, thuật toán và feature flag.
- Nhật ký, lỗi và báo cáo.

Thông tin kỹ thuật như trạng thái crawler, embedding, K-Means hoặc lỗi pipeline chỉ hiện ở vùng quản trị. Người dùng nghiệp vụ chỉ thấy kết quả có ý nghĩa với công việc của họ.

## 6. Các trang công khai và xác thực

### 6.1 Landing page

- Header gọn với một CTA chính.
- Hero giải thích rõ giá trị sản phẩm và dùng mockup sản phẩm thật.
- Quy trình bốn bước: học liệu → phân loại → ngân hàng → tạo đề.
- Khu vực vai trò học sinh/giáo viên.
- Giải thích trực quan K-Means, CP-SAT và AI.
- FAQ, CTA cuối và footer có tổ chức.

### 6.2 Login/Register

- Bố cục hai vùng: thương hiệu và form.
- Form ngắn, lỗi cạnh trường, trạng thái gửi rõ.
- Không hiển thị phương thức đăng nhập chưa có backend.

### 6.3 Student onboarding

- Stepper rõ ràng;
- cho phép quay lại;
- lưu dữ liệu theo từng bước;
- xử lý tùy chọn “làm sau” theo rule sản phẩm thay vì khóa cứng người dùng.

## 7. Hệ chuyển động

Thiết kế sử dụng nhiều chuyển động có chủ đích, chia thành bốn lớp.

### 7.1 Ambient motion

- hạt dữ liệu, đường nối, ký hiệu học thuật chuyển động chậm;
- gradient ánh sáng rất nhẹ phản ứng theo con trỏ;
- hình khối môn học tạo parallax nhiều lớp;
- trạng thái và vòng tiến độ có breathing motion nhẹ.

### 7.2 Narrative motion trên landing

Dùng GSAP ScrollTrigger:

- hero text reveal theo dòng;
- dashboard mockup xuất hiện theo timeline;
- pinned data pipeline minh họa `Học liệu → Trích xuất → K-Means → Ngân hàng → CP-SAT → Bộ đề`;
- node dữ liệu di chuyển giữa các công đoạn;
- feature card xuất hiện stagger;
- số thống kê chạy tăng dần;
- khối vai trò chuyển cảnh theo chiều ngang;
- CTA có phản hồi pointer có kiểm soát.

### 7.3 Application motion

- page entrance theo thứ tự header → action bar → content;
- active indicator của sidebar/tab trượt mượt;
- menu group mở/đóng có choreography;
- card hover nâng nhẹ và tilt rất nhỏ;
- stat counter, chart draw, row stagger;
- dialog scale/fade và drawer slide;
- route transition ngắn, không cản thao tác.

### 7.4 Learning motion

Chat:

- typing indicator;
- process timeline chuyển trạng thái;
- mô phỏng thẻ câu hỏi đi vào bộ đề;
- exam config card xuất hiện bằng timeline;
- nút bắt đầu chuyển thẻ cấu hình thành màn làm bài.

Exam:

- chuyển câu theo hướng tiến/lùi;
- progress bar và timer ring;
- phản hồi đúng/sai;
- kết quả được reveal tuần tự;
- confetti tiết chế cho thành tích phù hợp.

### 7.5 Nguyên tắc hiệu năng và accessibility

- dùng GSAP timeline cho chuỗi, CSS cho hover/focus đơn giản;
- chủ yếu animate transform và opacity;
- `useGSAP` luôn có scope và cleanup;
- dừng animation nền khi tab không active;
- giảm particle, parallax và 3D trên mobile/thiết bị yếu;
- hỗ trợ `prefers-reduced-motion` bằng `gsap.matchMedia()`;
- không đặt `will-change` trên mọi phần tử;
- không tạo hàng trăm tween đồng thời.

## 8. Kiến trúc kỹ thuật

Thêm dependencies:

- `gsap`;
- `@gsap/react`.

ScrollTrigger dùng từ package GSAP và đăng ký một lần.

Tầng motion dùng chung gồm:

- `MotionProvider`;
- `PageEntrance`;
- `StaggerGroup`;
- `AnimatedCounter`;
- `MotionCard`;
- `RouteTransition`;
- `TypingIndicator`;
- `ProcessTimeline`.

Animation không được viết rải rác bằng selector toàn cục. Component dùng ref/scope, context-safe callback và cleanup khi unmount.

## 9. Luồng tạo đề từ chat

```text
idle
  → parsing_intent
  → searching_bank
  → balancing_questions
  → ready_to_configure
  → creating_attempt
  → ready_to_start
```

UI chỉ chuyển trạng thái khi backend/logic thật đạt trạng thái tương ứng.

Xử lý lỗi:

- không tìm thấy chủ đề: gợi ý chủ đề gần nhất;
- thiếu câu: giảm số lượng hoặc mở rộng độ khó;
- AI lỗi: tiếp tục bằng dữ liệu/thuật toán nếu pipeline hỗ trợ;
- mất mạng: giữ nội dung và cấu hình, cho thử lại;
- tạo phiên lỗi: không xóa lựa chọn;
- rời trang: hủy request và cleanup animation.

## 10. Lộ trình triển khai

1. Token, typography và motion foundation.
2. AppShell, sidebar, mobile navigation và UI primitives.
3. Dashboard và chat ôn tập học sinh.
4. Luồng làm bài và kết quả.
5. Học liệu, ngân hàng, ma trận, đề và lớp của giáo viên.
6. Khu vực quản trị.
7. Landing, login/register và onboarding.
8. Xóa CSS legacy đã hết consumer.
9. QA toàn hệ thống và tinh chỉnh motion.

Các bước được triển khai theo lát dọc, không thay toàn bộ CSS trong một lần. Mỗi lát phải build và kiểm thử trước khi chuyển sang lát tiếp theo.

## 11. Tiêu chuẩn hoàn thành

- TypeScript và production build thành công.
- Không có horizontal overflow ở viewport chuẩn.
- Luồng chính của ba vai trò được Playwright kiểm tra.
- Axe không có lỗi accessibility nghiêm trọng.
- Giao diện hoạt động với `prefers-reduced-motion`.
- Không còn timeline/listener sau khi route unmount.
- Animation được kiểm tra trên thiết bị yếu và mobile.
- Có ảnh so sánh trước/sau cho các trang trọng yếu.
- Không mất chức năng hiện có.
- Các route nghiệp vụ được bảo vệ đúng vai trò, không chỉ ẩn menu.

## 12. Ngoài phạm vi

- viết lại backend hoặc mô hình dữ liệu không phục vụ trực tiếp redesign;
- thay React/Vite bằng framework khác;
- xây lại thuật toán K-Means, CP-SAT hoặc pipeline tạo đề;
- bổ sung OAuth/social login khi backend chưa hỗ trợ;
- quảng bá chức năng chưa tồn tại.
