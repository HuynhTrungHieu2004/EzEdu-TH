# 10 - Recommendation API and AI Explanation

## Mục tiêu

Bước này tạo API recommendation cho frontend và bổ sung AI explanation có kiểm soát.

Quyết định item được đề xuất đã hoàn tất ở Candidate Generator, Ranker và Re-ranker trước khi AI được gọi. AI chỉ diễn giải lý do đã có, không được thay đổi danh sách item, final score, prerequisite, mastery hoặc số liệu.

## API

Router personalization được mount dưới `/api/v1/personalization`.

Endpoint mới:

```text
GET  /api/v1/personalization/recommendations/me
POST /api/v1/personalization/recommendations/me/feedback
GET  /api/v1/personalization/recommendations/me/history
```

Các endpoint dùng current authenticated user. Public API không nhận tùy ý `user_id`.

Endpoint bị ẩn nếu một trong hai flag tắt:

- `PERSONALIZATION_ENABLED`
- `RECOMMENDATION_ENABLED`

AI explanation chỉ bật nếu:

- `AI_RECOMMENDATION_EXPLANATION_ENABLED=true`

Nếu flag AI tắt hoặc provider lỗi, API vẫn trả recommendation bằng template deterministic.

## Response item

Mỗi item trong `GET /recommendations/me` gồm:

- `recommendation_log_id`
- `item_id`
- `item_type`
- `title`
- `preview`
- `difficulty`
- `knowledge_components`
- `final_score`
- `reason_codes`
- `explanation`
- `source_document`
- `estimated_duration`
- `model_versions`
- `generated_at`

`final_score` hiện được trả về để hỗ trợ kiểm thử và nội bộ. Nếu frontend production không nên hiển thị điểm này, có thể ẩn ở tầng UI hoặc thêm cấu hình response sau.

## Luồng xử lý

```text
GET /recommendations/me
        |
        v
recommend_for_user()
        |
        +--> Candidate Generator
        +--> Ranker
        +--> Re-ranker
        +--> Recommendation log
        |
        v
Enrich item metadata
        |
        v
AI explanation if enabled
        |
        v
Fallback template if AI disabled or invalid
        |
        v
Frontend response
```

## AI input tối thiểu

Prompt AI chỉ nhận dữ liệu đã lọc ownership và đã tối giản:

- `reason_codes`
- mastery liên quan của các KC trong item nếu có trong Digital Twin
- `difficulty_fit`
- `prerequisite_state`
- `learning_goals`
- item metadata: type, title, difficulty, estimated duration
- knowledge component id/name
- source document id/title
- language
- explanation style

Không truyền:

- email
- full name
- raw event history
- raw answer
- token/password
- dữ liệu nhận dạng không cần thiết
- dữ liệu user khác

## AI output schema

AI phải trả JSON:

```json
{
  "short_reason": "...",
  "learning_objective": "...",
  "expected_benefit": "...",
  "suggested_action": "...",
  "confidence": 0.0
}
```

Backend validate bằng Pydantic:

- text không rỗng
- mỗi text tối đa 500 ký tự
- `confidence` trong `[0,1]`

## Validation chống hallucination

Backend không chấp nhận AI output nếu:

- JSON sai schema
- text chứa số liệu tự tạo
- text chứa tuyên bố tuyệt đối kiểu guaranteed/diagnosis
- text có dấu hiệu nhắc số mastery không do backend kiểm soát

Khi invalid, dùng fallback deterministic từ reason code.

## Fallback explanation

Fallback không gọi AI và dùng reason code:

- `IMPROVE_WEAK_SKILL`: luyện kỹ năng đang cần củng cố
- `REVIEW_BEFORE_FORGETTING`: ôn kiến thức có nguy cơ quên
- `FILL_PREREQUISITE_GAP`: lấp khoảng trống tiên quyết
- `MATCH_LEARNING_GOAL`: phù hợp mục tiêu học tập
- `SUITABLE_DIFFICULTY`: phù hợp vùng độ khó
- `CONTINUE_LEARNING_PATH`: tiếp nối lộ trình học
- `EXPLORE_RELATED_TOPIC`: khám phá chủ đề liên quan an toàn

## Feedback API

`POST /recommendations/me/feedback`

Payload:

```json
{
  "recommendation_log_id": "...",
  "item_id": "...",
  "feedback_type": "clicked"
}
```

Feedback types:

- `clicked`
- `skipped`
- `completed`
- `too_easy`
- `too_hard`
- `not_relevant`
- `helpful`
- `not_helpful`

Quy tắc:

- Recommendation log phải thuộc current user.
- `item_id` phải khớp log.
- Cùng một feedback type trên cùng log là idempotent.
- Lưu timestamp phía server.
- Nếu `BANDIT_ENABLED=false`, feedback chưa cập nhật bandit policy.

## History API

`GET /recommendations/me/history`

Chỉ trả logs của current user:

- `recommendation_log_id`
- `item_id`
- `candidate_sources`
- `component_scores`
- `final_score`
- `rank_position`
- `reason_codes`
- `generated_at`
- `feedback`

Không có API public trả toàn bộ recommendation history của mọi user.

## Cache

Recommendation API có cache in-memory ngắn hạn theo:

- user
- limit
- language
- explanation style

Default:

- `RECOMMENDATION_CACHE_TTL_SECONDS=60`

Cache được invalidate khi ghi learning event mới. Đây là điểm hiện tại để bắt các thay đổi do người dùng trả lời câu hỏi, learner model update sau event, và tiến độ học mới.

Các thay đổi learning goal hoặc item disabled cần gọi `invalidate_recommendation_cache(user_id)` từ service cập nhật tương ứng khi các flow đó được triển khai.

## File đã thêm/sửa

Thêm:

- `backend/app/personalization/services/recommendation_api_service.py`
- `backend/tests/test_recommendation_api_explanation.py`
- `docs/personalization/10-recommendation-api-ai-explanation.md`

Sửa:

- `backend/app/core/config.py`
- `backend/.env.example`
- `backend/app/personalization/repositories/mongo.py`
- `backend/app/personalization/schemas/recommendations.py`
- `backend/app/personalization/services/recommendation_ranking_service.py`
- `backend/app/personalization/services/learning_event_service.py`
- `backend/app/personalization/services/__init__.py`
- `backend/app/personalization/schemas/__init__.py`
- `backend/app/personalization/api/recommendations.py`

## Hạn chế

- AI explanation hiện là diễn giải ngắn có schema, chưa có prompt đa ngôn ngữ sâu.
- Validator đang reject mọi chữ số trong text AI để tránh số liệu bịa; nếu sau này muốn cho phép số liệu, cần whitelist số được backend truyền vào.
- Cache invalidation cho learning goal/item disabled cần nối vào các flow update tương ứng khi có API chỉnh goals hoặc disable item.
- Feedback chưa cập nhật Contextual Bandit khi `BANDIT_ENABLED=false`.
