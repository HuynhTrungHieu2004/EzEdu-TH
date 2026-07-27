import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import {
  personalizationApi,
  type StudentOnboardingOptions,
  type StudentOnboardingPayload,
} from '../api/personalizationApi';

const emptyDraft: StudentOnboardingPayload = {
  grade_level: 12,
  strong_subjects: [],
  weak_subjects: [],
  target_exam_combinations: [],
};

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

export default function StudentOnboardingPage() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<StudentOnboardingOptions | null>(null);
  const [draft, setDraft] = useState<StudentOnboardingPayload>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (savedProfile?.onboarding_completed) {
          setDraft({
            grade_level: savedProfile.grade_level,
            strong_subjects: savedProfile.strong_subjects,
            weak_subjects: savedProfile.weak_subjects,
            target_exam_combinations: savedProfile.target_exam_combinations,
          });
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

  const availableWeakSubjects = useMemo(() => {
    return (options?.subjects || []).filter((subject) => !draft.strong_subjects.includes(subject.id));
  }, [draft.strong_subjects, options]);

  const combinationGroups = useMemo(() => {
    return groupCombinations(options?.exam_combinations || []);
  }, [options]);

  const handleStrongToggle = (subjectId: string) => {
    setDraft((current) => {
      const nextStrong = toggleValue(current.strong_subjects, subjectId);
      return {
        ...current,
        strong_subjects: nextStrong,
        weak_subjects: current.weak_subjects.filter((value) => !nextStrong.includes(value)),
      };
    });
  };

  const handleWeakToggle = (subjectId: string) => {
    setDraft((current) => ({
      ...current,
      weak_subjects: toggleValue(current.weak_subjects, subjectId),
    }));
  };

  const handleCombinationToggle = (code: string) => {
    setDraft((current) => ({
      ...current,
      target_exam_combinations: toggleValue(current.target_exam_combinations, code),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!draft.grade_level) {
      setError('Hãy chọn lớp hiện tại của bạn.');
      return;
    }

    if (draft.target_exam_combinations.length === 0) {
      setError('Hãy chọn ít nhất một khối hoặc tổ hợp môn muốn ôn.');
      return;
    }

    setSaving(true);
    try {
      await personalizationApi.updateMyStudentOnboarding(draft);
      navigate('/published-questions', { replace: true });
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Chưa lưu được hồ sơ học tập. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="student-onboarding-page" aria-label="Đang tải hồ sơ học tập">
        <div className="student-onboarding-card">
          <p className="eyebrow">EzEdu AI</p>
          <h1>Đang chuẩn bị hồ sơ học tập</h1>
          <p className="personalization-muted">EzEdu AI đang tải các lựa chọn phù hợp cho học sinh.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="student-onboarding-page">
      <form className="student-onboarding-card" onSubmit={handleSubmit}>
        <div className="student-onboarding-header">
          <button type="button" className="student-onboarding-brand" onClick={() => navigate('/')}>
            <span translate="no">Ez</span>
            <strong translate="no">EzEdu AI</strong>
          </button>
          <p className="eyebrow">Thiết lập cho học sinh</p>
          <h1>Cá nhân hóa lộ trình ôn tập của bạn</h1>
          <p>
            Chọn một vài thông tin ban đầu để EzEdu AI ưu tiên nội dung đúng lớp,
            đúng môn cần cải thiện và đúng khối bạn muốn ôn.
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <fieldset className="student-onboarding-section">
          <legend>Lớp hiện tại</legend>
          <div className="student-grade-grid">
            {(options?.grades || []).map((grade) => (
              <label key={grade} className={`student-choice ${draft.grade_level === grade ? 'student-choice-active' : ''}`}>
                <input
                  type="radio"
                  name="grade-level"
                  value={grade}
                  checked={draft.grade_level === grade}
                  onChange={() => setDraft((current) => ({ ...current, grade_level: grade }))}
                />
                Lớp {grade}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="student-onboarding-section">
          <legend>Điểm mạnh về môn nào?</legend>
          <p>Chọn các môn bạn đang tự tin hơn để hệ thống cân bằng mức độ và nội dung ôn.</p>
          <div className="student-subject-grid">
            {(options?.subjects || []).map((subject) => (
              <label key={subject.id} className={`student-choice ${draft.strong_subjects.includes(subject.id) ? 'student-choice-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={draft.strong_subjects.includes(subject.id)}
                  onChange={() => handleStrongToggle(subject.id)}
                />
                {subject.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="student-onboarding-section">
          <legend>Điểm yếu về môn nào?</legend>
          <p>Các môn đã chọn là điểm mạnh sẽ tự ẩn khỏi danh sách này.</p>
          <div className="student-subject-grid">
            {availableWeakSubjects.map((subject) => (
              <label key={subject.id} className={`student-choice ${draft.weak_subjects.includes(subject.id) ? 'student-choice-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={draft.weak_subjects.includes(subject.id)}
                  onChange={() => handleWeakToggle(subject.id)}
                />
                {subject.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="student-onboarding-section">
          <legend>Khối hoặc tổ hợp môn muốn ôn</legend>
          <p>Có thể chọn nhiều tổ hợp. EzEdu AI sẽ ghi nhớ để ưu tiên nội dung phù hợp.</p>
          <div className="student-combination-groups">
            {Object.entries(combinationGroups).map(([group, items]) => (
              <section key={group} className="student-combination-group" aria-label={`Nhóm ${group}`}>
                <h2>{group === 'Mới' ? 'Tổ hợp theo chương trình mới' : `Khối ${group}`}</h2>
                <div className="student-combination-grid">
                  {items.map((item) => (
                    <label
                      key={item.code}
                      className={`student-combination-choice ${draft.target_exam_combinations.includes(item.code) ? 'student-choice-active' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={draft.target_exam_combinations.includes(item.code)}
                        onChange={() => handleCombinationToggle(item.code)}
                      />
                      <span>
                        <strong>{combinationTitle(item.code, item.group)}</strong>
                        <small>{item.subjects.join(' · ')}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </fieldset>

        <div className="student-onboarding-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Đang lưu hồ sơ...' : 'Lưu và bắt đầu học'}
          </button>
        </div>
      </form>
    </main>
  );
}
