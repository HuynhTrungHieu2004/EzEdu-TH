import { useCallback, useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { examBankApi, type ExamResultStatistics } from '../api/examBankApi';
import { classesApi } from '../api/classesApi';
import type { ClassSummary } from '../types/classes';
import { Button, Card, CardBody, FormField, PageHeader, Select } from '../components/ui';

export default function ExamStatsPage({ mode }: { mode: 'admin' | 'teacher' }) {
  const [stats, setStats] = useState<ExamResultStatistics | null>(null);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [classId, setClassId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setStats(await examBankApi.getExamResultStatistics(classId || undefined));
    } catch {
      setError('Không thể tải thống kê kết quả thi.');
    }
  }, [classId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    classesApi.list().then((data) => setClasses(data.items)).catch(() => setClasses([]));
  }, [mode]);

  if (error) return <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void load()}>Thử lại</Button></Card>;
  if (!stats) return <Card style={{ padding: '3rem', textAlign: 'center' }}>Đang tải...</Card>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      <PageHeader title={mode === 'admin' ? 'Thống kê kết quả thi toàn trường' : 'Thống kê kết quả các đề phụ trách'} description="Số liệu được tính từ các lượt thi đã nộp, quy đổi về thang điểm 10." />
      {mode === 'teacher' && <FormField label="Lớp học"><Select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Tất cả lớp phụ trách</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        {[
          ['Điểm trung bình', `${stats.average_score} / 10`],
          ['Tỷ lệ đạt', `${stats.pass_rate}%`],
          ['Tỷ lệ Giỏi/Xuất sắc', `${stats.excellent_rate}%`],
          ['Lượt thi đã nộp', stats.total_attempts],
        ].map(([label, value]) => <Card key={label}><CardBody><span style={{ color: '#64748b' }}>{label}</span><div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.35rem' }}>{value}</div></CardBody></Card>)}
      </div>
      <Card><CardBody><h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart3 size={18} /> Phổ điểm</h3><div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 200, borderBottom: '1px solid #e2e8f0' }}>
        {Object.entries(stats.score_distribution).map(([label, count]) => {
          const height = stats.total_attempts ? Math.max(4, 100 * count / stats.total_attempts) : 4;
          return <div key={label} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}><strong>{count}</strong><div style={{ width: '100%', maxWidth: 54, height: `${height}%`, background: '#2563eb', borderRadius: '8px 8px 0 0' }} /><span style={{ fontSize: '0.75rem' }}>{label}</span></div>;
        })}
      </div></CardBody></Card>
    </div>
  );
}
