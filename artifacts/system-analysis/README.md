# Bộ bàn giao phân tích hệ thống EzEdu AI

## Tài liệu chính

- `Bao_cao_phan_tich_nghiep_vu_EzEdu_AI.docx`: báo cáo Word đã render và kiểm tra trực quan.
- `Bao_cao_phan_tich_nghiep_vu_EzEdu_AI.md`: nguồn nội dung báo cáo.

## Sơ đồ

Thư mục `diagrams/` chứa năm sơ đồ:

- Use Case Diagram.
- Activity Diagram.
- Sequence Diagram.
- Class Diagram.
- ERD.

Mỗi sơ đồ có bản PNG và SVG. Thư mục `diagrams/source/` chứa nguồn PlantUML `.puml`.

## CASE Studio 2

Thư mục `case-studio2/` chứa:

- `ezedu_logical_model_mysql.sql`: DDL logic 49 bảng để reverse-engineer trong CASE Studio 2.
- `data_dictionary.csv`: inventory dữ liệu đối chiếu mã nguồn.
- `README_CASE_STUDIO_2.md`: hướng dẫn import và lưu model `.dm2`.

CASE Studio 2 không có trong môi trường macOS hiện tại, nên gói không giả lập hoặc đổi tên tệp thành `.dm2`. Tệp `.dm2` hợp lệ cần được CASE Studio 2 tạo từ DDL trên Windows.

## Inventory và khả năng tái tạo

- `inventory/api_inventory.csv`: 199 endpoint FastAPI.
- `inventory/data_inventory.csv`: 46 collection/logical data surfaces.
- `inventory/system_inventory.md`: bản tóm tắt inventory.
- `scripts/`: công cụ tái tạo inventory, sơ đồ, báo cáo Word, contact sheet và kiểm tra DDL.
- `qa/docx-render-verified/`: bản render PDF/PNG dùng kiểm tra bố cục, gồm contact sheet 39 trang.

## Kết quả xác minh

- Backend: 411 tests pass, 13 subtests pass.
- Frontend: lint pass; TypeScript + Vite production build pass.
- DDL: 49 bảng, 94 FK references, không có đích FK bị thiếu.
- DOCX: render thành công 39 trang; đã kiểm tra trực quan.
