import { useState, useEffect } from 'react';
import {
  Sparkles,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Input,
  DataTable,
  ProgressBar,
  Dialog,
} from '../../components/ui';
import { coursesApi } from '../../api/coursesApi';
import type { CourseEnrollment } from '../../types/courses';

export default function TeacherStudentsPage() {
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<CourseEnrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      setEnrollments(await coursesApi.getEnrollments());
    } catch {
      setError('Không thể tải danh sách học sinh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, []);

  const filteredEnrollments = enrollments.filter(
    (e) =>
      e.student_name.toLowerCase().includes(search.toLowerCase()) ||
      e.student_code.toLowerCase().includes(search.toLowerCase()) ||
      e.course_title.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      key: 'student',
      title: 'Học sinh',
      label: 'Học sinh',
      render: (row: CourseEnrollment) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.student_name}</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Mã: {row.student_code} • Lớp: {row.grade}</div>
        </div>
      ),
    },
    {
      key: 'course',
      title: 'Khóa học đang học',
      label: 'Khóa học đang học',
      render: (row: CourseEnrollment) => (
        <div>
          <div style={{ fontWeight: 600, color: '#2563eb' }}>{row.course_title}</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>GV Phụ trách: {row.teacher_name}</div>
        </div>
      ),
    },
    {
      key: 'progress',
      title: 'Tiến độ học tập',
      label: 'Tiến độ học tập',
      render: (row: CourseEnrollment) => (
        <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600 }}>
            <span>{row.completed_lessons}/{row.total_lessons} Bài</span>
            <span style={{ color: '#2563eb' }}>{row.progress_pct}%</span>
          </div>
          <ProgressBar value={row.progress_pct} max={100} />
        </div>
      ),
    },
    {
      key: 'gpa',
      title: 'Điểm GPA',
      label: 'Điểm GPA',
      render: (row: CourseEnrollment) => (
        <div style={{ fontWeight: 800, color: row.gpa_average >= 8.0 ? '#059669' : row.gpa_average >= 6.5 ? '#d97706' : '#dc2626' }}>
          {row.gpa_average > 0 ? `${row.gpa_average} / 10` : '--'}
        </div>
      ),
    },
    {
      key: 'actions',
      title: 'Phân tích AI',
      label: 'Phân tích AI',
      render: (row: CourseEnrollment) => (
        <Button variant="outline" size="sm" style={{ borderRadius: '8px', gap: '0.3rem' }} onClick={() => setSelectedStudent(row)}>
          <Sparkles size={14} style={{ color: '#7c3aed' }} /> Đánh giá AI
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
      <PageHeader
        title="👨‍🏫 Theo dõi Tiến độ & Đề xuất AI cho Học sinh"
        description="Quản lý tình hình tiếp thu bài giảng, kết quả làm bài tập và nhận các gợi ý hỗ trợ cá nhân hóa từ AI cho từng học sinh."
      />

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        <Input
          placeholder="Tìm tên học sinh, mã HS hoặc khóa học..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, borderRadius: '10px' }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải học sinh...</div>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
          {error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button>
        </Card>
      ) : (
        <Card style={{ borderRadius: '20px', overflow: 'hidden' }}>
          <CardBody style={{ padding: 0 }}>
            <DataTable data={filteredEnrollments} columns={columns} rowKey={(row) => row.id} emptyMessage="Không có dữ liệu học sinh." />
          </CardBody>
        </Card>
      )}

      {/* AI Student Analysis Modal */}
      {selectedStudent && (
        <Dialog
          open
          onClose={() => setSelectedStudent(null)}
          title={`Phân tích Tiến độ AI: ${selectedStudent.student_name}`}
          footer={<Button variant="primary" onClick={() => setSelectedStudent(null)}>Đóng</Button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff' }}>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Khóa học: {selectedStudent.course_title}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.2rem', color: '#38bdf8' }}>
                Tiến độ: {selectedStudent.progress_pct}% • GPA: {selectedStudent.gpa_average}/10
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
              Chưa có phân tích AI đã được lưu cho học sinh này.
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
