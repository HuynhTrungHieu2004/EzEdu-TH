import { useCallback, useEffect, useState } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import { PageHeader, Card, CardBody, Button, Badge, FormField, Input, Textarea } from '../../components/ui';
import { assignmentsApi } from '../../api/assignmentsApi';
import type { Assignment, StudentSubmission } from '../../types/courses';

export default function TeacherSubmissionsPage() {
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<StudentSubmission | null>(null);
  const [filter, setFilter] = useState('all');
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [submissionData, assignmentData] = await Promise.all([
        assignmentsApi.listSubmissions(),
        assignmentsApi.list(),
      ]);
      setSubmissions(submissionData);
      setAssignments(assignmentData);
    } catch {
      setError('Không thể tải danh sách bài nộp.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const open = (submission: StudentSubmission) => {
    setSelected(submission);
    setScore(submission.teacher_score == null ? '' : String(submission.teacher_score));
    setFeedback(submission.teacher_feedback || '');
    setError('');
  };

  const requestAI = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const updated = await assignmentsApi.aiGrade(selected.id);
      setSelected(updated);
      setScore(updated.ai_grade ? String(updated.ai_grade.score) : score);
      setFeedback(updated.ai_grade?.feedback || feedback);
      setSubmissions((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setError('AI chưa thể chấm bài. Nội dung và điểm bạn đang nhập vẫn được giữ để thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const saveGrade = async () => {
    if (!selected || score === '') return;
    setBusy(true);
    setError('');
    try {
      const updated = await assignmentsApi.teacherGrade(selected.id, { score: Number(score), feedback });
      setSubmissions((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelected(null);
    } catch {
      setError('Không thể lưu điểm. Vui lòng kiểm tra điểm tối đa và thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const filtered = submissions.filter((submission) => filter === 'all'
    || (filter === 'graded' ? submission.status === 'teacher_graded' : submission.status !== 'teacher_graded'));
  const maxScore = selected
    ? assignments.find((assignment) => assignment.id === selected.assignment_id)?.max_score || 10
    : 10;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader title="Chấm điểm Bài nộp của Học sinh" description="AI đề xuất điểm; giáo viên xác nhận điểm cuối cùng." />

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button variant={filter === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilter('all')}>Tất cả ({submissions.length})</Button>
        <Button variant={filter === 'ungraded' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilter('ungraded')}>Chưa chấm ({submissions.filter((item) => item.status !== 'teacher_graded').length})</Button>
        <Button variant={filter === 'graded' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilter('graded')}>Đã chấm ({submissions.filter((item) => item.status === 'teacher_graded').length})</Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải bài nộp...</div>
      ) : error && !selected ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button></Card>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Chưa có bài nộp.</Card>
      ) : filtered.map((submission) => (
        <Card key={submission.id} style={{ borderRadius: '16px' }}>
          <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <strong>{submission.student_name || submission.student_id}</strong>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{submission.assignment_title} · {new Date(submission.submitted_at).toLocaleString('vi-VN')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Badge variant={submission.status === 'teacher_graded' ? 'success' : submission.status === 'grading_failed' ? 'error' : 'warning'}>
                {submission.status === 'teacher_graded' ? 'Đã chấm' : submission.status === 'grading_failed' ? 'AI lỗi' : 'Chưa xác nhận'}
              </Badge>
              {submission.final_score != null && <strong>{submission.final_score}/{assignments.find((item) => item.id === submission.assignment_id)?.max_score || 10}</strong>}
              <Button variant="outline" size="sm" onClick={() => open(submission)}><Eye size={14} /> Chấm bài</Button>
            </div>
          </CardBody>
        </Card>
      ))}

      {selected && (
        <Card style={{ borderRadius: '20px', border: '2px solid #2563eb' }}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Bài làm: {selected.student_name}</h3><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Đóng</Button></div>
            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px' }}>{selected.content}</div>
            {selected.ai_grade && <div style={{ padding: '1rem', background: '#eef2ff', borderRadius: '12px' }}><strong>AI đề xuất {selected.ai_grade.score}/{maxScore}:</strong> {selected.ai_grade.feedback}</div>}
            {selected.status === 'grading_failed' && <div style={{ color: '#b91c1c' }}>{selected.grading_error || 'AI chấm thất bại.'}</div>}
            {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
            <Button variant="outline" loading={busy} onClick={() => void requestAI()}><Sparkles size={16} /> {selected.status === 'grading_failed' ? 'Thử AI lại' : 'Nhờ AI đề xuất điểm'}</Button>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '1rem' }}>
              <FormField label={`Điểm (tối đa ${maxScore})`}><Input type="number" min="0" max={maxScore} value={score} onChange={(event) => setScore(event.target.value)} /></FormField>
              <FormField label="Nhận xét"><Textarea rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></FormField>
            </div>
            <Button variant="primary" loading={busy} disabled={score === ''} onClick={() => void saveGrade()}>Xác nhận điểm cuối</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
