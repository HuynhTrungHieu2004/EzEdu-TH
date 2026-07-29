import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import { authApi } from '../api/authApi';
import type { AdminQuestionDetail, AdminQuestionUpdatePayload } from '../types/adminContent';
import { hasPermission } from '../utils/adminPermissions';
import { Badge, EmptyState, fmtDateTime, renderObjectRows } from './AdminContentShared';
import { apiErrorMessage } from '../utils/apiError';
import { Button, Card, CardBody, FormField, PageHeader, Textarea } from '../components/ui';

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

  if (loading) return <div className="ez-admin-page"><EmptyState title="Đang tải" text="Đang lấy chi tiết câu hỏi." /></div>;
  if (error || !item) return <div className="ez-admin-page"><EmptyState title="Có lỗi" text={error || 'Không tìm thấy câu hỏi.'} /></div>;

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Chi tiết câu hỏi"
        description={item.id}
        actions={
          <>
            {canUpdate && <Button variant="outline" onClick={() => setEditing((value) => !value)}>{editing ? 'Hủy sửa' : 'Sửa câu hỏi'}</Button>}
            <Button variant="outline" onClick={() => navigate('/admin/questions')}>Quay lại</Button>
          </>
        }
      />

      <Card>
        <CardBody>
          <dl className="ez-kv-grid">
            <div><dt>Loại / độ khó</dt><dd>{item.question_type || 'Không có dữ liệu'} / {item.difficulty || 'Không có dữ liệu'}</dd></div>
            <div><dt>Nguồn</dt><dd>{item.source_document_name || item.source_document_id || 'Không có dữ liệu'}</dd></div>
            <div><dt>Chủ sở hữu</dt><dd>{item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu'}</dd></div>
            <div><dt>Citation</dt><dd>{item.citation_status || 'Không có dữ liệu'}</dd></div>
            <div><dt>Hallucination risk</dt><dd>{item.hallucination_risk || 'Không có dữ liệu'}</dd></div>
            <div><dt>Kiểm duyệt</dt><dd><Badge tone={item.deleted_at ? 'danger' : item.moderation_status === 'approved' ? 'ok' : 'info'}>{item.deleted_at ? 'deleted' : item.moderation_status}</Badge></dd></div>
            <div><dt>Ngày tạo</dt><dd>{fmtDateTime(item.created_at)}</dd></div>
            <div><dt>Bloom</dt><dd>{item.bloom_level || 'Không có dữ liệu'}</dd></div>
            <div><dt>Tags</dt><dd>{item.tags.length ? item.tags.join(', ') : 'Không có dữ liệu'}</dd></div>
          </dl>
        </CardBody>
      </Card>

      {editing ? (
        <Card>
          <CardBody>
            <form onSubmit={submit}>
              <FormField label="Câu hỏi">
                <Textarea rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} />
              </FormField>
              <FormField label="Đáp án đúng">
                <Textarea rows={2} value={correctAnswer} onChange={(event) => setCorrectAnswer(event.target.value)} />
              </FormField>
              <FormField label="Giải thích">
                <Textarea rows={5} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
              </FormField>
              <FormField label="Lý do chỉnh sửa">
                <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
              </FormField>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" disabled={busy || !question.trim() || !correctAnswer.trim()}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <h2>Nội dung</h2>
            <p>{item.question}</p>
            <h3>Đáp án</h3>
            <p>{item.correct_answer}</p>
            <h3>Giải thích</h3>
            <p>{item.explanation || 'Không có dữ liệu'}</p>
            <h3>Lựa chọn</h3>
            {item.options ? renderObjectRows(item.options) : <p className="ez-muted">Không có dữ liệu</p>}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2>Evidence / source chunk</h2>
          {item.evidence.length ? renderObjectRows(item.evidence) : <p className="ez-muted">Backend không tìm thấy chunk nguồn cho câu hỏi này.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
