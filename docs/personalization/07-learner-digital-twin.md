# 07 - Learner Digital Twin

## Mục tiêu

Learner Digital Twin là lớp tổng hợp trạng thái người học hiện tại. Đây không phải là model AI độc lập và không gọi API AI. Mọi trường định lượng được tính từ dữ liệu đã có ownership theo `user_id`:

- `learner_profiles`
- `learner_knowledge_states`
- BKT mastery trong từng knowledge state
- Rasch/IRT theta trong learner profile/state
- forgetting risk heuristic
- K-Means cluster id đã lưu trong learner profile
- learning goals và preferences
- recent learning events
- prerequisite edges trong knowledge graph

## API

Router personalization được mount dưới `/api/v1/personalization`, vì vậy các endpoint mới là:

- `GET /api/v1/personalization/me`
- `GET /api/v1/personalization/me/knowledge`
- `GET /api/v1/personalization/me/progress`

API lấy `user_id` từ `get_current_user`. Frontend không truyền `user_id`. Service chỉ đọc learner data qua repository có ownership guard.

## Sơ đồ xử lý

```text
Authenticated User
        |
        v
GET /personalization/me
        |
        v
DigitalTwinService
        |
        +--> LearnerProfile repository read by user_id
        +--> LearnerKnowledgeState repository read by user_id
        +--> LearningEvent repository read by user_id
        +--> KnowledgeComponent repository read by created_by
        +--> KnowledgeGraphEdge repository read by created_by
        +--> Active cluster model metadata
        |
        v
Deterministic rules and aggregations
        |
        v
DigitalTwinResponse
```

## Schema trả về

`DigitalTwinResponse` gồm:

- `user_id`
- `current_level`
- `global_ability`
- `profile_confidence`
- `strengths`
- `weaknesses`
- `prerequisite_gaps`
- `at_risk_knowledge`
- `learning_goals`
- `content_preferences`
- `behavior_summary`
- `cluster_memberships`
- `cluster_distances`
- `recent_progress`
- `recommended_difficulty_range`
- `data_quality`
- `model_versions`
- `generated_at`

Không trả raw answer, raw event metadata, document content, private identifiers ngoài `user_id` của chính user đang đăng nhập.

## Cách tính từng trường

`user_id`: lấy từ authenticated user.

`current_level`: đọc từ `learner_profiles.current_level`, vốn được cập nhật bởi learner model rule ở Prompt 5.

`global_ability`: đọc từ `learner_profiles.global_ability`, là theta tổng hợp từ Rasch/IRT 1PL.

`profile_confidence`: đọc từ `learner_profiles.profile_confidence`; nếu chưa có profile thì bằng `0`.

`learning_goals`: đọc từ `learner_profiles.learning_goals`.

`content_preferences`: tổng hợp từ `preferred_subjects`, `preferred_content_types`, `preferred_explanation_style`, `preferred_session_minutes`.

`model_versions`: lấy từ cấu hình:

- `FEATURE_SCHEMA_VERSION`
- `KNOWLEDGE_MODEL_VERSION`
- `LEARNER_MODEL_VERSION`
- `CLUSTERING_MODEL_VERSION`
- `RANKING_MODEL_VERSION`
- `BANDIT_POLICY_VERSION`

`generated_at`: timestamp phía server tại lúc tạo twin.

## Strength, Weakness và trạng thái kiến thức

Digital Twin phân loại từng Knowledge Component bằng rule, không dùng AI.

Trạng thái nội bộ:

- `mastered`
- `weak`
- `uncertain`
- `unassessed`
- `at_risk_of_forgetting`

Rule mặc định:

- `unassessed`: chưa có attempt hoặc chưa có mastery.
- `uncertain`: số attempt dưới `DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED` hoặc uncertainty cao hơn `DIGITAL_TWIN_UNCERTAINTY_THRESHOLD`.
- `mastered`: mastery lớn hơn hoặc bằng `DIGITAL_TWIN_STRENGTH_MASTERY_THRESHOLD`, đủ attempts và uncertainty thấp.
- `weak`: mastery nhỏ hơn hoặc bằng `DIGITAL_TWIN_WEAK_MASTERY_THRESHOLD`, đủ attempts và uncertainty thấp.
- `at_risk_of_forgetting`: forgetting risk vượt `DIGITAL_TWIN_FORGETTING_RISK_THRESHOLD` và mastery chưa quá thấp.

Điểm quan trọng: Knowledge Component có ít dữ liệu không bị xem là điểm yếu chắc chắn. Nó được phân loại `uncertain` hoặc `unassessed`.

## Forgetting Risk

Forgeting risk là heuristic baseline có thể giải thích, không phải mô hình Ebbinghaus chính xác.

Công thức hiện tại dùng các thành phần:

- thời gian từ lần luyện cuối: `elapsed_days / DIGITAL_TWIN_FORGETTING_RISK_DAYS`
- mastery hiện tại: `1 - mastery_probability`
- độ ổn định luyện tập: `1 / sqrt(attempt_count)`
- kết quả gần đây: `1 - recent_accuracy`, hoặc uncertainty nếu thiếu recent accuracy

Tổng hợp:

```text
risk =
  0.40 * time_factor
+ 0.25 * mastery_factor
+ 0.20 * practice_stability
+ 0.15 * performance_instability
```

Kết quả được clamp vào `[0, 1]`.

## Prerequisite Gaps

Repository đọc `knowledge_graph_edges` thuộc `created_by=user_id`, loại `prerequisite`.

Quy ước cạnh:

```text
source_knowledge_component_id -> target_knowledge_component_id
```

Nghĩa là source là điều kiện tiên quyết của target.

Nếu target đã có evidence học tập, còn source đang `weak`, `uncertain`, `unassessed` hoặc `at_risk_of_forgetting`, source được đưa vào `prerequisite_gaps`.

## Behavior Summary

Dựa trên recent learning events của user hiện tại:

- `recent_event_count`: số event gần nhất được đọc.
- `question_answered_count`: số event `question_answered`.
- `recent_accuracy`: tỷ lệ đúng trên các event có `is_correct`.
- `average_response_time_ms`: trung bình response time của `question_answered`.
- `hint_rate`: tổng hint trên số câu trả lời, clamp tối đa `1`.
- `answer_change_rate`: số lần đổi đáp án trung bình.
- `skip_rate`: tỷ lệ event có `skipped=true`.
- `completion_rate`: tỷ lệ event có `completed=true`.
- `active_session_count`: số `session_id` khác nhau trong recent events.

## Recent Progress

Gồm:

- `recent_event_count`
- `question_answered_count`
- `recent_accuracy`
- `completed_count`
- `last_active_at`

`last_active_at` lấy giá trị mới hơn giữa `learner_profile.last_active_at` và event gần nhất.

## Recommended Difficulty Range

Tính từ Rasch/IRT 1PL, không dùng AI.

Với:

```text
P(correct) = 1 / (1 + exp(-(theta - beta)))
```

Đảo công thức để tìm `beta` tương ứng với xác suất mục tiêu:

```text
beta = theta - log(P / (1 - P))
```

Mặc định mục tiêu là xác suất đúng trong khoảng `0.6-0.8`. `beta` được chuyển về difficulty `[0, 1]` dựa trên `IRT_MIN_BETA` và `IRT_MAX_BETA`.

## Cluster Memberships

Digital Twin không fit K-Means. Nó chỉ đọc cluster id đã có trong `learner_profiles`:

- `ability_cluster_id`
- `behavior_cluster_id`
- `interest_cluster_id`

Nếu có active cluster model, response kèm model version. Nếu learner vẫn cold start, cluster membership được đánh dấu `provisional=true`.

Không coi cluster là bản chất cố định của người học.

## Data Quality

`data_quality.confidence` là trung bình có clamp của:

- profile confidence
- event factor: `min(1, total_learning_events / 20)`
- state factor: `min(1, assessed_knowledge_count / 10)`

Các issue có thể gồm:

- `missing_learner_profile`
- `no_learning_events`
- `no_learner_knowledge_states`
- `some_knowledge_unassessed`
- `cold_start`

## Cache

Digital Twin có cache in-memory ngắn hạn theo `user_id`:

- TTL: `DIGITAL_TWIN_CACHE_TTL_SECONDS`
- default: `60`

Khi ghi learning event mới, service learning event gọi `invalidate_digital_twin_cache(user_id)`.

## Ranh giới AI

Digital Twin không gọi AI.

AI có thể được dùng ở các prompt khác để gắn nhãn, sinh câu hỏi hoặc diễn giải kết quả thuật toán, nhưng không được trực tiếp tính mastery, strength, weakness, level, forgetting risk hoặc difficulty range.

## File đã thêm/sửa

Thêm:

- `backend/app/personalization/schemas/digital_twin.py`
- `backend/app/personalization/services/digital_twin_service.py`
- `backend/app/personalization/api/digital_twin.py`
- `backend/tests/test_learner_digital_twin.py`

Sửa:

- `backend/app/core/config.py`
- `backend/app/personalization/repositories/mongo.py`
- `backend/app/personalization/api/__init__.py`
- `backend/app/personalization/services/__init__.py`
- `backend/app/personalization/schemas/__init__.py`
- `backend/app/personalization/services/learning_event_service.py`

## Hạn chế

- Forgetting risk là heuristic baseline, cần dữ liệu thật để hiệu chỉnh.
- Cluster distance chưa được tính lại trong Digital Twin; service chỉ trả distance nếu profile đã lưu.
- Digital Twin không thay thế recommendation/ranking.
- Người học mới sẽ có confidence thấp cho tới khi có đủ learning events và knowledge states.
