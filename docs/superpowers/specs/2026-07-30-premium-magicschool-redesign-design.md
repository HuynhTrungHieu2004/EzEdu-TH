# EzEdu AI — Premium MagicSchool-inspired redesign

- **Ngày duyệt:** 2026-07-30
- **Hướng được chọn:** Editorial Classroom Energy
- **Phạm vi:** Trang công khai, xác thực, app shell và dashboard của giáo viên, học sinh, quản trị
- **Trang tham khảo:** MagicSchool.ai

## 1. Bối cảnh và kết quả khảo sát

Bản hiện tại hoạt động tốt về nền tảng nhưng chưa đạt yêu cầu thẩm mỹ. Khảo sát
trực tiếp ở desktop và mobile ghi nhận:

- Landing có 13 section, không dùng ảnh và có khoảng 65 phần tử mang kiểu card.
- Hero dùng nền tối, gradient tím và minh họa SVG nhân vật quá đơn giản.
- Nhiều section lặp lại cấu trúc tiêu đề căn giữa và lưới thẻ bằng nhau.
- Nhịp thị giác thiếu ảnh người, lớp chồng, mảng màu, texture và bố cục bất đối
  xứng.
- Mobile không tràn ngang; menu responsive hoạt động.
- Không có lỗi console ở landing hoặc dashboard.
- Một lỗi tải dashboard xuất hiện khi backend vừa khởi động, nhưng tải lại thành
  công và ba API `/documents`, `/questions/my-history`, `/classes` đều trả 200.

MagicSchool tạo cảm giác sống động bằng ảnh/collage lớp học, typography có cá
tính, nền kem, mảng cam–tím, hình trang trí lớn và section có tỷ lệ khác nhau.
EzEdu sẽ học tinh thần đó nhưng dùng nội dung, asset và nhận diện nguyên bản.

## 2. Mục tiêu

1. Tạo ấn tượng giáo dục sống động ngay ở màn hình đầu tiên.
2. Loại bỏ cảm giác giao diện AI đại trà và sự lặp lại của các card đồng dạng.
3. Giữ nguyên mọi route, API, phân quyền và logic nghiệp vụ hiện có.
4. Làm public site và app sau đăng nhập cùng một hệ nhận diện nhưng khác mật độ:
   public giàu cảm xúc; app ưu tiên hiệu suất làm việc.
5. Đảm bảo desktop, tablet, mobile, light mode, dark mode và reduced motion đều
   hoàn chỉnh.

## 3. Phạm vi và giới hạn

### Trong phạm vi

- Landing page và các public page: `/`, `/how-it-works`, `/features`, `/faq`.
- Trang xác thực và trạng thái: login, register, onboarding, maintenance, 404.
- App shell dùng chung: sidebar, mobile navigation, account menu, theme controls.
- Dashboard giáo viên, học sinh và quản trị.
- Design tokens và primitive UI cần thiết để các trang nghiệp vụ kế thừa phong
  cách mới.
- Các CSS cục bộ liên quan trực tiếp đến landing, public layout, app shell và
  dashboard.

### Ngoài phạm vi

- Không đổi API contract, schema dữ liệu hoặc business rules.
- Không viết lại DataTable, form nghiệp vụ hoặc workflow quản trị.
- Không thêm tính năng chưa có trong backend.
- Không bịa testimonial, số liệu, chứng chỉ bảo mật hoặc tích hợp.
- Không sao chép CSS, SVG, ảnh hoặc nội dung của MagicSchool.
- Không thêm thư viện animation nặng hoặc chuyển framework.

Các trang nghiệp vụ bên trong sẽ nhận diện mới qua token và primitive UI. Chỉ
những màn hình có lỗi thị giác rõ ràng do token mới mới được vá cục bộ.

## 4. Ngôn ngữ thị giác

### 4.1 Màu sắc

- Nền thương hiệu sáng: kem ấm `#FBF6EA`, không dùng trắng tinh làm nền toàn
  trang.
- Màu chữ chính: tím than `#251A36`.
- Màu tương tác duy nhất: tím hoàng gia `#5C3AD7`.
- Cam san hô và vàng nắng chỉ dùng cho nền section, collage, nhãn trang trí và
  minh họa (`#FF7B61` và `#FFC857`); không dùng như màu trạng thái hoặc CTA cạnh
  tranh với tím.
- Màu success, warning, danger tiếp tục mang ý nghĩa ngữ nghĩa hiện có.
- Dark mode dùng nền tím than `#171322`, bề mặt nâng theo cấp độ và bóng có sắc
  tím; không dùng nền đen phẳng.

Token phải tiếp tục theo cấu trúc hiện có trong `tokens.css`. Component không
được hard-code màu thương hiệu khi đã có token tương ứng. Các mã màu trên là
điểm xuất phát; implementation được phép điều chỉnh độ sáng trong cùng hue để
đạt WCAG AA.

### 4.2 Typography

- Dùng `Be Vietnam Pro` cho cả display và body để bảo đảm dấu tiếng Việt nhất
  quán. Display dùng weight 800, body dùng 400/500/600.
- Body ưu tiên khả năng đọc; display dùng tracking âm và `text-wrap: balance`.
- Đoạn mô tả giới hạn khoảng 60–68 ký tự mỗi dòng.
- Số liệu dashboard dùng tabular figures.
- Eyebrow dùng sentence case; không lạm dụng chữ in hoa.

Font được tải một lần từ nguồn hiện có của frontend, có fallback
`system-ui, sans-serif` và không gây layout shift đáng kể. Không phụ thuộc font
để bố cục vẫn dùng được khi mạng lỗi.

### 4.3 Hình ảnh và texture

Tạo ba asset gốc, thống nhất phong cách collage biên tập:

1. Hero: giáo viên và học sinh Việt Nam trong lớp học, năng lượng tích cực.
2. Teacher showcase: giáo viên chuẩn bị nội dung với laptop và tài liệu.
3. Student showcase: học sinh luyện tập và nhận phản hồi.

Asset không được sao chép từ MagicSchool hoặc dùng stock photo không rõ giấy
phép. Ba ảnh được lưu cục bộ trong `frontend/src/assets/brand/`, xuất WebP với
kích thước responsive và có alt text phù hợp; production không tải ảnh từ dịch
vụ bên ngoài. Trang trí bổ sung bằng sao bốn cánh, nét vẽ tay, giấy kẻ ô và grain
rất nhẹ.

## 5. Kiến trúc landing page

### 5.1 Announcement bar và header

- Announcement bar lấy nội dung CMS hiện có; không có nội dung thì ẩn.
- Header nền kem bán trong suốt, có border trong nhẹ và sticky sau khi cuộn.
- Desktop dùng nav ngang; mobile dùng drawer hiện có, không thay đổi route.
- CTA chính luôn dẫn tới luồng đăng ký hoặc khu vực hợp lệ theo trạng thái đăng
  nhập.

### 5.2 Hero

- Bố cục desktop lệch 55/45: copy và CTA bên trái, collage bên phải.
- Mobile xếp copy trước, collage sau; CTA không nhỏ hơn 44px chiều cao.
- Headline cụ thể, không dùng sáo ngữ AI.
- Chỉ có một CTA chính màu tím, một text/outline action phụ.
- Collage gồm ảnh chính, hai callout sản phẩm và hình trang trí có kiểm soát.

### 5.3 Built for learning

Thay ba card bằng nhau bằng mosaic:

- Khối giáo viên lớn nhất.
- Khối học sinh cao và hẹp hơn.
- Khối lớp học/quản lý trải rộng phía dưới.

Mỗi khối có một lợi ích thật, một đường dẫn thật và tỷ lệ riêng. Trên mobile,
mosaic trở thành danh sách có thứ tự hợp lý.

### 5.4 Product demo tải học liệu

- Giữ nguyên toàn bộ logic chọn file, validation dung lượng/định dạng và điều
  hướng theo vai trò.
- Tạo một vùng upload có chiều sâu, trạng thái drag, selected, invalid và
  processing rõ ràng.
- Bao quanh bằng callout mô tả PDF, DOCX, PPTX và video thay vì nhiều chip rời.

### 5.5 Quy trình ba bước

- Desktop dùng timeline sticky: nội dung bước ở một cột và mockup thay đổi ở
  cột kia.
- Mobile dùng timeline dọc, không sticky.
- Không thêm business state; đây chỉ là trình bày nội dung marketing.

### 5.6 Showcase giáo viên và học sinh

- Hai section zig-zag, ảnh lớn và mockup sản phẩm chồng nhẹ.
- Danh sách công cụ lấy từ `toolRegistry.ts`, không tạo tên công cụ giả.
- CTA dùng route thật theo vai trò.

### 5.7 Trust, dữ liệu và nội dung xã hội

- Chỉ hiển thị số liệu khi CMS/API cung cấp dữ liệu thật.
- Testimonial không có dữ liệu thì ẩn cả section.
- Trust chỉ nêu cơ chế có trong hệ thống như RBAC, audit log và nguồn trích dẫn.
- Không hiển thị logo tích hợp hoặc chứng chỉ chưa được xác thực.

### 5.8 CTA cuối và footer

- CTA cuối là một khối màu lớn, copy ngắn và một hành động chính.
- Footer tập trung vào điều hướng quan trọng, thông tin pháp lý hiện có và liên
  hệ; không tạo link giả hoặc link `#`.

## 6. App shell và dashboard

### 6.1 App shell

- Giữ sidebar vì ứng dụng có nhiều workflow và phân quyền khác nhau.
- Sidebar trở thành workspace rail có nền riêng, khoảng cách nhóm rõ, trạng thái
  active nổi bật và account block dễ nhận biết.
- Mobile tiếp tục dùng drawer/bottom access hiện có; không ẩn chức năng.
- Vùng nội dung có max-width thích hợp cho dashboard nhưng cho phép bảng dữ liệu
  dùng toàn chiều rộng.

### 6.2 Dashboard

- Greeting panel dùng màu thương hiệu, copy theo vai trò và collage nhỏ.
- Search giữ nguyên dữ liệu/command nhưng có trạng thái focus nổi bật.
- Quick actions dùng nhóm hành động ngang linh hoạt, không biến thành một lưới
  card thứ hai.
- Stat tile có phân cấp rõ, số dùng tabular figures.
- Empty state trở thành hướng dẫn bắt đầu có cấu trúc.
- Error và loading state tiếp tục dùng component hiện có, được cập nhật theo
  design system.

### 6.3 Trang quản trị

Trang quản trị không dùng collage hay trang trí marketing trong khu vực dữ liệu.
Token mới áp dụng cho header, filter, table container, form, badge và feedback
state. Mật độ, khả năng quét bảng và phân cấp nguy hiểm vẫn là ưu tiên.

## 7. Component và ranh giới mã

Các đơn vị sẽ được triển khai:

- `BrandArtwork`: render asset và callout trang trí, không chứa dữ liệu nghiệp vụ.
- `Reveal`: IntersectionObserver dùng chung cho hiệu ứng xuất hiện; không chạy khi
  reduced motion.
- `SectionIntro`: chuẩn hóa eyebrow, heading, description nhưng hỗ trợ căn trái
  và tỷ lệ khác nhau.
- `ProductMockup`: khung trình diễn UI tĩnh, không gọi API.
- File `components/public/LandingSections.tsx` hiện dài 949 dòng sẽ được tách
  thành các component section trong `components/public/landing/`. File gốc chỉ
  còn nhiệm vụ re-export để không phá import hiện có.
- `PrimaryTool` tiếp tục sở hữu logic upload; phần trình bày được đổi nhưng
  callback và validation không đổi.

Không gom mọi section vào một component khổng lồ. Component trang trí không được
biết auth role; component nghiệp vụ không được chứa chi tiết asset.

## 8. Chuyển động và tương tác

- Entrance reveal: opacity + translateY, 450–650ms, stagger tối đa 80ms.
- Hero decoration: chuyển động nổi nhỏ, chu kỳ dài, không ảnh hưởng bố cục.
- Hover: translateY tối đa 3px hoặc đổi màu/border; pressed dùng scale nhẹ.
- Sticky header và timeline không gây layout shift.
- Chỉ animate `transform` và `opacity`.
- Với `prefers-reduced-motion: reduce`, tắt reveal, parallax, floating và smooth
  scroll; nội dung luôn hiển thị đầy đủ.
- Focus ring phải nhìn rõ trên mọi màu nền.

Không dùng hiệu ứng con trỏ tùy biến, scroll hijacking hoặc animation liên tục ở
phần dashboard dữ liệu.

## 9. Responsive và accessibility

- Breakpoint kế thừa hệ hiện có; kiểm tra tối thiểu 390px, 768px, 1280px và
  1440px.
- Không có horizontal overflow ở 390px.
- Touch target tối thiểu 44×44px.
- Thứ tự DOM phải đúng nghĩa khi layout desktop đổi vị trí bằng CSS.
- Heading hierarchy không bỏ cấp.
- Ảnh nội dung có alt; hình trang trí dùng `aria-hidden`.
- Contrast đạt WCAG AA cho body text, controls và focus indicator.
- Skip link, landmark, label, `aria-live` và keyboard navigation hiện có phải
  được giữ.

## 10. Dữ liệu, lỗi và bảo toàn nghiệp vụ

- CMS `fetchPublicWebsiteContent` tiếp tục là nguồn copy public.
- Không đổi auth context, route guards hoặc interceptor API.
- Không đổi validation upload:
  - PDF, DOCX, PPTX tối đa 20MB.
  - MP4, MOV, WEBM, MKV tối đa 100MB.
- Hành vi theo vai trò của công cụ chính giữ nguyên:
  - giáo viên vào `/documents`;
  - học sinh nhận hướng dẫn phù hợp;
  - admin vào `/admin/documents`;
  - khách được mời đăng ký.
- Lỗi API hiển thị inline; không dùng `window.alert`.
- Ảnh hỏng phải có nền/fallback, không làm mất CTA hoặc nội dung chính.

## 11. Chiến lược kiểm thử

### Trước khi sửa mã

- Viết hoặc cập nhật Playwright test cho các hành vi/contract cần bảo vệ.
- Chạy test mới và xác nhận test thất bại vì UI mới chưa tồn tại, không phải vì
  cấu hình sai.

### Trong quá trình triển khai

- Sau từng cụm thay đổi: typecheck, lint và test mục tiêu.
- Kiểm tra thủ công bằng trình duyệt ở light/dark, desktop/mobile.
- Theo dõi console error và request lỗi.

### Trước khi hoàn thành

- `npx tsc -b --force`
- `npm run lint`
- `npm run build`
- Toàn bộ Playwright suite.
- Toàn bộ backend test hiện có.
- Axe/accessibility scan cho landing, login, dashboard và một trang admin.
- Smoke test đăng ký, đăng nhập, mobile menu, theme, upload validation, CTA,
  route guards và logout.

## 12. Tiêu chí nghiệm thu

1. Hero và hai showcase dùng asset nguyên bản, có chất lượng và responsive.
2. Landing không còn chuỗi section lặp lại bằng các lưới ba card đồng dạng.
3. Public site có nhịp thị giác, bố cục và năng lượng giáo dục tương đương hoặc
   tốt hơn trang tham khảo mà không sao chép.
4. App shell và dashboard cùng nhận diện nhưng vẫn đọc nhanh và làm việc hiệu
   quả.
5. Không thay đổi route, API contract, quyền truy cập hoặc hành vi upload.
6. Không có console error, horizontal overflow hoặc lỗi accessibility nghiêm
   trọng.
7. Typecheck, lint, build, frontend test và backend test đều vượt qua.
