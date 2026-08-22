import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Play,
  CheckCircle,
  FileText,
  Award,
  Sparkles,
  Send,
  Download,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  Dialog,
  FormField,
} from '../../components/ui';
import { coursesApi } from '../../api/coursesApi';
import { assignmentsApi } from '../../api/assignmentsApi';
import type { Course, Lesson, Assignment, StudentSubmission } from '../../types/courses';

export default function StudentCourseDetailPage() {
  const { courseId = 'CRS-101' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'lessons' | 'assignments' | 'progress'>('lessons');

  // Interactive Modals
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [submitAssignmentModal, setSubmitAssignmentModal] = useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cData, lData, aData, sData] = await Promise.all([
        coursesApi.getCourseById(courseId),
        coursesApi.getLessons(courseId),
        assignmentsApi.list(courseId),
        assignmentsApi.listSubmissions(),
      ]);
      setCourse(cData);
      setLessons(lData);
      setAssignments(aData);
      setSubmissions(sData);
    } catch {
      setError('Không thể tải nội dung khóa học.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const handleSubmitAssignment = async () => {
    if (!submitAssignmentModal || !submissionText.trim()) return;
    setSubmitting(true);
    try {
      const submitted = await assignmentsApi.submit(submitAssignmentModal.id, { content: submissionText.trim() });
      try {
        await assignmentsApi.aiGrade(submitted.id);
      } catch {
        // Bài đã nộp thành công; lỗi AI được hiển thị sau khi tải lại trạng thái bài nộp.
      }
      setSubmitAssignmentModal(null);
      setSubmissionText('');
      loadData();
    } catch {
      alert('Không thể nộp bài');
    } finally {
      setSubmitting(false);
    }
  };

  // Group lessons by chapter
  const groupedLessons = lessons.reduce((acc, les) => {
    const ch = les.chapter_title || 'Bài học chung';
    if (!acc[ch]) acc[ch] = [];
    acc[ch].push(les);
    return acc;
  }, {} as Record<string, Lesson[]>);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải nội dung khóa học...</div>;
  }
  if (error) {
    return (
      <Card style={{ margin: '2rem auto', maxWidth: '720px', padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
        {error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/student/courses')} style={{ gap: '0.4rem', marginBottom: '0.5rem' }}>
          <ArrowLeft size={16} /> Quay lại Khóa học của tôi
        </Button>
        <PageHeader
          title={course?.title || 'Đang tải khóa học...'}
          description={`Môn: ${course?.subject || ''} (${course?.grade || ''}) • GV Phụ trách: ${course?.teacher_name || ''}`}
          actions={
            <Badge variant="primary" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>
              Mã: {course?.code}
            </Badge>
          }
        />
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <Button
          variant={activeTab === 'lessons' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('lessons')}
          style={{ borderRadius: '10px', gap: '0.4rem' }}
        >
          <BookOpen size={16} /> Nội dung Bài học ({lessons.length})
        </Button>

        <Button
          variant={activeTab === 'assignments' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('assignments')}
          style={{ borderRadius: '10px', gap: '0.4rem' }}
        >
          <Sparkles size={16} /> Bài tập & AI Chấm điểm ({assignments.length})
        </Button>

        <Button
          variant={activeTab === 'progress' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('progress')}
          style={{ borderRadius: '10px', gap: '0.4rem' }}
        >
          <Award size={16} /> Tiến độ & Nhận xét AI
        </Button>
      </div>

      {/* TAB 1: LESSONS */}
      {activeTab === 'lessons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {Object.keys(groupedLessons).length === 0 && (
            <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Khóa học chưa có bài học đã xuất bản.</Card>
          )}
          {Object.entries(groupedLessons).map(([chapter, chapterLessons], idx) => (
            <Card key={idx} style={{ borderRadius: '18px', border: '1px solid #e2e8f0' }}>
              <CardBody style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: '#0f172a' }}>
                  📖 {chapter}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {chapterLessons.map((les, lIdx) => (
                    <div
                      key={les.id}
                      style={{
                        padding: '1rem',
                        borderRadius: '14px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', flex: 1 }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: les.student_status === 'completed' ? '#ecfdf5' : '#eff6ff', color: les.student_status === 'completed' ? '#10b981' : '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {les.student_status === 'completed' ? <CheckCircle size={18} /> : lIdx + 1}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a' }}>{les.title}</div>
                          <div style={{ fontSize: '0.83rem', color: '#64748b', marginTop: '0.2rem' }}>{les.description}</div>
                        </div>
                      </div>

                      <Button variant="primary" size="sm" style={{ borderRadius: '8px', gap: '0.3rem' }} onClick={() => setActiveLesson(les)}>
                        <Play size={14} /> Học bài ngay
                      </Button>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* TAB 2: ASSIGNMENTS & AI GRADING */}
      {activeTab === 'assignments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {assignments.length === 0 && (
            <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Khóa học chưa có bài tập.</Card>
          )}
          {assignments.map((asn) => {
            const studentSub = submissions.find((s) => s.assignment_id === asn.id);

            return (
              <Card key={asn.id} style={{ borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <CardBody style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 700 }}>Hạn nộp: {new Date(asn.due_at).toLocaleString('vi-VN')}</div>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{asn.title}</h3>
                      <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.88rem', color: '#475569' }}>{asn.description}</p>
                    </div>
                    {studentSub ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Badge variant={studentSub.status === 'teacher_graded' ? 'success' : studentSub.status === 'grading_failed' ? 'error' : 'primary'}>
                          {studentSub.status === 'teacher_graded' ? 'Đã duyệt điểm' : studentSub.status === 'grading_failed' ? 'AI chấm lỗi' : 'Đã nộp'}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => { setSubmissionText(studentSub.content); setSubmitAssignmentModal(asn); }}>Nộp lại</Button>
                      </div>
                    ) : (
                      <Button variant="primary" style={{ borderRadius: '10px', gap: '0.4rem' }} onClick={() => setSubmitAssignmentModal(asn)}>
                        <Send size={15} /> Nộp bài tự luận
                      </Button>
                    )}
                  </div>

                  <div style={{ padding: '0.8rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                    <strong>📋 Hướng dẫn làm bài:</strong> {asn.instructions}
                  </div>

                  {/* Submission & AI Grading Feedback display */}
                  {studentSub && (
                    <div style={{ padding: '1rem', borderRadius: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#166534' }}>
                          <Sparkles size={18} style={{ color: '#15803d' }} /> Phân tích & Điểm số từ AI & Giáo viên
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#15803d' }}>
                          {studentSub.final_score != null ? `${studentSub.final_score} / ${asn.max_score}` : studentSub.ai_grade ? `${studentSub.ai_grade.score} / ${asn.max_score} (AI đề xuất)` : 'Chưa có điểm'}
                        </div>
                      </div>

                      {studentSub.ai_grade && (
                        <div style={{ fontSize: '0.85rem', color: '#14532d', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <div><strong>Nội dung bài làm:</strong> <em>"{studentSub.content}"</em></div>
                          <div><strong>Đánh giá AI:</strong> {studentSub.ai_grade.feedback}</div>
                        </div>
                      )}

                      {studentSub.teacher_score != null && (
                        <div style={{ marginTop: '0.5rem', padding: '0.75rem', borderRadius: '10px', background: '#fff', border: '1px solid #86efac', fontSize: '0.85rem', color: '#166534' }}>
                          <strong>💬 Nhận xét từ Giáo viên:</strong> {studentSub.teacher_feedback || 'Đã xác nhận điểm.'}
                        </div>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* TAB 3: PROGRESS & AI RECOMMENDATIONS */}
      {activeTab === 'progress' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card style={{ borderRadius: '18px' }}>
            <CardBody style={{ padding: '1.5rem' }}>
              <strong>Tiến độ khóa học</strong>
              <p style={{ color: '#64748b' }}>Khóa học có {lessons.length} bài học đã xuất bản. Chưa có dữ liệu tiến độ chi tiết được ghi nhận.</p>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Modal Học bài */}
      {activeLesson && (
        <Dialog
          open
          onClose={() => setActiveLesson(null)}
          title={`Bài học: ${activeLesson.title}`}
          footer={<Button variant="primary" onClick={() => setActiveLesson(null)}>Đã học xong bài này</Button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', lineHeight: '1.6', fontSize: '0.92rem', color: '#334155' }}>
              <strong>Nội dung bài học:</strong>
              <p style={{ marginTop: '0.5rem' }}>{activeLesson.content}</p>
            </div>

            {activeLesson.attachments && activeLesson.attachments.length > 0 && (
              <div>
                <strong>Tài liệu đính kèm:</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {activeLesson.attachments.map((att) => (
                    <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                      <span style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FileText size={16} style={{ color: '#2563eb' }} /> {att.name}
                      </span>
                      <Button variant="outline" size="sm" style={{ gap: '0.3rem', fontSize: '0.78rem' }}>
                        <Download size={13} /> Tải tài liệu
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* Modal Nộp bài tự luận */}
      {submitAssignmentModal && (
        <Dialog
          open
          onClose={() => setSubmitAssignmentModal(null)}
          title={`Nộp bài tự luận: ${submitAssignmentModal.title}`}
          closeOnOverlayClick={!submitting}
          footer={
            <>
              <Button variant="outline" disabled={submitting} onClick={() => setSubmitAssignmentModal(null)}>Hủy</Button>
              <Button variant="primary" loading={submitting} disabled={!submissionText.trim()} onClick={handleSubmitAssignment}>
                Nộp bài & AI Chấm ngay
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#475569', background: '#eff6ff', padding: '0.75rem', borderRadius: '10px' }}>
              🤖 Sau khi bấm Nộp bài, trợ lý AI sẽ tự động phân tích lời giải tự luận của bạn và đề xuất điểm số ngay lập tức!
            </div>

            <FormField label="Lời giải tự luận của bạn" required>
              <textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                rows={6}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                placeholder="Trình bày chi tiết lời giải từ bước tập xác định, tọa độ đỉnh, trục đối xứng, bảng biến thiên..."
              />
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
