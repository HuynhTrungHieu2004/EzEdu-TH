# 08 - Candidate Generator

## Mục tiêu

Candidate Generator tạo danh sách nội dung ứng viên cho hệ thống đề xuất. Module này chưa chọn nội dung cuối cùng, chưa ranking đầy đủ và chưa dùng Contextual Bandit.

Generator hiện là deterministic service, không gọi API AI. AI không được quyết định mastery, weakness hoặc item cuối cùng.

## API

Router personalization được mount dưới `/api/v1/personalization`.

Endpoint mới:

```text
GET /api/v1/personalization/recommendations/candidates
```

Endpoint bị ẩn nếu một trong hai flag tắt:

- `PERSONALIZATION_ENABLED`
- `RECOMMENDATION_ENABLED`

## Input chính

Service đọc dữ liệu theo `user_id` hiện tại qua repository:

- Digital Twin hiện tại.
- `learner_profiles`.
- `learner_knowledge_states`.
- `learning_events` gần đây.
- `knowledge_components` thuộc user.
- `knowledge_graph_edges` prerequisite thuộc user.
- `learning_items` thuộc document mà user sở hữu.

Không lấy item từ document user không có quyền.

## Candidate schema

Mỗi candidate trả về:

- `item_id`
- `source_types`
- `source_scores`
- `knowledge_component_ids`
- `difficulty`
- `quality_score`
- `verification_status`
- `prerequisite_status`
- `recently_seen`
- `generated_at`

Response tổng:

- `user_id`
- `candidates`
- `source_counts`
- `fallback_sources`
- `generated_at`
- `model_versions`

## Candidate sources

Generator hỗ trợ 10 nguồn:

- `weak_knowledge`
- `prerequisite_gap`
- `forgetting_review`
- `current_learning_goal`
- `similar_to_recent_error`
- `appropriate_difficulty`
- `learner_interest`
- `cluster_match`
- `exploration`
- `continue_current_path`

Một item có thể đến từ nhiều nguồn. Generator deduplicate theo `item_id` và giữ toàn bộ provenance trong `source_types` + `source_scores`.

## Quy tắc lọc bắt buộc

Bước cuối loại bỏ:

- Item không tồn tại trong accessible learning item pool.
- Item thuộc document user không sở hữu.
- Item có `verification_status` là `rejected`, `failed`, hoặc `verification_failed`.
- Item có `quality_score` thấp hơn `CANDIDATE_MIN_QUALITY_SCORE`.
- Item không có nguồn.
- Item vừa làm trong `CANDIDATE_RECENT_WINDOW_HOURS`, trừ `forgetting_review`.
- Item có prerequisite gap nghiêm trọng, trừ khi chính item đó là prerequisite-gap repair candidate.

## Weak Knowledge

Nguồn `weak_knowledge` dùng Digital Twin weakness:

- mastery thấp.
- đủ attempts theo `DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED`.
- confidence đủ để hành động.
- tăng nhẹ điểm nếu KC khớp learning goals hoặc preferred subjects.

Knowledge Component unassessed hoặc ít dữ liệu không được xem là điểm yếu chắc chắn.

## Prerequisite Gap

Nguồn `prerequisite_gap` dùng `twin.prerequisite_gaps`.

Nếu người học đã học/đang mạnh ở KC nâng cao nhưng prerequisite source còn yếu, chưa chắc hoặc chưa assessed, generator tìm item gắn với prerequisite source để sửa lỗ hổng trước.

## Forgetting Review

Nguồn `forgetting_review` dùng `twin.at_risk_knowledge`.

Chỉ sinh review nếu:

- KC đã có attempt.
- mastery từng đạt ít nhất `CANDIDATE_FORGETTING_MIN_MASTERY`.
- forgetting risk đang cao.

Không dùng forgetting review cho kiến thức người học chưa từng học.

## Similar To Recent Error

Nguồn `similar_to_recent_error` dùng:

- recent wrong `question_answered` events.
- overlapping Knowledge Components.
- `content_cluster_id` nếu có.

Generator loại câu giống hệt bằng cách bỏ chính `item_id` đã sai gần đây. Vector similarity/question cluster có thể được bổ sung khi item embedding hoặc question cluster được lưu đầy đủ hơn.

## Appropriate Difficulty

Nguồn `appropriate_difficulty` dùng range từ Digital Twin:

```text
recommended_difficulty_range +/- CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN
```

Range gốc được tính từ Rasch/IRT target probability ở Prompt 7.

## Learner Interest

Nguồn `learner_interest` dùng:

- `preferred_subjects`
- `preferred_content_types`
- metadata của Knowledge Component: name, normalized_name, description, subject, topic

## Cluster Match

Nguồn `cluster_match` dùng `content_cluster_id` của item gần đây. Generator không fit K-Means ở bước này, chỉ đọc cluster id đã có.

## Exploration

Exploration là fallback nhỏ, không random hoàn toàn.

Item exploration phải:

- trong vùng difficulty phù hợp nếu có difficulty.
- đạt quality tối thiểu.
- không vi phạm prerequisite nghiêm trọng.
- không vừa làm quá gần.

Tỷ lệ/cỡ exploration được giới hạn bằng `CANDIDATE_EXPLORATION_RATIO`.

## Continue Current Path

Nguồn `continue_current_path` tìm item khác trong document gần đây nhất, không lấy chính item vừa làm.

## Cấu hình

Default hiện tại:

- `CANDIDATE_PER_SOURCE_LIMIT=5`
- `CANDIDATE_TOTAL_LIMIT=30`
- `CANDIDATE_MIN_QUALITY_SCORE=0.5`
- `CANDIDATE_RECENT_WINDOW_HOURS=24`
- `CANDIDATE_EXPLORATION_RATIO=0.1`
- `CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN=0.15`
- `CANDIDATE_FORGETTING_MIN_MASTERY=0.65`

## Fallback

Nếu số candidate chưa đủ:

1. Bổ sung `appropriate_difficulty`.
2. Bổ sung `exploration`.

Các nguồn fallback đã dùng được trả trong `fallback_sources`.

## File đã thêm/sửa

Thêm:

- `backend/app/personalization/schemas/candidates.py`
- `backend/app/personalization/services/candidate_generator_service.py`
- `backend/app/personalization/api/candidates.py`
- `backend/tests/test_candidate_generator.py`

Sửa:

- `backend/app/core/config.py`
- `backend/.env.example`
- `backend/app/personalization/repositories/mongo.py`
- `backend/app/personalization/api/__init__.py`
- `backend/app/personalization/services/__init__.py`
- `backend/app/personalization/schemas/__init__.py`

## Hạn chế

- Chưa có ranking cuối cùng.
- Chưa dùng Contextual Bandit.
- Similar-error hiện dùng KC overlap và content cluster; vector/question-cluster similarity sẽ tốt hơn khi dữ liệu item lưu đủ embedding/cluster.
- Exploration là deterministic fallback, không phải chiến lược exploration chính thức.
