# EzEdu AI System Analysis and CASE Studio 2 Deliverables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo bộ báo cáo phân tích nghiệp vụ đầy đủ và năm sơ đồ nhất quán với mã nguồn EzEdu AI, kèm DDL reverse-engineer được bằng CASE Studio 2.

**Architecture:** Nội dung chuẩn được lưu trong Markdown; dữ liệu sơ đồ được khai báo tập trung trong script Node, xuất SVG rồi chuyển PNG bằng `sharp`; báo cáo DOCX được tạo bằng `python-docx` từ nội dung và ảnh đã kiểm tra. ERD vật lý dùng mô hình quan hệ logic MySQL để CASE Studio 2 reverse-engineer, trong khi báo cáo giải thích rõ hệ thống chạy MongoDB.

**Tech Stack:** Markdown, PlantUML source, SVG, Sharp, Python 3 bundled runtime, python-docx, LibreOffice renderer, MySQL-compatible DDL.

## Global Constraints

- Không sửa mã nguồn chức năng của frontend/backend.
- Không ghi hoặc tiết lộ giá trị trong `.env`.
- Không tạo tệp `.dm2` không thể xác minh.
- Các kết luận ưu tiên code/router/schema hiện tại hơn tài liệu kế hoạch cũ.
- Mọi sơ đồ dùng cùng tên tác nhân, use case, lớp và thực thể.
- DOCX dùng preset `standard_business_brief`; sơ đồ lớn nằm trên trang ngang.

---

### Task 1: Chốt inventory và bằng chứng hệ thống

**Files:**
- Create: `artifacts/system-analysis/inventory/system_inventory.md`
- Create: `artifacts/system-analysis/inventory/api_inventory.csv`
- Create: `artifacts/system-analysis/inventory/data_inventory.csv`

**Interfaces:**
- Consumes: router, schema, service, config, frontend routes và báo cáo QA trong repository.
- Produces: danh mục chuẩn cho báo cáo, sơ đồ và ma trận truy vết.

- [ ] **Step 1: Ghi inventory kiến trúc, phân hệ, vai trò và tích hợp**

Đối chiếu `backend/app/main.py`, `backend/app/core/rbac.py`, `frontend/src/App.tsx`, `backend/app/core/config.py`.

- [ ] **Step 2: Ghi inventory API**

Liệt kê method, path, phân hệ, actor và mục đích nghiệp vụ từ các decorator FastAPI.

- [ ] **Step 3: Ghi inventory dữ liệu**

Liệt kê collection, khóa logic, owner field, quan hệ và kiểu lưu nhúng/tham chiếu.

- [ ] **Step 4: Kiểm tra chéo**

Đảm bảo mọi router được include trong `main.py` xuất hiện trong inventory và mọi collection constant/index quan trọng xuất hiện trong data inventory.

---

### Task 2: Viết báo cáo nguồn Markdown

**Files:**
- Create: `artifacts/system-analysis/Bao_cao_phan_tich_nghiep_vu_EzEdu_AI.md`

**Interfaces:**
- Consumes: ba inventory của Task 1 và đặc tả thiết kế.
- Produces: nội dung chuẩn để tạo DOCX và mô tả sơ đồ.

- [ ] **Step 1: Viết khảo sát hiện trạng**

Bao gồm bối cảnh, stakeholders, kiến trúc, công nghệ, phân hệ, quy trình, dữ liệu, tích hợp, kiểm thử, hạn chế và độ sẵn sàng.

- [ ] **Step 2: Viết yêu cầu chức năng**

Đánh mã FR-AUTH, FR-DOC, FR-VER, FR-QS, FR-EXAM, FR-CLASS, FR-CHAT, FR-KNOW, FR-PERS, FR-ADMIN, FR-OPS; mỗi yêu cầu có actor, tiền điều kiện, luồng chính, ngoại lệ và tiêu chí nghiệm thu.

- [ ] **Step 3: Viết yêu cầu phi chức năng và quy tắc nghiệp vụ**

Đánh mã NFR và BR; bao phủ security, performance, reliability, scalability, usability, accessibility, observability, maintainability, compatibility, privacy và AI governance.

- [ ] **Step 4: Viết dữ liệu, tích hợp, rủi ro và truy vết**

Phân biệt MongoDB vật lý, ChromaDB, Cloudinary và mô hình quan hệ logic.

- [ ] **Step 5: Tự rà soát nội dung**

Tìm placeholder, mâu thuẫn vai trò, mâu thuẫn trạng thái và mô tả cũ không còn đúng.

---

### Task 3: Tạo nguồn sơ đồ và hình xuất

**Files:**
- Create: `artifacts/system-analysis/diagrams/source/use-case-diagram.puml`
- Create: `artifacts/system-analysis/diagrams/source/activity-diagram.puml`
- Create: `artifacts/system-analysis/diagrams/source/sequence-diagram.puml`
- Create: `artifacts/system-analysis/diagrams/source/class-diagram.puml`
- Create: `artifacts/system-analysis/diagrams/source/erd-diagram.puml`
- Create: `artifacts/system-analysis/scripts/build_diagrams.js`
- Create: `artifacts/system-analysis/diagrams/use-case-diagram.svg`
- Create: `artifacts/system-analysis/diagrams/activity-diagram.svg`
- Create: `artifacts/system-analysis/diagrams/sequence-diagram.svg`
- Create: `artifacts/system-analysis/diagrams/class-diagram.svg`
- Create: `artifacts/system-analysis/diagrams/erd-diagram.svg`
- Create: các PNG cùng tên.

**Interfaces:**
- Consumes: actor/use case/entity chuẩn từ Task 1 và Task 2.
- Produces: hình để nhúng báo cáo và nguồn có thể chỉnh sửa.

- [ ] **Step 1: Viết năm nguồn PlantUML**

Mỗi tệp phải có title, legend/note về phạm vi và quan hệ nhất quán.

- [ ] **Step 2: Viết trình dựng SVG**

Dùng SVG thuần với palette đã khóa; text phải wrap, connector phải có marker và vùng nhóm rõ ràng.

- [ ] **Step 3: Xuất SVG và PNG**

Chạy Node bundled runtime với `NODE_PATH` bundled; dùng `sharp` chuyển SVG sang PNG độ phân giải cao.

- [ ] **Step 4: Kiểm tra hình**

Mở từng PNG ở kích thước thật, sửa chữ cắt, đường đè và vùng trống bất thường.

---

### Task 4: Tạo mô hình CASE Studio 2

**Files:**
- Create: `artifacts/system-analysis/case-studio2/ezedu_logical_model_mysql.sql`
- Create: `artifacts/system-analysis/case-studio2/README_CASE_STUDIO_2.md`
- Create: `artifacts/system-analysis/case-studio2/data_dictionary.csv`

**Interfaces:**
- Consumes: ERD logic và data inventory.
- Produces: đầu vào reverse engineering cho CASE Studio 2.

- [ ] **Step 1: Viết DDL MySQL**

Dùng `VARCHAR(24)` cho ObjectId; PK/FK/index rõ ràng; mảng quan trọng tách bảng con; map/JSON ánh xạ sang `TEXT`.

- [ ] **Step 2: Viết data dictionary**

Mỗi bảng có collection nguồn, mục đích, owner field và ghi chú embedded/reference.

- [ ] **Step 3: Viết hướng dẫn CASE Studio 2**

Nêu cách tạo model MySQL, reverse-engineer script, auto-layout, xuất hình và lưu `.dm2` trên máy Windows có CASE Studio 2.

- [ ] **Step 4: Kiểm tra DDL**

Kiểm tra dấu ngoặc, dấu phẩy, FK target và tên bảng/cột trùng.

---

### Task 5: Tạo và kiểm tra DOCX

**Files:**
- Create: `artifacts/system-analysis/scripts/build_report.py`
- Create: `artifacts/system-analysis/Bao_cao_phan_tich_nghiep_vu_EzEdu_AI.docx`
- Create: `artifacts/system-analysis/qa/docx-render/page-*.png`

**Interfaces:**
- Consumes: Markdown, PNG sơ đồ, data dictionary và inventory.
- Produces: báo cáo Word bàn giao.

- [ ] **Step 1: Tạo style sheet**

Áp dụng chính xác preset `standard_business_brief`, header/footer, numbering thật và table geometry DXA.

- [ ] **Step 2: Tạo nội dung DOCX**

Tạo cover `editorial_cover`, mục lục tĩnh, headings, bảng yêu cầu, callout, sơ đồ landscape và phụ lục.

- [ ] **Step 3: Audit cấu trúc**

Kiểm tra page geometry, style, numbering, table widths, alt text ảnh và placeholder.

- [ ] **Step 4: Render DOCX**

Chạy `render_docx.py` bằng bundled Python với `TMPDIR=/private/tmp`.

- [ ] **Step 5: Kiểm tra toàn bộ trang**

Tạo contact sheet để rà soát tổng thể, sau đó mở trang đại diện và mọi trang có sơ đồ/bảng lớn ở độ phân giải gốc; lặp lại nếu có lỗi.

---

### Task 6: Xác minh repository và đóng gói

**Files:**
- Modify: `artifacts/system-analysis/Bao_cao_phan_tich_nghiep_vu_EzEdu_AI.md`
- Create: `artifacts/system-analysis/README.md`

**Interfaces:**
- Consumes: toàn bộ artifact Tasks 1-5.
- Produces: gói bàn giao tự mô tả và trạng thái kiểm chứng cuối.

- [ ] **Step 1: Chạy kiểm tra backend/frontend khả dụng**

Chạy backend pytest, frontend lint/typecheck/build; không gọi API ngoài và không dùng secret thật.

- [ ] **Step 2: Kiểm tra manifest**

Xác nhận đủ 5 SVG, 5 PNG, 5 PUML, DOCX, Markdown, DDL, dictionary và hướng dẫn.

- [ ] **Step 3: Kiểm tra file đầu ra**

Xác nhận DOCX là ZIP hợp lệ; ảnh đọc được; SQL/CSV/Markdown là UTF-8.

- [ ] **Step 4: Viết README bàn giao**

Mô tả từng file, cách mở và giới hạn CASE Studio 2 trên môi trường hiện tại.
