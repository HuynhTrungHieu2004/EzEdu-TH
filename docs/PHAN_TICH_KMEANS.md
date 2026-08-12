# Phân tích ứng dụng K-Means trong hệ thống EzEdu AI

> Tài liệu này dựa trên đọc trực tiếp mã nguồn (`backend/app/personalization/`, `backend/app/services/clustering_service.py`) và kiểm tra dữ liệu thật trong MongoDB `chuyende02`, không suy đoán.

---

## Phần 1 — Hiện trạng: K-Means đang được dùng ở đâu

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
| Ngưỡng phát hiện ngoại lai không dùng | `KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER = 2.5` khai báo nhưng chưa áp dụng vào chức năng nào | `config.py:132` |
| Phân cụm tài liệu không ai gọi | Endpoint `GET /documents/analysis/clusters` và hàm `documentApi.getClusters` đều tồn tại, nhưng **không trang giao diện nào gọi tới** | đã kiểm tra bằng grep toàn bộ `frontend/src` |
| Chưa từng chạy với dữ liệu thật | Cả 10 collection cá nhân hoá trong MongoDB đều đang **0 bản ghi** | kiểm tra trực tiếp DB |

### 2.3. Kết luận đánh giá

Nếu chia "khai thác K-Means" thành 10 hạng mục:

| # | Hạng mục | Trạng thái |
|---|---|---|
| 1 | Thiết kế đặc trưng | Đã làm tốt |
| 2 | Chuẩn hoá / co giãn dữ liệu | Đã làm tốt |
| 3 | Chọn số cụm k | Đã làm tốt (đa chỉ số) |
| 4 | Đánh giá chất lượng cụm | Đã làm tốt (3 chỉ số nội tại) |
| 5 | Đánh giá độ ổn định | Đã làm tốt (ARI đa seed) |
| 6 | Quản lý version mô hình | Đã làm tốt |
| 7 | **Gán nhãn cụm cho đối tượng** | **Thiếu hoàn toàn** |
| 8 | **Dùng cụm để thay đổi đầu ra** | **Thiếu hoàn toàn** |
| 9 | **Diễn giải ý nghĩa từng cụm** | **Có mã, không chạy** |
| 10 | **Phát hiện ngoại lai theo khoảng cách tâm cụm** | **Chưa dùng** |

Đạt khoảng **6/10** — và đáng tiếc là 6 phần đã làm đều thuộc nửa đầu (chuẩn bị), 4 phần thiếu thuộc nửa sau (tạo ra giá trị). Người dùng cuối hiện **không nhận được bất kỳ lợi ích nào** từ K-Means.

---

## Phần 3 — Đề xuất: các chức năng sẵn có nên áp dụng K-Means

Nguyên tắc chọn đề xuất: (a) chỉ dùng chức năng **đã có sẵn** trên web, (b) khai thác đặc tính mà **chỉ K-Means mới làm tốt** — phân hoạch không giám sát, diễn giải qua toạ độ tâm cụm, và đo khoảng cách tới tâm cụm — chứ không phải gượng ép gắn K-Means vào chỗ một câu lệnh `GROUP BY` cũng làm được.

### Điều kiện tiên quyết cho mọi đề xuất

**Phải bổ sung khâu gán nhãn cụm trước.** Cụ thể: sau khi huấn luyện xong, chạy `predict_cluster` cho từng đối tượng rồi ghi `cluster_id` vào tài liệu tương ứng, và đưa việc này thành một job định kỳ trong `worker.py`. Không có bước này thì mọi đề xuất bên dưới đều không chạy được.

---

### Đề xuất 1 — Phân nhóm học sinh trong lớp để giao đề phân hoá ⭐ ưu tiên cao nhất

**Chức năng sẵn có được nâng cấp:** Quản lý lớp học + Ma trận đề & sinh đề tự động.

**Cách làm:** Dùng cụm `learner_ability` gán cho từng học sinh trong một lớp. Giáo viên mở trang lớp học sẽ thấy lớp tự động chia thành các nhóm năng lực, kèm mô tả sinh từ **toạ độ tâm cụm** — ví dụ "Nhóm 2 (12 em): thành thạo tốt phần Hàm số, nhưng yếu rõ rệt ở Bất phương trình".

**Vì sao khai thác tốt K-Means:**
- **Toạ độ tâm cụm trở thành lời chẩn đoán.** Tâm cụm là vector mức thành thạo theo từng thành phần kiến thức — đọc trực tiếp ra được "nhóm này yếu ở đâu". Đây là thế mạnh diễn giải của K-Means mà các thuật toán phân cụm khác (DBSCAN, hierarchical) không cho trực tiếp.
- **Khoảng cách tới tâm cụm = mức độ điển hình.** Em nào nằm xa tâm cụm của chính mình là trường hợp không giống ai trong lớp → giáo viên cần kèm riêng. Chỉ số này đã được tính sẵn (`mean/std/max_distance_to_centroid`) nhưng chưa dùng.
- Số nhóm **không cố định trước** — lớp đồng đều sẽ tự ra 2 nhóm, lớp phân hoá mạnh ra 4 nhóm. Đây đúng là bài toán K-Means giải, không phải chia theo ngưỡng điểm cứng.

**Hạ tầng đã có:** bảng `classes` với `student_ids`, cơ chế giao đề theo lớp `exams.target_class_ids`, trang `ClassDetailPage`. Chỉ cần mở rộng target từ "theo lớp" thành "theo nhóm trong lớp".

---

### Đề xuất 2 — Tự động phát hiện câu hỏi bất thường trong ngân hàng đề ⭐ ưu tiên cao

**Chức năng sẵn có được nâng cấp:** Ngân hàng câu hỏi.

**Cách làm:** Phân cụm câu hỏi bằng cụm `question` (độ khó, độ phân biệt, tỉ lệ trả lời đúng, thời gian làm bài trung bình). Câu nào có khoảng cách tới tâm cụm vượt quá `2.5 × độ lệch chuẩn` thì tự động chuyển `quality_status` sang `flagged` và đẩy vào danh sách chờ giáo viên duyệt lại.

**Vì sao khai thác tốt K-Means:**
- Đây là dùng K-Means làm **bộ phát hiện ngoại lai**, không phải chỉ để gom nhóm — một năng lực bị bỏ quên của thuật toán này.
- Bắt được đúng loại lỗi mà kiểm tra thủ công hay bỏ sót: câu có đáp án sai (mọi học sinh giỏi đều trả lời "sai" → độ phân biệt âm bất thường), câu diễn đạt mơ hồ (thời gian làm lâu bất thường so với độ khó khai báo).
- **Ngưỡng `KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER = 2.5` đã có sẵn trong cấu hình**, chỉ chờ được dùng. Trường `quality_status: unreviewed | flagged | verified` cũng đã có sẵn trong schema và hiện **không có gì tự động đặt giá trị `flagged`**.

---

### Đề xuất 3 — Lọc câu hỏi trùng lặp ngữ nghĩa ngay khi AI sinh đề ⭐ ưu tiên cao, dễ làm nhất

**Chức năng sẵn có được nâng cấp:** Sinh câu hỏi từ học liệu.

**Cách làm:** Khi giáo viên yêu cầu 10 câu, cho AI sinh dư (25–30 câu), phân cụm embedding của chúng với `k = 10`, rồi mỗi cụm chỉ lấy **một câu gần tâm cụm nhất**.

**Vì sao khai thác tốt K-Means:**
- Đây là kỹ thuật **chọn tập con đa dạng** (diverse subset selection) kinh điển bằng K-Means — vừa đảm bảo 10 câu phủ đều không gian ngữ nghĩa của tài liệu, vừa loại được các câu hỏi na ná nhau.
- Câu gần tâm cụm nhất là câu **đại diện nhất** cho vùng kiến thức đó, thường cũng là câu diễn đạt chuẩn mực nhất trong nhóm.
- Giải quyết đúng một điểm yếu thực tế của LLM: sinh nhiều câu bị lặp ý dù khác chữ.

**Chi phí thấp nhất trong các đề xuất:** chỉ can thiệp vào một chỗ trong `question_generation_service.py`, không cần bảng mới, không cần job nền, không phụ thuộc việc gán nhãn lâu dài.

---

### Đề xuất 4 — Ràng buộc đa dạng nội dung khi sinh đề từ ma trận

**Chức năng sẵn có được nâng cấp:** Ma trận đề & sinh đề tự động.

**Cách làm:** Ma trận hiện chọn câu theo chủ đề / mức Bloom / độ khó đã khai báo. Bổ sung thêm một ràng buộc: các câu được chọn phải trải trên tối thiểu N cụm `content` khác nhau.

**Vì sao khai thác tốt K-Means:** Phân loại theo chương trình học (`curriculum_taxonomy`) là do con người khai báo, có thể thô. Một đề "đúng chủ đề Hàm số, đúng mức Vận dụng" vẫn có thể vô tình dồn hết vào một dạng bài duy nhất. Cụm ngữ nghĩa phát hiện được sự trùng lặp mà nhãn thủ công không thấy — hai hệ phân loại **bổ sung cho nhau**, không thay thế nhau.

**Đã có tiền lệ trong mã:** ý tưởng này đã được cài cho phần gợi ý học tập (`RERANK_MAX_SAME_QUESTION_CLUSTER = 2`), chỉ cần mang sang khâu sinh đề.

---

### Đề xuất 5 — Gợi ý tài liệu liên quan cho giáo viên

**Chức năng sẵn có được nâng cấp:** Quản lý học liệu.

**Cách làm:** Gán `content_cluster_id` cho tài liệu; khi giáo viên mở một tài liệu, hiển thị "Tài liệu cùng nhóm nội dung".

**Vì sao đáng làm:** Đây là đề xuất **rẻ nhất** — endpoint `GET /documents/analysis/clusters` và `getSimilar` **đã viết xong từ trước, và hiện không trang nào gọi tới**. Về bản chất chỉ là nối dây giao diện cho phần backend đã sẵn sàng.

---

### Đề xuất 6 — Phân nhóm hành vi người dùng cho trang quản trị

**Chức năng sẵn có được nâng cấp:** Theo dõi sử dụng AI + Quản lý hạn mức (quota) + Nhật ký hoạt động.

**Cách làm:** Phân cụm người dùng theo mẫu hành vi sử dụng (số lượt gọi AI, khung giờ hoạt động, tỉ lệ lỗi, loại thao tác chính) từ `user_activity_logs` và `ai_usage_events`. Dùng cho hai việc: (a) đặt hạn mức AI theo **nhóm hành vi thực tế** thay vì theo vai trò cứng, (b) phát hiện tài khoản bất thường qua khoảng cách tới tâm cụm.

**Vì sao khai thác tốt K-Means:** Vai trò (`student`/`lecturer`) là nhãn hành chính, không phản ánh mức độ sử dụng thật — có giáo viên dùng rất ít, có học sinh dùng rất nhiều. Phân cụm hành vi cho ra phân khúc đúng thực tế hơn. Đồng thời tận dụng lại năng lực phát hiện ngoại lai để chống lạm dụng tài nguyên AI.

**Ưu điểm dữ liệu:** đây là đề xuất **duy nhất có sẵn dữ liệu thật ngay lúc này** (`user_activity_logs` đang có 46 bản ghi, `system_error_logs` 29 bản ghi) — có thể thử nghiệm mà không cần chờ người dùng thật.

---

## Phần 4 — Thứ tự triển khai đề xuất

| Bước | Việc | Lý do xếp trước |
|---|---|---|
| 0 | **Bổ sung khâu gán nhãn cụm + job huấn luyện định kỳ** | Điều kiện bắt buộc cho các bước 1, 2, 4, 5, 6 |
| 1 | Đề xuất 3 (lọc câu hỏi trùng lặp) | Không phụ thuộc bước 0, làm được ngay, thấy kết quả liền |
| 2 | Đề xuất 5 (gợi ý tài liệu liên quan) | Backend đã xong, chỉ nối giao diện |
| 3 | Đề xuất 6 (phân nhóm hành vi quản trị) | Đã có dữ liệu thật để chạy thử |
| 4 | Đề xuất 2 (phát hiện câu hỏi bất thường) | Cần tích luỹ dữ liệu lượt làm bài |
| 5 | Đề xuất 1 (phân nhóm học sinh) | Giá trị cao nhất nhưng cần nhiều dữ liệu học tập nhất |
| 6 | Đề xuất 4 (đa dạng hoá ma trận đề) | Phụ thuộc cụm nội dung đã ổn định |

---

## Phần 5 — Ghi chú cho báo cáo chuyên đề

Khi trình bày, nên nêu rõ ba điểm sau vì chúng là thế mạnh học thuật của cài đặt hiện tại:

1. **Chọn k bằng chỉ số tổng hợp** (Silhouette + Davies-Bouldin + Calinski-Harabasz theo tỉ trọng 0.6/0.2/0.2) thay vì phương pháp elbow trực quan — đây là điểm chặt chẽ hơn mặt bằng chung.
2. **Kiểm định độ ổn định bằng Adjusted Rand Index** qua nhiều seed khởi tạo — trả lời được câu hỏi phản biện kinh điển: "K-Means phụ thuộc khởi tạo ngẫu nhiên, sao chứng minh kết quả đáng tin?".
3. **Ràng buộc loại bỏ đặc trưng định danh** trước khi huấn luyện — thể hiện ý thức về quyền riêng tư và tránh rò rỉ nhãn (label leakage) trong mô hình học máy.

Đồng thời nên thẳng thắn nêu hạn chế hiện tại (cụm chưa được gán và chưa được sử dụng) như một hướng phát triển tiếp theo — điều này thường được đánh giá cao hơn là né tránh.
