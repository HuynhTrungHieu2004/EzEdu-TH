import { useCallback, useEffect, useState } from 'react';
import { Bell, BookOpen, Calendar, ClipboardList, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { assignmentsApi } from '../../api/assignmentsApi';
import { coursesApi } from '../../api/coursesApi';
import { notificationsApi, type UserNotification } from '../../api/notificationsApi';
import { schedulesApi, type Schedule } from '../../api/schedulesApi';
import { Button, Card, CardBody, PageHeader, StatGrid, StatTile } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import type { Assignment, CourseEnrollment } from '../../types/courses';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseEnrollment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled([
        coursesApi.getStudentEnrollments(),
        assignmentsApi.list(),
        schedulesApi.list(),
        notificationsApi.list(),
      ]);
      const [courseData, assignmentData, scheduleData, notificationData] = results;
      if (courseData.status === 'fulfilled') setCourses(courseData.value);
      if (assignmentData.status === 'fulfilled') setAssignments(assignmentData.value);
      if (scheduleData.status === 'fulfilled') setSchedules(scheduleData.value);
      if (notificationData.status === 'fulfilled') setNotifications(notificationData.value);
      if (results.some((result) => result.status === 'rejected')) {
        setError('Một số dữ liệu chưa thể tải. Bạn có thể bấm Làm mới để thử lại.');
      }
    } catch {
      setError('Không thể tải tổng quan học tập.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const now = new Date();
  const today = now.toDateString();
  const dueAssignments = assignments.filter((item) => new Date(item.due_at) >= now);
  const todaySchedules = schedules.filter((item) => new Date(item.start_at).toDateString() === today && item.status === 'scheduled');
  const average = courses.length ? (courses.reduce((sum, item) => sum + item.gpa_average, 0) / courses.length).toFixed(1) : '—';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader title={`Xin chào, ${user?.full_name || 'bạn'}`} description="Tổng quan được cập nhật từ khóa học, bài tập, lịch học và thông báo của bạn." actions={<Button variant="outline" onClick={() => void load()}>Làm mới</Button>} />
      {loading ? <Card style={{ padding: '3rem', textAlign: 'center' }}>Đang tải...</Card> : <>
        {error && <Card style={{ padding: '1rem', textAlign: 'center', color: '#b91c1c' }}>{error}</Card>}
        <StatGrid>
          <StatTile label="Khóa học" value={courses.length} icon={<BookOpen size={20} />} />
          <StatTile label="Bài tập sắp hạn" value={dueAssignments.length} icon={<ClipboardList size={20} />} />
          <StatTile label="Lịch hôm nay" value={todaySchedules.length} icon={<Calendar size={20} />} />
          <StatTile label="Điểm trung bình" value={average} icon={<BookOpen size={20} />} />
        </StatGrid>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          <Card><CardBody><h3>Lịch sắp tới</h3>{schedules.filter((item) => item.status === 'scheduled' && new Date(item.end_at) >= now).slice(0, 4).map((item) => <p key={item.id}><strong>{item.title}</strong><br /><span style={{ color: '#64748b' }}>{new Date(item.start_at).toLocaleString('vi-VN')}</span></p>)}{schedules.length === 0 && <p style={{ color: '#64748b' }}>Chưa có lịch học.</p>}<Link to="/student/online-schedules">Xem toàn bộ lịch</Link></CardBody></Card>
          <Card><CardBody><h3>Bài tập sắp hạn</h3>{dueAssignments.slice(0, 4).map((item) => <p key={item.id}><strong>{item.title}</strong><br /><span style={{ color: '#64748b' }}>{item.course_title} · {new Date(item.due_at).toLocaleString('vi-VN')}</span></p>)}{dueAssignments.length === 0 && <p style={{ color: '#64748b' }}>Không có bài tập sắp hạn.</p>}<Link to="/student/courses">Vào khóa học</Link></CardBody></Card>
          <Card><CardBody><h3>Thông báo mới</h3>{notifications.filter((item) => !item.is_read).slice(0, 4).map((item) => <p key={item.id}><Bell size={14} /> <strong>{item.title}</strong><br /><span style={{ color: '#64748b' }}>{item.content}</span></p>)}{notifications.every((item) => item.is_read) && <p style={{ color: '#64748b' }}>Không có thông báo mới.</p>}<Link to="/student/notifications">Xem thông báo</Link></CardBody></Card>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}><Button variant="primary" onClick={() => { window.location.href = '/student/practice'; }}><ClipboardList size={16} /> Luyện tập</Button><Button variant="outline" onClick={() => { window.location.href = '/student/ask-ai'; }}><MessageSquare size={16} /> Hỏi AI</Button></div>
      </>}
    </div>
  );
}
