import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  BookOpen,
  Users,
  CheckCircle,
  Trash2,
  Edit,
  Play,
  Pause,
  UserCheck,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  Input,
  Select,
  Dialog,
  FormField,
} from '../components/ui';
import { coursesApi } from '../api/coursesApi';
import { adminUsersApi } from '../api/adminUsersApi';
import type { Course, CourseStatus } from '../types/courses';
import type { AdminUserSummary } from '../types/adminUsers';

const SUBJECT_OPTIONS = ['Tất cả môn', 'Toán học', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Tin học'];
const GRADE_OPTIONS = ['Tất cả khối', 'Lớp 10', 'Lớp 11', 'Lớp 12'];
const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'published', label: 'Đang mở' },
  { value: 'draft', label: 'Nháp' },
  { value: 'archived', label: 'Đã lưu trữ' },
];

export default function AdminCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('Tất cả môn');
  const [gradeFilter, setGradeFilter] = useState('Tất cả khối');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    description: '',
    subject: 'Toán học',
    grade: 'Lớp 10',
    teacher_id: '',
    assistant_teacher_name: '',
    goals: '',
    syllabus_overview: '',
    start_date: '2026-09-05',
    end_date: '2027-01-15',
    status: 'draft' as CourseStatus,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [courseData, teacherData] = await Promise.all([
        coursesApi.getAllCourses(),
        adminUsersApi.list({ role: 'lecturer', status: 'active', page_size: 100 }),
      ]);
      setCourses(courseData);
      setTeachers(teacherData.items);
      if (teacherData.items[0]) {
        setFormData((current) => current.teacher_id ? current : { ...current, teacher_id: teacherData.items[0].id });
      }
    } catch {
      setError('Không thể tải dữ liệu khóa học.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const filteredCourses = courses.filter((c) => {
    const matchSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.teacher_name.toLowerCase().includes(search.toLowerCase());
    const matchSubject = subjectFilter === 'Tất cả môn' || c.subject === subjectFilter;
    const matchGrade = gradeFilter === 'Tất cả khối' || c.grade === gradeFilter;
    const matchTeacher = teacherFilter === 'all' || c.teacher_id === teacherFilter;
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchSubject && matchGrade && matchTeacher && matchStatus;
  });

  const handleCreateSubmit = async () => {
    setBusy(true);
    try {
      const selectedTeacher = teachers.find((t) => t.id === formData.teacher_id);
      await coursesApi.createCourse({
        code: formData.code.trim(),
        title: formData.title.trim(),
        description: formData.description.trim(),
        subject: formData.subject,
        grade: formData.grade,
        teacher_id: formData.teacher_id,
        teacher_name: selectedTeacher?.full_name || '',
        assistant_teacher_name: formData.assistant_teacher_name.trim() || undefined,
        goals: formData.goals.split('\n').filter(Boolean),
        syllabus_overview: formData.syllabus_overview,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: formData.status,
      });
      setCreateModalOpen(false);
      resetForm();
      loadData();
    } catch {
      alert('Không thể tạo khóa học mới.');
    } finally {
      setBusy(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editCourse) return;
    setBusy(true);
    try {
      const selectedTeacher = teachers.find((t) => t.id === formData.teacher_id);
      await coursesApi.updateCourse(editCourse.id, {
        code: formData.code.trim(),
        title: formData.title.trim(),
        description: formData.description.trim(),
        subject: formData.subject,
        grade: formData.grade,
        teacher_id: formData.teacher_id,
        teacher_name: selectedTeacher?.full_name || editCourse.teacher_name,
        assistant_teacher_name: formData.assistant_teacher_name.trim() || undefined,
        goals: formData.goals.split('\n').filter(Boolean),
        syllabus_overview: formData.syllabus_overview,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: formData.status,
      });
      setEditCourse(null);
      resetForm();
      loadData();
    } catch {
      alert('Không thể cập nhật khóa học.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (course: Course) => {
    const nextStatus: CourseStatus = course.status === 'published' ? 'draft' : 'published';
    try {
      await coursesApi.updateCourse(course.id, { status: nextStatus });
      loadData();
    } catch {
      alert('Lỗi đổi trạng thái khóa học');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await coursesApi.deleteCourse(confirmDelete.id);
      setConfirmDelete(null);
      loadData();
    } catch {
      alert('Lỗi xóa khóa học');
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      title: '',
      description: '',
      subject: 'Toán học',
      grade: 'Lớp 10',
      teacher_id: teachers[0]?.id || '',
      assistant_teacher_name: '',
      goals: '',
      syllabus_overview: '',
      start_date: '2026-09-05',
      end_date: '2027-01-15',
      status: 'draft',
    });
  };

  const openEditModal = (c: Course) => {
    setEditCourse(c);
    setFormData({
      code: c.code,
      title: c.title,
      description: c.description,
      subject: c.subject,
      grade: c.grade,
      teacher_id: c.teacher_id,
      assistant_teacher_name: c.assistant_teacher_name || '',
      goals: c.goals.join('\n'),
      syllabus_overview: c.syllabus_overview,
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
    });
  };

  const renderStatusBadge = (st: CourseStatus) => {
    switch (st) {
      case 'published':
        return <Badge variant="success">Đang mở</Badge>;
      case 'draft':
        return <Badge variant="warning">Nháp</Badge>;
      case 'archived':
        return <Badge variant="neutral">Đã lưu trữ</Badge>;
    }
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
      <PageHeader
        title="Quản lý Đào tạo & Khóa học"
        description="Quản lý danh sách khóa học, phân công giáo viên phụ trách, lộ trình bài giảng và đăng ký của học sinh."
        actions={
          <Button
            variant="primary"
            style={{ borderRadius: '12px', gap: '0.4rem', fontWeight: 600 }}
            onClick={() => {
              resetForm();
              setCreateModalOpen(true);
            }}
          >
            <Plus size={16} /> Thêm khóa học mới
          </Button>
        }
      />

      {/* Stat Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Card style={{ borderRadius: '16px' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.8rem', borderRadius: '14px', background: '#eff6ff', color: '#2563eb' }}>
              <BookOpen size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Tổng số khóa học</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{courses.length}</div>
            </div>
          </CardBody>
        </Card>

        <Card style={{ borderRadius: '16px' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.8rem', borderRadius: '14px', background: '#ecfdf5', color: '#10b981' }}>
              <CheckCircle size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Khóa học đang mở</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                {courses.filter((c) => c.status === 'published').length}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card style={{ borderRadius: '16px' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.8rem', borderRadius: '14px', background: '#f5f3ff', color: '#7c3aed' }}>
              <UserCheck size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Giáo viên phụ trách</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{teachers.length}</div>
            </div>
          </CardBody>
        </Card>

        <Card style={{ borderRadius: '16px' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.8rem', borderRadius: '14px', background: '#fff7ed', color: '#ea580c' }}>
              <Users size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Tổng lượt đăng ký</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                {courses.reduce((acc, curr) => acc + curr.student_count, 0)}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', padding: '1rem', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Input
            placeholder="Tìm theo Mã, Tên khóa học hoặc Giáo viên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ borderRadius: '10px', width: '100%' }}
          />
        </div>
        <Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} style={{ borderRadius: '10px', width: '150px' }}>
          {SUBJECT_OPTIONS.map((sub) => (
            <option key={sub} value={sub}>{sub}</option>
          ))}
        </Select>
        <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ borderRadius: '10px', width: '140px' }}>
          {GRADE_OPTIONS.map((gr) => (
            <option key={gr} value={gr}>{gr}</option>
          ))}
        </Select>
        <Select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} style={{ borderRadius: '10px', width: '180px' }}>
          <option value="all">Tất cả giáo viên</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ borderRadius: '10px', width: '160px' }}>
          {STATUS_OPTIONS.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </Select>
      </div>

      {/* Course Grid / Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải danh sách khóa học...</div>
      ) : error ? (
        <Card style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
          {error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button>
        </Card>
      ) : filteredCourses.length === 0 ? (
        <Card style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          Không tìm thấy khóa học nào phù hợp với bộ lọc.
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredCourses.map((crs) => (
            <Card key={crs.id} style={{ borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0' }}>
              <div style={{ padding: '1.2rem 1.2rem 0.5rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <Badge variant="primary">{crs.code}</Badge>
                  <Badge variant="success">{crs.subject}</Badge>
                </div>
                <div>
                  {renderStatusBadge(crs.status)}
                </div>
              </div>

              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1, padding: '1.2rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 700 }}>{crs.grade}</div>
                  <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.08rem', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                    {crs.title}
                  </h3>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {crs.description}
                  </p>
                </div>

                <div style={{ padding: '0.75rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>👨‍🏫 GV phụ trách:</span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{crs.teacher_name}</span>
                  </div>
                  {crs.assistant_teacher_name && (
                    <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>🤝 GV hỗ trợ:</span>
                      <span style={{ color: '#475569' }}>{crs.assistant_teacher_name}</span>
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                    <span>🗓️ Thời gian:</span>
                    <span>{crs.start_date} - {crs.end_date}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center', fontSize: '0.78rem', padding: '0.5rem 0', borderTop: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ color: '#64748b' }}>Bài học</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{crs.lesson_count}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b' }}>Bài tập</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{crs.assignment_count}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b' }}>Học sinh</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2563eb' }}>{crs.student_count}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ flex: 1, borderRadius: '8px', fontSize: '0.8rem', gap: '0.3rem' }}
                    onClick={() => navigate(`/admin/courses/${crs.id}/lessons`)}
                  >
                    <BookOpen size={14} /> Bài học
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    title={crs.status === 'published' ? 'Chuyển về bản nháp' : 'Xuất bản khóa học'}
                    onClick={() => handleToggleStatus(crs)}
                    style={{ borderRadius: '8px' }}
                  >
                    {crs.status === 'published' ? <Pause size={15} style={{ color: '#eab308' }} /> : <Play size={15} style={{ color: '#10b981' }} />}
                  </Button>

                  <Button variant="ghost" size="sm" onClick={() => openEditModal(crs)} style={{ borderRadius: '8px' }}>
                    <Edit size={15} />
                  </Button>

                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(crs)} style={{ borderRadius: '8px' }}>
                    <Trash2 size={15} style={{ color: '#ef4444' }} />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Tạo Khóa Học */}
      {createModalOpen && (
        <Dialog
          open
          onClose={() => setCreateModalOpen(false)}
          title="Tạo khóa học mới"
          closeOnOverlayClick={!busy}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!formData.title.trim() || !formData.code.trim()}
                onClick={handleCreateSubmit}
              >
                Tạo khóa học
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
              <FormField label="Mã khóa học" required>
                <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="VD: TOAN10-A1" />
              </FormField>
              <FormField label="Tên khóa học" required>
                <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="VD: Toán học 10 - Đại số & Hàm số" />
              </FormField>
            </div>

            <FormField label="Mô tả ngắn">
              <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Mô tả tổng quan về khóa học..." />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Môn học">
                <Select value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })}>
                  {SUBJECT_OPTIONS.filter((s) => s !== 'Tất cả môn').map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Khối / Lớp">
                <Select value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value })}>
                  {GRADE_OPTIONS.filter((g) => g !== 'Tất cả khối').map((gr) => (
                    <option key={gr} value={gr}>{gr}</option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Giáo viên phụ trách chính" required>
                <Select value={formData.teacher_id} onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Giáo viên hỗ trợ (Nếu có)">
                <Input value={formData.assistant_teacher_name} onChange={(e) => setFormData({ ...formData, assistant_teacher_name: e.target.value })} placeholder="VD: Trần Minh Đức" />
              </FormField>
            </div>

            <FormField label="Mục tiêu khóa học (Mỗi mục 1 dòng)">
              <textarea
                value={formData.goals}
                onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                placeholder="- Nắm vững khái niệm hàm số&#10;- Giải phương trình bậc hai"
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <FormField label="Ngày bắt đầu">
                <Input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
              </FormField>
              <FormField label="Ngày kết thúc">
                <Input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
              </FormField>
              <FormField label="Trạng thái">
                <Select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as CourseStatus })}>
                  <option value="published">Đang mở</option>
                  <option value="draft">Nháp</option>
                  <option value="archived">Đã lưu trữ</option>
                </Select>
              </FormField>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal Chỉnh Sửa Khóa Học */}
      {editCourse && (
        <Dialog
          open
          onClose={() => setEditCourse(null)}
          title={`Chỉnh sửa khóa học: ${editCourse.code}`}
          closeOnOverlayClick={!busy}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setEditCourse(null)}>Hủy</Button>
              <Button variant="primary" loading={busy} onClick={handleEditSubmit}>Lưu thay đổi</Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Tên khóa học" required>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
            </FormField>

            <FormField label="Mô tả">
              <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Giáo viên phụ trách">
                <Select value={formData.teacher_id} onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Trạng thái">
                <Select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as CourseStatus })}>
                  <option value="published">Đang mở</option>
                  <option value="draft">Nháp</option>
                  <option value="archived">Đã lưu trữ</option>
                </Select>
              </FormField>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(null)}
          title="Xác nhận xóa khóa học"
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(null)}>Hủy</Button>
              <Button variant="danger" loading={busy} onClick={handleDelete}>Xóa khóa học</Button>
            </>
          }
        >
          Bạn có chắc chắn muốn xóa khóa học <strong>{confirmDelete.title}</strong>? Thao tác này không thể hoàn tác.
        </Dialog>
      )}
    </div>
  );
}
