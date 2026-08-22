import { useCallback, useEffect, useState } from 'react';
import { Calendar, Plus, Trash2, Video } from 'lucide-react';
import { schedulesApi, type Schedule, type ScheduleEventType } from '../api/schedulesApi';
import { coursesApi } from '../api/coursesApi';
import type { Course } from '../types/courses';
import { PageHeader, Card, CardBody, Button, Badge, Dialog, FormField, Input, Select } from '../components/ui';

export default function SchedulesPage({ mode, eventType, heading }: {
  mode: 'admin' | 'teacher' | 'student';
  eventType?: ScheduleEventType;
  heading?: string;
}) {
  const readOnly = mode === 'student';
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    course_id: '',
    title: '',
    event_type: (mode === 'admin' ? 'exam' : 'class') as ScheduleEventType,
    start_at: '',
    end_at: '',
    join_url: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [scheduleData, courseData] = await Promise.all([
        schedulesApi.list(eventType || mode === 'admin' ? { event_type: eventType || 'exam' } : undefined),
        readOnly ? Promise.resolve([]) : coursesApi.getAllCourses(),
      ]);
      setSchedules(scheduleData);
      setCourses(courseData);
      setForm((current) => ({ ...current, course_id: current.course_id || courseData[0]?.id || '' }));
    } catch {
      setError('Không thể tải lịch.');
    } finally {
      setLoading(false);
    }
  }, [eventType, mode, readOnly]);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const create = async () => {
    if (!form.course_id || !form.title.trim() || !form.start_at || !form.end_at) return;
    setBusy(true);
    try {
      await schedulesApi.create({
        ...form,
        title: form.title.trim(),
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        join_url: form.join_url || null,
      });
      setDialogOpen(false);
      setForm((current) => ({ ...current, title: '', start_at: '', end_at: '', join_url: '' }));
      await loadData();
    } catch {
      setError('Không thể tạo lịch. Hãy kiểm tra thời gian kết thúc.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (item: Schedule) => {
    setBusy(true);
    try {
      await schedulesApi.delete(item.id);
      await loadData();
    } catch {
      setError('Không thể hủy lịch.');
    } finally {
      setBusy(false);
    }
  };

  const title = heading || (mode === 'admin' ? 'Quản lý Lịch thi' : mode === 'teacher' ? 'Thời khóa biểu & Lịch dạy' : 'Lịch học Online');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title={title}
        description="Lịch được đồng bộ từ các khóa học và hiển thị theo múi giờ thiết bị."
        actions={!readOnly && <Button variant="primary" onClick={() => setDialogOpen(true)}><Plus size={16} /> Thêm lịch</Button>}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải lịch...</div>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button></Card>
      ) : schedules.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Chưa có lịch phù hợp.</Card>
      ) : schedules.map((item) => (
        <Card key={item.id} style={{ borderRadius: '18px' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {item.event_type === 'online' ? <Video size={24} /> : <Calendar size={24} />}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><strong>{item.title}</strong><Badge variant={item.status === 'scheduled' ? 'primary' : 'neutral'}>{item.status === 'scheduled' ? 'Sắp diễn ra' : item.status === 'cancelled' ? 'Đã hủy' : 'Hoàn tất'}</Badge></div>
                <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '0.25rem' }}>{item.course_title} · {new Date(item.start_at).toLocaleString('vi-VN')} – {new Date(item.end_at).toLocaleTimeString('vi-VN')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {item.join_url && item.status === 'scheduled' && <Button variant="outline" size="sm" onClick={() => window.open(item.join_url || '', '_blank', 'noopener')}>Tham gia</Button>}
              {!readOnly && item.status === 'scheduled' && <Button aria-label={`Hủy ${item.title}`} variant="ghost" size="sm" loading={busy} onClick={() => void cancel(item)}><Trash2 size={15} /></Button>}
            </div>
          </CardBody>
        </Card>
      ))}

      {dialogOpen && (
        <Dialog open onClose={() => setDialogOpen(false)} title="Thêm lịch" closeOnOverlayClick={!busy} footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button><Button variant="primary" loading={busy} onClick={() => void create()}>Tạo lịch</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Khóa học" required><Select value={form.course_id} onChange={(event) => setForm({ ...form, course_id: event.target.value })}>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></FormField>
            <FormField label="Tiêu đề" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></FormField>
            <FormField label="Loại lịch"><Select value={form.event_type} onChange={(event) => setForm({ ...form, event_type: event.target.value as ScheduleEventType })}><option value="class">Học trên lớp</option><option value="online">Online</option><option value="exam">Thi</option><option value="meeting">Họp</option></Select></FormField>
            <FormField label="Bắt đầu" required><Input type="datetime-local" value={form.start_at} onChange={(event) => setForm({ ...form, start_at: event.target.value })} /></FormField>
            <FormField label="Kết thúc" required><Input type="datetime-local" value={form.end_at} onChange={(event) => setForm({ ...form, end_at: event.target.value })} /></FormField>
            <FormField label="Link tham gia"><Input type="url" value={form.join_url} onChange={(event) => setForm({ ...form, join_url: event.target.value })} /></FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
