import { useState } from 'react';
import {
  Plus,
  Shield,
  BookOpen,
} from 'lucide-react';
import { PageHeader, Card, CardBody, Button, Badge, Input } from '../../components/ui';

export default function AdminTeachersPage() {
  const [search, setSearch] = useState('');

  const [teachers] = useState([
    { id: 'TCH-001', name: 'ThS. Nguyễn Văn An', email: 'giaovien.demo@ezedu.vn', subject: 'Toán học', assignedClasses: ['10A1', '10A2'], role: 'Lecturer' },
    { id: 'TCH-002', name: 'Cô Trần Thị Bình', email: 'tranbinh@ezedu.vn', subject: 'Vật lý', assignedClasses: ['10A2', '11B1'], role: 'Lecturer' },
    { id: 'TCH-003', name: 'Thầy Lê Hoàng Nam', email: 'hoangnam@ezedu.vn', subject: 'Hóa học', assignedClasses: ['11B1', '12C1'], role: 'Lecturer' },
  ]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title="Quản lý Giáo viên"
        description="Danh sách đội ngũ giáo viên, phân công lớp giảng dạy và phân quyền quản trị nội dung."
        actions={
          <Button variant="primary" style={{ borderRadius: '12px', gap: '0.4rem' }} onClick={() => alert('Mở form thêm giáo viên mới')}>
            <Plus size={16} /> Thêm giáo viên
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--ez-surface, #fff)', borderRadius: '16px', border: '1px solid var(--ez-border-subtle, #e2e8f0)' }}>
        <Input
          placeholder="Tìm tên giáo viên, môn dạy hoặc email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ borderRadius: '10px', flex: 1 }}
        />
      </div>

      <Card style={{ borderRadius: '20px' }}>
        <CardBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {teachers.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderRadius: '12px', background: 'var(--ez-surface-muted, #f8fafc)', border: '1px solid var(--ez-border-subtle, #e2e8f0)', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#10b981', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                    👨‍🏫
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ez-text, #0f172a)' }}>{t.name}</span>
                      <Badge variant="success">Bộ môn: {t.subject}</Badge>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>
                      {t.email} • Phụ trách: {t.assignedClasses.join(', ')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="outline" size="sm" style={{ borderRadius: '10px', gap: '0.3rem' }} onClick={() => alert(`Phân công lớp cho ${t.name}`)}>
                    <BookOpen size={14} /> Phân công lớp
                  </Button>
                  <Button variant="outline" size="sm" style={{ borderRadius: '10px', gap: '0.3rem' }} onClick={() => alert(`Phân quyền cho ${t.name}`)}>
                    <Shield size={14} /> Phân quyền
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
