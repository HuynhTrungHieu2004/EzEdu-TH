import { useCallback, useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  Input,
  Select,
  DataTable,
  Dialog,
  FormField,
  ProgressBar,
} from '../components/ui';
import { coursesApi } from '../api/coursesApi';
import { adminUsersApi } from '../api/adminUsersApi';
import type { CourseEnrollment, CourseEnrollmentStatus, Course } from '../types/courses';
import type { AdminUserSummary } from '../types/adminUsers';

const STATUS_LABELS: Record<CourseEnrollmentStatus, { label: string; variant: 'success' | 'warning' | 'primary' | 'neutral' }> = {
  learning: { label: 'Đang học', variant: 'primary' },
  completed: { label: 'Hoàn thành', variant: 'success' },
  not_started: { label: 'Chưa bắt đầu', variant: 'warning' },
  cancelled: { label: 'Đã hủy', variant: 'neutral' },
};

export default function AdminCourseEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<CourseEnrollment | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<CourseEnrollment | null>(null);
  const [busy, setBusy] = useState(false);

  // Form State for Enrolling Student
  const [enrollForm, setEnrollForm] = useState({
    course_id: '',
    student_id: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [enrData, courseData, studentData] = await Promise.all([
        coursesApi.getEnrollments(),
        coursesApi.getAllCourses(),
        adminUsersApi.list({ role: 'student', status: 'active', page_size: 100 }),
      ]);
      setEnrollments(enrData);
      setCourses(courseData);
      setStudents(studentData.items);
      setEnrollForm((prev) => ({
        course_id: prev.course_id || courseData[0]?.id || '',
        student_id: prev.student_id || studentData.items[0]?.id || '',
      }));
    } catch {
      setError('Không thể tải danh sách ghi danh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const filteredEnrollments = enrollments.filter((e) => {
    const matchSearch =
      e.student_name.toLowerCase().includes(search.toLowerCase()) ||
      e.student_code.toLowerCase().includes(search.toLowerCase()) ||
      e.course_title.toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || e.course_id === courseFilter;
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchCourse && matchStatus;
  });

  const handleEnrollSubmit = async () => {
    if (!enrollForm.course_id || !enrollForm.student_id) return;
    setBusy(true);
    try {
      await coursesApi.createEnrollment({
        course_id: enrollForm.course_id,
        student_id: enrollForm.student_id,
      });
      setEnrollModalOpen(false);
      await loadData();
    } catch {
      alert('Không thể ghi danh học sinh');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) return;
    setBusy(true);
    try {
      await coursesApi.removeEnrollment(confirmRemove.id);
      setConfirmRemove(null);
      await loadData();
    } catch {
      alert('Không thể xóa học sinh khỏi khóa học');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'student',
      title: 'Học sinh',
      label: 'Học sinh',
      render: (row: CourseEnrollment) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.student_name}</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Mã HS: {row.student_code} • {row.student_email}</div>
        </div>
      ),
    },
    {
      key: 'course',
      title: 'Khóa học',
      label: 'Khóa học',
      render: (row: CourseEnrollment) => (
        <div>
          <div style={{ fontWeight: 600, color: '#2563eb' }}>{row.course_title}</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{row.subject} ({row.grade}) • GV: {row.teacher_name}</div>
        </div>
      ),
    },
    {
      key: 'enrollment_date',
      title: 'Ngày đăng ký',
      label: 'Ngày đăng ký',
      render: (row: CourseEnrollment) => (
        <div style={{ fontSize: '0.82rem', color: '#475569' }}>{row.enrollment_date}</div>
      ),
    },
    {
      key: 'progress',
      title: 'Tiến độ & GPA',
      label: 'Tiến độ & GPA',
      render: (row: CourseEnrollment) => (
        <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600 }}>
            <span>{row.completed_lessons}/{row.total_lessons} Bài ({row.progress_pct}%)</span>
            <span style={{ color: '#059669' }}>{row.gpa_average > 0 ? `GPA: ${row.gpa_average}` : '--'}</span>
          </div>
          <ProgressBar value={row.progress_pct} max={100} />
        </div>
      ),
    },
    {
      key: 'status',
      title: 'Trạng thái',
      label: 'Trạng thái',
      render: (row: CourseEnrollment) => {
        const conf = STATUS_LABELS[row.status];
        return <Badge variant={conf.variant}>{conf.label}</Badge>;
      },
    },
    {
      key: 'actions',
      title: 'Thao tác',
      label: 'Thao tác',
      render: (row: CourseEnrollment) => (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <Button variant="outline" size="sm" onClick={() => setSelectedEnrollment(row)}>Xem tiến độ</Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(row)}>
            <Trash2 size={15} style={{ color: '#ef4444' }} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
      <PageHeader
        title="Quản lý Đăng ký Khóa học của Học sinh"
        description="Theo dõi danh sách học sinh đăng ký các khóa học, tiến độ hoàn thành bài giảng và kết quả điểm trung bình GPA."
        actions={
          <Button variant="primary" style={{ borderRadius: '12px', gap: '0.4rem' }} onClick={() => setEnrollModalOpen(true)}>
            <Plus size={16} /> Ghi danh học sinh vào khóa học
          </Button>
        }
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        <Input
          placeholder="Tìm tên HS, Mã HS hoặc Khóa học..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, borderRadius: '10px' }}
        />
        <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} style={{ width: '220px', borderRadius: '10px' }}>
          <option value="all">Tất cả khóa học</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.code} - {c.title}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '160px', borderRadius: '10px' }}>
          <option value="all">Tất cả trạng thái</option>
          <option value="learning">Đang học</option>
          <option value="completed">Hoàn thành</option>
          <option value="not_started">Chưa bắt đầu</option>
        </Select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải danh sách ghi danh...</div>
      ) : error ? (
        <Card style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
          {error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button>
        </Card>
      ) : (
        <Card style={{ borderRadius: '20px', overflow: 'hidden' }}>
          <CardBody style={{ padding: 0 }}>
            <DataTable
              data={filteredEnrollments}
              columns={columns}
              rowKey={(row) => row.id}
              emptyMessage="Không có dữ liệu đăng ký khóa học nào."
            />
          </CardBody>
        </Card>
      )}

      {/* Modal Thêm Học sinh vào Khóa học */}
      {enrollModalOpen && (
        <Dialog
          open
          onClose={() => setEnrollModalOpen(false)}
          title="Ghi danh học sinh vào khóa học"
          closeOnOverlayClick={!busy}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setEnrollModalOpen(false)}>Hủy</Button>
              <Button variant="primary" loading={busy} onClick={handleEnrollSubmit}>Ghi danh</Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Chọn Khóa học" required>
              <Select value={enrollForm.course_id} onChange={(e) => setEnrollForm({ ...enrollForm, course_id: e.target.value })}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.title} (GV: {c.teacher_name})</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Chọn học sinh" required>
              <Select value={enrollForm.student_id} onChange={(e) => setEnrollForm({ ...enrollForm, student_id: e.target.value })}>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name} — {student.student_code || student.email}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </Dialog>
      )}

      {/* Progress Detail Modal */}
      {selectedEnrollment && (
        <Dialog
          open
          onClose={() => setSelectedEnrollment(null)}
          title={`Chi tiết Tiến độ: ${selectedEnrollment.student_name}`}
          footer={<Button variant="primary" onClick={() => setSelectedEnrollment(null)}>Đóng</Button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>{selectedEnrollment.course_title}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                Học sinh: {selectedEnrollment.student_name} ({selectedEnrollment.student_code}) • Lớp: {selectedEnrollment.grade}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ padding: '1rem', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '0.8rem', color: '#1e40af' }}>Tiến độ bài học</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d4ed8', marginTop: '0.2rem' }}>
                  {selectedEnrollment.progress_pct}%
                </div>
                <div style={{ fontSize: '0.78rem', color: '#3b82f6' }}>{selectedEnrollment.completed_lessons} / {selectedEnrollment.total_lessons} bài đã hoàn thành</div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.8rem', color: '#166534' }}>Điểm trung bình (GPA)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>
                  {selectedEnrollment.gpa_average} / 10
                </div>
                <div style={{ fontSize: '0.78rem', color: '#22c55e' }}>Lần đăng nhập cuối: {selectedEnrollment.last_activity_at}</div>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirm */}
      {confirmRemove && (
        <Dialog
          open
          onClose={() => setConfirmRemove(null)}
          title="Xác nhận hủy ghi danh"
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmRemove(null)}>Hủy</Button>
              <Button variant="danger" loading={busy} onClick={handleRemove}>Hủy đăng ký</Button>
            </>
          }
        >
          Xác nhận xóa đăng ký của học sinh <strong>{confirmRemove.student_name}</strong> khỏi khóa học <strong>{confirmRemove.course_title}</strong>?
        </Dialog>
      )}
    </div>
  );
}
