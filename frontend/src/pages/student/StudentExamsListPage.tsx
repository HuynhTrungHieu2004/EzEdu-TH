import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, FileQuestion, LogIn, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { examBankApi, type StudentExamItem } from '../../api/examBankApi';
import { classesApi } from '../../api/classesApi';
import { questionApi, type QuestionSetSummary } from '../../api/questionApi';
import { apiErrorMessage } from '../../utils/apiError';
import { Alert, Badge, Button, Card, CardBody, Input, PageHeader } from '../../components/ui';

export default function StudentExamsListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<StudentExamItem[]>([]);
  const [publishedPractices, setPublishedPractices] = useState<QuestionSetSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classCode, setClassCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const visible = useMemo(() => items.filter((item) => item.code.toLowerCase().includes(search.trim().toLowerCase())), [items, search]);
  const visiblePractices = useMemo(
    () => publishedPractices.filter((item) => item.document_name.toLowerCase().includes(search.trim().toLowerCase())),
    [publishedPractices, search],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [exams, practices] = await Promise.all([
        examBankApi.listStudentExams(),
        questionApi.listPublished(),
      ]);
      setItems(exams);
      setPublishedPractices(practices.items);
    } catch {
      setError('Không thể tải danh sách đề thi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (!classCode.trim()) return;
    setJoining(true);
    setJoinMessage(null);
    try {
      const joined = await classesApi.joinByCode(classCode.trim());
      setClassCode('');
      setJoinMessage({ tone: 'success', text: `Đã tham gia lớp ${joined.name}.` });
      await load();
    } catch (err) {
      setJoinMessage({ tone: 'error', text: apiErrorMessage(err, 'Không thể tham gia lớp bằng mã này.') });
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
      <PageHeader title="Đề thi chính thức" description="Các đề đã xuất bản cho toàn trường hoặc lớp của bạn." />
      <Card>
        <CardBody>
          <form onSubmit={handleJoin} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <strong style={{ flexBasis: '100%' }}>Tham gia lớp bằng mã lớp</strong>
            <Input
              aria-label="Mã lớp"
              placeholder="Nhập mã lớp 6 ký tự"
              value={classCode}
              maxLength={20}
              onChange={(event) => setClassCode(event.target.value.toUpperCase())}
              style={{ flex: '1 1 240px' }}
            />
            <Button type="submit" loading={joining} disabled={!classCode.trim()}>
              <LogIn size={16} aria-hidden="true" /> Tham gia lớp
            </Button>
            {joinMessage && <div style={{ flexBasis: '100%' }}><Alert tone={joinMessage.tone}>{joinMessage.text}</Alert></div>}
          </form>
        </CardBody>
      </Card>
      <Input placeholder="Tìm theo mã đề hoặc tên đề..." value={search} onChange={(event) => setSearch(event.target.value)} />
      {loading ? <Card style={{ padding: '3rem', textAlign: 'center' }}>Đang tải...</Card> : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void load()}>Thử lại</Button></Card>
      ) : visible.length === 0 && visiblePractices.length === 0 ? <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Chưa có đề thi phù hợp.</Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {visiblePractices.map((item) => (
            <Card key={`practice-${item.id}`}>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <Badge variant="primary">Đề giáo viên ban hành</Badge>
                <strong>{item.document_name}</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileQuestion size={22} /> {item.published_question_count || item.question_count} câu
                </div>
                <Button onClick={() => navigate(`/question-sets/${item.id}`)}><Play size={16} /> Làm bài</Button>
              </CardBody>
            </Card>
          ))}
          {visible.map((item) => {
            const completed = item.attempt_status === 'submitted' || item.attempt_status === 'graded';
            return <Card key={item.id}><CardBody style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Badge variant="primary">{item.code}</Badge><Badge variant={completed ? 'success' : 'warning'}>{completed ? 'Đã nộp' : item.attempt_status === 'in_progress' ? 'Đang làm' : 'Chưa làm'}</Badge></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}><FileQuestion size={22} /><strong>{item.question_count} câu · {item.total_points} điểm</strong></div>
              <div style={{ color: '#64748b', display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Clock size={15} /> {item.duration_minutes} phút</div>
              {item.score !== null && <strong style={{ color: '#059669' }}>Kết quả: {item.score}/10</strong>}
              <Button disabled={completed} variant={completed ? 'outline' : 'primary'} onClick={() => navigate(`/take-exam/${item.id}`)}><Play size={16} /> {completed ? 'Đã hoàn thành' : item.attempt_status === 'in_progress' ? 'Tiếp tục làm bài' : 'Vào thi'}</Button>
            </CardBody></Card>;
          })}
        </div>
      )}
    </div>
  );
}
