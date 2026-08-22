import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Download } from 'lucide-react';
import { examBankApi, type ExamResultItem } from '../api/examBankApi';
import { classesApi } from '../api/classesApi';
import type { ClassSummary } from '../types/classes';
import { Badge, Button, Card, CardBody, FormField, Input, PageHeader, Select } from '../components/ui';

const classification = (score: number) => score >= 9 ? 'Xuất sắc' : score >= 8 ? 'Giỏi' : score >= 6.5 ? 'Khá' : score >= 5 ? 'Đạt' : 'Chưa đạt';

export default function ExamResultsPage({ mode }: { mode: 'admin' | 'teacher' }) {
  const [results, setResults] = useState<ExamResultItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [classId, setClassId] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    return !query ? results : results.filter((item) => `${item.student_name} ${item.student_email} ${item.exam_code}`.toLocaleLowerCase('vi').includes(query));
  }, [results, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResults(await examBankApi.listExamResults(classId || undefined));
    } catch {
      setError('Không thể tải kết quả thi.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    classesApi.list().then((data) => setClasses(data.items)).catch(() => setClasses([]));
  }, [mode]);

  const exportCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['Học sinh', 'Email', 'Mã đề', 'Điểm / 10', 'Ngày nộp'], ...filtered.map((item) => [item.student_name || '', item.student_email || '', item.exam_code, item.score, item.submitted_at ? new Date(item.submitted_at).toLocaleString('vi-VN') : ''])];
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ket-qua-thi.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title={mode === 'admin' ? 'Quản lý Kết quả thi' : 'Báo cáo & Kết quả Học tập'}
        description={mode === 'admin' ? 'Bảng điểm các lượt thi đã nộp trên toàn hệ thống.' : 'Bảng điểm các lượt thi thuộc đề do bạn phụ trách.'}
        actions={results.length > 0 && <Button variant="outline" onClick={exportCsv}><Download size={16} /> Xuất CSV</Button>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: mode === 'teacher' ? 'minmax(220px, 320px) 1fr' : '1fr', gap: '1rem' }}>
        {mode === 'teacher' && <FormField label="Lớp học"><Select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Tất cả lớp phụ trách</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>}
        <FormField label="Tìm kiếm"><Input placeholder="Tìm học sinh, email hoặc mã đề..." value={search} onChange={(event) => setSearch(event.target.value)} /></FormField>
      </div>
      {loading ? (
        <Card style={{ padding: '3rem', textAlign: 'center' }}>Đang tải...</Card>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void load()}>Thử lại</Button></Card>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Chưa có kết quả phù hợp.</Card>
      ) : (
        <Card><CardBody style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderRadius: '12px', background: 'var(--ez-surface-muted, #f8fafc)', border: '1px solid var(--ez-border-subtle, #e2e8f0)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}><Award size={20} color="#10b981" /><div><strong>{item.student_name || item.student_email || 'Học sinh'}</strong><div style={{ fontSize: '0.82rem', color: '#64748b' }}>Mã đề: {item.exam_code} · {item.submitted_at ? new Date(item.submitted_at).toLocaleString('vi-VN') : 'Chưa có thời gian nộp'}</div></div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><strong style={{ color: item.score >= 5 ? '#10b981' : '#ef4444' }}>{item.score}/10</strong><Badge variant={item.score >= 5 ? 'success' : 'error'}>{classification(item.score)}</Badge></div>
            </div>
          ))}
        </CardBody></Card>
      )}
    </div>
  );
}
