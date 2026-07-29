# 60 — Bàn giao: Kho tri thức chuẩn (Giai đoạn 7)

> Tiếp theo [50-grounded-web-knowledge.md](50-grounded-web-knowledge.md) (Giai đoạn 6, đã hoàn thành). Phạm vi: source registry + ingestion pipeline + quality checks cho nội dung giáo khoa đã kiểm duyệt, tìm kiếm được dùng chung toàn nền tảng — đúng phần Giai đoạn 6 đã cố ý để lại ("`list_sources` chỉ trả học liệu của CHÍNH giáo viên... đây chính là phạm vi của Giai đoạn 7").

## Dependency đã thêm
**Không có.** Dùng lại `chromadb` (đã cài từ trước cho `rag_service.py`), hạ tầng job queue/TTL-index/optimistic-concurrency đã có.

## Kiến trúc — tái sử dụng tối đa, không viết lại

- **Taxonomy môn/lớp/chương/chủ đề** — dùng NGUYÊN VẸN `app/exam_bank/schemas/taxonomy.py`/`services/taxonomy_service.py` (Giai đoạn 3), vốn đã ghi chú sẵn "dùng chung cho ngân hàng câu hỏi và kho tri thức chuẩn (giai đoạn 7)". Không tạo taxonomy thứ 2.
- **Embedding (Gemini + fallback local)** — 2 hàm private `_build_embeddings`/`_build_query_embedding` trong `rag_service.py` được đổi thành PUBLIC (`build_embeddings`/`build_query_embedding`, đổi tên thuần tuý, hành vi giữ nguyên — đã verify qua toàn bộ test suite cũ không hồi quy) để `curriculum_kb` gọi lại đúng cơ chế đã có, không viết lại logic Gemini-embedding-với-fallback.
- **`KnowledgeRetriever` Protocol** (nhắc tới trong kiến trúc Giai đoạn 1) — **cố ý KHÔNG xây** ở giai đoạn này: chỉ có 1 cài đặt thật (Chroma), một interface trừu tượng cho đúng 1 implementation là thêm phức tạp không có lợi ích hiện tại (đúng nguyên tắc "chỉ thêm khi có lợi ích đã đo được", chính kiến trúc Giai đoạn 1 cũng ghi rõ `GeminiFileSearchRetriever` "chỉ nếu có lợi rõ ràng, không migrate mặc định").
- **Quality check** — tái sử dụng đúng vốn từ `quality_status: unreviewed|flagged|verified` đã có ở `QuestionBankResponse` (Giai đoạn 3) và đúng cơ chế "duyệt xong (approved) tự chuyển verified" — không xây pipeline kiểm định nội dung riêng.
- **Vector store riêng** — `curriculum_kb_chunks_*` (Chroma collection mới, KHÁC `document_chunks` của `rag_service.py`): lọc theo `subject_id/grade/topic_id` (trục dữ liệu toàn nền tảng), trong khi `document_chunks` chỉ lọc theo `document_id/user_id` (trục sở hữu cá nhân) — 2 mục đích khác nhau, không dùng chung collection.

## Domain model mới — `app/curriculum_kb/`

**Source registry** (`curriculum_kb_sources`): mỗi bản ghi là 1 nguồn tri thức, có 3 trạng thái độc lập:
- `review_status`: `draft→reviewing→approved→published→archived` (state machine riêng `CurriculumReviewStatus`, không trùng tên với `WebKnowledgeSourceStatus`/`QuestionBankStatus` dù cùng hình dạng — đúng quy ước dự án).
- `quality_status`: `unreviewed|flagged|verified` — tự chuyển `verified` khi `review_status→approved`.
- `ingest_status`: `not_ingested|pending|ingested|failed` — vòng đời riêng của việc NẠP vào Chroma, tách khỏi việc DUYỆT nội dung (1 nguồn có thể approved nhưng chưa nạp, hoặc nạp thất bại cần thử lại mà không mất trạng thái duyệt).

**2 cách tạo nguồn:**
1. **Thủ công** (`origin_type="manual"`) — giáo viên gõ trực tiếp, bắt đầu ở `draft`, phải qua đủ vòng duyệt.
2. **Từ "Khám phá kiến thức Internet"** (`origin_type="web_knowledge"`, `origin_id=<web_knowledge_source id>`) — chỉ cho phép khi nguồn web đã `approved`/`published` bên đó; vào thẳng `approved`/`verified` ở đây (không bắt duyệt lại từ đầu vì đã qua 1 vòng duyệt rồi) — giáo viên chỉ cần bấm "Nạp vào kho".

## File backend đã tạo mới — `app/curriculum_kb/`

| File | Việc |
|---|---|
| `constants/collections.py` | `CURRICULUM_SOURCES` |
| `schemas/source.py` | `CurriculumReviewStatus`+transitions, `CurriculumQualityStatus`, `CurriculumIngestStatus`, `CurriculumSourceCreate/Response`, `CurriculumSearchResultItem/Response` — tái sử dụng `WebCitation` |
| `services/registry_service.py` | `create_source`, `create_source_from_web_knowledge`, `review_source`, `list_sources`, `list_published_sources` |
| `services/ingestion_service.py` | `enqueue_ingestion`, `ingest_curriculum_source_job` (handler job nền — chunk qua `text_chunking_service.split_text_into_chunks`, embed qua `rag_service.build_embeddings`, upsert Chroma), `search()` |
| `repositories/indexes.py` | Index cho `curriculum_kb_sources` |
| `api/deps.py` | `require_curriculum_kb_actor` (mọi vai trò, cổng bằng `ENABLE_CURRICULUM_KB`), `require_teacher_actor` |
| `api/registry.py`, `api/search.py`, `api/__init__.py` | Router — xem endpoint bên dưới |
| `backend/tests/test_curriculum_kb.py` (18 test) | Xem mục Test |

## File backend đã sửa

| File | Thay đổi |
|---|---|
| `app/services/rag_service.py` | Đổi tên `_build_embeddings`→`build_embeddings`, `_build_query_embedding`→`build_query_embedding` (private→public, hành vi giữ nguyên) để dùng chéo module |
| `app/web_knowledge/services/source_service.py` | Đổi tên `_load_owned_source`→`load_owned_source` (private→public) — `curriculum_kb` cần gọi lại khi tạo nguồn từ web-knowledge, đúng tiền lệ đã áp dụng ở Giai đoạn 4 (không import hàm private chéo module) |
| `app/core/config.py` | Thêm `ENABLE_CURRICULUM_KB: bool = False` |
| `app/main.py` | Đăng ký `curriculum_kb_router`, gọi `ensure_curriculum_kb_indexes` |
| `app/worker.py` | Đăng ký handler `ingest_curriculum_source` |

### Endpoint mới

```
POST /api/v1/curriculum-kb/sources                              (giáo viên/admin)
POST /api/v1/curriculum-kb/sources/from-web-knowledge/{id}       (giáo viên/admin)
GET  /api/v1/curriculum-kb/sources                               (giáo viên/admin — của mình; admin thấy tất cả)
POST /api/v1/curriculum-kb/sources/{id}/review                   (giáo viên/admin, đúng chủ sở hữu)
POST /api/v1/curriculum-kb/sources/{id}/ingest                    (giáo viên/admin — xếp hàng job nền, 202)
GET  /api/v1/curriculum-kb/search                                 (mọi vai trò đã đăng nhập)
GET  /api/v1/curriculum-kb/sources/published                      (mọi vai trò — chỉ published+ingested)
```

## Frontend

| File | Việc |
|---|---|
| `frontend/src/api/curriculumKbApi.ts` | Type + hàm gọi 7 endpoint trên |
| `frontend/src/pages/CurriculumKbPage.tsx` | Tìm kiếm (mọi vai trò) + form thêm nguồn thủ công + danh sách nguồn của giáo viên kèm nút Gửi duyệt/Duyệt/Xuất bản/Nạp vào kho |
| `frontend/src/pages/WebKnowledgePage.tsx` | Thêm nút "Đưa vào kho tri thức chuẩn" cho học liệu Internet đã approved/published — liên kết 2 phân hệ Giai đoạn 6↔7 |
| `frontend/src/App.tsx`, `AppLayout.tsx` | Route `/curriculum-kb` (học sinh + giáo viên), nav "Kho tri thức chuẩn" |

## Test đã chạy

```
python -m pytest tests -q
```
**403 passed**, 0 fail (385 test cũ Giai đoạn 1–6 + 18 test mới `test_curriculum_kb.py`): tạo nguồn thủ công (draft/unreviewed), tạo từ web-knowledge (chặn nếu chưa approved, đi thẳng approved/verified khi hợp lệ), toàn bộ vòng đời duyệt (quality tự verified khi approve), chuyển trạng thái sai bị chặn, duyệt không phải chủ sở hữu bị chặn (403), danh sách published chỉ hiện đúng published+ingested, enqueue ingest chặn nguồn chưa approved, enqueue đặt `pending` + xếp đúng job, job ingest chunk+embed+đánh dấu ingested đúng, job lỗi đánh dấu `failed` kèm lỗi RỒI ném lại (để `background_job_service` retry), search ghép đúng chunk với nguồn gốc, search rỗng khi câu hỏi trống, feature flag tắt chặn tất cả, học sinh không quản lý được registry nhưng tìm kiếm được.

## Kiểm thử thủ công trên server thật (MongoDB Atlas + Chroma thật, không mock)

Bật tạm `ENABLE_CURRICULUM_KB=true`/`ENABLE_WEB_KNOWLEDGE=true` trong `.env` cục bộ (đã khôi phục sau khi xong).

1. Tạo nguồn thủ công (định lý Pythagoras, môn `math`, lớp 8) → `draft`/`unreviewed`.
2. Duyệt `draft→reviewing→approved` → xác nhận `quality_status` tự chuyển `verified` đúng như thiết kế.
3. Gọi `/ingest` → **worker thật xử lý job thật**, chunk nội dung, embed (fallback local do Gemini hết quota — đã ghi nhận từ Giai đoạn 4/6, không chặn ingest vì có fallback), upsert vào Chroma persistent thật → `ingest_status: "ingested"`, `chunk_count: 1`.
4. Duyệt tiếp `approved→published`.
5. `GET /curriculum-kb/search?query=...&subject_id=math` → trả đúng chunk, đúng nguồn gốc, điểm liên quan tính từ khoảng cách vector thật (không phải giả lập).
6. `GET /curriculum-kb/sources/published` → đúng 1 kết quả.
7. **Liên kết Giai đoạn 6→7**: tạo 1 học liệu Internet (`web_knowledge_sources`) thủ công, duyệt `approved`, gọi `POST /curriculum-kb/sources/from-web-knowledge/{id}` → tạo đúng bản ghi `origin_type="web_knowledge"`, đi thẳng `approved`/`verified` (bỏ qua vòng duyệt lại), giữ đúng `origin_id` trỏ về nguồn web gốc.
8. Học sinh: gọi tạo nguồn → `403` đúng; gọi search → `200`, trả đúng kết quả đã publish (không bị chặn).
9. **Trên trình duyệt thật**: đăng nhập giáo viên, vào `/curriculum-kb` — thấy đúng 2 nguồn (1 tạo tay đã nạp, 1 từ web-knowledge chưa nạp), tìm kiếm trả đúng kết quả kèm badge môn/lớp/độ liên quan.
10. Dọn dữ liệu QA: xoá cả bản ghi Mongo LẪN vector Chroma mồ côi (`curriculum_kb_chunks_local_384d`, xoá theo `where={"subject_id": "math"}`) — nếu chỉ xoá Mongo mà quên Chroma, vector rác vẫn tồn tại vĩnh viễn trên đĩa dù đã "xoá sạch" ở tầng ứng dụng.

## RBAC / Security
- `require_teacher_actor`: chỉ giáo viên/admin tạo/duyệt/nạp nguồn — học sinh bị 403 (đã verify thật).
- `require_curriculum_kb_actor`: mọi vai trò tìm kiếm/duyệt kho đã publish — tri thức chuẩn là tài nguyên học tập chung.
- Ownership: `review_source`/`list_sources` (không phải admin) chỉ thấy/sửa nguồn của chính mình.
- `list_published_sources`/`search` chỉ trả nội dung `review_status="published"` VÀ `ingest_status="ingested"` — nội dung `draft`/`reviewing`/`approved`-chưa-publish không bao giờ lộ ra ngoài phạm vi chủ sở hữu.

## Giả định / hạng mục chưa xử lý, cần lưu ý ở giai đoạn sau
- **`KnowledgeRetriever` Protocol chưa xây** (xem mục Kiến trúc) — nếu sau này thêm 1 retriever backend thứ 2 thật sự (ví dụ Gemini File Search) có lợi ích đo được, lúc đó mới rút interface chung từ `ChromaRetriever`/`curriculum_kb` hiện tại.
- **Ingestion mới hỗ trợ text thuần** — chưa xử lý PDF/DOCX trực tiếp làm nguồn kho tri thức chuẩn (khác với `documents.py` đã có OCR/parse riêng cho học liệu cá nhân). Nếu cần "nạp cả file giáo trình PDF vào kho chuẩn", cần thêm bước parse tái sử dụng `document_parser.py` trước khi gọi `ingest_curriculum_source_job` — để lại cho nhu cầu thực tế xác nhận trước khi xây (YAGNI).
- **`enqueue_ingestion` không kiểm tra job đang chạy trùng** ngoài idempotency-key theo `(source_id, version)` — nếu giáo viên bấm "Nạp vào kho" nhiều lần liên tiếp TRƯỚC khi version đổi, các lần sau bị chặn tạo job trùng nhờ idempotency-key có sẵn (đã test), không cần thêm cơ chế khoá riêng.
- Chưa có UI duyệt/tìm kiếm theo cây taxonomy đầy đủ (chỉ lọc theo `subject_id` dạng text tự do trong ô tìm kiếm) — trang hiện tại chưa tích hợp dropdown chọn từ `curriculum_taxonomy` đã có ở Giai đoạn 3; để lại như cải tiến UX nếu cần, không chặn chức năng tìm kiếm cốt lõi.
