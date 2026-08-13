# Content-Based Filtering & các thuật toán ML áp dụng được ngay

> Dựa trên đọc mã nguồn trực tiếp. Mọi đề xuất đều chỉ rõ file cần sửa và hạ tầng đã có sẵn.

> **Cập nhật sau khi triển khai.** Đã làm xong A1, A3 trong Nhóm A, bốn chức năng K-Means ngoài danh sách ban đầu (xem `PHAN_TICH_KMEANS.md`), **thông tắc đường cá nhân hoá** (BKT/IRT nay chạy được), **gán nhãn cụm**, **CBF**, và **ghép CBF × K-Means**. Chẩn đoán ban đầu về mắt xích đứt là **sai**; chỗ sai và nguyên nhân được ghi lại nguyên vẹn ở mục ngay dưới. Nay thêm **A2** (cảnh báo học liệu gần trùng) và **Thompson Sampling** (đã kiểm chứng, chờ bật). **Toàn bộ lộ trình trong tài liệu này đã hoàn thành.**

---

## Phát hiện quan trọng trước khi đề xuất

Kho thuật toán trong `backend/app/personalization/algorithms/` **đã có sẵn 6 mô-đun**, không cần viết mới:

| File | Thuật toán | Trạng thái |
|---|---|---|
| `bkt.py` | Bayesian Knowledge Tracing | ✅ **đã chạy dữ liệu thật** — 168 trạng thái, mastery 0.155–0.648 |
| `irt.py` | Item Response Theory (Rasch) | ✅ **đã chạy dữ liệu thật** — có theta và beta trên từng trạng thái |
| `akt_sequences.py` | Attention-based Knowledge Tracing | Viết xong, chưa chạy dữ liệu thật (cần quy mô lớn hơn nhiều) |
| `neural_cognitive_diagnosis.py` | Neural Cognitive Diagnosis | Viết xong, chưa chạy dữ liệu thật (cần quy mô lớn hơn nhiều) |
| `contextual_bandit.py` | Thompson Sampling | Viết xong, đã kiểm chứng ba chế độ, **cờ vẫn tắt** (`BANDIT_KILL_SWITCH = True`) |
| `kmeans_clustering.py` | K-Means | ✅ **đã gán nhãn và vào điểm xếp hạng** (xem `PHAN_TICH_KMEANS.md`) |

> **Cập nhật sau lần chạy thật đầu-cuối.** Toàn chuỗi đã chạy trên MongoDB thật:
> 4 học liệu lập chỉ mục → 16 thành phần tri thức + 17 learning item → 108 sự kiện
> học tập → 168 trạng thái BKT/IRT → 3 mô hình cụm huấn luyện → gán nhãn 15 câu hỏi
> và 12 người học → 6 gợi ý hiện trên màn hình học sinh. Xem Phần 3, bước 15.

Tất cả đều mắc **cùng một bệnh**: được gọi qua `learner_model_service.process_learning_event`, mà hàm này chỉ chạy khi có `learning_event` được ghi.

### Chẩn đoán ban đầu và chỗ nó sai

Bản đầu tài liệu này kết luận: *"mắt xích đứt duy nhất là khi nộp bài luyện tập, hệ thống không phát learning event nào"*. **Kết luận đó sai**, và ghi lại chỗ sai ở đây vì bản thân sai lầm cũng đáng rút kinh nghiệm.

Sai ở đâu: kết luận dựa trên một lệnh tìm kiếm bị cắt ngắn (`grep ... | head -5`), chỉ thấy các dòng khai báo kiểu mà không thấy chỗ gọi thật. Thực tế `PracticeAttemptPage.tsx:168-187` **đã phát đầy đủ** sự kiện `question_answered` sau mỗi lượt nộp, kèm thời gian làm từng câu đo thật, `idempotency_key`, số lần đổi đáp án và metadata.

Bài học: một lệnh tìm kiếm bị cắt ngắn có thể dẫn tới kết luận ngược hẳn. Phải đọc hết kết quả trước khi kết luận "không có chỗ nào gọi".

### Mắt xích đứt thật sự — ✅ ĐÃ THÔNG

`process_learning_event` cần **q-matrix** để biết câu hỏi thuộc đơn vị kiến thức nào. Q-matrix nằm trên `learning_items`, mà `learning_items` chỉ do `knowledge_extraction_service` sinh ra — và service này trước đây chỉ gọi được qua một endpoint **không giao diện nào dùng**. Nên dù người dùng thao tác bao nhiêu, `learning_items` vẫn rỗng vĩnh viễn và mọi sự kiện đều rơi vào nhánh `missing_q_matrix`.

**Cách đã thông:** thêm job nền `extract_document_knowledge`, tự xếp hàng ngay sau khi sinh câu hỏi xong (`knowledge_extraction_job.py`). Chạy nền vì bước này gọi AI trên toàn bộ tài liệu — giáo viên nhận bộ câu hỏi ngay, không phải chờ. Có `idempotency_key` nên sinh câu hỏi nhiều lần trên cùng tài liệu chỉ trích xuất một lần.

**Kiểm chứng end-to-end với MongoDB thật:**

```
BƯỚC 1 — trích xuất:  q_matrix câu 0 = {KC_bề_lõm: 1.0}
BƯỚC 2 — trả lời SAI: process_learning_event → "processed"
                      (trước đây luôn là "missing_q_matrix")
        BKT mastery = 0.1552   ← thấp, đúng vì trả lời sai
        IRT theta   = −0.0479  ← năng lực âm nhẹ, đúng hướng
```

**Cách bật:** đặt `PERSONALIZATION_ENABLED=true` và `KNOWLEDGE_GRAPH_ENABLED=true` trong `backend/.env`, rồi chạy worker (`python -m app.worker`) để job nền được xử lý. Cả hai cờ mặc định tắt nên hệ thống giữ nguyên hành vi cũ cho tới khi quản trị viên bật.

### Lỗi chỉ lộ ra khi chạy với MongoDB thật

Ngay lần chạy thật đầu tiên, bước trích xuất chết hoàn toàn với lỗi `ConflictingUpdateOperators`: hàm `upsert_graph_edge` quên tách `evidence_chunk_ids` khỏi `$set` trong khi `$addToSet` cũng ghi trường đó. MongoDB không cho phép một trường xuất hiện ở hai toán tử update.

Vì sao 500+ test không bắt được: test dùng `mongomock`, mà mongomock **chấp nhận** lệnh này. Đây là giới hạn cố hữu của việc giả lập cơ sở dữ liệu — hành vi giả lập lỏng hơn hành vi thật.

Cách khắc phục ở tầng test: thay vì dựa vào driver phát hiện, thêm test **soi cấu trúc lệnh update** và khẳng định không trường nào xuất hiện ở hai toán tử. Đã xác minh test này thật sự bắt được lỗi (bỏ bản sửa thì test đỏ, khôi phục thì xanh).

#### Lần thứ hai — và lần này chặn cả chuỗi

Khi bật cờ để chạy thật đầu-cuối, đúng loại lỗi đó tái phát ở `upsert_learning_session`: `schema_version` nằm cả trong `$set` lẫn `$setOnInsert`.

Hệ quả nặng hơn hẳn lần đầu: **không một sự kiện học tập nào ghi được**. Mà sự kiện học tập là mắt xích đầu của cả chuỗi — không có nó thì không có hồ sơ người học, không BKT/IRT, không đặc trưng để phân cụm, không CBF, không gợi ý. Toàn bộ miền cá nhân hoá chết ngay bước một, trong khi 586 test vẫn xanh.

Sửa từng chỗ rõ ràng là không đủ. Nay có test **quét tĩnh** dùng `ast` duyệt mọi file trong `app/`, tìm dict literal có khoá trùng giữa các cặp toán tử xung khắc (`$set`/`$setOnInsert`, `$set`/`$addToSet`, `$set`/`$inc`, …) và in ra `file:dòng`. Test tự nó cũng được kiểm: có một ca khẳng định bộ quét thật sự phát hiện được mẫu lỗi đã biết — một bộ quét không bắt được gì thì vô dụng mà vẫn xanh.

Quét lần đầu ra đúng một chỗ còn lại, chính là chỗ đang hỏng.

### Một nhà cung cấp hết hạn mức, cả tính năng chết theo

Bước trích xuất tri thức chọn nhà cung cấp AI **một lần rồi thôi**:

```python
ai_json_generator = gemini_generate_json if is_gemini_available() else generate_json
```

Gemini trả `429 RESOURCE_EXHAUSTED` (hạn mức miễn phí 20 lượt/ngày) là toàn bộ luồng dừng — dù Groq đã cấu hình đủ và đang chạy tốt. Cấu hình hai nhà cung cấp mà chỉ dùng được một.

`generate_json_with_failover` thử lần lượt, giữ nguyên thứ tự ưu tiên cũ nên đường thuận lợi không đổi hành vi. Chạy lại: Gemini 429 → Groq tiếp quản → 3/4 tài liệu trích xuất thành công. Tài liệu thứ tư bị `KnowledgeExtractionValidationError` vì Groq gán quá 4 thành phần tri thức cho một item — **guard chạy đúng**, không phải lỗi.

Điểm đáng nêu: hạn mức miễn phí hết hằng ngày là chuyện thường, không phải sự cố hiếm. Một hệ thống phụ thuộc AI nên coi đó là trạng thái vận hành bình thường chứ không phải ngoại lệ.

---

## Phần 1 — Content-Based Filtering: đặt ở đâu

### 1.1. Hạ tầng CBF cần và đã có gì

CBF cần 3 thành phần:

| Thành phần | Trạng thái | Vị trí |
|---|---|---|
| Vector đặc trưng nội dung | **Đã có** | `rag_service.build_embeddings()`, `tfidf_service.extract_keywords()` |
| Vector hồ sơ người dùng | **Đã có** | `content_based_filtering_service.build_learner_profile_vector` |
| Hàm đo tương đồng | **Đã có** | `rag_service._normalize_vector()` — chuẩn hoá L2 rồi tích vô hướng chính là cosine |

~~Thiếu đúng một thành phần: vector hồ sơ người dùng.~~ **Nay đã đủ cả ba.**

> **Một điều kiện ẩn phát hiện khi bắt tay làm:** thành phần (1) tưởng là "đã có"
> nhưng thực ra **chưa** — `learning_items` không hề lưu vector nội dung. Chi tiết
> ở mục 1.4 bên dưới, vì đây đồng thời là một lỗi âm thầm làm hỏng hai loại cụm
> K-Means.

### 1.2. Vị trí chèn chính xác — ✅ ĐÃ TRIỂN KHAI

Hàm `_collect_learner_interest` (`candidate_generator_service.py:344-365`) hiện đang **so khớp hạng mục thô**, không phải CBF thật:

```python
type_match = not preferred_types or item.get("item_type") in preferred_types
subject_match = any(_matches_goal(...) for kc_id in _item_kcs(item))
if type_match and subject_match:
    accumulator.add(item, "learner_interest", 0.5 + quality * 0.25)
```

Điểm số `0.5 + chất lượng × 0.25` **không phụ thuộc nội dung học sinh đã học** — mọi item cùng môn, cùng loại đều nhận điểm bằng nhau. Đây là lọc theo nhãn, không phải lọc theo nội dung.

**Thay bằng CBF thật:**

1. Dựng vector hồ sơ: trung bình có trọng số embedding của các item học sinh đã tương tác tích cực (làm đúng, xem hết, click gợi ý), trọng số giảm dần theo thời gian.
2. Điểm CBF = cosine(vector hồ sơ, embedding item).
3. Điểm này thay cho hằng số `0.5`, cho ra thứ hạng thật sự cá nhân hoá.

**Kết quả thật** — học sinh vừa học 2 bài về phương trình bậc hai, chấm 4 ứng viên:

| Ứng viên | Cách cũ | CBF |
|---|---|---|
| Định lý Viète cho phương trình bậc hai | 0.700 | **0.510** |
| Đồ thị hàm bậc hai, đỉnh parabol | 0.700 | 0.413 |
| Cấu tạo tế bào, ti thể | 0.700 | 0.314 |
| Chiến dịch Điện Biên Phủ | 0.700 | 0.209 |

Cách cũ cho **cả 4 điểm bằng nhau** nên không xếp hạng được gì — đây là bằng chứng
định lượng cho nhận định "lọc theo nhãn chứ không phải theo nội dung". CBF xếp đúng
thứ tự gần gũi về nội dung.

**Hai lựa chọn thiết kế đáng nêu khi bảo vệ:**

- **Câu trả lời SAI vẫn tính như tương tác bình thường.** Đây là hồ sơ *sở thích
  nội dung*, không phải hồ sơ *năng lực* — làm sai không có nghĩa là không quan tâm.
  Lẫn hai khái niệm này là lỗi thiết kế thường gặp.
- **Suy giảm theo thời gian**, chu kỳ bán rã 30 ngày. Không có bước này thì hồ sơ
  bị đóng băng theo những gì học sinh học từ đầu năm.

### 1.2b. Nối xong vẫn chưa có nghĩa là chạy: bốn tầng chặn nối tiếp

Bảng số ở trên đo **hàm CBF chạy độc lập**. Khi bật cờ và chạy thật trên đường sản phẩm, `interest_match` vẫn bằng **0.000** ở mọi gợi ý. Bốn tầng chặn nối tiếp nhau, gỡ một tầng vẫn không thấy gì — đây là phần đáng giá nhất của lần chạy thật này.

**Tầng 1 — học sinh không nhìn thấy học liệu nào.** `list_accessible_learning_items_for_user` định nghĩa "truy cập được" là **tài liệu do chính mình tải lên**. Học sinh không tải tài liệu nào, nên trả về danh sách rỗng và **không học sinh nào từng nhận được một gợi ý** — trong khi tính năng cá nhân hoá sinh ra chính cho họ. Đo được: cùng một API, tài khoản học sinh trả 0 ứng viên, tài khoản giảng viên trả 7.

Cách sửa không phải dựng luật mới. Hệ thống đã có luật hiển thị cho học sinh ở trang "Bài thi của bạn": bộ đề có câu đã ban hành, ban hành cho tất cả hoặc cho lớp mà em đó thuộc về. Luật đó được tách sang `question_visibility_service` để router cũ và miền cá nhân hoá dùng chung **một định nghĩa** — hai bản sao sẽ lệch nhau, và lệch theo hướng nguy hiểm: một bên siết, một bên hở. Lọc tới từng câu chứ không chỉ từng bộ đề, vì một bộ đã ban hành vẫn có thể còn câu nháp.

Bốn accessor cùng phải đổi. Ba cái đầu quyết định *có ứng viên hay không*; riêng `get_accessible_learning_item_for_user` chạy ở **bước dựng phản hồi**, nên khi nó lệch luật thì gợi ý đã xếp hạng xong vẫn rơi mất và màn hình vẫn rỗng. Nếu chỉ kiểm bằng API xếp hạng thì đã kết luận nhầm là xong.

**Tầng 2 — nguồn CBF đòi khai môn trước mới chạy.** `_matches_goal` trả `False` khi danh sách môn rỗng, nên học sinh chưa qua onboarding thì vĩnh viễn không có nguồn này. Nghịch lý: CBF sinh ra chính để **suy ra** sở thích từ hành vi. Nay danh sách rỗng nghĩa là không ràng buộc — đúng như cách cùng hàm đó vẫn xử lý `preferred_content_types`.

**Tầng 3 — điểm CBF tính xong rồi vứt.** Bộ thu chấm cosine cho từng item, rồi chọn item theo **thứ tự duyệt** và `break` khi đủ số lượng. Item được chọn là item *gặp trước*, không phải item *hợp gu nhất*. Bộ thu láng giềng `_collect_appropriate_difficulty` ngay bên cạnh thì sắp xếp rồi lấy top-N — cùng một file, hai cách làm khác nhau.

**Tầng 4 — hạn ngạch tiêu vào item vừa làm xong.** CBF chấm cao nhất đúng những item giống thứ người học vừa tương tác, mà chúng bị bộ lọc "đã xem gần đây" bỏ ngay sau đó. Đo được: 4/5 lựa chọn của CBF rơi vào diện này. Loại chúng từ đầu.

**Một lỗ lộ ra khi gỡ tầng 2.** Nới ràng buộc môn làm một test sẵn có đỏ ngay: nguồn này **không có chốt an toàn** theo độ khó và chất lượng như nguồn `exploration` bên cạnh, nên đẩy được cả câu quá sức lên đầu chỉ vì đúng chủ đề. Lỗ này bị che suốt vì nguồn chưa từng chạy. Hợp gu không có nghĩa là làm được — nay dùng chung ngưỡng với `exploration`.

**Kết quả sau khi gỡ đủ bốn tầng**, tài khoản học sinh thật:

| | Trước | Sau |
|---|---|---|
| Learning item nhìn thấy | 0 | 16 |
| Thành phần tri thức | 0 | 14 |
| Ứng viên | 0 | 7 |
| Gợi ý hiện trên màn hình | 0 | 6 |
| `interest_match` | 0.000 | 0.392 / 0.456 |
| `cluster_match` | 0.000 | 0.730 |

**Bài học đáng nêu khi bảo vệ:** "đã cài đặt" và "đang chạy" là hai trạng thái khác nhau, và khoảng cách giữa chúng có thể chứa bốn lỗi độc lập. Test đơn vị xác nhận hàm CBF đúng — bảng số ở mục 1.2 là thật. Nhưng hàm đúng nằm sau bốn lớp chặn thì người dùng vẫn nhận được đúng con số 0.

### 1.4. Điều kiện ẩn: `learning_items` chưa từng lưu vector nội dung

Cụm `content` và `question` dành **70% trọng số đặc trưng** cho trường
`semantic_embedding`. Nhưng không dòng mã nào ghi trường đó, và schema
`PersonalizationDocument` đặt `extra="forbid"` nên nó cũng **không lưu được** kể cả
khi có ai ghi. Hàm đọc lại có sẵn fallback cứng `[0.0, 0.0, 0.0, 0.0]`.

Hệ quả: lỗi diễn ra **hoàn toàn im lặng**. Phân cụm vẫn chạy, vẫn ra kết quả, chỉ là
70% trọng số đổ vào một vector hằng không phân biệt được gì — tức chạy trên 30% tín
hiệu so với thiết kế.

Đã sửa: thêm trường vào schema, nhúng nội dung theo lô ngay trong bước trích xuất tri
thức. Kiểm chứng với 4 đoạn nội dung thuộc 2 chủ đề khác hẳn nhau (toán và lịch sử):

| | Trước | Sau |
|---|---|---|
| Vector lưu được | không | 384 chiều, khác 0 |
| Độ tách không gian đặc trưng `content` | **0.0000** | **0.9899** |

Bài học: một giá trị mặc định "cho an toàn" có thể che giấu việc cả một khối đặc trưng
không bao giờ có dữ liệu. Nên cân nhắc ghi log hoặc báo lỗi thay vì lặng lẽ dùng
giá trị thay thế.

### 1.3. Ghép CBF với K-Means — 3 cách, ba kết cục khác nhau

> **Tóm tắt sau khi triển khai:** cách 3 đã nối vào luồng chạy; cách 1 đã cài và đo
> nhưng **cố tình chưa nối**; cách 2 chưa làm vì thiếu một cầu nối không gian đặc
> trưng. Lý do từng trường hợp ghi ngay dưới mỗi cách.

Đây là phần trả lời trực tiếp câu hỏi "CBF kết hợp K-Means được không". Ba cách dưới đây không gượng ép, mỗi cách giải một điểm yếu cụ thể.

**Cách 1 — Cụm thu hẹp, CBF xếp hạng (tốc độ)** — ⚠️ đã cài và đo, CỐ TÌNH chưa nối

CBF thuần phải tính cosine với toàn bộ N item, chi phí O(N), tăng tuyến tính khi kho học liệu lớn dần. Ghép K-Means:

```
vector hồ sơ → cosine với k tâm cụm (k ≈ 8)  → chọn 2 cụm gần nhất
             → chỉ cosine trong 2 cụm đó      → xếp hạng cuối
```

Chi phí giảm từ `O(N)` xuống `O(k + 2N/k)`.

**Đo thực tế** (vector 384 chiều, 8 cụm, chọn 2 cụm gần nhất):

| N item | CBF toàn bộ | Cụm rồi CBF | Tỉ lệ |
|---|---|---|---|
| 1.000 | 36.8ms | 9.4ms | **3.91×** |
| 5.000 | 182.1ms | 47.1ms | 3.87× |
| 20.000 | 738.3ms | 184.8ms | 3.99× |

**Nhưng phép đo đầu tiên cho kết quả ngược lại — chậm hơn 15-25%.** Nguyên nhân: bước
dựng tâm cụm cũng phải quét hết N item và cộng vector 384 chiều, tốn ngang việc chấm
điểm toàn bộ. Con số 3.9× ở trên chỉ đạt được khi tâm cụm được **tính sẵn và lưu lại**.

**Quyết định: chưa nối.** Kho học liệu hiện giới hạn 1.000 item mỗi lượt, tiết kiệm
khoảng 27ms — chưa đủ để đánh đổi lấy một tầng cache tâm cụm kèm rủi ro dùng nhầm dữ
liệu cũ khi mô hình được huấn luyện lại. Hàm đã có test đầy đủ, số đo ghi trong
docstring, sẵn sàng nối khi quy mô lớn hơn.

**Đính chính bản đầu:** câu *"tâm cụm đã được lưu sẵn trong `cluster_models.centroids`
— không cần tính lại"* là **sai**. Tâm cụm đó nằm ở không gian đặc trưng **đã trộn và
chuẩn hoá** (embedding × 0.7 + khối số × 0.3, đã z-score), nên không so cosine trực
tiếp với vector hồ sơ được. Phải tính lại tâm cụm trong chính không gian embedding —
vẫn dùng đúng cách phân hoạch của K-Means, chỉ đổi hệ quy chiếu để phép đo có nghĩa.

**Cách 2 — Cụm giải bài toán khởi đầu lạnh của CBF** — ⬜ chưa làm, có lý do

CBF cần lịch sử tương tác mới dựng được vector hồ sơ. Học sinh mới đăng ký có lịch sử rỗng → CBF không chạy được.

Cách xử lý dự kiến: trang `StudentOnboardingPage` **đã thu thập sẵn** khối lớp, môn mạnh/yếu, tổ hợp môn mục tiêu. Dùng các trường này gán học sinh mới vào cụm `learner_interest` gần nhất, rồi lấy tâm cụm làm vector hồ sơ tạm thời.

**Vì sao chưa làm:** đặc trưng của cụm `learner_interest` là các **phân bố tương tác**
(tỉ lệ chạm chủ đề, ưu tiên loại nội dung, phân bố click gợi ý), còn dữ liệu onboarding
là **khối lớp và tên môn** — hai không gian khác nhau, cần một cầu nối ánh xạ chưa tồn
tại. Gán bừa sẽ cho ra cụm vô nghĩa.

Hiện tại học sinh mới có `profile_vector` rỗng và **tự lùi về cách khớp nhãn cũ** — vẫn
chạy đúng, chỉ là chưa cá nhân hoá. Đây là đường lùi an toàn, không phải lỗi.

**Cách 3 — Cụm chống bong bóng lọc của CBF** — ✅ ĐÃ NỐI vào luồng chạy

CBF chỉ gợi ý thứ giống cái đã học → học sinh bị nhốt trong một vùng kiến thức, không bao giờ gặp chủ đề mới. Đây là nhược điểm kinh điển của CBF.

Cách xử lý: áp ràng buộc trên cụm — trong top-N gợi ý phải có tối thiểu 1 item thuộc
cụm mà học sinh chưa từng chạm.

Khi đọc kỹ mã mới thấy rõ hơn: `RERANK_MAX_SAME_QUESTION_CLUSTER = 2` chỉ chặn item
**liên tiếp** cùng cụm — đó là *giãn cách*, không phải *phủ*. Một top-10 vẫn hoàn toàn
có thể chỉ gồm hai cụm xen kẽ nhau, tức vẫn nằm trong bong bóng.

`ensure_cluster_exploration` bổ sung đúng chiều còn thiếu, kèm một ràng buộc quan
trọng: **giữ nguyên item điểm cao nhất ở đầu danh sách** — thăm dò không được đánh đổi
bằng việc đẩy gợi ý tốt nhất xuống dưới. Item được đề lên thay vào vị trí cuối của
top-N, độ dài danh sách không đổi và không item nào bị mất.

> Tóm tắt vai trò: **K-Means lo độ phủ và tốc độ, CBF lo độ chính xác cá nhân.** Hai thuật toán bù đúng nhược điểm của nhau chứ không chồng chéo.

---

## Phần 2 — Các thuật toán ML khác, xếp theo mức độ dùng được ngay

### Nhóm A — Chạy được ngay, không cần chờ dữ liệu người dùng

| # | Thuật toán | Chức năng áp dụng | Sửa ở đâu | Vì sao dùng được ngay |
|---|---|---|---|---|
| A1 | **Cosine trên embedding** (CBF nội dung) | Gợi ý tài liệu liên quan | ✅ **đã xong** — tab "Liên quan" ở trang chi tiết học liệu | Backend + embedding đã xong, chỉ cần nối giao diện |
| A2 | **TF-IDF + cosine** | Cảnh báo học liệu gần trùng | ✅ **đã xong** — `document_duplicate_service.py`, chạy sau bước trích xuất | `tfidf_service.py` đã có, nay dùng thêm cho việc này |
| A3 | **K-Means chọn tập con đa dạng** | Lọc câu hỏi trùng ý khi AI sinh đề | ✅ **đã xong** — `question_diversity_service.py` | Chỉ cần embedding của câu vừa sinh, không cần lịch sử |

Cả ba mục nay đã xong. Chúng chỉ phụ thuộc nội dung tài liệu — có tài liệu là chạy được, không cần chờ học sinh dùng.

#### A2 đã triển khai — và bài học về việc chọn không gian vector

Khi khảo sát mới thấy hệ thống **đã có sẵn bước khử trùng theo `checksum`**: tải lại
đúng file cũ thì tái dùng bản ghi, không lưu thêm. Nên A2 không lặp lại việc đó mà bắt
phần checksum không bắt được: **gần trùng** — cùng bài giảng xuất lại thành PDF khác,
sửa vài dòng, hay đổi định dạng, đều cho checksum khác hoàn toàn.

**Vì sao dùng TF-IDF chứ không dùng embedding sẵn có?** Đây là điểm đáng nhấn:

| | Bản chất quan hệ | Công cụ đúng |
|---|---|---|
| "Học liệu **liên quan**" (A1) | **ngữ nghĩa** — hai bài khác nhau cùng chủ đề vẫn là liên quan | embedding |
| "Học liệu **trùng lặp**" (A2) | **từ vựng** — cùng một văn bản, có thể sửa vài chữ | TF-IDF |

Dùng embedding cho bài toán trùng lặp sẽ báo nhầm hàng loạt với mọi bài cùng chủ đề.
**Cùng một phép đo cosine, hai không gian vector khác nhau, chọn theo bản chất bài
toán** — không phải theo công cụ nào sẵn có.

**Ngưỡng chọn theo số đo, không theo cảm tính.** Đo trên văn bản tiếng Việt thực tế:

```
Copy nguyên            1.0000  ┐
Sửa vài chữ            0.9574  │ trùng thật
Thêm một đoạn cuối     0.7338  │
Rút gọn còn một nửa    0.6718  ┘
────────── ngưỡng 0.60 nằm giữa vùng trống ──────────
Cùng chương, khác bài  0.1109  ┐
Khác môn hoàn toàn     0.0103  │ không trùng
Cùng môn, khác chương  0.0000  ┘
```

Khoảng trống giữa hai nhóm rất rộng (0.11 → 0.67) nên ngưỡng **không nhạy cảm với thay
đổi nhỏ** — chứng minh được bằng số, không phải chỉnh cho vừa dữ liệu.

**Cảnh báo chứ không chặn.** Giáo viên có thể cố ý giữ hai phiên bản của cùng một bài
giảng. Việc của hệ thống là chỉ ra, không phải quyết định thay.

### Nhóm B — Bật được ngay sau khi nối mắt xích learning event

| # | Thuật toán | Chức năng áp dụng | Đã có sẵn |
|---|---|---|---|
| B1 | **BKT** | Ước lượng mức thành thạo từng đơn vị kiến thức → trang "Tiến độ học tập" hiện chỉ có điểm số thô | `algorithms/bkt.py` |
| B2 | **IRT (Rasch)** | Ước lượng độ khó câu hỏi **từ dữ liệu thật** thay vì để AI/giáo viên gán tay; đồng thời ước lượng năng lực học sinh trên cùng thang đo | `algorithms/irt.py` |
| B3 | **Thompson Sampling** | Tự học xem nguồn gợi ý nào hiệu quả nhất cho từng học sinh, thay vì trọng số cố định | ✅ **đã kiểm chứng** — mã vốn đã nối đủ, chỉ chờ bật cờ. Xem mục ngay dưới |

**Lưu ý B2 rất đáng giá:** độ khó do IRT ước lượng chính là đầu vào chất lượng cao cho đề xuất "phát hiện câu hỏi bất thường" bằng K-Means — câu có độ phân biệt âm (học sinh giỏi làm sai nhiều hơn học sinh yếu) gần như chắc chắn là câu sai đáp án. Hai thuật toán nuôi nhau.

#### B3 Thompson Sampling — trường hợp duy nhất không thiếu mã

Khác mọi mục khác trong tài liệu này, phần bandit **đã nối đủ hai đầu từ trước**:
`evaluate_bandit_decision` trong luồng xếp hạng, `update_bandit_from_recommendation_feedback`
trong luồng phản hồi, và log gợi ý có lưu đủ `bandit_context` lẫn `bandit_action` để phản
hồi về sau dùng được. Nó chỉ bị tắt bởi `BANDIT_KILL_SWITCH`.

Nhưng đường này **chưa từng chạy trong sản phẩm**, nên đã chạy tay kiểm chứng toàn bộ rồi
chốt lại bằng test hồi quy.

**Ba chế độ hoạt động đúng:**

| Chế độ | Hành vi kiểm chứng được |
|---|---|
| `disabled` (mặc định) | thoát ngay, không đụng thứ tự gợi ý |
| `shadow` | tính quyết định và lưu context, **không đổi thứ tự** |
| `active` | ép bandit chọn item cuối → thứ tự đổi thành `['i3','i1','i2']` |

**Vòng học đi đúng hướng** (ước lượng suy từ tham số chính tắc `b / precision`):

```
3 lần phản hồi TÍCH CỰC:  0.42 → 0.68 → 0.86
3 lần phản hồi TIÊU CỰC:  0.50 → 0.22 → 0.00
```

Tăng dần rồi lùi đối xứng về tiên nghiệm — đúng chuẩn hồi quy Bayes tuyến tính.

**Một nghi ngờ đã kiểm tra rồi bác bỏ.** `compute_bandit_reward` dùng
`immediate_map.get(feedback_type, 0.0)`, thoạt nhìn có vẻ nuốt im lặng loại phản hồi lạ —
đúng kiểu lỗi đã gặp nhiều lần trong dự án này. Nhưng `FeedbackType` chỉ cho đúng 8 giá
trị và bảng phần thưởng phủ hết cả 8; đo lại cả 8 đều khác 0 và đúng dấu. Nhánh mặc định
không tới được từ API — đây là phòng thủ, không phải lỗ hổng. Đã khoá điều kiện này bằng
test để nếu sau này thêm loại phản hồi mới mà quên cập nhật bảng thì test sẽ đỏ.

**Không bật cờ, và đó là chủ ý.** Bật hay không là quyết định vận hành của chủ hệ thống.
Đã ghi lộ trình ba bước vào `.env.example`: tắt → chế độ quan sát (bandit quyết định và
ghi log nhưng không đổi gợi ý, chạy vài tuần để đối chiếu) → chế độ thật.
`BANDIT_KILL_SWITCH` thắng mọi cờ khác nên luôn dùng được làm đường thoát hiểm.

### Nhóm C — Chưa nên làm bây giờ

| Thuật toán | Lý do hoãn |
|---|---|
| Collaborative Filtering (lọc cộng tác) | Cần nhiều người dùng có lịch sử chồng lấn. Hiện hệ thống có **1 tài khoản thật, chưa có lượt làm bài nào** — ma trận user-item rỗng, thuật toán không có gì để học. Chỉ nên làm khi đã có vài trăm lượt làm bài thật. |
| AKT / Neural Cognitive Diagnosis | Đã viết sẵn (`akt_sequences.py`, `neural_cognitive_diagnosis.py`) nhưng cần chuỗi tương tác dài mỗi học sinh. Để sau BKT/IRT. |

---

## Phần 3 — Thứ tự triển khai

Bảng dưới đã cập nhật theo thực tế đã đi. Bước "nối learning event" hoá ra **không cần làm** — trang làm bài đã phát sự kiện từ trước; thứ thật sự thiếu là trích xuất tri thức (xem mục đầu tài liệu).

| Bước | Việc | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | A3 — lọc câu hỏi trùng ý khi sinh đề | ✅ xong | Không |
| 2 | A1 — gợi ý tài liệu liên quan (nối giao diện) | ✅ xong | Không |
| 3 | K-Means phát hiện câu hỏi lỗi *(ngoài danh sách ban đầu)* | ✅ xong | `question_attempts` |
| 4 | K-Means phân nhóm năng lực lớp *(ngoài danh sách ban đầu)* | ✅ xong | `question_attempts` |
| 5 | K-Means phân nhóm hành vi người dùng *(ngoài danh sách ban đầu)* | ✅ xong | `user_activity_logs` |
| 6 | K-Means ràng buộc đa dạng ma trận đề *(ngoài danh sách ban đầu)* | ✅ xong | Ngân hàng câu hỏi |
| 7 | A2 — cảnh báo học liệu gần trùng | ✅ xong | Không |
| 8 | **Tự động chạy knowledge extraction sau khi sinh câu hỏi** | ✅ xong | Job nền, cờ mặc định tắt |
| 9 | ~~Nối mắt xích: nộp bài luyện tập → phát sinh learning event~~ | ✅ **vốn đã có sẵn** | trang làm bài đã phát từ trước |
| 10 | Gán nhãn cụm cho miền cá nhân hoá (`predict_cluster` + job định kỳ) | ✅ xong | Bước 9 |
| 11 | CBF: dựng vector hồ sơ + cosine thay cho khớp nhãn thô | ✅ xong | Bước 9 + lưu embedding cho item |
| 12 | Ghép CBF × K-Means | ✅ cách 3 đã nối; cách 1 đo xong chưa nối; cách 2 chưa làm | Bước 10 + 11 |
| 13 | B1, B2 — BKT & IRT | ✅ **đã chạy được** | cần bật cờ + đủ lượt làm bài |
| 14 | B3 — Thompson Sampling | ✅ đã kiểm chứng, chờ quyết định bật | Bước 11 |
| 15 | **Bật cờ, chạy thật đầu-cuối trên MongoDB thật** | ✅ xong — lộ ra 6 lỗi, xem dưới | Bước 1-14 |
| 16 | Mở quyền truy cập học liệu cho học sinh | ✅ xong | Bước 15 |
| 17 | Nhãn cụm vào điểm xếp hạng (`cluster_match` 0.0 → 0.05) | ✅ xong | Bước 15 |
| 18 | Tiêu đề gợi ý lấy từ nội dung câu hỏi | ✅ xong | Bước 15 |

**Thay đổi quan trọng so với bản đầu:** bước 8 (tự động chạy knowledge extraction) trước đây không có trong kế hoạch, nhưng nó mới là **điều kiện thật sự** để mở đường cá nhân hoá — không phải bước "nối learning event" như đã tưởng. Bước 9 hoá ra đã có sẵn từ trước.

### Bước 15 đáng một mục riêng

Sau bước 14, mọi thứ "đã xong": 586 test xanh, mọi mô-đun có nơi gọi thật, tài liệu này ghi ✅ khắp nơi. Bật cờ chạy thật một lần thì lộ ra **sáu lỗi**, không lỗi nào bị test bắt:

| # | Lỗi | Hệ quả |
|---|---|---|
| 1 | `ConflictingUpdateOperators` ở `upsert_learning_session` | Không sự kiện học tập nào ghi được — chặn cả chuỗi |
| 2 | Chọn nhà cung cấp AI cứng, không failover | Gemini hết hạn mức là trích xuất tri thức chết |
| 3 | Luật truy cập loại học sinh khỏi kho học liệu | Không học sinh nào nhận được gợi ý |
| 4 | Nguồn CBF đòi khai môn trước mới chạy | CBF không đóng góp cho ai chưa onboarding |
| 5 | Điểm CBF tính xong rồi chọn theo thứ tự duyệt | Phần Content-Based Filtering không ảnh hưởng kết quả |
| 6 | Nguồn `cluster_match` đọc nhầm trường nhãn cụm | Nhãn K-Means không chạm tới thứ hạng |

Ba lỗi đầu chặn cứng, ba lỗi sau làm thuật toán chạy mà không có tác dụng — loại thứ hai nguy hiểm hơn vì nhìn từ ngoài mọi thứ đều bình thường.

**Đây là điểm nên nêu thẳng khi bảo vệ.** Nó cho thấy quy trình kiểm chứng có tầng: test đơn vị bắt lỗi logic, nhưng chỉ chạy thật với cơ sở dữ liệu thật và trên trình duyệt mới bắt được lỗi tích hợp và lỗi "chạy mà vô dụng". Một hệ thống 600 test xanh vẫn có thể có sáu chỗ hỏng nếu chưa ai bật nó lên chạy.

Chiều ngược lại cũng đúng và cũng gặp: **test sai trong khi mã đúng**. `test_statistics_counts_today` đỏ ngẫu nhiên vì so dữ liệu mẫu bám giờ thật với cửa sổ "hôm nay" tính từ nửa đêm UTC — chạy vắt qua nửa đêm là đỏ, chạy lại lúc khác là xanh. Đã sửa bằng cách ghim đồng hồ cho cả lớp test. Ba kiểu "test xanh nói dối" của dự án được liệt kê đủ ở `PHAN_TICH_KMEANS.md`, Phần 5.

Tổng số test hiện tại: **615**, chạy trong ~18 giây.

**Toàn bộ 18 bước đã xong.** Ba phần còn lại đều là *quyết định có chủ đích*, không phải việc bỏ dở:

| Phần | Trạng thái | Lý do |
|---|---|---|
| Thompson Sampling | mã đã kiểm chứng, cờ vẫn tắt | bật là quyết định vận hành, nên chạy chế độ quan sát trước |
| Ghép CBF × K-Means cách 1 (tốc độ) | đã cài và đo, chưa nối | ở quy mô hiện tại chỉ tiết kiệm ~27ms, chưa đáng đánh đổi lấy tầng cache |
| Ghép CBF × K-Means cách 2 (khởi đầu lạnh) | chưa làm | thiếu cầu nối giữa hai không gian đặc trưng; đường lùi hiện tại vẫn chạy đúng |

---

## Phụ lục — Các chức năng KHÔNG cần thêm thuật toán ML

Danh sách này liệt kê các chức năng đã được giải đúng bằng thuật toán phù hợp. Thêm ML vào những chỗ này sẽ **làm kết quả tệ đi hoặc vô ích**.

### Nhóm 1 — Đã dùng thuật toán tối ưu chặt chẽ, thêm ML sẽ kém hơn

| Chức năng | Thuật toán đang dùng | Vì sao không nên thêm ML |
|---|---|---|
| Sinh đề từ ma trận | **CP-SAT** (OR-Tools constraint solver) — `blueprint_solver_service.py` | CP-SAT **chứng minh được** lời giải tối ưu, và chứng minh được INFEASIBLE khi ngân hàng không đủ câu. ML chỉ cho lời giải gần đúng, không chứng minh được gì. Đây là bước lùi rõ ràng. Chính file mã đã ghi nguyên tắc: "KHÔNG dùng AI để thay thế bước kiểm tra ràng buộc". |
| Sinh mã đề tương đương | Hoán vị có seed (`random.Random(seed)`) — `shuffle_service.py` | Cần **tái tạo lại chính xác** đề đã phát cho học sinh. Thuật toán xác định là yêu cầu bắt buộc, không phải lựa chọn. |
| Chấm trắc nghiệm | So khớp đáp án chính xác | Đáp án đúng/sai là sự thật tuyệt đối. Không có gì để "học". |
| Tính điểm, xếp hạng lượt làm bài | Cộng điểm số học | Như trên. |

### Nhóm 2 — Đã dùng AI/ML rồi (dạng LLM), thêm ML cổ điển là thừa

| Chức năng | Đang dùng | Ghi chú |
|---|---|---|
| Sinh câu hỏi từ học liệu | Groq + Gemini, **kiểm chứng chéo hai chiều** (`question_generation_service.py:240-262`) | Đã có cơ chế hai mô hình kiểm tra lẫn nhau — chặt hơn dùng một mô hình. |
| Chấm tự luận | LLM qua job nền (`grade_essay_answer_job`) | Bài toán hiểu ngôn ngữ tự nhiên, LLM là công cụ đúng. |
| Kiểm tra độ chính xác học liệu | LLM đối chiếu theo từng đoạn | Như trên. |
| Phiên âm video bài giảng | Whisper (Groq) | Mô hình chuyên dụng, tốt hơn mọi giải pháp tự xây. |
| Đặt tên cụm tài liệu | LLM sinh nhãn từ thống kê cụm | Đúng cách kết hợp: K-Means chia cụm, LLM diễn giải. |

### Nhóm 3 — Thuật toán truy xuất đã đủ tốt

| Chức năng | Đang dùng | Ghi chú |
|---|---|---|
| Hỏi đáp AI theo học liệu (RAG) | **Hybrid search**: `0.75 × điểm vector + 0.25 × độ trùng từ khoá`, có rerank (`rag_service.py:114-127`) | Đây đã là kiến trúc hybrid retrieval chuẩn — kết hợp tìm kiếm ngữ nghĩa và tìm kiếm từ khoá. Chỉ nên tinh chỉnh trọng số, không cần thuật toán mới. |
| Rút từ khoá từ tài liệu | TF-IDF (`tfidf_service.py`) | TF-IDF là công cụ tiêu chuẩn cho việc này. Nay dùng lại cho cả việc phát hiện học liệu gần trùng — xem mục 2.1. |

### Nhóm 4 — Không bao giờ nên đưa ML vào

Đăng nhập & phân quyền (RBAC), quản lý người dùng, quản lý lớp học (thêm/xoá học sinh), cấu hình hệ thống, feature flags, nhật ký hoạt động & nhật ký quản trị, xoá mềm và khôi phục, xuất file DOCX/PDF, quản lý nội dung website.

**Lý do chung:** đây là các thao tác cần kết quả **xác định và giải trình được**. Riêng phân quyền còn là vấn đề bảo mật — một quyết định mang tính xác suất ở đây là lỗ hổng, không phải tính năng.

### Tổng kết

Trong khoảng 30 chức năng của hệ thống, chỉ có **6 chức năng** thực sự đáng thêm thuật toán ML (đã nêu ở Phần 1 và 2 của tài liệu này). Phần còn lại hoặc đã dùng đúng công cụ, hoặc thuộc loại không nên có ML. Việc nhận diện đúng ranh giới này quan trọng ngang với việc chọn được thuật toán tốt.
