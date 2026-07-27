import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorDetail } from '../api/errors';
import {
  personalizationApi,
  type KnowledgeSignal,
  type LearningGoalsUpdatePayload,
  type PersonalizationProfile,
  type RecommendationFeedbackType,
  type RecommendationItem,
  type RecommendationsResponse,
} from '../api/personalizationApi';
import {
  formatMasteryEstimate,
  formatPercentEstimate,
  isPersonalizationFeatureDisabled,
  knowledgeStatusLabel,
  profileConfidenceLabel,
  reasonCodeLabel,
  splitPreferenceInput,
} from '../utils/personalizationUi';

type GoalDraft = {
  learningGoals: string;
  preferredSubjects: string;
  preferredContentTypes: string;
  explanationStyle: LearningGoalsUpdatePayload['preferred_explanation_style'];
  sessionMinutes: number;
};

const DEFAULT_GOAL_DRAFT: GoalDraft = {
  learningGoals: '',
  preferredSubjects: '',
  preferredContentTypes: 'question, lesson',
  explanationStyle: 'normal',
  sessionMinutes: 30,
};

const subjectLabels: Record<string, string> = {
  toan: 'Toán',
  ngu_van: 'Ngữ văn',
  tieng_anh: 'Tiếng Anh',
  vat_li: 'Vật lí',
  hoa_hoc: 'Hóa học',
  sinh_hoc: 'Sinh học',
  lich_su: 'Lịch sử',
  dia_li: 'Địa lí',
  gdktpl: 'GDKT&PL',
  tin_hoc: 'Tin học',
  cong_nghe: 'Công nghệ',
};

function firstReason(item: RecommendationItem) {
  return item.explanation?.short_reason || item.reason_codes.map(reasonCodeLabel).join(', ') || 'Phù hợp với hồ sơ học tập hiện tại.';
}

function signalTitle(signal: KnowledgeSignal) {
  return `KC ${signal.knowledge_component_id}`;
}

function difficultyLabel(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Chưa rõ';
  if (value < 0.34) return 'Dễ';
  if (value < 0.67) return 'Trung bình';
  return 'Khó';
}

function durationLabel(seconds?: number | null) {
  if (!seconds) return 'Chưa ước tính';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} phút`;
}

function combinationLabel(code: string) {
  return code.startsWith('N') ? `Tổ hợp mới ${code.replace(/^\D+/, '')}` : code;
}

function profileToDraft(profile: PersonalizationProfile): GoalDraft {
  return {
    learningGoals: profile.learning_goals.join(', '),
    preferredSubjects: profile.content_preferences.preferred_subjects.join(', '),
    preferredContentTypes: profile.content_preferences.preferred_content_types.join(', ') || DEFAULT_GOAL_DRAFT.preferredContentTypes,
    explanationStyle: (profile.content_preferences.preferred_explanation_style as GoalDraft['explanationStyle']) || 'normal',
    sessionMinutes: profile.content_preferences.preferred_session_minutes || DEFAULT_GOAL_DRAFT.sessionMinutes,
  };
}

function KnowledgeSignalList({ title, items, emptyText }: { title: string; items: KnowledgeSignal[]; emptyText: string }) {
  return (
    <section className="personalization-panel">
      <div className="personalization-panel-header">
        <h3>{title}</h3>
        <span className="tag">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="personalization-muted">{emptyText}</p>
      ) : (
        <div className="knowledge-signal-list">
          {items.slice(0, 5).map((item) => (
            <article key={`${title}-${item.knowledge_component_id}`} className={`knowledge-signal knowledge-signal-${item.status}`}>
              <div>
                <strong>{signalTitle(item)}</strong>
                <span>{knowledgeStatusLabel(item.status)}</span>
              </div>
              <p>{formatMasteryEstimate(item.mastery_probability)} · {profileConfidenceLabel(item.confidence)}</p>
              <small>{item.reason}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RecommendationCard({
  item,
  onFeedback,
  busy,
}: {
  item: RecommendationItem;
  onFeedback: (item: RecommendationItem, feedbackType: RecommendationFeedbackType) => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const hasDestination = Boolean(item.source_document?.id);

  const startItem = () => {
    onFeedback(item, 'clicked');
    if (item.source_document?.id) {
      navigate(`/documents/${item.source_document.id}`);
    }
  };

  return (
    <article className="recommendation-card">
      <div className="recommendation-card-top">
        <div>
          <p className="eyebrow">{item.item_type}</p>
          <h3>{item.title}</h3>
        </div>
        <span className="tag">{difficultyLabel(item.difficulty)}</span>
      </div>
      {item.preview && <p className="recommendation-preview">{item.preview}</p>}
      <div className="recommendation-meta">
        <span>{durationLabel(item.estimated_duration)}</span>
        <span>{formatPercentEstimate(item.explanation?.confidence, 'Giải thích theo mẫu')}</span>
      </div>
      <p className="recommendation-reason">{firstReason(item)}</p>
      <div className="tag-row">
        {item.reason_codes.slice(0, 3).map((reason) => (
          <span key={`${item.item_id}-${reason}`} className="tag">{reasonCodeLabel(reason)}</span>
        ))}
      </div>
      <div className="knowledge-chip-row">
        {item.knowledge_components.slice(0, 4).map((component) => (
          <span key={`${item.item_id}-${component.id}`} className="knowledge-chip">
            {component.name || component.id}
          </span>
        ))}
      </div>
      {!item.explanation && (
        <div className="alert alert-error">Giải thích AI chưa khả dụng. Hệ thống đang dùng lý do đề xuất theo rule.</div>
      )}
      <div className="recommendation-actions">
        <button type="button" className="btn-primary" onClick={startItem} disabled={busy || !hasDestination}>
          Bắt đầu
        </button>
        <button type="button" className="btn-secondary" onClick={() => onFeedback(item, 'not_relevant')} disabled={busy}>
          Không phù hợp
        </button>
        <button type="button" className="btn-secondary" onClick={() => onFeedback(item, 'too_easy')} disabled={busy}>
          Quá dễ
        </button>
        <button type="button" className="btn-secondary" onClick={() => onFeedback(item, 'too_hard')} disabled={busy}>
          Quá khó
        </button>
      </div>
    </article>
  );
}

export default function PersonalizationPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PersonalizationProfile | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [recommendationsDisabled, setRecommendationsDisabled] = useState(false);
  const [feedbackBusyId, setFeedbackBusyId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(DEFAULT_GOAL_DRAFT);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalMessage, setGoalMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeatureDisabled(false);
    setRecommendationsDisabled(false);
    try {
      const [profileData, knowledgeResult, recommendationResult] = await Promise.allSettled([
        personalizationApi.getMyPersonalizationProfile(),
        personalizationApi.getMyKnowledgeStates(),
        personalizationApi.getMyRecommendations(),
      ]);

      if (profileData.status === 'rejected') {
        if (isPersonalizationFeatureDisabled(profileData.reason)) {
          setFeatureDisabled(true);
          setProfile(null);
          setRecommendations(null);
          return;
        }
        throw profileData.reason;
      }

      setProfile(profileData.value);
      setGoalDraft(profileToDraft(profileData.value));

      if (knowledgeResult.status === 'fulfilled') {
        setProfile((current) => current ? {
          ...current,
          strengths: knowledgeResult.value.strengths,
          weaknesses: knowledgeResult.value.weaknesses,
          prerequisite_gaps: knowledgeResult.value.prerequisite_gaps,
          at_risk_knowledge: knowledgeResult.value.at_risk_knowledge,
          data_quality: knowledgeResult.value.data_quality,
        } : current);
      }

      if (recommendationResult.status === 'fulfilled') {
        setRecommendations(recommendationResult.value);
      } else if (isPersonalizationFeatureDisabled(recommendationResult.reason)) {
        setRecommendationsDisabled(true);
        setRecommendations(null);
      }
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Không tải được dữ liệu cá nhân hóa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const unassessedCount = profile?.data_quality.unassessed_knowledge_count ?? 0;
  const knowledgeMap = useMemo(() => {
    if (!profile) return [];
    return [
      ...profile.strengths.map((item) => ({ ...item, status: 'mastered' as const })),
      ...profile.weaknesses,
      ...profile.prerequisite_gaps,
      ...profile.at_risk_knowledge,
    ];
  }, [profile]);

  const sendFeedback = async (item: RecommendationItem, feedbackType: RecommendationFeedbackType) => {
    if (!item.recommendation_log_id) {
      setFeedbackMessage('Chưa có mã log đề xuất để ghi nhận phản hồi.');
      return;
    }
    setFeedbackBusyId(item.item_id);
    setFeedbackMessage(null);
    try {
      await personalizationApi.sendRecommendationFeedback({
        recommendation_log_id: item.recommendation_log_id,
        item_id: item.item_id,
        feedback_type: feedbackType,
      });
      setFeedbackMessage('Đã ghi nhận phản hồi.');
    } catch (err) {
      setFeedbackMessage(getApiErrorDetail(err) ?? 'Chưa gửi được phản hồi, bạn có thể thử lại.');
    } finally {
      setFeedbackBusyId(null);
    }
  };

  const saveGoals = async () => {
    setGoalSaving(true);
    setGoalMessage(null);
    const minutes = Number(goalDraft.sessionMinutes);
    const payload: LearningGoalsUpdatePayload = {
      learning_goals: splitPreferenceInput(goalDraft.learningGoals),
      preferred_subjects: splitPreferenceInput(goalDraft.preferredSubjects),
      preferred_content_types: splitPreferenceInput(goalDraft.preferredContentTypes),
      preferred_explanation_style: goalDraft.explanationStyle,
      preferred_session_minutes: Number.isFinite(minutes) ? Math.max(1, Math.min(240, Math.round(minutes))) : null,
    };
    try {
      const updated = await personalizationApi.updateLearningGoals(payload);
      setProfile(updated);
      setGoalDraft(profileToDraft(updated));
      setGoalMessage('Đã lưu mục tiêu học tập.');
    } catch (err) {
      setGoalMessage(getApiErrorDetail(err) ?? 'Không lưu được mục tiêu học tập.');
    } finally {
      setGoalSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-wide">
          <div className="personalization-skeleton" aria-label="Đang tải cá nhân hóa">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  if (featureDisabled) {
    return (
      <div className="page">
        <div className="page-wide">
          <section className="welcome-panel">
            <div>
              <p className="eyebrow">Cá nhân hóa</p>
              <h2>Hệ thống cá nhân hóa đang tắt</h2>
              <p>Backend trả về trạng thái disabled, nên giao diện không hiển thị dữ liệu hồ sơ hoặc đề xuất.</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-wide">
          <div className="alert alert-error">{error}</div>
          <button type="button" className="btn-secondary" onClick={() => void loadData()}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <div className="page-wide">
          <div className="empty-state">Chưa có dữ liệu cá nhân hóa cho tài khoản hiện tại.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-wide personalization-page">
        <div className="page-header">
          <div>
            <p className="eyebrow">Hồ sơ học tập cá nhân</p>
            <h2 className="section-title">Tổng quan học tập</h2>
            <p className="section-subtitle">
              Các chỉ số dưới đây là ước tính từ dữ liệu làm bài và hành vi học tập, không phải kết luận tuyệt đối.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void loadData()}>
            Làm mới
          </button>
        </div>

        <section className="personalization-hero">
          <div>
            <span className="dashboard-kicker">ME</span>
            <h3>{profile.current_level || 'Chưa xác định trình độ'}</h3>
            <p>{profileConfidenceLabel(profile.profile_confidence)} · {formatPercentEstimate(profile.profile_confidence)}</p>
          </div>
          <div className="personalization-metrics">
            <span><strong>{profile.recent_progress.question_answered_count}</strong><small>Câu đã trả lời gần đây</small></span>
            <span><strong>{formatPercentEstimate(profile.behavior_summary.recent_accuracy)}</strong><small>Độ chính xác gần đây</small></span>
            <span><strong>{unassessedCount}</strong><small>Kiến thức chưa đánh giá</small></span>
          </div>
        </section>

        <section className="personalization-grid">
          <KnowledgeSignalList title="Điểm mạnh" items={profile.strengths} emptyText="Chưa đủ bằng chứng để xác định điểm mạnh." />
          <KnowledgeSignalList title="Điểm yếu" items={profile.weaknesses} emptyText="Chưa có điểm yếu đủ tin cậy. Dữ liệu ít sẽ được xem là chưa chắc chắn." />
          <KnowledgeSignalList title="Nguy cơ quên" items={profile.at_risk_knowledge} emptyText="Chưa có kiến thức nào cần ôn theo heuristic hiện tại." />
          <section className="personalization-panel">
            <div className="personalization-panel-header">
              <h3>Mục tiêu & tiến bộ</h3>
              <span className="tag">{profile.learning_goals.length} mục tiêu</span>
            </div>
            <div className="tag-row">
              {profile.learning_goals.length ? profile.learning_goals.map((goal) => <span key={goal} className="tag">{goal}</span>) : <span className="personalization-muted">Bạn chưa khai báo mục tiêu.</span>}
            </div>
            <p className="personalization-muted">
              Hoàn thành gần đây: {profile.recent_progress.completed_count} · Lần hoạt động cuối: {profile.recent_progress.last_active_at ? new Date(profile.recent_progress.last_active_at).toLocaleString('vi-VN') : 'chưa có'}
            </p>
          </section>
          <section className="personalization-panel">
            <div className="personalization-panel-header">
              <h3>Hồ sơ ban đầu</h3>
              <button type="button" className="text-link" onClick={() => navigate('/student-onboarding')}>
                Chỉnh sửa
              </button>
            </div>
            <div className="tag-row">
              {profile.grade_level && <span className="tag">Lớp {profile.grade_level}</span>}
              {profile.target_exam_combinations.map((code) => <span key={code} className="tag">{combinationLabel(code)}</span>)}
            </div>
            <p className="personalization-muted">
              Điểm mạnh: {profile.strong_subjects.length ? profile.strong_subjects.map((id) => subjectLabels[id] || id).join(', ') : 'chưa khai báo'}
            </p>
            <p className="personalization-muted">
              Cần củng cố: {profile.weak_subjects.length ? profile.weak_subjects.map((id) => subjectLabels[id] || id).join(', ') : 'chưa khai báo'}
            </p>
          </section>
        </section>

        <section className="personalization-section">
          <div className="personalization-section-title">
            <h3>Đề xuất cho bạn</h3>
            <span className="tag">{recommendations?.items.length ?? 0} nội dung</span>
          </div>
          {recommendationsDisabled && (
            <div className="empty-state">Recommendation feature đang tắt trên backend.</div>
          )}
          {feedbackMessage && <div className="alert alert-success">{feedbackMessage}</div>}
          {!recommendationsDisabled && (!recommendations || recommendations.items.length === 0) && (
            <div className="empty-state">Chưa có candidate đủ điều kiện để đề xuất.</div>
          )}
          {recommendations?.items.length ? (
            <div className="recommendation-grid">
              {recommendations.items.map((item) => (
                <RecommendationCard
                  key={`${item.recommendation_log_id}-${item.item_id}`}
                  item={item}
                  busy={feedbackBusyId === item.item_id}
                  onFeedback={(selected, feedbackType) => void sendFeedback(selected, feedbackType)}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="personalization-section">
          <div className="personalization-section-title">
            <h3>Bản đồ kiến thức</h3>
            <span className="tag">{profile.data_quality.assessed_knowledge_count} đã đánh giá</span>
          </div>
          <div className="knowledge-map">
            {knowledgeMap.slice(0, 16).map((item) => (
              <article key={`map-${item.status}-${item.knowledge_component_id}`} className={`knowledge-map-node knowledge-map-${item.status}`}>
                <strong>{signalTitle(item)}</strong>
                <span>{knowledgeStatusLabel(item.status)}</span>
                <small>{formatMasteryEstimate(item.mastery_probability)}</small>
              </article>
            ))}
            {unassessedCount > 0 && (
              <article className="knowledge-map-node knowledge-map-unassessed">
                <strong>{unassessedCount} KC</strong>
                <span>Chưa đánh giá</span>
                <small>Cần thêm bài làm để đánh giá</small>
              </article>
            )}
            {!knowledgeMap.length && unassessedCount === 0 && (
              <div className="empty-state">Chưa có Knowledge Component nào trong hồ sơ học tập.</div>
            )}
          </div>
        </section>

        <section className="personalization-section">
          <div className="personalization-section-title">
            <h3>Mục tiêu học tập</h3>
            <span className="tag">Frontend không tính learner model</span>
          </div>
          <div className="goals-form">
            <label className="form-group">
              <span className="form-label">Mục tiêu</span>
              <input className="form-input" value={goalDraft.learningGoals} onChange={(event) => setGoalDraft({ ...goalDraft, learningGoals: event.target.value })} placeholder="Ví dụ: đạo hàm, xác suất, ôn thi cuối kỳ" />
            </label>
            <label className="form-group">
              <span className="form-label">Môn/chủ đề ưu tiên</span>
              <input className="form-input" value={goalDraft.preferredSubjects} onChange={(event) => setGoalDraft({ ...goalDraft, preferredSubjects: event.target.value })} placeholder="Toán, Vật lý, Lập trình" />
            </label>
            <label className="form-group">
              <span className="form-label">Kiểu nội dung</span>
              <input className="form-input" value={goalDraft.preferredContentTypes} onChange={(event) => setGoalDraft({ ...goalDraft, preferredContentTypes: event.target.value })} />
            </label>
            <label className="form-group">
              <span className="form-label">Kiểu giải thích</span>
              <select className="form-select" value={goalDraft.explanationStyle} onChange={(event) => setGoalDraft({ ...goalDraft, explanationStyle: event.target.value as GoalDraft['explanationStyle'] })}>
                <option value="normal">Cân bằng</option>
                <option value="concise">Ngắn gọn</option>
                <option value="detailed">Chi tiết</option>
                <option value="beginner">Cho người mới</option>
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">Thời lượng buổi học</span>
              <input className="form-input" type="number" min={1} max={240} value={goalDraft.sessionMinutes} onChange={(event) => setGoalDraft({ ...goalDraft, sessionMinutes: Number(event.target.value) })} />
            </label>
            <div className="goals-form-actions">
              <button type="button" className="btn-primary" onClick={() => void saveGoals()} disabled={goalSaving}>
                {goalSaving ? 'Đang lưu...' : 'Lưu mục tiêu'}
              </button>
              {goalMessage && <span className="personalization-muted">{goalMessage}</span>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
