# Content-Based Filtering & các thuật toán ML áp dụng được ngay

> Dựa trên đọc mã nguồn trực tiếp. Mọi đề xuất đều chỉ rõ file cần sửa và hạ tầng đã có sẵn.

> **Cập nhật sau khi triển khai.** Đã làm xong A1, A3 trong Nhóm A, bốn chức năng K-Means ngoài danh sách ban đầu (xem `PHAN_TICH_KMEANS.md`), **thông tắc đường cá nhân hoá** (BKT/IRT nay chạy được), **gán nhãn cụm**, **CBF**, và **ghép CBF × K-Means**. Chẩn đoán ban đầu về mắt xích đứt là **sai**; chỗ sai và nguyên nhân được ghi lại nguyên vẹn ở mục ngay dưới. Nay thêm **A2** (cảnh báo học liệu gần trùng). Chỉ còn **Thompson Sampling** chưa làm.

---

## Phát hiện quan trọng trước khi đề xuất

Kho thuật toán trong `backend/app/personalization/algorithms/` **đã có sẵn 6 mô-đun**, không cần viết mới:

| File | Thuật toán | Trạng thái |
|---|---|---|
| `bkt.py` | Bayesian Knowledge Tracing | Viết xong, chưa chạy dữ liệu thật |
| `irt.py` | Item Response Theory (Rasch) | Viết xong, chưa chạy dữ liệu thật |
| `akt_sequences.py` | Attention-based Knowledge Tracing | Viết xong, chưa chạy dữ liệu thật |
| `neural_cognitive_diagnosis.py` | Neural Cognitive Diagnosis | Viết xong, chưa chạy dữ liệu thật |
| `contextual_bandit.py` | Thompson Sampling | Viết xong, **bị tắt cứng** (`BANDIT_KILL_SWITCH = True`) |
| `kmeans_clustering.py` | K-Means | Viết xong, chưa gán nhãn (xem `PHAN_TICH_KMEANS.md`) |

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
| B3 | **Thompson Sampling** | Tự học xem nguồn gợi ý nào hiệu quả nhất cho từng học sinh, thay vì trọng số cố định | `algorithms/contextual_bandit.py`, đang bị tắt bởi `BANDIT_KILL_SWITCH` |

**Lưu ý B2 rất đáng giá:** độ khó do IRT ước lượng chính là đầu vào chất lượng cao cho đề xuất "phát hiện câu hỏi bất thường" bằng K-Means — câu có độ phân biệt âm (học sinh giỏi làm sai nhiều hơn học sinh yếu) gần như chắc chắn là câu sai đáp án. Hai thuật toán nuôi nhau.

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
| 14 | B3 — bật Thompson Sampling | ⬜ chưa | Bước 11 |

**Thay đổi quan trọng so với bản đầu:** bước 8 (tự động chạy knowledge extraction) trước đây không có trong kế hoạch, nhưng nó mới là **điều kiện thật sự** để mở đường cá nhân hoá — không phải bước "nối learning event" như đã tưởng. Bước 9 hoá ra đã có sẵn từ trước.

Sau khi thông bước 8, **BKT và IRT đã chạy được** (bước 13). Các bước 7, 10, 11, 12 cũng đã hoàn thành. Chỉ còn **Thompson Sampling** chưa làm, cộng hai phần có lý do hoãn rõ ràng là cách 1 và cách 2 của phần ghép CBF × K-Means.

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
