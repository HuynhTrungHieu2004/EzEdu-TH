import { useState } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  Plus,
} from 'lucide-react';
import { PageHeader, Card, CardBody, Button, Badge, Input, Select } from '../../components/ui';

export default function AdminStudentsPage() {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  const [students, setStudents] = useState([
    { id: 'STU-001', name: 'Nguyễn Văn Nam', email: 'hocsinh.demo@ezedu.vn', grade: 'Lớp 10A1', status: 'active', joinedDate: '15/09/2025' },
    { id: 'STU-002', name: 'Lê Thị Mai', email: 'lethimai@gmail.com', grade: 'Lớp 10A1', status: 'active', joinedDate: '18/09/2025' },
    { id: 'STU-003', name: 'Phạm Minh Khoa', email: 'phammkhoa@gmail.com', grade: 'Lớp 11B1', status: 'locked', joinedDate: '02/10/2025' },
  ]);

  const toggleLock = (id: string) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: s.status === 'active' ? 'locked' : 'active' } : s
      )
    );
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title="Quản lý Học sinh"
        description="Danh sách học sinh toàn hệ thống, quản lý tài khoản, khóa tài khoản và đặt lại mật khẩu."
        actions={
          <Button variant="primary" style={{ borderRadius: '12px', gap: '0.4rem' }} onClick={() => alert('Mở form thêm học sinh mới')}>
            <Plus size={16} /> Thêm học sinh
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--ez-surface, #fff)', borderRadius: '16px', border: '1px solid var(--ez-border-subtle, #e2e8f0)' }}>
        <Input
          placeholder="Tìm tên học sinh hoặc email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ borderRadius: '10px', flex: 1 }}
        />
        <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ borderRadius: '10px', width: '160px' }}>
          <option value="all">Tất cả các lớp</option>
          <option value="10A1">Lớp 10A1</option>
          <option value="11B1">Lớp 11B1</option>
        </Select>
      </div>

      <Card style={{ borderRadius: '20px' }}>
        <CardBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {students.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderRadius: '12px', background: 'var(--ez-surface-muted, #f8fafc)', border: '1px solid var(--ez-border-subtle, #e2e8f0)', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--ez-surface, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--ez-primary, #2563eb)', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                    {s.name.charAt(0)}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ez-text, #0f172a)' }}>{s.name}</span>
                      <Badge variant={s.status === 'active' ? 'success' : 'error'}>
                        {s.status === 'active' ? 'Đang hoạt động' : 'Đang bị khóa'}
                      </Badge>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>{s.email} • {s.grade}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="outline" size="sm" style={{ borderRadius: '10px', gap: '0.3rem' }} onClick={() => alert(`Đặt lại mật khẩu cho ${s.name}`)}>
                    <KeyRound size={14} /> Đặt lại pass
                  </Button>

                  <Button
                    variant={s.status === 'active' ? 'ghost' : 'outline'}
                    size="sm"
                    style={{ borderRadius: '10px', gap: '0.3rem', color: s.status === 'active' ? '#ef4444' : '#10b981' }}
                    onClick={() => toggleLock(s.id)}
                  >
                    {s.status === 'active' ? <Lock size={14} /> : <Unlock size={14} />}
                    {s.status === 'active' ? 'Khóa' : 'Mở khóa'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
