import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ClipboardList, FileText, School, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { assignmentsApi } from '../../api/assignmentsApi';
import { classesApi } from '../../api/classesApi';
import { coursesApi } from '../../api/coursesApi';
import { documentApi, type DocumentResponse } from '../../api/documentApi';
import { questionApi, type QuestionSetSummary } from '../../api/questionApi';
import { Button, Card, CardBody, PageHeader, StatGrid, StatTile } from '../../components/ui';
import type { Assignment, Course } from '../../types/courses';

export default function TeacherDashboardPage() {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [questionSets, setQuestionSets] = useState<QuestionSetSummary[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classCount, setClassCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled([
        documentApi.list(),
        questionApi.listMyHistory({ limit: 5 }),
        classesApi.list(),
        coursesApi.getAllCourses(),
        assignmentsApi.list(),
      ]);
      const [docs, sets, classData, courseData, assignmentData] = results;
      if (docs.status === 'fulfilled') setDocuments(docs.value);
      if (sets.status === 'fulfilled') setQuestionSets(sets.value.items);
      if (classData.status === 'fulfilled') setClassCount(classData.value.items.length);
      if (courseData.status === 'fulfilled') setCourses(courseData.value);
      if (assignmentData.status === 'fulfilled') setAssignments(assignmentData.value);
      if (results.some((result) => result.status === 'rejected')) {
        setError('Một số dữ liệu chưa thể tải. Bạn có thể bấm Làm mới để thử lại.');
      }
    } catch {
      setError('Không thể tải tổng quan giảng dạy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader title="Tổng quan giảng dạy" description="Dữ liệu trực tiếp từ học liệu, lớp, khóa học và bài tập của bạn." actions={<Button variant="outline" onClick={() => void load()}>Làm mới</Button>} />
      {loading ? <Card style={{ padding: '3rem', textAlign: 'center' }}>Đang tải...</Card> : <>
        {error && <Card style={{ padding: '1rem', textAlign: 'center', color: '#b91c1c' }}>{error}</Card>}
        <StatGrid><StatTile label="Học liệu" value={documents.length} icon={<FileText size={20} />} /><StatTile label="Bộ câu hỏi" value={questionSets.length} icon={<ClipboardList size={20} />} /><StatTile label="Lớp phụ trách" value={classCount} icon={<Users size={20} />} /><StatTile label="Khóa học" value={courses.length} icon={<School size={20} />} /><StatTile label="Bài tập" value={assignments.length} icon={<BookOpen size={20} />} /></StatGrid>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          <Card><CardBody><h3>Học liệu gần đây</h3>{documents.slice(0, 5).map((item) => <p key={item.id}><Link to={`/documents/${item.id}`}>{item.original_filename}</Link><br /><span style={{ color: '#64748b' }}>{item.status}</span></p>)}{documents.length === 0 && <p style={{ color: '#64748b' }}>Chưa có học liệu.</p>}<Link to="/documents">Quản lý học liệu</Link></CardBody></Card>
          <Card><CardBody><h3>Bộ câu hỏi gần đây</h3>{questionSets.slice(0, 5).map((item) => <p key={item.id}><Link to={`/question-sets/${item.id}`}>{item.document_name}</Link><br /><span style={{ color: '#64748b' }}>{item.question_count} câu</span></p>)}{questionSets.length === 0 && <p style={{ color: '#64748b' }}>Chưa có bộ câu hỏi.</p>}<Link to="/question-bank">Mở ngân hàng câu hỏi</Link></CardBody></Card>
        </div>
      </>}
    </div>
  );
}
