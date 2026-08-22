import { useCallback, useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { PageHeader, Card, CardBody, Button, Badge } from '../../components/ui';
import { assignmentsApi } from '../../api/assignmentsApi';
import type { StudentSubmission } from '../../types/courses';

export default function StudentResultsPage() {
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSubmissions(await assignmentsApi.listSubmissions());
    } catch {
      setError('Không thể tải kết quả bài tập.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const graded = submissions.filter((submission) => submission.final_score != null);
  const average = graded.length
    ? graded.reduce((sum, submission) => sum + (submission.final_score || 0), 0) / graded.length
    : 0;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader title="Kết quả Bài tập" description="Điểm AI chỉ là đề xuất; mục này chỉ tính điểm giáo viên đã xác nhận." />

      <Card style={{ borderRadius: '18px' }}>
        <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Award size={30} color="#7c3aed" />
          <div><div style={{ color: '#64748b' }}>Điểm trung bình đã xác nhận</div><strong style={{ fontSize: '1.5rem' }}>{average.toFixed(1)}</strong></div>
        </CardBody>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải kết quả...</div>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button></Card>
      ) : submissions.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Bạn chưa có bài nộp nào.</Card>
      ) : submissions.map((submission) => (
        <Card key={submission.id} style={{ borderRadius: '16px' }}>
          <CardBody style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <strong>{submission.assignment_title}</strong>
              <div style={{ color: '#64748b', fontSize: '0.82rem' }}>{submission.course_title} · Nộp lần {submission.revision_count}</div>
              {submission.teacher_feedback && <div style={{ marginTop: '0.5rem' }}>{submission.teacher_feedback}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge variant={submission.status === 'teacher_graded' ? 'success' : submission.status === 'grading_failed' ? 'error' : 'warning'}>
                {submission.status === 'teacher_graded' ? 'Đã xác nhận' : submission.status === 'grading_failed' ? 'AI lỗi' : 'Đang chờ giáo viên'}
              </Badge>
              <div style={{ marginTop: '0.5rem', fontWeight: 800 }}>{submission.final_score == null ? 'Chưa có điểm cuối' : submission.final_score}</div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
