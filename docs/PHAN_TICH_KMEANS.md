# Phân tích ứng dụng K-Means trong hệ thống EzEdu AI

> Tài liệu này dựa trên đọc trực tiếp mã nguồn (`backend/app/personalization/`, `backend/app/services/`) và kiểm tra dữ liệu thật trong MongoDB `chuyende02`, không suy đoán.

> **Cập nhật sau khi triển khai.** Bản đầu của tài liệu này là báo cáo rà soát, kết luận rằng K-Means huấn luyện xong nhưng không tạo ra giá trị nào cho người dùng. Sau đó **cả 6 đề xuất đã được cài đặt và kiểm chứng**. Các mục dưới đây được đánh dấu rõ trạng thái; phần phân tích hiện trạng ban đầu giữ nguyên để đối chiếu trước/sau.

## Tóm tắt trạng thái

| Chức năng dùng K-Means | Trạng thái | K-Means đóng góp gì |
|---|---|---|
| Lọc câu hỏi trùng ý khi sinh đề | **Đã chạy** | Chọn tập con đa dạng |
| Phát hiện câu hỏi lỗi trong bộ đề | **Đã chạy** | Ngoại lai theo khoảng cách tâm cụm |
| Phân nhóm năng lực học sinh trong lớp | **Đã chạy** | Phân hoạch + tâm cụm đọc ra điểm yếu |
| Gợi ý tài liệu liên quan | **Đã chạy** (cosine, không phải K-Means) | — |
| Ràng buộc đa dạng khi sinh đề từ ma trận | **Đã chạy** | Gán nhãn cụm nội dung làm ràng buộc cho CP-SAT |
| Phân nhóm hành vi người dùng (quản trị) | **Đã chạy** | Phân khúc sử dụng + phát hiện tài khoản bất thường |
| Gán nhãn cụm cho miền cá nhân hoá | **Đã chạy** | Gán 5 loại cụm về đúng đối tượng |
| Ghép CBF × K-Means (chống bong bóng lọc) | **Đã chạy** | Cụm chỉ ra vùng nội dung người học chưa chạm |
| Nhãn cụm tham gia điểm xếp hạng gợi ý | **Đã chạy** | `cluster_match` mang trọng số 0.05 (Phần 4.5) |

Sáu chức năng K-Means đã chạy đều dùng chung `choose_k_and_fit` (chọn k đa chỉ số), ba
trong số đó dùng thêm `flag_distance_outliers` (phát hiện ngoại lai bền vững).

Chia theo nguồn dữ liệu nuôi chúng:

- **Năm chức năng chạy trên dữ liệu tự sinh từ luồng dùng bình thường** — giáo viên tạo
  đề, học sinh làm bài, người dùng thao tác. Không phụ thuộc gì thêm.
- **Riêng "gán nhãn cụm cho miền cá nhân hoá"** cần `learning_items`, tức phụ thuộc mắt
  xích knowledge extraction. Mắt xích đó **nay đã thông** (Phần 4.1) và đã chạy thật
  đầu-cuối trên MongoDB thật (Phần 4.4), nhưng chỉ hoạt động khi bật `PERSONALIZATION_ENABLED`
  và `KNOWLEDGE_GRAPH_ENABLED` — mặc định vẫn tắt, và hiện đang tắt.

> **Về trạng thái kiểm chứng.** Sáu chức năng đầu chạy được ngay, không phụ thuộc cờ nào.
> Chúng đã được xác minh trên trình duyệt thật với bộ dữ liệu mẫu (`scripts/seed_kmeans_demo.py`).
> Phân biệt rõ hai điều: *mã đúng và test xanh* khác với *chạy thật ra số trên màn hình* —
> khoảng cách giữa hai điều đó là nơi Phần 4.4 và 4.5 tìm thấy lỗi.

---

## Phần 1 — Hiện trạng ban đầu: K-Means đang được dùng ở đâu

*(Phần này mô tả trạng thái TRƯỚC khi triển khai, giữ nguyên để đối chiếu.)*

Hệ thống có **hai cài đặt K-Means hoàn toàn tách biệt**, không dùng chung mã nguồn.

### 1.1. K-Means cá nhân hoá học tập (`app/personalization/`)

Đây là cài đặt chính, được đầu tư kỹ về mặt thuật toán. Nó định nghĩa **5 loại cụm**:

| Loại cụm | Mục đích thiết kế | Đặc trưng đầu vào |
|---|---|---|
| `content` | Gom nhóm nội dung học theo chủ đề ngữ nghĩa | Embedding (0.7) + độ khó, mức Bloom, thời lượng (0.3) + chủ đề (one-hot) |
| `question` | Gom nhóm câu hỏi theo đặc tính đo lường | Embedding (0.7) + độ khó, Bloom, tỉ lệ đúng TB, thời gian trả lời TB, độ phân biệt (0.3) |
| `learner_ability` | Phân nhóm học sinh theo năng lực | Theta tổng, mức thành thạo TB, độ chính xác gần đây, khoảng trống tiên quyết |
| `learner_behavior` | Phân nhóm theo hành vi học | Thời gian trả lời, tỉ lệ hoàn thành, tỉ lệ dùng gợi ý, tỉ lệ đổi đáp án, tỉ lệ bỏ qua |
| `learner_interest` | Phân nhóm theo sở thích nội dung | Phân bố tương tác chủ đề, ưu tiên loại nội dung, phân bố click gợi ý |

**Chất lượng cài đặt thuật toán — đánh giá là tốt:**

- **Tiền xử lý đặc trưng đúng chuẩn** (`kmeans_clustering.py:135-201`): embedding được chuẩn hoá L2 theo từng dòng rồi nhân trọng số; khối số được điền khuyết bằng trung bình cột, chuẩn hoá z-score, rồi nhân trọng số; biến hạng mục được one-hot. Tham số chuẩn hoá (`means`, `stds`, `category_maps`) được lưu cùng mô hình để tái sử dụng lúc dự đoán — đây là điểm nhiều dự án làm sai.
- **Chọn k không chỉ dùng elbow** (`kmeans_clustering.py:204-273`): quét k từ 2 đến 8, loại bỏ k nào có cụm nhỏ hơn ngưỡng tối thiểu, rồi chấm điểm tổng hợp `0.6 × Silhouette + 0.2 × Davies-Bouldin (đã chuẩn hoá, đảo dấu) + 0.2 × Calinski-Harabasz (đã chuẩn hoá)`. Đây là cách chọn k chặt hơn hẳn so với chỉ nhìn biểu đồ elbow.
- **Lưu đầy đủ chỉ số chất lượng**: Silhouette, Davies-Bouldin, Calinski-Harabasz, kích thước từng cụm, và toàn bộ chỉ số của mọi k đã thử — cho phép giải trình vì sao chọn k đó.
- **Đánh giá độ ổn định** (`evaluation/metrics.py:192-199`): huấn luyện lại với 3 seed khác nhau (13, 29, 47) rồi đo Adjusted Rand Index giữa các lần — trả lời câu hỏi "kết quả phân cụm có ổn định hay chỉ là ngẫu nhiên".
- **Quản lý vòng đời mô hình**: đánh version theo thời gian, trạng thái `draft → active → retired`, có hàm quay lui (rollback) về version cũ.
- **Bảo vệ quyền riêng tư** (`kmeans_clustering.py:104-108`): chặn cứng, báo lỗi nếu vector đặc trưng lỡ chứa `user_id`, `email`, `document_id`… — tránh mô hình học vào định danh cá nhân.

### 1.2. K-Means phân cụm tài liệu (`app/services/clustering_service.py`)

Cài đặt đơn giản hơn nhiều, độc lập hoàn toàn: chạy K-Means ngay trong request trên embedding của tài liệu, chọn k bằng quét Silhouette thuần, rồi nhờ AI đặt tên cho từng cụm. Không lưu mô hình, không đánh version, không gán nhãn ngược lại vào tài liệu.

---

## Phần 2 — Đánh giá: đã khai thác hết khả năng chưa?

**Chưa. Và khoảng cách rất lớn — không nằm ở thuật toán, mà ở chỗ kết quả phân cụm chưa được dùng vào việc gì.**

### 2.1. Phát hiện nghiêm trọng nhất: cụm được tính ra nhưng không bao giờ được gán

Một quy trình phân cụm hoàn chỉnh có 3 khâu:

```
[1] Huấn luyện          [2] Gán nhãn              [3] Sử dụng
    → tìm tâm cụm    →     → gán mỗi đối tượng   →   → thay đổi thứ tự gợi ý,
                              vào cụm gần nhất         hiển thị cho người dùng
```

Hệ thống hiện có **khâu [1] rất tốt, thiếu hoàn toàn khâu [2], nên khâu [3] chạy rỗng.**

> **Cập nhật:** cả ba khâu nay đã đủ. Xem Phần 4.1 để biết nguyên nhân cấu trúc khiến
> khâu [2] không làm được và cách sửa. Phần mô tả bên dưới giữ nguyên trạng thái ban
> đầu để đối chiếu.

Bằng chứng cụ thể:

- Hàm gán cụm `predict_cluster` **có tồn tại** (`clustering_service.py:169-216`) nhưng **không có nơi nào trong mã sản phẩm gọi nó** — chỉ có 2 test gọi (`tests/test_kmeans_clustering.py:109,121`).
- Các trường lưu kết quả gán cụm — `content_cluster_id`, `question_cluster_id`, `ability_cluster_id`, `behavior_cluster_id`, `interest_cluster_id` — **không có một dòng mã nào ghi vào chúng**. Quét toàn bộ `backend/app/` chỉ ra: khai báo schema, khai báo index MongoDB, và các chỗ **đọc**. Không có chỗ ghi.
- Hệ quả dây chuyền: hàm `_collect_cluster_match` (`candidate_generator_service.py:366-386`) — nơi duy nhất mà cụm có thể thay đổi nội dung người học nhìn thấy — luôn đọc ra `None` và thoát sớm.

### 2.2. Các điểm chặn khác

| Vấn đề | Chi tiết | Vị trí |
|---|---|---|
| Trọng số cụm bị đặt bằng 0 | `RANKER_WEIGHT_CLUSTER_MATCH = 0.0` — kể cả khi có nhãn cụm, nó vẫn đóng góp đúng 0 vào điểm xếp hạng | `config.py:155` |
| Không có API | Toàn bộ thư mục `personalization/api/` không có endpoint nào liên quan phân cụm — không train, không predict, không xem mô hình | `personalization/api/` |
| Không có lịch chạy tự động | `worker.py` chỉ đăng ký 3 loại job (chấm tự luận, dọn file, nạp tri thức). Huấn luyện chỉ chạy được thủ công bằng lệnh CLI | `worker.py:32-36` |
| Đặt tên cụm bằng AI không bao giờ chạy | Hàm `_interpret_clusters` cần truyền vào một bộ sinh JSON; điểm gọi duy nhất không truyền → `interpretation` luôn rỗng | `clustering_service.py:36-85` |
| Hai tham số cấu hình bị bỏ quên | `KMEANS_EMBEDDING_WEIGHT` / `KMEANS_NUMERIC_WEIGHT` được kiểm tra hợp lệ nhưng không nơi nào đọc — trọng số 0.7/0.3 bị viết cứng trong mã | `config.py:130-131` |
| ~~Ngưỡng phát hiện ngoại lai không dùng~~ **ĐÃ DÙNG** | `KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER = 2.5` nay là ngưỡng cho cả hai chức năng phát hiện câu hỏi lỗi và học sinh cần quan tâm riêng | `kmeans_clustering.flag_distance_outliers` |
| Phân cụm tài liệu không ai gọi | Endpoint `GET /documents/analysis/clusters` và hàm `documentApi.getClusters` đều tồn tại, nhưng **không trang giao diện nào gọi tới** | đã kiểm tra bằng grep toàn bộ `frontend/src` |
| Chưa từng chạy với dữ liệu thật | Cả 10 collection cá nhân hoá trong MongoDB đều đang **0 bản ghi** | kiểm tra trực tiếp DB |

### 2.3. Kết luận đánh giá

Nếu chia "khai thác K-Means" thành 10 hạng mục:

| # | Hạng mục | Trước triển khai | Sau triển khai |
|---|---|---|---|
| 1 | Thiết kế đặc trưng | Đã làm tốt | Đã làm tốt |
| 2 | Chuẩn hoá / co giãn dữ liệu | Đã làm tốt | Đã làm tốt |
| 3 | Chọn số cụm k | Đã làm tốt (đa chỉ số) | Đã làm tốt, nay dùng lại cho 5 chức năng |
| 4 | Đánh giá chất lượng cụm | Đã làm tốt (3 chỉ số nội tại) | Đã làm tốt, silhouette hiện ra giao diện |
| 5 | Đánh giá độ ổn định | Đã làm tốt (ARI đa seed) | Đã làm tốt |
| 6 | Quản lý version mô hình | Đã làm tốt | Đã làm tốt |
| 7 | **Gán nhãn cụm cho đối tượng** | Thiếu hoàn toàn | **Đã có đủ** — 5 chức năng mới, và cả 5 loại cụm của miền cá nhân hoá |
| 8 | **Dùng cụm để thay đổi đầu ra** | Thiếu hoàn toàn | **Đã có** — 5 chức năng đều hiện kết quả cho người dùng |
| 9 | **Diễn giải ý nghĩa từng cụm** | Có mã, không chạy | **Đã có** — toạ độ tâm cụm đọc thẳng ra điểm yếu của nhóm |
| 10 | **Phát hiện ngoại lai theo khoảng cách tâm cụm** | Chưa dùng | **Đã có**, dùng median/MAD (xem lỗi che lấp bên dưới) |

**Trước:** khoảng 6/10, và 6 phần đã làm đều thuộc nửa đầu (chuẩn bị), 4 phần thiếu thuộc nửa sau (tạo ra giá trị). Người dùng cuối không nhận được lợi ích nào.

**Sau:** cả 10 hạng mục đều có ít nhất một chức năng thực thi. Riêng hạng mục 7 còn nợ ở **miền cá nhân hoá** — không phải vì thiếu mã, mà vì dữ liệu nuôi nó bị chặn (Phần 4).

### 2.4. Lỗi thống kê phát hiện trong quá trình triển khai

Ngưỡng phát hiện ngoại lai ban đầu dùng `trung bình + 2.5 × độ lệch chuẩn`. Cách này mắc **hiệu ứng che lấp (masking)**: một điểm quá xa sẽ tự thổi phồng độ lệch chuẩn và kéo ngưỡng vượt lên trên chính nó.

Số liệu thật lúc kiểm chứng — khoảng cách từ 8 học sinh tới tâm nhóm của mình:

```
3.17  3.68  3.88  4.48  16.69  17.21  19.00  51.33
                                              ↑ lệch rõ nhất
trung bình = 14.93   độ lệch chuẩn = 15.19
ngưỡng 2.5σ = 52.91  >  51.33  →  KHÔNG bắt được
```

Học sinh lệch nhất — gấp 2.7 lần em kế tiếp — lại lọt lưới, đúng vì chính em ấy làm phình độ lệch chuẩn.

**Cách sửa:** dùng median và MAD (median absolute deviation) thay cho trung bình và độ lệch chuẩn. Median/MAD không bị điểm cực trị kéo đi. Hệ số 0.6745 quy MAD về cùng thang sigma nên tham số ngưỡng vẫn đọc được như cũ. Sau khi sửa, em này bị bắt đúng, các em còn lại không bị báo nhầm.

Helper dùng chung: `flag_distance_outliers` trong `kmeans_clustering.py`, dùng cho cả phát hiện câu hỏi lỗi lẫn học sinh cần quan tâm riêng.

### 2.5. Nghịch lý: điểm ngoại lai tự phá hỏng phép phát hiện ngoại lai

Lỗi này chỉ lộ ra sau khi có bộ dữ liệu mẫu đủ giống thật (Phần 4.4). Bộ dữ liệu cũ quá đều nên che mất nó.

Bài toán phát hiện câu hỏi lỗi chấm điểm trên không gian (độ khó, độ phân biệt). Câu bị sai đáp án lệch hẳn khỏi phần còn lại — đó chính là thứ cần tìm. Nhưng lệch hẳn kéo theo **hai bậc thất bại nối nhau**:

**Bậc 1 — guard `min_cluster_size ≥ 2` loại sạch mọi k.** Với 8 câu thật, câu hỏng là cụm một phần tử ở *mọi* k từ 2 đến 8:

```
k=2: [7, 1]   k=3: [5, 1, 2]   k=4: [3, 1, 2, 2]   k=5: [2, 1, 2, 2, 1]
```

Không k nào thoả, hàm ném `KMeansTrainingError`, API trả `clustering_unavailable`. Nghĩa là **đúng bộ đề có câu sai đáp án lại là bộ đề bị bỏ qua bước phân cụm**.

Ngưỡng này sinh ra cho bài toán **phân khúc** — một nhóm chỉ có một học sinh thì không dạy phân hoá được nên phải loại. Ở bài toán **tìm ngoại lai** thì ngược lại: cụm một phần tử chính là kết quả.

**Bậc 2 — cho phép cụm một phần tử thì khoảng cách bằng 0.** Sửa xong bậc 1, câu hỏng được cấp một cụm riêng, và khoảng cách từ nó tới tâm cụm của chính nó là 0.000. Phép đo ngoại lai theo khoảng cách nhìn thấy con số sạch nhất bảng. Câu đáng ngờ nhất trông vô hại nhất.

**Cách sửa:** bài toán này dùng `min_cluster_size=1`, và gắn cờ ngoại lai theo **cả kích thước cụm lẫn khoảng cách** — cụm chỉ có một câu tự nó là dấu hiệu, xét độc lập với khoảng cách.

Kết quả trên dữ liệu thật (12 lượt làm, 8 câu, câu 4 cố tình sai đáp án):

| Câu | Độ khó | Độ phân biệt | Cờ |
|---|---|---|---|
| 4 | 0.33 | **−0.567** | `cluster_outlier`, `negative_discrimination` |
| còn lại | 0.25–0.83 | +0.26 … +0.72 | — |

k = 2, kích thước cụm `[7, 1]`, Silhouette 0.60. Cả hai lớp — quy tắc đo lường giáo dục và K-Means — cùng chỉ vào một câu.

**Bài học chung với lỗi che lấp ở 2.4:** cả hai đều là *phép phát hiện ngoại lai bị chính điểm ngoại lai vô hiệu hoá*. Một lần qua độ lệch chuẩn bị thổi phồng, một lần qua ràng buộc kích thước cụm và khoảng cách bằng 0. Cùng một cái bẫy, hai hình dạng.

---

## Phần 3 — Đề xuất: các chức năng sẵn có nên áp dụng K-Means

Nguyên tắc chọn đề xuất: (a) chỉ dùng chức năng **đã có sẵn** trên web, (b) khai thác đặc tính mà **chỉ K-Means mới làm tốt** — phân hoạch không giám sát, diễn giải qua toạ độ tâm cụm, và đo khoảng cách tới tâm cụm — chứ không phải gượng ép gắn K-Means vào chỗ một câu lệnh `GROUP BY` cũng làm được.

### Điều kiện tiên quyết — đã được xác minh lại

> **Cập nhật:** khâu gán nhãn cụm chỉ bắt buộc với các đề xuất dựa trên miền cá nhân hoá. Ba đề xuất đã triển khai (1, 2, 3) **tự gán nhãn ngay trong lượt tính**, không cần job nền, nên không bị chặn. Xem Phần 4 để biết vì sao đường cá nhân hoá vẫn tắc.

**Với miền cá nhân hoá, phải bổ sung khâu gán nhãn cụm trước.** Cụ thể: sau khi huấn luyện xong, chạy `predict_cluster` cho từng đối tượng rồi ghi `cluster_id` vào tài liệu tương ứng, và đưa việc này thành một job định kỳ trong `worker.py`. Không có bước này thì mọi đề xuất bên dưới đều không chạy được.

---

### Đề xuất 1 — Phân nhóm học sinh trong lớp để giao đề phân hoá — ✅ ĐÃ TRIỂN KHAI

**Chức năng sẵn có được nâng cấp:** Quản lý lớp học + Ma trận đề & sinh đề tự động.

**Cách làm:** Dùng cụm `learner_ability` gán cho từng học sinh trong một lớp. Giáo viên mở trang lớp học sẽ thấy lớp tự động chia thành các nhóm năng lực, kèm mô tả sinh từ **toạ độ tâm cụm** — ví dụ "Nhóm 2 (12 em): thành thạo tốt phần Hàm số, nhưng yếu rõ rệt ở Bất phương trình".

**Vì sao khai thác tốt K-Means:**
- **Toạ độ tâm cụm trở thành lời chẩn đoán.** Tâm cụm là vector mức thành thạo theo từng thành phần kiến thức — đọc trực tiếp ra được "nhóm này yếu ở đâu". Đây là thế mạnh diễn giải của K-Means mà các thuật toán phân cụm khác (DBSCAN, hierarchical) không cho trực tiếp.
- **Khoảng cách tới tâm cụm = mức độ điển hình.** Em nào nằm xa tâm cụm của chính mình là trường hợp không giống ai trong lớp → giáo viên cần kèm riêng. Chỉ số này đã được tính sẵn (`mean/std/max_distance_to_centroid`) nhưng chưa dùng.
- Số nhóm **không cố định trước** — lớp đồng đều sẽ tự ra 2 nhóm, lớp phân hoá mạnh ra 4 nhóm. Đây đúng là bài toán K-Means giải, không phải chia theo ngưỡng điểm cứng.

**Hạ tầng đã có:** bảng `classes` với `student_ids`, cơ chế giao đề theo lớp `exams.target_class_ids`, trang `ClassDetailPage`. Chỉ cần mở rộng target từ "theo lớp" thành "theo nhóm trong lớp".

---

### Đề xuất 2 — Tự động phát hiện câu hỏi bất thường — ✅ ĐÃ TRIỂN KHAI

**Chức năng sẵn có được nâng cấp:** Ngân hàng câu hỏi.

**Cách làm:** Phân cụm câu hỏi bằng cụm `question` (độ khó, độ phân biệt, tỉ lệ trả lời đúng, thời gian làm bài trung bình). Câu nào có khoảng cách tới tâm cụm vượt quá `2.5 × độ lệch chuẩn` thì tự động chuyển `quality_status` sang `flagged` và đẩy vào danh sách chờ giáo viên duyệt lại.

**Vì sao khai thác tốt K-Means:**
- Đây là dùng K-Means làm **bộ phát hiện ngoại lai**, không phải chỉ để gom nhóm — một năng lực bị bỏ quên của thuật toán này.
- Bắt được đúng loại lỗi mà kiểm tra thủ công hay bỏ sót: câu có đáp án sai (mọi học sinh giỏi đều trả lời "sai" → độ phân biệt âm bất thường), câu diễn đạt mơ hồ (thời gian làm lâu bất thường so với độ khó khai báo).
- **Ngưỡng `KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER = 2.5` đã có sẵn trong cấu hình**, chỉ chờ được dùng. Trường `quality_status: unreviewed | flagged | verified` cũng đã có sẵn trong schema và hiện **không có gì tự động đặt giá trị `flagged`**.

---

### Đề xuất 3 — Lọc câu hỏi trùng lặp ngữ nghĩa khi AI sinh đề — ✅ ĐÃ TRIỂN KHAI

**Chức năng sẵn có được nâng cấp:** Sinh câu hỏi từ học liệu.

**Cách làm:** Khi giáo viên yêu cầu 10 câu, cho AI sinh dư (25–30 câu), phân cụm embedding của chúng với `k = 10`, rồi mỗi cụm chỉ lấy **một câu gần tâm cụm nhất**.

**Vì sao khai thác tốt K-Means:**
- Đây là kỹ thuật **chọn tập con đa dạng** (diverse subset selection) kinh điển bằng K-Means — vừa đảm bảo 10 câu phủ đều không gian ngữ nghĩa của tài liệu, vừa loại được các câu hỏi na ná nhau.
- Câu gần tâm cụm nhất là câu **đại diện nhất** cho vùng kiến thức đó, thường cũng là câu diễn đạt chuẩn mực nhất trong nhóm.
- Giải quyết đúng một điểm yếu thực tế của LLM: sinh nhiều câu bị lặp ý dù khác chữ.

**Chi phí thấp nhất trong các đề xuất:** chỉ can thiệp vào một chỗ trong `question_generation_service.py`, không cần bảng mới, không cần job nền, không phụ thuộc việc gán nhãn lâu dài.

---

### Đề xuất 4 — Ràng buộc đa dạng nội dung khi sinh đề từ ma trận — ✅ ĐÃ TRIỂN KHAI

**Chức năng sẵn có được nâng cấp:** Ma trận đề & sinh đề tự động.

**Cách làm:** Ma trận hiện chọn câu theo chủ đề / mức Bloom / độ khó đã khai báo. Bổ sung thêm một ràng buộc: các câu được chọn phải trải trên tối thiểu N cụm `content` khác nhau.

**Vì sao khai thác tốt K-Means:** Phân loại theo chương trình học (`curriculum_taxonomy`) là do con người khai báo, có thể thô. Một đề "đúng chủ đề Hàm số, đúng mức Vận dụng" vẫn có thể vô tình dồn hết vào một dạng bài duy nhất. Cụm ngữ nghĩa phát hiện được sự trùng lặp mà nhãn thủ công không thấy — hai hệ phân loại **bổ sung cho nhau**, không thay thế nhau.

**Đã có tiền lệ trong mã:** ý tưởng này đã được cài cho phần gợi ý học tập (`RERANK_MAX_SAME_QUESTION_CLUSTER = 2`), chỉ cần mang sang khâu sinh đề.

---

### Đề xuất 5 — Gợi ý tài liệu liên quan cho giáo viên — ✅ ĐÃ TRIỂN KHAI

**Chức năng sẵn có được nâng cấp:** Quản lý học liệu.

**Cách làm:** Gán `content_cluster_id` cho tài liệu; khi giáo viên mở một tài liệu, hiển thị "Tài liệu cùng nhóm nội dung".

**Vì sao đáng làm:** Đây là đề xuất **rẻ nhất** — endpoint `GET /documents/analysis/clusters` và `getSimilar` **đã viết xong từ trước, và hiện không trang nào gọi tới**. Về bản chất chỉ là nối dây giao diện cho phần backend đã sẵn sàng.

---

### Đề xuất 6 — Phân nhóm hành vi người dùng cho trang quản trị — ✅ ĐÃ TRIỂN KHAI

**Chức năng sẵn có được nâng cấp:** Theo dõi sử dụng AI + Quản lý hạn mức (quota) + Nhật ký hoạt động.

**Cách làm:** Phân cụm người dùng theo mẫu hành vi sử dụng (số lượt gọi AI, khung giờ hoạt động, tỉ lệ lỗi, loại thao tác chính) từ `user_activity_logs` và `ai_usage_events`. Dùng cho hai việc: (a) đặt hạn mức AI theo **nhóm hành vi thực tế** thay vì theo vai trò cứng, (b) phát hiện tài khoản bất thường qua khoảng cách tới tâm cụm.

**Vì sao khai thác tốt K-Means:** Vai trò (`student`/`lecturer`) là nhãn hành chính, không phản ánh mức độ sử dụng thật — có giáo viên dùng rất ít, có học sinh dùng rất nhiều. Phân cụm hành vi cho ra phân khúc đúng thực tế hơn. Đồng thời tận dụng lại năng lực phát hiện ngoại lai để chống lạm dụng tài nguyên AI.

**Ưu điểm dữ liệu:** đây là đề xuất **duy nhất có sẵn dữ liệu thật ngay lúc này** (`user_activity_logs` đang có 46 bản ghi, `system_error_logs` 29 bản ghi) — có thể thử nghiệm mà không cần chờ người dùng thật.

---

## Phần 4 — Thứ tự triển khai và phát hiện làm đổi thứ tự

### 4.1. Vì sao "gán nhãn cụm" không còn là bước 0 — và tắc nghẽn nay đã được thông

Bản đầu xếp *"bổ sung khâu gán nhãn cụm + job huấn luyện định kỳ"* làm bước 0 bắt buộc. Khi bắt tay làm mới phát hiện **bước này bị chặn, không phải do thiếu mã**:

- Miền cá nhân hoá gán nhãn cho `learning_items`, mà các bản ghi này chỉ sinh ra từ `knowledge_extraction_service`.
- Service đó chỉ được gọi qua `POST /personalization/documents/{id}/knowledge-graph/extract`.
- **Không giao diện nào gọi endpoint đó**, và không job nền nào kích hoạt nó.

Hệ quả: dù người dùng dùng web bao nhiêu đi nữa, `learning_items` vẫn rỗng vĩnh viễn, nên gán nhãn xong cũng không có gì để gán.

**Cách xử lý lúc đó:** không cố thông tắc ngay, mà chuyển sang các chức năng có **dữ liệu tự sinh từ luồng dùng bình thường** — giáo viên tạo đề (`question_sets`), học sinh làm bài (`question_attempts`). Đề xuất 1, 2, 3 đều nằm trên đường này, và chúng **tự gán nhãn cụm ngay trong lượt tính**, không cần job nền.

**Cập nhật — tắc nghẽn đã thông VÀ khâu [2] đã hoàn thiện.** Thêm job nền
`extract_document_knowledge` tự xếp hàng sau khi sinh câu hỏi, nhờ đó `learning_items`
sinh ra được. Sau đó bổ sung luôn `cluster_assignment_service` gán nhãn cụm cho cả năm
loại cụm.

**Nguyên nhân cấu trúc của khâu [2] tìm được khi bắt tay làm:** hàm
`collect_cluster_samples` trả về vector đặc trưng **không kèm id đối tượng**, nên mất
đường ánh xạ ngược — huấn luyện xong không biết gán kết quả cho ai. Đó mới là lý do
thật, không phải "quên viết".

Cách sửa: đổi hàm gốc thành `collect_labelled_cluster_samples` trả cặp `(id, đặc_trưng)`,
rồi giữ hàm cũ làm **lớp bọc mỏng** chỉ lấy phần đặc trưng. Nhờ vậy huấn luyện và gán
nhãn luôn thấy **cùng một vector**; tách thành hai đường dựng riêng thì sửa một bên
quên bên kia sẽ khiến cụm gán ra sai âm thầm. Có test khẳng định hai đường khớp từng
phần tử. Id nằm ngoài vector nên ràng buộc chặn định danh lọt vào đặc trưng vẫn nguyên
vẹn — cũng có test riêng.

**Kiểm chứng với MongoDB thật** (12 học sinh thuộc 2 dải năng lực):

```
TRƯỚC:  0 hồ sơ có ability_cluster_id
KHÂU [1] huấn luyện:  k=2 (tự chọn), 12 mẫu
KHÂU [2] gán nhãn:    gán 12, ngoại lai 0, bỏ qua 0
KHÂU [3] đọc lại:     cụm 0 → 6 em yếu  [0.10 … 0.35]
                      cụm 1 → 6 em khá  [0.70 … 0.85]
```

Một quyết định đáng nêu: mẫu quá xa mọi tâm cụm được ghi `None` và đếm riêng, **không
ép vào cụm gần nhất** — ép là bịa ra kết luận mà mô hình không đưa ra.

### 4.2. Thứ tự thực tế đã đi

| Bước | Việc | Trạng thái |
|---|---|---|
| 1 | Đề xuất 3 — lọc câu hỏi trùng ý khi sinh đề | ✅ xong |
| 2 | Đề xuất 5 — gợi ý tài liệu liên quan (nối giao diện) | ✅ xong |
| 3 | Đề xuất 2 — phát hiện câu hỏi lỗi | ✅ xong |
| 4 | Đề xuất 1 — phân nhóm năng lực học sinh | ✅ xong |
| 5 | Đề xuất 6 — phân nhóm hành vi người dùng (quản trị) | ✅ xong |
| 6 | Đề xuất 4 — đa dạng hoá ma trận đề | ✅ xong |
| 7 | Thông tắc đường cá nhân hoá: tự động chạy knowledge extraction sau khi sinh câu hỏi | ✅ xong — BKT/IRT nay chạy được |
| 8 | Gán nhãn cụm cho miền cá nhân hoá | ✅ xong — khâu [2] hoàn thiện |
| 9 | Ghép CBF × K-Means chống bong bóng lọc | ✅ xong |
| 10 | Nạp dữ liệu mẫu rồi chạy thật toàn chuỗi trên MongoDB thật | ✅ xong — xem 4.4 |
| 11 | Nhãn cụm tham gia vào điểm xếp hạng gợi ý | ✅ xong — xem 4.5 |

### 4.3. Chi tiết năm chức năng K-Means đã triển khai

| | Đề xuất 3 | Đề xuất 2 | Đề xuất 1 | Đề xuất 6 | Đề xuất 4 |
|---|---|---|---|---|---|
| Chức năng | Lọc câu trùng ý | Phát hiện câu lỗi | Phân nhóm học sinh | Phân nhóm hành vi | Đa dạng ma trận đề |
| Không gian đặc trưng | Embedding câu hỏi | (độ khó, độ phân biệt) | Điểm % theo từng bộ đề | 6 chỉ số sử dụng | Embedding nội dung câu |
| Chọn k | k = số câu cần | `choose_k_and_fit` | `choose_k_and_fit` | `choose_k_and_fit` | `choose_k_and_fit` |
| K-Means dùng để | Chọn tập con đa dạng | Phát hiện ngoại lai | Phân hoạch + đọc tâm cụm | Phân khúc + phát hiện ngoại lai | **Chỉ gán nhãn** — làm đầu vào cho CP-SAT |
| Chuẩn hoá đặc trưng | L2 (từ embedding) | z-score | **Không** — giữ thang % | **Có** z-score — bắt buộc | L2 (từ embedding) |
| Cách đọc tâm cụm | — | trực tiếp | trực tiếp | qua trung bình số gốc | — |
| Nguồn dữ liệu | Câu vừa sinh | `question_attempts` | `question_attempts` | `user_activity_logs` | Ngân hàng câu hỏi |
| Nơi hiện kết quả | Danh sách câu hỏi trả về | Trang biên tập bộ đề | Trang chi tiết lớp học | Trang nhật ký hoạt động | Đề sinh ra |

**Đề xuất 4 là trường hợp kiến trúc khác hẳn bốn cái còn lại — và đó là chủ ý.**

Ở bốn chức năng kia, K-Means tự quyết định kết quả cuối. Ở đây thì không: bộ giải ràng buộc **CP-SAT** mới là nơi chọn câu, K-Means chỉ **gán nhãn `content_cluster`** rồi nhãn đó trở thành một ràng buộc tuyến tính nữa trong mô hình.

Lý do phải giữ ranh giới này: CP-SAT **chứng minh được** lời giải tối ưu và chứng minh được INFEASIBLE khi ngân hàng không đủ câu. Nếu để K-Means (hay bất kỳ phương pháp gần đúng nào) thay chỗ đó thì mất cả hai tính chất — một bước lùi rõ ràng. Chính mã nguồn `blueprint_solver_service.py` đã ghi nguyên tắc: *"KHÔNG dùng AI để thay thế bước kiểm tra ràng buộc"*.

Đây là ví dụ tốt cho câu hỏi phản biện *"vì sao chỗ này dùng K-Means, chỗ kia không?"* — trả lời được rằng K-Means bổ sung một chiều thông tin mà nhãn thủ công không có, chứ không thay thế thứ đang làm tốt hơn nó.

**Điểm đáng nhấn: hai quyết định chuẩn hoá trái ngược nhau, mỗi cái có lý do riêng.**

| | Đề xuất 1 — phân nhóm lớp | Đề xuất 6 — phân nhóm hành vi |
|---|---|---|
| Thang các chiều | Đều là phần trăm 0-100 | Lệch xa: lượt (hàng chục–trăm), tỉ lệ lỗi (0-1), thời gian (hàng nghìn ms) |
| Nếu **không** chuẩn hoá | Đúng — mọi chiều cùng trọng số tự nhiên | Sai — cột thời gian ms sẽ nuốt trọn khoảng cách Euclid, các chiều khác gần như vô nghĩa |
| Nếu **có** chuẩn hoá | Mất tính đọc được của tâm cụm | Đúng — mọi chiều đóng góp cân bằng |
| Quyết định | Không chuẩn hoá | Chuẩn hoá z-score |
| Bù lại nhược điểm | — | Báo cáo ra ngoài bằng **trung bình số gốc**, không phải toạ độ thang z |

Biết khi nào *nên* và khi nào *không nên* chuẩn hoá — kèm cách bù nhược điểm — là chỗ thể hiện hiểu thuật toán, không phải áp dụng máy móc.

**Ghi chú thêm về Đề xuất 6 — loại cột không biến thiên.** Trước khi z-score, các cột có độ lệch chuẩn bằng 0 bị loại (nếu không sẽ chia cho 0). Thực tế chạy: hai cột `ai_call_count` và `ai_total_tokens` tự bị loại vì `ai_usage_events` chưa có dữ liệu. **Giao diện nêu rõ đã bỏ đặc trưng nào** thay vì im lặng — người đọc biết kết quả dựa trên đúng bao nhiêu chiều.

---

### 4.4. Chạy thật mới biết: sáu chức năng đúng mã nhưng không có gì để nhai

Tới bước 9, cả sáu chức năng K-Means đều có mã đúng, test xanh, và **màn hình trống**. Trên máy sạch, `documents`, `questions`, `question_attempts` đều bằng 0 sau khi dọn dữ liệu kiểm chứng — mà màn hình trống trông y hệt tính năng hỏng.

`backend/scripts/seed_kmeans_demo.py` dựng đủ dữ liệu cho từng mô-đun: 12 học sinh theo ba chân dung năng lực, 3 bộ đề × 8 câu, 36 lượt làm bài, một cặp học liệu gần trùng, 246 nhật ký theo ba mức cường độ. Gỡ sạch bằng `--purge`.

Một chi tiết nhỏ nhưng quyết định: đáp án được sinh bằng **lấy mẫu theo trọng số** (Gumbel top-k), không phải chọn thẳng các câu dễ nhất. Cách sau khiến ba câu dễ có tỉ lệ đúng đúng 1.00 tròn trịa — nhìn là biết dàn dựng, và quan trọng hơn: nó **che mất** lỗi ở mục 2.5. Dữ liệu mẫu quá đẹp thì kiểm chứng không có giá trị.

### 4.5. Nhãn cụm được tính, được gán, rồi không ai dùng

Khâu [1] huấn luyện và khâu [2] gán nhãn đã xong từ bước 8. Nhưng khi chạy thật, `cluster_match` bằng 0 ở mọi gợi ý. Hai nguyên nhân độc lập, phải gỡ cả hai:

- **Trọng số bằng 0.** `RANKER_WEIGHT_CLUSTER_MATCH = 0.0` — thành phần được tính rồi nhân với 0. Đã chuyển 0.05 từ `weakness_match` (0.25 → 0.20) sang; tổng mười trọng số vẫn đúng 1.0 theo ràng buộc `validate_ranker_weights`.
- **Đọc nhầm trường.** Nguồn ứng viên `cluster_match` chỉ đọc `content_cluster_id`, trong khi **câu hỏi** — loại item chiếm gần hết kho — mang nhãn `question_cluster_id`. Mô hình cụm nội dung lại bị bỏ qua vì không đủ mẫu, nên trường kia rỗng hoàn toàn. Nay dùng chung `_cluster_of` với phần ghép CBF × K-Means: một định nghĩa duy nhất cho câu hỏi "item này thuộc cụm nào".

Đo trên tài khoản học sinh thật: ứng viên 3 → 7, gợi ý 3 → 6, `cluster_match` 0.000 → 0.730.

Đây là khâu [3] — **tiêu thụ** — mà ba khâu trước phục vụ. Huấn luyện tốt, gán nhãn đúng, nhưng nếu khâu cuối tra nhầm trường thì toàn bộ công sức phân cụm không chạm tới người dùng. Cùng loại với phát hiện ở Phần 2.1, chỉ khác chỗ đứt.

---

## Phần 5 — Ghi chú cho báo cáo chuyên đề

Khi trình bày, nên nêu rõ năm điểm sau vì chúng là thế mạnh học thuật của cài đặt hiện tại:

1. **Chọn k bằng chỉ số tổng hợp** (Silhouette + Davies-Bouldin + Calinski-Harabasz theo tỉ trọng 0.6/0.2/0.2) thay vì phương pháp elbow trực quan — đây là điểm chặt chẽ hơn mặt bằng chung.
2. **Kiểm định độ ổn định bằng Adjusted Rand Index** qua nhiều seed khởi tạo — trả lời được câu hỏi phản biện kinh điển: "K-Means phụ thuộc khởi tạo ngẫu nhiên, sao chứng minh kết quả đáng tin?".
3. **Ràng buộc loại bỏ đặc trưng định danh** trước khi huấn luyện — thể hiện ý thức về quyền riêng tư và tránh rò rỉ nhãn (label leakage) trong mô hình học máy.
4. **Phát hiện ngoại lai bằng median/MAD thay vì trung bình/độ lệch chuẩn** — có số liệu thật chứng minh cách cũ bỏ sót đúng trường hợp cần bắt nhất do hiệu ứng che lấp (Phần 2.4). Đây là loại chi tiết cho thấy đã thực sự chạy và kiểm chứng, không chỉ cài công thức sách.
5. **Quyết định KHÔNG chuẩn hoá đặc trưng ở bài toán phân nhóm lớp**, có lý do rõ ràng: giữ thang phần trăm để toạ độ tâm cụm diễn giải được. Biết khi nào *không* nên áp dụng một bước tiền xử lý cũng là hiểu thuật toán.
6. **Ngưỡng kích thước cụm tối thiểu phải đổi theo bài toán** (Phần 2.5). Cùng một tham số `min_cluster_size`: ở bài toán phân khúc thì cụm một phần tử là vô dụng nên phải loại; ở bài toán tìm ngoại lai thì cụm một phần tử **chính là kết quả**. Đặt cùng một giá trị cho cả hai làm chức năng phát hiện câu hỏi lỗi tự tắt đúng lúc cần nhất. Đây là ví dụ cụ thể cho việc *một tham số của K-Means không có giá trị "đúng" tuyệt đối, chỉ có đúng với mục đích*.

### Hai điểm nên thẳng thắn nêu là hạn chế

- **Quy tắc "độ phân biệt âm" không phải phát hiện của K-Means** — đó là quy tắc xác định trong đo lường giáo dục. Trong mã, hai lớp này được tách riêng (`_apply_rule_based_flags` và `_apply_outlier_flags`); trình bày lẫn lộn là không trung thực. K-Means đóng góp phần phát hiện bất thường theo khoảng cách tâm cụm.
- **Miền cá nhân hoá nay đã gán nhãn cụm và chạy thật đầu-cuối** trên MongoDB thật: 3/5 loại cụm huấn luyện được với dữ liệu hiện có (`question` k=2, `learner_ability` k=2, `learner_behavior` k=3), gán nhãn cho 15 câu hỏi và 12 người học. Hai loại còn lại (`content`, `learner_interest`) tự báo `no_active_model` vì chưa đủ mẫu — **hệ thống nói rõ lý do thay vì im lặng**, đó mới là hành vi đúng.
- **Cùng một loại lỗi MongoDB thật, dính hai lần** — và lần thứ hai nghiêm trọng hơn hẳn. `ConflictingUpdateOperators` xảy ra khi một lệnh update ghi cùng một trường bằng hai toán tử (`$set` và `$setOnInsert`). Lần đầu ở `upsert_graph_edge`; lần hai ở `upsert_learning_session`, chặn **mọi** sự kiện học tập — tức chặn cả chuỗi cá nhân hoá ngay mắt xích đầu tiên. Cả hai lần, 580+ test dùng `mongomock` đều xanh, vì mongomock chấp nhận lệnh mà MongoDB thật từ chối.

  Thay vì chờ lần thứ ba, nay có một test **quét tĩnh toàn bộ `app/`** bằng `ast`, tìm mọi dict literal có khoá trùng giữa các cặp toán tử xung khắc, và chỉ thẳng ra `file:dòng`. Bài học đáng nêu: khi một loại lỗi tái phát, sửa từng chỗ là chưa đủ — phải dựng cái lưới bắt được cả loại.
- **Một lỗi im lặng do giá trị mặc định**: `learning_items` chưa từng lưu `semantic_embedding`, mà cụm `content` và `question` dành 70% trọng số cho trường này. Hàm đọc có sẵn fallback cứng `[0,0,0,0]` nên phân cụm vẫn chạy, vẫn ra kết quả — chỉ là 70% trọng số đổ vào một vector hằng. Sau khi sửa, độ tách không gian đặc trưng tăng từ **0.0000 lên 0.9899**. Bài học: một giá trị mặc định "cho an toàn" có thể che giấu việc cả một khối đặc trưng không bao giờ có dữ liệu.
- **Chọn không gian vector theo bản chất bài toán, không theo công cụ sẵn có**: chức năng "học liệu liên quan" dùng embedding vì *liên quan* là quan hệ ngữ nghĩa; chức năng "cảnh báo học liệu gần trùng" dùng TF-IDF vì *trùng lặp* là quan hệ từ vựng. Cùng một phép đo cosine, hai không gian khác nhau. Dùng embedding cho bài toán trùng lặp sẽ báo nhầm mọi bài cùng chủ đề. Chi tiết và số đo ở `PHAN_TICH_ML_CBF.md`.
- **Không phải nghi ngờ nào cũng là lỗi.** Ở phần Thompson Sampling, một dòng
  `map.get(key, 0.0)` thoạt nhìn giống hệt kiểu lỗi "giá trị mặc định che giấu vấn đề" đã
  gặp ở trên. Kiểm tra kỹ thì kiểu dữ liệu đầu vào chỉ cho đúng 8 giá trị và bảng tra phủ
  hết cả 8, nên nhánh mặc định không tới được — đó là phòng thủ hợp lý. Nêu cả trường hợp
  nghi sai này cho thấy quy trình là *kiểm chứng rồi mới kết luận*, không phải đi tìm lỗi
  cho đủ số.
- **Một tối ưu đã đo rồi quyết định KHÔNG dùng**: ghép cụm để thu hẹp trước khi xếp hạng CBF nhanh 3.9× khi tâm cụm tính sẵn, nhưng **chậm hơn 15-25%** nếu tính lại tâm cụm mỗi lượt. Ở quy mô hiện tại chỉ tiết kiệm ~27ms, chưa đủ để đánh đổi lấy một tầng cache kèm rủi ro dữ liệu cũ. Trình bày cả số đo lẫn quyết định hoãn thường được đánh giá cao hơn là tối ưu mà không đo.

### Số liệu kiểm chứng có thể trích vào báo cáo

**Phát hiện câu hỏi lỗi — bộ số mới, chạy trên dữ liệu mẫu 12 học sinh × 8 câu:** xem bảng ở Phần 2.5. Bộ số dưới đây là lần kiểm chứng đầu, giữ lại vì nó minh hoạ đủ hai lớp phát hiện trên một ví dụ nhỏ dễ đọc.

**Phát hiện câu hỏi lỗi** — 6 học sinh, 5 câu, câu số 2 cố tình đặt sai đáp án:

| Câu | Độ khó | Độ phân biệt | Cụm | Kết luận |
|---|---|---|---|---|
| 1 | 0.50 | +0.82 | 1 | bình thường |
| 2 | 0.50 | **−0.82** | 0 | **bắt được sai đáp án** |
| 3 | 1.00 | 0.00 | 0 | **bắt được quá dễ** |
| 4, 5 | 0.50 | +0.82 | 1 | bình thường |

k = 2 (tự chọn), Silhouette = 0.683 — K-Means tách sạch nhóm câu bình thường khỏi nhóm câu có vấn đề.

**Phân nhóm năng lực lớp** — 12 học sinh, 3 bộ đề, chạy trên dữ liệu mẫu qua giao diện thật (lớp "Toán 10A1"):

| Nhóm | Số em | Hàm số | Lượng giác | Tổ hợp | TB | Cần phụ đạo nhất |
|---|---|---|---|---|---|---|
| 1 | 2 | 75.0% | **37.5%** | 62.5% | 58.3% | Lượng giác |
| 2 | 4 | **59.4%** | 68.8% | 71.9% | 66.7% | Hàm số |
| 3 | 4 | **50.0%** | 93.8% | 59.4% | 67.7% | Hàm số |
| 4 | 2 | **62.5%** | 87.5% | 75.0% | 75.0% | Hàm số |

k = 4 (tự chọn), Silhouette = 0.53. Giao diện hiện thẳng câu *"Cần phụ đạo nhất: Kiểm tra Hàm số bậc hai (43.75%) · Vững nhất: Kiểm tra Phương trình lượng giác (87.5%)"* kèm danh sách tên học sinh từng nhóm.

Điểm đáng nhấn: nhóm 2 và nhóm 3 có **điểm trung bình gần bằng nhau** (66.7% và 67.7%) nhưng chân dung khác hẳn — nhóm 3 giỏi Lượng giác hơn hẳn (93.8% so với 68.8%) và yếu Hàm số hơn. Bảng xếp hạng theo điểm trung bình xếp hai nhóm này cạnh nhau và coi như giống nhau; K-Means tách được vì nó nhìn **vector điểm theo từng bộ đề**, không nhìn một con số gộp. Đây chính là lập luận trả lời câu hỏi *"sao không dùng GROUP BY cho nhanh?"*.

**Phân nhóm hành vi người dùng** — 34 người dùng, cửa sổ 90 ngày, chạy trên dữ liệu thật trong `chuyende02` sau khi nạp bộ mẫu (Phần 4.4):

| Nhóm | Số người | Lượt hoạt động | Số ngày hoạt động | Số loại thao tác | Tỉ lệ lỗi | Phản hồi TB |
|---|---|---|---|---|---|---|
| 3 | 5 | 34.2 | 12.0 | 5.2 | 3% | 656 ms |
| 1 | 11 | 8.5 | 3.3 | 4.7 | **14%** | 442 ms |
| 2 | 18 | 2.9 | 1.1 | 1.9 | 0% | 286 ms |

k = 3 (tự chọn), Silhouette = 0.54. Một tài khoản bị gắn cờ lệch hẳn mọi nhóm. Hai đặc trưng về AI tự bị loại vì `ai_usage_events` không biến thiên — hệ thống **nêu rõ tên hai đặc trưng bị bỏ ra giao diện**, không âm thầm bỏ.

Trước khi có dữ liệu mẫu, cùng chức năng này trả về `clustering_unavailable` với 16 người dùng: mức sử dụng lệch tới mức mọi k từ 2 đến 8 đều sinh ra cụm một người. Guard chạy đúng — nhưng giao diện khi đó **không hiện gì cả**, kể cả lý do, nên người quản trị không phân biệt được "dữ liệu chưa đủ" với "tính năng hỏng". Nay khối luôn hiện, kèm câu giải thích và điều kiện để nó tự đầy lại.

> **Lưu ý khi trình bày:** đây là kết quả trên dữ liệu mẫu có kiểm soát. Nêu rõ điều đó — kèm cả trạng thái "không đủ dữ liệu để phân cụm" ở trên, vì biết khi nào thuật toán *không* nên đưa ra kết luận cũng là một kết quả.

**Ràng buộc đa dạng nội dung khi sinh đề** — 9 câu hỏi tiếng Việt thuộc 3 chủ đề (bề lõm parabol / toạ độ đỉnh / trục đối xứng), tất cả cùng chủ đề, cùng mức Bloom, cùng độ khó nên ma trận truyền thống **không phân biệt được**:

K-Means gom đúng 3 cụm, mỗi cụm 3 câu — khớp chính xác 3 chủ đề thật.

| Cấu hình | Cụm của 3 câu được chọn | Trạng thái bộ giải |
|---|---|---|
| Không đặt ràng buộc | `[2, 2, 2]` — **cả 3 câu cùng một cụm** | OPTIMAL |
| Đặt tối đa 1 câu/cụm | `[0, 1, 2]` — mỗi cụm một câu | OPTIMAL |

Dòng đầu chính là vấn đề cần giải: đề đúng ma trận trên giấy nhưng dồn hết vào một dạng bài. Dòng sau cho thấy ràng buộc giải đúng vấn đề đó **mà không làm mất tính tối ưu** — bộ giải vẫn trả về OPTIMAL, và khi yêu cầu bất khả thi thì vẫn báo INFEASIBLE thay vì trả về một đề sai ma trận.

---

## Phần 6 — Tổng kết: K-Means trong hệ thống sau khi hoàn thành

Năm chức năng dùng K-Means, mỗi chức năng khai thác một năng lực khác nhau của thuật toán:

| Năng lực của K-Means | Chức năng khai thác |
|---|---|
| Phân hoạch không giám sát | Phân nhóm học sinh, phân nhóm hành vi người dùng |
| Diễn giải qua toạ độ tâm cụm | Phân nhóm học sinh ("nhóm này yếu Hàm số"), phân nhóm hành vi |
| Đo khoảng cách tới tâm cụm | Phát hiện câu hỏi lỗi, học sinh cần quan tâm riêng, tài khoản bất thường |
| Chọn tập con đại diện | Lọc câu hỏi trùng ý khi sinh đề |
| Sinh nhãn làm đầu vào cho thuật toán khác | Ràng buộc đa dạng nội dung (đầu vào cho CP-SAT), và `cluster_match` trong công thức xếp hạng gợi ý |
| Nhận diện vùng chưa chạm tới | Chống bong bóng lọc: đề một item thuộc cụm người học chưa từng học lên top |

Điều đáng nói không phải số lượng chức năng, mà là **năm cách dùng khác nhau của cùng một thuật toán** — từ phân nhóm thuần tuý, tới phát hiện bất thường, tới chọn mẫu đại diện, tới làm bước tiền xử lý cho một bộ giải ràng buộc. Đó là bằng chứng cho việc hiểu thuật toán đủ sâu để đặt nó đúng chỗ, thay vì áp một khuôn duy nhất cho mọi bài toán.
