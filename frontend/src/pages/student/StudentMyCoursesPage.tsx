import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Play,
  CheckCircle,
  Award,
  UserCheck,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  ProgressBar,
} from '../../components/ui';
import { coursesApi } from '../../api/coursesApi';
import type { CourseEnrollment } from '../../types/courses';

export default function StudentMyCoursesPage() {
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'enrolled' | 'completed' | 'all'>('enrolled');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEnrollments(await coursesApi.getStudentEnrollments());
    } catch {
      setError('Không thể tải khóa học của bạn.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const enrolledList = enrollments.filter((e) => e.status === 'learning');
  const completedList = enrollments.filter((e) => e.status === 'completed');
  const graded = enrollments.filter((enrollment) => enrollment.gpa_average > 0);
  const averageGpa = graded.length
    ? graded.reduce((sum, enrollment) => sum + enrollment.gpa_average, 0) / graded.length
    : 0;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
      <PageHeader
        title="🎓 Khóa học của tôi"
        description="Theo dõi toàn bộ lộ trình học tập, hoàn thành các bài giảng, bài tập và xem nhận xét đánh giá từ Giáo viên & AI."
      />

      {/* Tabs & Stats Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card style={{ borderRadius: '16px', background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', color: '#fff' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div style={{ padding: '0.8rem', borderRadius: '14px', background: 'rgba(255,255,255,0.2)' }}>
              <BookOpen size={26} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Khóa học đang học</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{enrolledList.length} Khóa</div>
            </div>
          </CardBody>
        </Card>

        <Card style={{ borderRadius: '16px', background: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)', color: '#fff' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div style={{ padding: '0.8rem', borderRadius: '14px', background: 'rgba(255,255,255,0.2)' }}>
              <CheckCircle size={26} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Đã hoàn thành</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{completedList.length} Khóa</div>
            </div>
          </CardBody>
        </Card>

        <Card style={{ borderRadius: '16px', background: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)', color: '#fff' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div style={{ padding: '0.8rem', borderRadius: '14px', background: 'rgba(255,255,255,0.2)' }}>
              <Award size={26} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Điểm GPA Trung bình</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{averageGpa.toFixed(1)} / 10</div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Navigation Filter Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <Button
          variant={tab === 'enrolled' ? 'primary' : 'ghost'}
          onClick={() => setTab('enrolled')}
          style={{ borderRadius: '10px' }}
        >
          Đang học ({enrolledList.length})
        </Button>
        <Button
          variant={tab === 'completed' ? 'primary' : 'ghost'}
          onClick={() => setTab('completed')}
          style={{ borderRadius: '10px' }}
        >
          Đã hoàn thành ({completedList.length})
        </Button>
        <Button
          variant={tab === 'all' ? 'primary' : 'ghost'}
          onClick={() => setTab('all')}
          style={{ borderRadius: '10px' }}
        >
          Tất cả khóa học của tôi ({enrollments.length})
        </Button>
      </div>

      {/* Course Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải danh sách khóa học...</div>
      ) : error ? (
        <Card style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
          {error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button>
        </Card>
      ) : tab === 'enrolled' && enrolledList.length === 0 ? (
        <Card style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          Bạn chưa đăng ký khóa học nào. Hãy sang tab "Tất cả khóa học có sẵn" để khám phá nhé!
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
          {(tab === 'enrolled' ? enrolledList : tab === 'completed' ? completedList : enrollments).map((enr) => (
            <Card key={enr.id} style={{ borderRadius: '20px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1rem 1.2rem 0.5rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <Badge variant="primary">{enr.course_code}</Badge>
                  <Badge variant="success">{enr.subject}</Badge>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{enr.grade}</div>
              </div>

              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1.2rem', flex: 1 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: '#0f172a' }}>{enr.course_title}</h3>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <UserCheck size={14} style={{ color: '#2563eb' }} /> Giáo viên: <strong style={{ color: '#334155' }}>{enr.teacher_name}</strong>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    <span>Tiến độ bài học</span>
                    <span style={{ color: '#2563eb' }}>{enr.completed_lessons}/{enr.total_lessons} Bài ({enr.progress_pct}%)</span>
                  </div>
                  <ProgressBar value={enr.progress_pct} max={100} />
                  {enr.gpa_average > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700, marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Điểm GPA hiện tại:</span>
                      <span>{enr.gpa_average} / 10</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  style={{ marginTop: 'auto', borderRadius: '10px', width: '100%', gap: '0.4rem', fontWeight: 600 }}
                  onClick={() => navigate(`/student/courses/${enr.course_id}`)}
                >
                  <Play size={16} /> Tiếp tục học ngay
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
