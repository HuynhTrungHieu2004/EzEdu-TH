# Prompt 11 - Personalization Frontend

## Scope

This step adds the first student-facing personalization UI without redesigning the existing React/Vite application. The page is protected by the existing authentication wrapper and uses the existing axios client, layout, CSS tokens, and sidebar navigation.

## Route

- `GET /personalization` in the frontend router renders `PersonalizationPage`.
- The route is wrapped by `ProtectedRoute`.
- The student sidebar includes a new `Cá nhân hóa` entry.

## Frontend Modules

- `frontend/src/pages/PersonalizationPage.tsx`
  - Learning overview.
  - Recommendation cards and feedback actions.
  - Knowledge map list.
  - Learning goals form.
  - Loading, empty, disabled, and retry states.
- `frontend/src/api/personalizationApi.ts`
  - `getMyPersonalizationProfile`
  - `getMyKnowledgeStates`
  - `getMyRecommendations`
  - `sendRecommendationFeedback`
  - `updateLearningGoals`
- `frontend/src/utils/personalizationUi.ts`
  - Deterministic display helpers for mastery wording, confidence labels, reason codes, status labels, and feature-disabled detection.

## API Integration

Frontend calls the existing personalization API under `/api/v1/personalization`:

- `GET /personalization/me`
- `GET /personalization/me/knowledge`
- `GET /personalization/recommendations/me`
- `POST /personalization/recommendations/me/feedback`

This step also adds a narrow backend endpoint:

- `PATCH /personalization/me/goals`

The endpoint uses the current authenticated user. The frontend never sends or chooses `user_id`.

## UI Behavior

The learning overview displays:

- Current level.
- Profile confidence with cautious wording.
- Strengths.
- Weaknesses.
- Unassessed count.
- At-risk knowledge.
- Learning goals.
- Recent progress.

Mastery is shown as an estimate, for example `Ước tính thành thạo 72%`. Low-evidence states are shown as limited data instead of firm conclusions.

Recommendation cards display:

- Item title.
- Item type.
- Difficulty label.
- Estimated duration.
- Recommendation reason.
- Related knowledge components.
- Start action.
- Feedback actions: not relevant, too easy, too hard.

The knowledge map is a responsive list/grid, not a graph visualization. It uses the model states:

- `mastered`
- `weak`
- `unassessed`
- `at_risk_of_forgetting`
- `uncertain` when returned by the API.

## Loading and Error States

The page handles:

- Loading skeleton.
- Empty profile data.
- Personalization disabled.
- Recommendation feature disabled.
- AI explanation unavailable.
- Network/API error with retry.
- Feedback failure without crashing the page.

## Privacy

The UI does not display:

- Internal centroids.
- Raw feature vectors.
- Raw AI prompts.
- Internal model secrets.
- Other users' data.

Cluster memberships and distances from the digital twin response are intentionally not surfaced in this first UI.

## Backend Goal Update

`PATCH /personalization/me/goals` updates only:

- `learning_goals`
- `preferred_subjects`
- `preferred_content_types`
- `preferred_explanation_style`
- `preferred_session_minutes`

It does not update mastery, ability, learner level, clusters, or recommendation scores. After saving, the digital twin cache is invalidated and a fresh current-user digital twin is returned.

## Tests

Frontend tests cover deterministic UI helpers and the feedback payload contract in the existing `test:chat` runner:

- Mastery estimate wording.
- Low/high confidence labels.
- Knowledge status labels.
- Recommendation reason labels.
- Preference input normalization.
- Feature-disabled error detection.
- Recommendation feedback payload type.

## Remaining Work

- Add full DOM component tests if the project adopts a React component test runner.
- Add visual regression screenshots if Playwright is introduced.
- Add a richer knowledge component display name once the backend returns human-readable names for all signals.
- Add route-specific navigation for question items when item metadata contains the target question set.
