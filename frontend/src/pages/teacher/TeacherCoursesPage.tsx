import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { PageHeader, Card, CardBody, Button, Badge, Input, Select } from '../../components/ui';
import { coursesApi } from '../../api/coursesApi';
import type { Course, Lesson } from '../../types/courses';

export default function TeacherCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCourses(await coursesApi.getAllCourses());
    } catch {
      setError('Không thể tải các khóa học được phân công.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadCourses());
  }, [loadCourses]);

  const openCourse = async (course: Course) => {
    setSelectedCourse(course);
    setLessons([]);
    try {
      setLessons(await coursesApi.getLessons(course.id));
    } catch {
      setError('Không thể tải bài học của khóa học.');
    }
  };

  const togglePublished = async (course: Course) => {
    setBusy(true);
    try {
      const updated = await coursesApi.updateCourse(course.id, {
        status: course.status === 'published' ? 'draft' : 'published',
      });
      setCourses((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelectedCourse(updated);
    } catch {
      setError('Không thể cập nhật trạng thái khóa học.');
    } finally {
      setBusy(false);
    }
  };

  const subjects = useMemo(() => [...new Set(courses.map((course) => course.subject))], [courses]);
  const filteredCourses = courses.filter((course) =>
    (subjectFilter === 'all' || course.subject === subjectFilter) &&
    `${course.title} ${course.description}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title="Quản lý Khóa học Giảng dạy"
        description="Các khóa học được quản trị viên phân công cho bạn."
      />

      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--ez-surface, #fff)', borderRadius: '16px', border: '1px solid var(--ez-border-subtle, #e2e8f0)' }}>
        <Input placeholder="Tìm tên khóa học hoặc nội dung..." value={search} onChange={(event) => setSearch(event.target.value)} style={{ borderRadius: '10px', flex: 1 }} />
        <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} style={{ borderRadius: '10px', width: '160px' }}>
          <option value="all">Tất cả môn</option>
          {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
        </Select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải khóa học...</div>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
          {error} <Button variant="outline" size="sm" onClick={() => void loadCourses()}>Thử lại</Button>
        </Card>
      ) : filteredCourses.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Bạn chưa được phân công khóa học nào.</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {filteredCourses.map((course) => (
            <Card key={course.id} style={{ borderRadius: '20px' }}>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Badge variant="primary">{course.grade}</Badge>
                  <Badge variant={course.status === 'published' ? 'success' : 'warning'}>
                    {course.status === 'published' ? 'Đang mở' : course.status === 'draft' ? 'Nháp' : 'Đã lưu trữ'}
                  </Badge>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--ez-text, #0f172a)' }}>{course.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--ez-text-secondary, #64748b)' }}>{course.description}</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#64748b' }}>
                  <span>👥 {course.student_count} học sinh</span>
                  <span>📚 {course.lesson_count} bài học</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => void openCourse(course)}>
                  Xem bài học <ChevronRight size={14} />
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {selectedCourse && (
        <Card style={{ borderRadius: '20px', border: '2px solid var(--ez-primary, #2563eb)' }}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <Badge variant="primary">{selectedCourse.code}</Badge>
                <h2 style={{ margin: '0.35rem 0 0' }}>{selectedCourse.title}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {selectedCourse.status !== 'archived' && (
                  <Button variant="outline" size="sm" loading={busy} onClick={() => void togglePublished(selectedCourse)}>
                    {selectedCourse.status === 'published' ? 'Chuyển về nháp' : 'Xuất bản'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelectedCourse(null)}>Đóng</Button>
              </div>
            </div>
            {lessons.length === 0 ? (
              <div style={{ color: '#64748b' }}>Khóa học chưa có bài học.</div>
            ) : lessons.map((lesson) => (
              <div key={lesson.id} style={{ padding: '0.9rem', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <strong><BookOpen size={15} style={{ verticalAlign: 'middle' }} /> {lesson.title}</strong>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.25rem' }}>{lesson.chapter_title} · {lesson.duration_mins} phút</div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
