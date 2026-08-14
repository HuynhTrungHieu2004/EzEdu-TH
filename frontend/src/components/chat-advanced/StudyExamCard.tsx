import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../api/chatApi';
import type {
  StudyDifficulty,
  StudyExamConfig,
  StudyExamRequest,
} from '../../types/chat';
import { STUDY_DIFFICULTIES, STUDY_QUESTION_COUNTS } from '../../utils/studyExam';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

interface StudyExamCardProps {
  config: StudyExamConfig;
  conversationId?: string | null;
  messageId?: string | null;
  initialRequest?: StudyExamRequest | null;
}

const POLL_INTERVAL_MS = 1500;

export const StudyExamCard: React.FC<StudyExamCardProps> = ({
  config,
  conversationId,
  messageId,
  initialRequest,
}) => {
  const navigate = useNavigate();
  const defaultSubject =
    config.requested_subject_id || config.suggested_subject_id || config.subjects[0]?.id || '';
  const [subjectId, setSubjectId] = useState(defaultSubject);
  const [topicId, setTopicId] = useState(config.suggested_topic_id || '');
  const [difficulty, setDifficulty] = useState<StudyDifficulty>('adaptive');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [request, setRequest] = useState<StudyExamRequest | null>(initialRequest || null);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const subjectOptions = useMemo(
    () => config.subjects.map((subject) => ({ value: subject.id, label: subject.label })),
    [config.subjects]
  );
  const availableTopics = useMemo(
    () => config.topics.filter((topic) => topic.subject_id === subjectId),
    [config.topics, subjectId]
  );
  const selectedSubject = config.subjects.find((subject) => subject.id === subjectId);
  const selectedTopic = availableTopics.find((topic) => topic.id === topicId);
  const isProcessing = request?.status === 'pending' || request?.status === 'running';

  useEffect(() => {
    if (!isProcessing || !request) return undefined;

    pollTimerRef.current = window.setInterval(async () => {
      try {
        const updated = await chatApi.getStudyExamRequest(request.id);
        setRequest(updated);
        setError(null);
      } catch {
        setError('Chưa thể cập nhật tiến độ. Hệ thống sẽ thử lại.');
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    };
  }, [isProcessing, request]);

  const handleSubjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSubjectId(event.target.value);
    setTopicId('');
  };

  const handleCreate = async () => {
    if (!subjectId) {
      setError('Vui lòng chọn môn học.');
      return;
    }
    setError(null);
    try {
      const created = await chatApi.createStudyExamRequest({
        subject_id: subjectId,
        subject_label: selectedSubject?.label,
        topic_id: topicId || null,
        topic_label: selectedTopic?.label,
        difficulty,
        question_count: questionCount,
        conversation_id: conversationId,
        message_id: messageId,
        client_request_id: crypto.randomUUID(),
      });
      setRequest(created);
    } catch {
      setError('Không thể tạo đề lúc này. Vui lòng thử lại.');
    }
  };

  if (request?.status === 'completed' && request.exam_id) {
    return (
      <section style={styles.card} aria-live="polite">
        <div style={styles.headingRow}>
          <span style={styles.icon}><BookOpen size={18} /></span>
          <div>
            <strong>Đề ôn tập đã sẵn sàng</strong>
            <div style={styles.subtle}>{request.selected_count} câu · Lớp {config.grade}</div>
          </div>
        </div>
        {request.shortfall_count > 0 && (
          <div style={styles.notice}>
            Ngân hàng hiện chưa đủ số câu đã chọn. Hệ thống đã tạo đề ngắn hơn với
            {' '}{request.selected_count} câu đã được kiểm tra.
          </div>
        )}
        <Button
          block
          size="lg"
          trailingIcon={<Play size={16} />}
          onClick={() => navigate(`/take-exam/${request.exam_id}`)}
        >
          Bắt đầu làm đề
        </Button>
      </section>
    );
  }

  return (
    <section style={styles.card} aria-label="Thiết lập đề ôn tập">
      <div style={styles.headingRow}>
        <span style={styles.icon}><BookOpen size={18} /></span>
        <div>
          <strong>Tạo đề ôn tập lớp {config.grade}</strong>
          <div style={styles.subtle}>Chọn nội dung phù hợp rồi bắt đầu khi đề sẵn sàng.</div>
        </div>
      </div>

      {config.suggestion_reason && <div style={styles.suggestion}>{config.suggestion_reason}</div>}

      <div style={styles.grid}>
        <label style={styles.field}>
          <span style={styles.label}>Môn học</span>
          <Select value={subjectId} options={subjectOptions} onChange={handleSubjectChange} />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>Chủ đề</span>
          <Select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
            <option value="">Tất cả chủ đề</option>
            {availableTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>{topic.label}</option>
            ))}
          </Select>
        </label>
        <label style={styles.field}>
          <span style={styles.label}>Độ khó</span>
          <Select
            value={difficulty}
            options={STUDY_DIFFICULTIES.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(event) => setDifficulty(event.target.value as StudyDifficulty)}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>Số câu hỏi</span>
          <Select value={String(questionCount)} onChange={(event) => setQuestionCount(Number(event.target.value))}>
            {STUDY_QUESTION_COUNTS.map((count) => (
              <option key={count} value={count}>{count} câu</option>
            ))}
          </Select>
        </label>
      </div>

      {isProcessing ? (
        <div style={styles.processing} role="status" aria-live="polite">
          <span className="spinner" style={styles.spinner} />
          <div>
            <strong>Đang tạo đề ôn tập…</strong>
            <div style={styles.subtle}>Hệ thống đang chọn câu phù hợp và kiểm tra cấu trúc đề.</div>
          </div>
        </div>
      ) : (
        <Button block size="lg" onClick={handleCreate}>Tạo đề ôn tập</Button>
      )}

      {(error || request?.status === 'failed') && (
        <div style={styles.error} role="alert">
          <AlertCircle size={15} />
          <span>{request?.error_message || error}</span>
        </div>
      )}
    </section>
  );
};

const styles = {
  card: {
    marginTop: '16px',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--surface-muted)',
  },
  headingRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
  icon: {
    width: '38px', height: '38px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '10px', color: 'var(--accent)', background: 'var(--surface-strong)',
  },
  subtle: { marginTop: '3px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.45 },
  suggestion: {
    marginBottom: '14px', padding: '9px 11px', borderRadius: '8px', fontSize: '12px',
    color: 'var(--text)', background: 'var(--surface-strong)', border: '1px solid var(--border)',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '12px', marginBottom: '14px',
  },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  label: { fontSize: '12px', fontWeight: '700', color: 'var(--text)' },
  processing: {
    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
    borderRadius: '9px', background: 'var(--surface-strong)', border: '1px solid var(--border)',
  },
  spinner: {
    width: '18px', height: '18px', flex: '0 0 18px', border: '2px solid var(--border)',
    borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  notice: {
    marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', fontSize: '12px',
    color: 'var(--warning-text)', background: 'var(--warning-bg)', border: '1px solid var(--border-strong)',
  },
  error: {
    display: 'flex', gap: '7px', alignItems: 'center', marginTop: '10px', fontSize: '12px', color: 'var(--danger)',
  },
};
