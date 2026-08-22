import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { PageHeader, Card, CardBody, Button, Badge, Input, Select, Dialog, FormField, Textarea } from '../../components/ui';
import { assignmentsApi } from '../../api/assignmentsApi';
import { coursesApi } from '../../api/coursesApi';
import type { Assignment, Course } from '../../types/courses';

export default function TeacherAssignmentsPage() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    course_id: '',
    title: '',
    instructions: '',
    due_at: '',
    max_score: 10,
    status: 'draft' as Assignment['status'],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [assignmentData, courseData] = await Promise.all([assignmentsApi.list(), coursesApi.getAllCourses()]);
      setAssignments(assignmentData);
      setCourses(courseData);
      setForm((current) => ({ ...current, course_id: current.course_id || courseData[0]?.id || '' }));
    } catch {
      setError('Không thể tải danh sách bài tập.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const createAssignment = async () => {
    if (!form.course_id || !form.title.trim() || !form.due_at) return;
    setBusy(true);
    try {
      await assignmentsApi.create({
        ...form,
        title: form.title.trim(),
        due_at: new Date(form.due_at).toISOString(),
        assignment_type: 'essay',
      });
      setDialogOpen(false);
      setForm((current) => ({ ...current, title: '', instructions: '', due_at: '', status: 'draft' }));
      await loadData();
    } catch {
      setError('Không thể tạo bài tập.');
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (assignment: Assignment) => {
    setBusy(true);
    try {
      await assignmentsApi.update(assignment.id, { status: assignment.status === 'published' ? 'draft' : 'published' });
      await loadData();
    } catch {
      setError('Không thể cập nhật bài tập.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (assignment: Assignment) => {
    setBusy(true);
    try {
      await assignmentsApi.delete(assignment.id);
      await loadData();
    } catch {
      setError('Không thể xóa hoặc lưu trữ bài tập.');
    } finally {
      setBusy(false);
    }
  };

  const filtered = assignments.filter((assignment) => {
    const expired = new Date(assignment.due_at).getTime() < now;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'expired' ? expired : assignment.status === statusFilter);
    return matchesStatus && assignment.title.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title="Quản lý & Giao Bài tập"
        description="Tạo, xuất bản và theo dõi bài tập cho các khóa học được phân công."
        actions={<Button variant="primary" onClick={() => setDialogOpen(true)}><Plus size={16} /> Giao bài tập mới</Button>}
      />

      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ width: '180px' }}>
          <option value="all">Tất cả bài tập</option>
          <option value="published">Đang giao</option>
          <option value="draft">Nháp</option>
          <option value="expired">Đã hết hạn</option>
        </Select>
        <Input placeholder="Tìm tiêu đề bài tập..." value={search} onChange={(event) => setSearch(event.target.value)} style={{ flex: 1 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải bài tập...</div>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button></Card>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Chưa có bài tập phù hợp.</Card>
      ) : filtered.map((assignment) => (
        <Card key={assignment.id} style={{ borderRadius: '20px' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Badge variant="primary">{assignment.course_title}</Badge>
                <Badge variant={assignment.status === 'published' ? 'success' : 'warning'}>
                  {assignment.status === 'published' ? 'Đang giao' : assignment.status === 'draft' ? 'Nháp' : 'Đã lưu trữ'}
                </Badge>
              </div>
              <h3 style={{ margin: '0.5rem 0' }}>{assignment.title}</h3>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Hạn nộp: {new Date(assignment.due_at).toLocaleString('vi-VN')} · Đã nộp: {assignment.submitted_count}/{assignment.total_students} · Tối đa: {assignment.max_score}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="outline" size="sm" onClick={() => navigate('/teacher/submissions')}>Xem bài nộp</Button>
              {assignment.status !== 'archived' && <Button aria-label={`${assignment.status === 'published' ? 'Chuyển về nháp' : 'Xuất bản'} ${assignment.title}`} variant="ghost" size="sm" loading={busy} onClick={() => void togglePublished(assignment)}><Edit3 size={15} /></Button>}
              <Button aria-label={`Xóa ${assignment.title}`} variant="ghost" size="sm" loading={busy} onClick={() => void remove(assignment)}><Trash2 size={15} /></Button>
            </div>
          </CardBody>
        </Card>
      ))}

      {dialogOpen && (
        <Dialog
          open
          onClose={() => setDialogOpen(false)}
          title="Giao bài tập mới"
          closeOnOverlayClick={!busy}
          footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button><Button variant="primary" loading={busy} onClick={() => void createAssignment()}>Tạo bài tập</Button></>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Khóa học" required><Select value={form.course_id} onChange={(event) => setForm({ ...form, course_id: event.target.value })}>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></FormField>
            <FormField label="Tiêu đề" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></FormField>
            <FormField label="Hướng dẫn"><Textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></FormField>
            <FormField label="Hạn nộp" required><Input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></FormField>
            <FormField label="Điểm tối đa"><Input type="number" min="1" value={form.max_score} onChange={(event) => setForm({ ...form, max_score: Number(event.target.value) })} /></FormField>
            <FormField label="Trạng thái"><Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Assignment['status'] })}><option value="draft">Nháp</option><option value="published">Xuất bản</option></Select></FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
