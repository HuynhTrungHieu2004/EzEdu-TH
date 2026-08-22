import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowLeft,
  FileText,
  Video,
  Edit,
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
import type { Lesson, Course } from '../types/courses';

export default function AdminCourseLessonsPage() {
  const { courseId = 'CRS-101' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [busy, setBusy] = useState(false);

  const [lessonForm, setLessonForm] = useState({
    chapter_title: 'Chương 1: Mệnh đề & Tập hợp',
    title: '',
    description: '',
    content: '',
    duration_mins: 45,
    attachment_name: '',
    attachment_type: 'pdf' as 'video' | 'pdf' | 'document' | 'link',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cData, lData] = await Promise.all([
        coursesApi.getCourseById(courseId),
        coursesApi.getLessons(courseId),
      ]);
      setCourse(cData || null);
      setLessons(lData);
    } catch {
      setError('Không thể tải dữ liệu bài học.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  const handleCreateSubmit = async () => {
    if (!lessonForm.title.trim()) return;
    setBusy(true);
    try {
      const attachments = lessonForm.attachment_name.trim()
        ? [
            {
              id: `${courseId}-${lessonForm.attachment_name.trim()}`,
              name: lessonForm.attachment_name.trim(),
              type: lessonForm.attachment_type,
              url: '#',
            },
          ]
        : [];

      await coursesApi.createLesson({
        course_id: courseId,
        chapter_title: lessonForm.chapter_title,
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim(),
        content: lessonForm.content.trim(),
        duration_mins: Number(lessonForm.duration_mins) || 45,
        status: 'published',
        attachments,
      });

      setCreateModalOpen(false);
      resetForm();
      loadData();
    } catch {
      alert('Không thể tạo bài học');
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setLessonForm({
      chapter_title: 'Chương 1: Mệnh đề & Tập hợp',
      title: '',
      description: '',
      content: '',
      duration_mins: 45,
      attachment_name: '',
      attachment_type: 'pdf',
    });
  };

  const handleEditSubmit = async () => {
    if (!editLesson?.title.trim()) return;
    setBusy(true);
    try {
      await coursesApi.updateLesson(courseId, editLesson.id, {
        title: editLesson.title.trim(),
        description: editLesson.description.trim(),
        content: editLesson.content,
        duration_mins: editLesson.duration_mins,
        status: editLesson.status,
      });
      setEditLesson(null);
      await loadData();
    } catch {
      setError('Không thể cập nhật bài học.');
    } finally {
      setBusy(false);
    }
  };

  // Group lessons by Chapter
  const groupedChapters = lessons.reduce((acc, lesson) => {
    const chapter = lesson.chapter_title || 'Chương chung';
    if (!acc[chapter]) acc[chapter] = [];
    acc[chapter].push(lesson);
    return acc;
  }, {} as Record<string, Lesson[]>);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/courses')} style={{ gap: '0.4rem', marginBottom: '0.5rem' }}>
          <ArrowLeft size={16} /> Quay lại danh sách khóa học
        </Button>
        <PageHeader
          title={`Quản lý Lộ trình & Bài học: ${course?.title || courseId}`}
          description={`Khóa học: ${course?.code || courseId} • GV Phụ trách: ${course?.teacher_name || 'Nguyễn Văn An'}`}
          actions={
            <Button variant="primary" style={{ borderRadius: '12px', gap: '0.4rem' }} onClick={() => setCreateModalOpen(true)}>
              <Plus size={16} /> Thêm bài học mới
            </Button>
          }
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Đang tải bài học...</div>
      ) : error ? (
        <Card style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>
          {error} <Button variant="outline" size="sm" onClick={() => void loadData()}>Thử lại</Button>
        </Card>
      ) : Object.keys(groupedChapters).length === 0 ? (
        <Card style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          Chưa có bài học nào trong khóa học này. Hãy bấm "Thêm bài học mới" để tạo bài giảng đầu tiên!
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {Object.entries(groupedChapters).map(([chapterTitle, chapterLessons], idx) => (
            <Card key={idx} style={{ borderRadius: '18px', border: '1px solid #e2e8f0' }}>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                    📖 {chapterTitle} ({chapterLessons.length} bài)
                  </h3>
                  <Badge variant="primary">Chương {idx + 1}</Badge>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {chapterLessons.map((les, lIdx) => (
                    <div
                      key={les.id}
                      style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', flex: 1 }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                          {lIdx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a' }}>{les.title}</div>
                          <div style={{ fontSize: '0.83rem', color: '#64748b', marginTop: '0.2rem' }}>{les.description}</div>

                          {les.attachments && les.attachments.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                              {les.attachments.map((att) => (
                                <span key={att.id} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#fff', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  {att.type === 'video' ? <Video size={12} style={{ color: '#2563eb' }} /> : <FileText size={12} style={{ color: '#10b981' }} />}
                                  {att.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>⏱️ {les.duration_mins} phút</span>
                        <Button variant="ghost" size="sm" onClick={() => setEditLesson(les)}>
                          <Edit size={15} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Tạo Bài Học */}
      {createModalOpen && (
        <Dialog
          open
          onClose={() => setCreateModalOpen(false)}
          title="Thêm bài học mới"
          closeOnOverlayClick={!busy}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setCreateModalOpen(false)}>Hủy</Button>
              <Button variant="primary" loading={busy} disabled={!lessonForm.title.trim()} onClick={handleCreateSubmit}>
                Tạo bài học
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Tên Chương" required>
              <Select value={lessonForm.chapter_title} onChange={(e) => setLessonForm({ ...lessonForm, chapter_title: e.target.value })}>
                <option value="Chương 1: Mệnh đề & Tập hợp">Chương 1: Mệnh đề & Tập hợp</option>
                <option value="Chương 2: Hàm số bậc nhất & bậc hai">Chương 2: Hàm số bậc nhất & bậc hai</option>
                <option value="Chương 3: Phương trình & Bất phương trình">Chương 3: Phương trình & Bất phương trình</option>
              </Select>
            </FormField>

            <FormField label="Tiêu đề bài học" required>
              <Input value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} placeholder="VD: Bài 3: Khái niệm Hàm số & Tập xác định" />
            </FormField>

            <FormField label="Mô tả ngắn">
              <Input value={lessonForm.description} onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })} placeholder="Tóm tắt nội dung chính của bài..." />
            </FormField>

            <FormField label="Thời lượng (Phút)">
              <Input type="number" value={lessonForm.duration_mins} onChange={(e) => setLessonForm({ ...lessonForm, duration_mins: Number(e.target.value) })} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <FormField label="Tên file tài liệu đính kèm">
                <Input value={lessonForm.attachment_name} onChange={(e) => setLessonForm({ ...lessonForm, attachment_name: e.target.value })} placeholder="VD: Giao_an_Chi_Tiet.pdf" />
              </FormField>
              <FormField label="Loại tài liệu">
                <Select value={lessonForm.attachment_type} onChange={(e) => setLessonForm({ ...lessonForm, attachment_type: e.target.value as typeof lessonForm.attachment_type })}>
                  <option value="pdf">PDF</option>
                  <option value="video">Video MP4</option>
                  <option value="document">Docx / Word</option>
                </Select>
              </FormField>
            </div>
          </div>
        </Dialog>
      )}

      {/* Edit Lesson Modal */}
      {editLesson && (
        <Dialog
          open
          onClose={() => setEditLesson(null)}
          title={`Sửa bài học: ${editLesson.title}`}
          closeOnOverlayClick={!busy}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setEditLesson(null)}>Hủy</Button>
              <Button variant="primary" loading={busy} onClick={() => void handleEditSubmit()}>Lưu thay đổi</Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Tiêu đề" required>
              <Input value={editLesson.title} onChange={(event) => setEditLesson({ ...editLesson, title: event.target.value })} />
            </FormField>
            <FormField label="Mô tả">
              <Input value={editLesson.description} onChange={(event) => setEditLesson({ ...editLesson, description: event.target.value })} />
            </FormField>
            <FormField label="Thời lượng (phút)">
              <Input type="number" value={editLesson.duration_mins} onChange={(event) => setEditLesson({ ...editLesson, duration_mins: Number(event.target.value) })} />
            </FormField>
            <FormField label="Trạng thái">
              <Select value={editLesson.status} onChange={(event) => setEditLesson({ ...editLesson, status: event.target.value as Lesson['status'] })}>
                <option value="draft">Nháp</option>
                <option value="published">Xuất bản</option>
                <option value="archived">Lưu trữ</option>
              </Select>
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
