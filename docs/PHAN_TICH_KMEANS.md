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

Năm chức năng K-Means đã chạy đều dùng chung `choose_k_and_fit` (chọn k đa chỉ số), ba trong số đó dùng thêm `flag_distance_outliers` (phát hiện ngoại lai bền vững). **Dữ liệu nuôi chúng tự sinh ra từ luồng dùng bình thường** — giáo viên tạo đề, học sinh làm bài, người dùng thao tác trên hệ thống. Không cái nào phụ thuộc mắt xích knowledge extraction đang tắc.

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

## Phần 5 — Ghi chú cho báo cáo chuyên đề

Khi trình bày, nên nêu rõ năm điểm sau vì chúng là thế mạnh học thuật của cài đặt hiện tại:

1. **Chọn k bằng chỉ số tổng hợp** (Silhouette + Davies-Bouldin + Calinski-Harabasz theo tỉ trọng 0.6/0.2/0.2) thay vì phương pháp elbow trực quan — đây là điểm chặt chẽ hơn mặt bằng chung.
2. **Kiểm định độ ổn định bằng Adjusted Rand Index** qua nhiều seed khởi tạo — trả lời được câu hỏi phản biện kinh điển: "K-Means phụ thuộc khởi tạo ngẫu nhiên, sao chứng minh kết quả đáng tin?".
3. **Ràng buộc loại bỏ đặc trưng định danh** trước khi huấn luyện — thể hiện ý thức về quyền riêng tư và tránh rò rỉ nhãn (label leakage) trong mô hình học máy.
4. **Phát hiện ngoại lai bằng median/MAD thay vì trung bình/độ lệch chuẩn** — có số liệu thật chứng minh cách cũ bỏ sót đúng trường hợp cần bắt nhất do hiệu ứng che lấp (Phần 2.4). Đây là loại chi tiết cho thấy đã thực sự chạy và kiểm chứng, không chỉ cài công thức sách.
5. **Quyết định KHÔNG chuẩn hoá đặc trưng ở bài toán phân nhóm lớp**, có lý do rõ ràng: giữ thang phần trăm để toạ độ tâm cụm diễn giải được. Biết khi nào *không* nên áp dụng một bước tiền xử lý cũng là hiểu thuật toán.

### Hai điểm nên thẳng thắn nêu là hạn chế

- **Quy tắc "độ phân biệt âm" không phải phát hiện của K-Means** — đó là quy tắc xác định trong đo lường giáo dục. Trong mã, hai lớp này được tách riêng (`_apply_rule_based_flags` và `_apply_outlier_flags`); trình bày lẫn lộn là không trung thực. K-Means đóng góp phần phát hiện bất thường theo khoảng cách tâm cụm.
- **Miền cá nhân hoá (5 loại cụm gốc) vẫn chưa gán nhãn cụm**, dù mắt xích knowledge extraction nay đã thông. Đây là việc còn lại rõ ràng nhất, và nêu thẳng sẽ được đánh giá cao hơn là né tránh.
- **Một lỗi chỉ lộ ra khi chạy với MongoDB thật** (`ConflictingUpdateOperators` trong `upsert_graph_edge`) mà 500+ test dùng `mongomock` không bắt được — vì mongomock chấp nhận lệnh mà MongoDB thật từ chối. Nêu điểm này cho thấy hiểu giới hạn của việc giả lập cơ sở dữ liệu trong kiểm thử.
- **Một lỗi im lặng do giá trị mặc định**: `learning_items` chưa từng lưu `semantic_embedding`, mà cụm `content` và `question` dành 70% trọng số cho trường này. Hàm đọc có sẵn fallback cứng `[0,0,0,0]` nên phân cụm vẫn chạy, vẫn ra kết quả — chỉ là 70% trọng số đổ vào một vector hằng. Sau khi sửa, độ tách không gian đặc trưng tăng từ **0.0000 lên 0.9899**. Bài học: một giá trị mặc định "cho an toàn" có thể che giấu việc cả một khối đặc trưng không bao giờ có dữ liệu.
- **Chọn không gian vector theo bản chất bài toán, không theo công cụ sẵn có**: chức năng "học liệu liên quan" dùng embedding vì *liên quan* là quan hệ ngữ nghĩa; chức năng "cảnh báo học liệu gần trùng" dùng TF-IDF vì *trùng lặp* là quan hệ từ vựng. Cùng một phép đo cosine, hai không gian khác nhau. Dùng embedding cho bài toán trùng lặp sẽ báo nhầm mọi bài cùng chủ đề. Chi tiết và số đo ở `PHAN_TICH_ML_CBF.md`.
- **Một tối ưu đã đo rồi quyết định KHÔNG dùng**: ghép cụm để thu hẹp trước khi xếp hạng CBF nhanh 3.9× khi tâm cụm tính sẵn, nhưng **chậm hơn 15-25%** nếu tính lại tâm cụm mỗi lượt. Ở quy mô hiện tại chỉ tiết kiệm ~27ms, chưa đủ để đánh đổi lấy một tầng cache kèm rủi ro dữ liệu cũ. Trình bày cả số đo lẫn quyết định hoãn thường được đánh giá cao hơn là tối ưu mà không đo.

### Số liệu kiểm chứng có thể trích vào báo cáo

**Phát hiện câu hỏi lỗi** — 6 học sinh, 5 câu, câu số 2 cố tình đặt sai đáp án:

| Câu | Độ khó | Độ phân biệt | Cụm | Kết luận |
|---|---|---|---|---|
| 1 | 0.50 | +0.82 | 1 | bình thường |
| 2 | 0.50 | **−0.82** | 0 | **bắt được sai đáp án** |
| 3 | 1.00 | 0.00 | 0 | **bắt được quá dễ** |
| 4, 5 | 0.50 | +0.82 | 1 | bình thường |

k = 2 (tự chọn), Silhouette = 0.683 — K-Means tách sạch nhóm câu bình thường khỏi nhóm câu có vấn đề.

**Phân nhóm năng lực lớp** — 8 học sinh, 3 chủ đề:

| Nhóm | Số em | Hàm số | Lượng giác | Đạo hàm | Cần phụ đạo |
|---|---|---|---|---|---|
| 1 | 4 | **39%** | 76% | 58% | Hàm số |
| 2 | 4 | 89% | **42%** | 70% | Lượng giác |

k = 2 (tự chọn), Silhouette = 0.679. Một em yếu đều (33%) bị gắn cờ "cần xem riêng" nhờ khoảng cách tới tâm nhóm — thông tin mà bảng xếp hạng điểm trung bình không cho được.

**Phân nhóm hành vi người dùng** — 16 người dùng, cửa sổ 90 ngày. **Đây là bộ số duy nhất chạy trên dữ liệu thật đang có trong hệ thống**, hai bảng trên dùng dữ liệu dựng để kiểm chứng:

| Nhóm | Số người | Lượt hoạt động | Số loại thao tác | Tỉ lệ lỗi | Thời gian phản hồi TB |
|---|---|---|---|---|---|
| 1 | 2 | 6.0 | 4.5 | **17%** | 532 ms |
| 2 | 14 | 3.4 | 2.3 | 0% | 294 ms |

k = 2 (tự chọn), Silhouette = 0.58. Hai đặc trưng về AI tự bị loại vì `ai_usage_events` chưa có dữ liệu — hệ thống nêu rõ điều này ra giao diện. Năm tài khoản bị gắn cờ lệch hẳn mọi nhóm.

> **Lưu ý khi trình bày:** dữ liệu hoạt động hiện tại chủ yếu là sự kiện đăng nhập (51/58 bản ghi), nên phân khúc thu được còn thô. Nêu rõ hạn chế này — kết quả sẽ giàu ý nghĩa hơn khi hệ thống tích luỹ đủ thao tác thật.

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
| Sinh nhãn làm đầu vào cho thuật toán khác | Ràng buộc đa dạng nội dung (đầu vào cho CP-SAT) |

Điều đáng nói không phải số lượng chức năng, mà là **năm cách dùng khác nhau của cùng một thuật toán** — từ phân nhóm thuần tuý, tới phát hiện bất thường, tới chọn mẫu đại diện, tới làm bước tiền xử lý cho một bộ giải ràng buộc. Đó là bằng chứng cho việc hiểu thuật toán đủ sâu để đặt nó đúng chỗ, thay vì áp một khuôn duy nhất cho mọi bài toán.
