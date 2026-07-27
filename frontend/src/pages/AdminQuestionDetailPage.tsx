import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import { authApi } from '../api/authApi';
import type { AdminQuestionDetail, AdminQuestionUpdatePayload } from '../types/adminContent';
import { hasPermission } from '../utils/adminPermissions';
import { Badge, EmptyState, fmtDateTime, renderObjectRows } from './AdminContentShared';
import { apiErrorMessage } from '../utils/apiError';
import './AdminContentPages.css';

export default function AdminQuestionDetailPage() {
  const { questionId = '' } = useParams();
  const navigate = useNavigate();
  const decodedId = decodeURIComponent(questionId);
  const [item, setItem] = useState<AdminQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<string>();
  const [overrides, setOverrides] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canUpdate = hasPermission(role, 'questions.update', overrides);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adminContentApi.questionDetail(decodedId)
      .then((data) => {
        setItem(data);
        setQuestion(data.question);
        setCorrectAnswer(data.correct_answer);
        setExplanation(data.explanation);
      })
      .catch((err) => setError(apiErrorMessage(err, 'Không tải được chi tiết câu hỏi.')))
      .finally(() => setLoading(false));
  }, [decodedId]);

  useEffect(() => {
    authApi.getMe().then((user) => {
      setRole(user.role);
      setOverrides(user.permissions_override || []);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload: AdminQuestionUpdatePayload = { question, correct_answer: correctAnswer, explanation, reason };
    setBusy(true);
    try {
      const updated = await adminContentApi.updateQuestion(decodedId, payload);
      setItem(updated);
      setEditing(false);
      setReason('');
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không cập nhật được câu hỏi.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="admin-content-page"><EmptyState title="Đang tải" text="Đang lấy chi tiết câu hỏi." /></main>;
  if (error || !item) return <main className="admin-content-page"><EmptyState title="Có lỗi" text={error || 'Không tìm thấy câu hỏi.'} /></main>;

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>Chi tiết câu hỏi</h1>
          <p>{item.id}</p>
        </div>
        <div className="admin-content-actions">
          {canUpdate && <button type="button" className="admin-content-btn" onClick={() => setEditing((value) => !value)}>{editing ? 'Hủy sửa' : 'Sửa câu hỏi'}</button>}
          <button type="button" className="admin-content-btn" onClick={() => navigate('/admin/questions')}>Quay lại</button>
        </div>
      </header>

      <section className="admin-content-detail">
        <div className="admin-content-detail-grid">
          <div className="admin-content-kv"><span>Loại / độ khó</span><strong>{item.question_type || 'Không có dữ liệu'} / {item.difficulty || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Nguồn</span><strong>{item.source_document_name || item.source_document_id || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Chủ sở hữu</span><strong>{item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Citation</span><strong>{item.citation_status || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Hallucination risk</span><strong>{item.hallucination_risk || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Kiểm duyệt</span><strong><Badge tone={item.deleted_at ? 'danger' : item.moderation_status === 'approved' ? 'ok' : 'info'}>{item.deleted_at ? 'deleted' : item.moderation_status}</Badge></strong></div>
          <div className="admin-content-kv"><span>Ngày tạo</span><strong>{fmtDateTime(item.created_at)}</strong></div>
          <div className="admin-content-kv"><span>Bloom</span><strong>{item.bloom_level || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Tags</span><strong>{item.tags.length ? item.tags.join(', ') : 'Không có dữ liệu'}</strong></div>
        </div>
      </section>

      {editing ? (
        <form className="admin-content-panel" onSubmit={submit}>
          <label className="admin-content-field"><span>Câu hỏi</span><textarea rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
          <label className="admin-content-field"><span>Đáp án đúng</span><textarea rows={2} value={correctAnswer} onChange={(event) => setCorrectAnswer(event.target.value)} /></label>
          <label className="admin-content-field"><span>Giải thích</span><textarea rows={5} value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
          <label className="admin-content-field"><span>Lý do chỉnh sửa</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="admin-content-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="admin-content-btn" disabled={busy || !question.trim() || !correctAnswer.trim()}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
          </div>
        </form>
      ) : (
        <section className="admin-content-panel">
          <h2>Nội dung</h2>
          <p>{item.question}</p>
          <h3>Đáp án</h3>
          <p>{item.correct_answer}</p>
          <h3>Giải thích</h3>
          <p>{item.explanation || 'Không có dữ liệu'}</p>
          <h3>Lựa chọn</h3>
          {item.options ? renderObjectRows(item.options) : <p className="admin-content-muted">Không có dữ liệu</p>}
        </section>
      )}

      <section className="admin-content-panel">
        <h2>Evidence / source chunk</h2>
        {item.evidence.length ? renderObjectRows(item.evidence) : <p className="admin-content-muted">Backend không tìm thấy chunk nguồn cho câu hỏi này.</p>}
      </section>
    </main>
  );
}
