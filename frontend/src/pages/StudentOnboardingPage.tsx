import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import {
  personalizationApi,
  type StudentOnboardingOptions,
  type StudentOnboardingPayload,
} from '../api/personalizationApi';
import { Alert, Button, Card, CardBody, ProgressSteps, Skeleton } from '../components/ui';
import type { ProgressStep } from '../components/ui';
import './student-onboarding.css';

const DRAFT_KEY = 'ez-student-onboarding-draft';

const emptyDraft: StudentOnboardingPayload = {
  grade_level: 12,
  strong_subjects: [],
  weak_subjects: [],
  target_exam_combinations: [],
};

const STEPS = [
  { id: 'grade', label: 'Lớp hiện tại', description: 'Bạn đang học lớp mấy?' },
  { id: 'strong', label: 'Điểm mạnh', description: 'Môn bạn đang tự tin' },
  { id: 'weak', label: 'Điểm yếu', description: 'Môn muốn cải thiện' },
  { id: 'target', label: 'Tổ hợp ôn thi', description: 'Khối hoặc tổ hợp bạn nhắm tới' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function groupCombinations(options: StudentOnboardingOptions['exam_combinations']) {
  return options.reduce<Record<string, StudentOnboardingOptions['exam_combinations']>>((groups, item) => {
    const key = item.group || 'Khác';
    groups[key] = [...(groups[key] || []), item];
    return groups;
  }, {});
}

function combinationTitle(code: string, group: string) {
  return group === 'Mới' ? `Tổ hợp mới ${code.replace(/^\D+/, '')}` : code;
}

/** Nháp lưu ở máy sau mỗi bước; server chỉ nhận hồ sơ khi đã đủ dữ liệu hợp lệ. */
function readDraft(): StudentOnboardingPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudentOnboardingPayload>;
    if (typeof parsed.grade_level !== 'number') return null;
    return {
      grade_level: parsed.grade_level as StudentOnboardingPayload['grade_level'],
      strong_subjects: Array.isArray(parsed.strong_subjects) ? parsed.strong_subjects : [],
      weak_subjects: Array.isArray(parsed.weak_subjects) ? parsed.weak_subjects : [],
      target_exam_combinations: Array.isArray(parsed.target_exam_combinations)
        ? parsed.target_exam_combinations
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Thiết lập hồ sơ học sinh theo từng bước (spec §6.3).
 *
 * Trước đây là một form dài: cuộn hết bốn nhóm lựa chọn rồi mới bấm lưu, không
 * thấy mình đang ở đâu, và tải lại trang là mất sạch lựa chọn. Nay là stepper
 * bốn bước, đi lui được, và mỗi bước ghi nháp vào `localStorage` nên đóng tab
 * hay bấm "Để sau" rồi quay lại vẫn còn nguyên.
 *
 * `ponytail:` nháp nằm ở máy người dùng, không lưu server. Backend yêu cầu
 * `target_exam_combinations` có ít nhất một phần tử nên hồ sơ dở dang không
 * ghi vào hồ sơ thật được; muốn lưu nháp phía server phải thêm chỗ chứa riêng.
 */
export default function StudentOnboardingPage() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<StudentOnboardingOptions | null>(null);
  const [draft, setDraft] = useState<StudentOnboardingPayload>(emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOnboarding() {
      setLoading(true);
      setError(null);
      try {
        const user = await authApi.getMe();
        if (user.role !== 'student') {
          navigate('/dashboard', { replace: true });
          return;
        }

        const [optionsData, savedProfile] = await Promise.all([
          personalizationApi.getStudentOnboardingOptions(),
          personalizationApi.getMyStudentOnboarding(),
        ]);

        if (cancelled) return;
        setOptions(optionsData);
        // Hồ sơ đã lưu trên server thắng nháp ở máy; không có thì dùng nháp.
        if (savedProfile?.onboarding_completed) {
          setDraft({
            grade_level: savedProfile.grade_level,
            strong_subjects: savedProfile.strong_subjects,
            weak_subjects: savedProfile.weak_subjects,
            target_exam_combinations: savedProfile.target_exam_combinations,
          });
        } else {
          const stored = readDraft();
          if (stored) setDraft(stored);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorDetail(err) ?? 'Chưa tải được bảng thiết lập học tập. Vui lòng thử lại.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOnboarding();
    return () => { cancelled = true; };
  }, [navigate]);

  const persistDraft = useCallback((next: StudentOnboardingPayload) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // Trình duyệt chặn storage thì chỉ mất nháp, không chặn thao tác.
    }
  }, []);

  const updateDraft = useCallback(
    (updater: (current: StudentOnboardingPayload) => StudentOnboardingPayload) => {
      setStepError(null);
      setDraft((current) => {
        const next = updater(current);
        persistDraft(next);
        return next;
      });
    },
    [persistDraft],
  );

  const availableWeakSubjects = useMemo(
    () => (options?.subjects || []).filter((subject) => !draft.strong_subjects.includes(subject.id)),
    [draft.strong_subjects, options],
  );

  const combinationGroups = useMemo(
    () => groupCombinations(options?.exam_combinations || []),
    [options],
  );

  const currentStep: StepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

  const steps: ProgressStep[] = STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    description: step.description,
    status: index === stepIndex ? 'active' : index < stepIndex ? 'done' : 'pending',
  }));

  /** Chỉ hai bước có ràng buộc thật: lớp và tổ hợp. Hai bước môn được phép bỏ trống. */
  function validateStep(): boolean {
    if (currentStep === 'grade' && !draft.grade_level) {
      setStepError('Hãy chọn lớp hiện tại của bạn.');
      return false;
    }
    if (currentStep === 'target' && draft.target_exam_combinations.length === 0) {
      setStepError('Hãy chọn ít nhất một khối hoặc tổ hợp môn muốn ôn.');
      return false;
    }
    setStepError(null);
    return true;
  }

  async function handleNext() {
    if (!validateStep()) return;
    if (!isLastStep) {
      setStepIndex((index) => index + 1);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await personalizationApi.updateMyStudentOnboarding(draft);
      localStorage.removeItem(DRAFT_KEY);
      navigate('/published-questions', { replace: true });
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Chưa lưu được hồ sơ học tập. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="ez-onboarding" aria-label="Đang tải hồ sơ học tập">
        <Card>
          <CardBody className="ez-stack">
            <Skeleton height="2rem" width="50%" />
            <Skeleton height="1rem" width="70%" />
            <Skeleton height="14rem" />
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="ez-onboarding">
      <Card>
        <CardBody>
          <header className="ez-onboarding-head">
            <p className="ez-page-eyebrow">Thiết lập cho học sinh</p>
            <h1 className="ez-onboarding-title">Cá nhân hóa lộ trình ôn tập</h1>
            <p className="ez-onboarding-sub">
              Bốn bước ngắn để EzEdu AI ưu tiên đúng lớp, đúng môn và đúng tổ hợp bạn nhắm tới.
              Lựa chọn được giữ lại nếu bạn quay lại sau.
            </p>
          </header>

          <ProgressSteps steps={steps} className="ez-onboarding-steps" />

          {error && (
            <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>
              {error}
            </Alert>
          )}

          <section className="ez-onboarding-step" aria-live="polite">
            {currentStep === 'grade' && (
              <fieldset className="ez-onboarding-fieldset">
                <legend>Bạn đang học lớp mấy?</legend>
                <div className="ez-onboarding-grid ez-onboarding-grid-compact">
                  {(options?.grades || []).map((grade) => (
                    <label
                      key={grade}
                      className={draft.grade_level === grade ? 'ez-onboarding-choice ez-onboarding-choice-active' : 'ez-onboarding-choice'}
                    >
                      <input
                        type="radio"
                        name="grade-level"
                        value={grade}
                        checked={draft.grade_level === grade}
                        onChange={() => updateDraft((current) => ({ ...current, grade_level: grade }))}
                      />
                      Lớp {grade}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {currentStep === 'strong' && (
              <fieldset className="ez-onboarding-fieldset">
                <legend>Môn nào bạn đang tự tin?</legend>
                <p className="ez-onboarding-hint">Chọn bao nhiêu tuỳ bạn, hoặc bỏ qua nếu chưa chắc.</p>
                <div className="ez-onboarding-grid">
                  {(options?.subjects || []).map((subject) => (
                    <label
                      key={subject.id}
                      className={draft.strong_subjects.includes(subject.id) ? 'ez-onboarding-choice ez-onboarding-choice-active' : 'ez-onboarding-choice'}
                    >
                      <input
                        type="checkbox"
                        checked={draft.strong_subjects.includes(subject.id)}
                        onChange={() => updateDraft((current) => {
                          const nextStrong = toggleValue(current.strong_subjects, subject.id);
                          return {
                            ...current,
                            strong_subjects: nextStrong,
                            // Môn đã là điểm mạnh thì bỏ khỏi điểm yếu — backend từ chối trùng.
                            weak_subjects: current.weak_subjects.filter((value) => !nextStrong.includes(value)),
                          };
                        })}
                      />
                      {subject.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {currentStep === 'weak' && (
              <fieldset className="ez-onboarding-fieldset">
                <legend>Môn nào bạn muốn cải thiện?</legend>
                <p className="ez-onboarding-hint">Các môn đã chọn là điểm mạnh không xuất hiện ở đây.</p>
                <div className="ez-onboarding-grid">
                  {availableWeakSubjects.map((subject) => (
                    <label
                      key={subject.id}
                      className={draft.weak_subjects.includes(subject.id) ? 'ez-onboarding-choice ez-onboarding-choice-active' : 'ez-onboarding-choice'}
                    >
                      <input
                        type="checkbox"
                        checked={draft.weak_subjects.includes(subject.id)}
                        onChange={() => updateDraft((current) => ({
                          ...current,
                          weak_subjects: toggleValue(current.weak_subjects, subject.id),
                        }))}
                      />
                      {subject.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {currentStep === 'target' && (
              <fieldset className="ez-onboarding-fieldset">
                <legend>Khối hoặc tổ hợp môn muốn ôn</legend>
                <p className="ez-onboarding-hint">Chọn ít nhất một tổ hợp; có thể chọn nhiều.</p>
                {Object.entries(combinationGroups).map(([group, items]) => (
                  <section key={group} className="ez-onboarding-group" aria-label={`Nhóm ${group}`}>
                    <h2 className="ez-onboarding-group-title">
                      {group === 'Mới' ? 'Tổ hợp theo chương trình mới' : `Khối ${group}`}
                    </h2>
                    <div className="ez-onboarding-grid">
                      {items.map((item) => (
                        <label
                          key={item.code}
                          className={draft.target_exam_combinations.includes(item.code) ? 'ez-onboarding-choice ez-onboarding-choice-active' : 'ez-onboarding-choice'}
                        >
                          <input
                            type="checkbox"
                            checked={draft.target_exam_combinations.includes(item.code)}
                            onChange={() => updateDraft((current) => ({
                              ...current,
                              target_exam_combinations: toggleValue(current.target_exam_combinations, item.code),
                            }))}
                          />
                          <span className="ez-onboarding-choice-text">
                            <strong>{combinationTitle(item.code, item.group)}</strong>
                            <small>{item.subjects.join(' · ')}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </fieldset>
            )}
          </section>

          {stepError && (
            <Alert tone="warning" style={{ marginTop: 'var(--ez-space-4)' }}>
              {stepError}
            </Alert>
          )}

          <footer className="ez-onboarding-actions">
            <Button
              type="button"
              variant="outline"
              disabled={stepIndex === 0 || saving}
              leadingIcon={<ChevronLeft size={16} aria-hidden="true" />}
              onClick={() => {
                setStepError(null);
                setStepIndex((index) => Math.max(0, index - 1));
              }}
            >
              Quay lại
            </Button>

            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => navigate('/dashboard', { replace: true })}
            >
              Để sau
            </Button>

            <Button
              type="button"
              loading={saving}
              trailingIcon={isLastStep ? undefined : <ChevronRight size={16} aria-hidden="true" />}
              onClick={() => void handleNext()}
            >
              {isLastStep ? 'Lưu và bắt đầu học' : 'Tiếp tục'}
            </Button>
          </footer>
        </CardBody>
      </Card>
    </main>
  );
}
