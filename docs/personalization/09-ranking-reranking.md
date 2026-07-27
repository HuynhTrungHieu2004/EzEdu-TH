# 09 - Ranking and Re-ranking

## Mục tiêu

Ranker nhận danh sách candidate từ Candidate Generator và tạo danh sách recommendation có thể giải thích. Bước này chưa dùng Learning-to-Rank, chưa dùng Contextual Bandit và không gọi API AI.

## API

Router personalization được mount dưới `/api/v1/personalization`.

Endpoint mới:

```text
GET /api/v1/personalization/recommendations
```

Endpoint chỉ dùng current authenticated user. Public API không nhận tùy ý `user_id`.

Endpoint bị ẩn nếu một trong hai flag tắt:

- `PERSONALIZATION_ENABLED`
- `RECOMMENDATION_ENABLED`

## Service

Service nội bộ:

```text
recommend_for_user(user_id, limit, context)
```

Luồng:

```text
Candidate Generator
        |
        v
Hard constraints
        |
        v
Component scoring [0,1]
        |
        v
Weighted final score
        |
        v
Rank before re-ranking
        |
        v
Greedy diversity re-ranking
        |
        v
Recommendation logs
```

## Component Scores

Ranker tính 10 điểm chuẩn hóa `[0,1]`:

- `weakness_match`
- `difficulty_fit`
- `prerequisite_readiness`
- `forgetting_need`
- `goal_match`
- `interest_match`
- `cluster_match`
- `quality_score`
- `novelty_score`
- `continuity_score`

## Công thức final score

```text
final_score =
  weakness_match * weight_weakness_match
+ difficulty_fit * weight_difficulty_fit
+ prerequisite_readiness * weight_prerequisite_readiness
+ forgetting_need * weight_forgetting_need
+ goal_match * weight_goal_match
+ interest_match * weight_interest_match
+ cluster_match * weight_cluster_match
+ quality_score * weight_quality_score
+ novelty_score * weight_novelty_score
+ continuity_score * weight_continuity_score
```

Kết quả được clamp vào `[0,1]`.

## Trọng số mặc định

Trọng số được cấu hình tập trung trong `Settings` và `.env.example`:

- `weakness_match`: `0.25`
- `difficulty_fit`: `0.20`
- `prerequisite_readiness`: `0.15`
- `forgetting_need`: `0.15`
- `goal_match`: `0.10`
- `interest_match`: `0.05`
- `cluster_match`: `0.0`
- `quality_score`: `0.10`
- `novelty_score`: `0.0`
- `continuity_score`: `0.0`

Validator bắt buộc tổng trọng số bằng `1.0`.

## Cách tính từng điểm

`weakness_match`: dựa trên overlap Knowledge Component với `twin.weaknesses`, mastery gap và confidence. Nếu không có state chi tiết thì dùng candidate source score `weak_knowledge`.

`difficulty_fit`: bằng `1.0` nếu difficulty nằm trong `recommended_difficulty_range`. Nếu lệch ngoài range, giảm tuyến tính theo `RANKER_SAFE_DIFFICULTY_MARGIN`.

`prerequisite_readiness`:

- `satisfied`: `1.0`
- `minor_gap`: `0.6`
- `unknown`: `0.5`
- `severe_gap`: `0.0`

`forgetting_need`: lấy forgetting risk từ `twin.at_risk_knowledge` hoặc source score `forgetting_review`.

`goal_match`: source score `current_learning_goal`.

`interest_match`: source score `learner_interest`.

`cluster_match`: source score `cluster_match`.

`quality_score`: normalized quality score của candidate/item.

`novelty_score`: `1.0` nếu chưa seen gần đây, `0.0` nếu recently seen.

`continuity_score`: source score `continue_current_path`.

## Hard Constraints

Item bị loại trước ranking nếu:

- Không tồn tại trong accessible learning item pool.
- Không đủ quyền vì item thuộc document user không sở hữu.
- `verification_status` là `rejected`, `failed`, hoặc `verification_failed`.
- `prerequisite_status` là `severe_gap`.
- Difficulty vượt `recommended_difficulty_range +/- RANKER_SAFE_DIFFICULTY_MARGIN`.
- Item bị khóa: `locked=true` hoặc status `locked`, `archived`, `deleted`.
- Quality thấp hơn `CANDIDATE_MIN_QUALITY_SCORE`.
- Candidate trùng `item_id`.

## Re-ranking

Re-ranker hiện dùng greedy diversity:

1. Bắt đầu từ danh sách đã sort theo final score.
2. Chọn item tốt nhất không vi phạm giới hạn diversity gần nhất.
3. Nếu tất cả item còn lại đều vi phạm, lấy item tốt nhất còn lại để tránh trả thiếu vô lý.

Giới hạn mặc định:

- `RERANK_MAX_SAME_KNOWLEDGE_COMPONENT=2`
- `RERANK_MAX_SAME_QUESTION_CLUSTER=2`
- `RERANK_MAX_SAME_ITEM_TYPE=2`

Mục tiêu:

- Không quá nhiều item liên tiếp cùng Knowledge Component.
- Không quá nhiều item liên tiếp cùng question/content cluster.
- Không lặp item type quá lâu.
- Cho phép continuity nhưng không để continuity nuốt hết diversity.

Tỷ lệ 50-60% điểm yếu, 15-25% ôn tập, 10-20% mục tiêu, 5-10% exploration sẽ được kiểm soát chặt hơn ở bước ranker nâng cao hoặc policy layer. Bước này đã giữ source provenance và reason codes để chuẩn bị cho phần đó.

## Reason Codes

Không dùng AI.

Reason codes hiện có:

- `IMPROVE_WEAK_SKILL`
- `REVIEW_BEFORE_FORGETTING`
- `FILL_PREREQUISITE_GAP`
- `MATCH_LEARNING_GOAL`
- `SUITABLE_DIFFICULTY`
- `CONTINUE_LEARNING_PATH`
- `EXPLORE_RELATED_TOPIC`

## Recommendation Logging

Mỗi recommendation được ghi vào `recommendation_logs`:

- `candidate_sources`
- `component_scores`
- `final_score`
- `rank_position` là rank sau re-ranking
- `feature_snapshot.rank_before_rerank`
- `feature_snapshot.rank_after_rerank`
- `reason_codes`
- `learner_model_version`
- `ranking_model_version`
- `bandit_policy_version`

`shown=false`, `clicked=false`, `completed=false` ở thời điểm tạo recommendation. Các event sau sẽ cập nhật/ghi nhận bằng learning events hoặc flow recommendation tracking ở prompt sau.

## File đã thêm/sửa

Thêm:

- `backend/app/personalization/schemas/recommendations.py`
- `backend/app/personalization/services/recommendation_ranking_service.py`
- `backend/app/personalization/api/recommendations.py`
- `backend/tests/test_recommendation_ranking.py`

Sửa:

- `backend/app/core/config.py`
- `backend/.env.example`
- `backend/app/personalization/api/__init__.py`
- `backend/app/personalization/services/__init__.py`
- `backend/app/personalization/schemas/__init__.py`

## Hạn chế

- Chưa có Learning-to-Rank.
- Chưa dùng Contextual Bandit.
- Re-ranking allocation theo tỷ lệ nguồn mới ở mức mềm thông qua diversity/provenance; chưa có optimizer phân bổ nguồn.
- Reason codes deterministic, chưa có AI diễn giải tự nhiên.
