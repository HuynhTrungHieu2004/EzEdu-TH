import { useCallback, useEffect, useState } from 'react';
import {
  Star,
  Trash2,
} from 'lucide-react';
import { PageHeader, Card, CardBody, Button, Badge } from '../../components/ui';
import { favoritesApi, type Favorite, type FavoriteResourceType } from '../../api/favoritesApi';

const labels: Record<FavoriteResourceType, string> = {
  document: 'Học liệu',
  exam: 'Đề thi',
  question_set: 'Bộ câu hỏi',
  course: 'Khóa học',
};

export default function AdminFavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setFavorites(await favoritesApi.list());
    } catch {
      setError('Không thể tải danh sách yêu thích.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await favoritesApi.delete(id);
      setFavorites((items) => items.filter((item) => item.id !== id));
    } catch {
      setError('Không thể xóa mục yêu thích.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title="Danh sách Yêu thích của tôi"
        description="Lưu trữ nhanh các bộ đề thi trọng tâm, tài liệu học liệu và tài nguyên thường dùng."
      />

      {loading ? (
        <Card style={{ padding: '3rem', textAlign: 'center' }}>Đang tải...</Card>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void load()}>Thử lại</Button></Card>
      ) : favorites.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Chưa có tài nguyên yêu thích.</Card>
      ) : <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {favorites.map((item) => (
          <Card key={item.id} style={{ borderRadius: '20px' }}>
            <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(234,179,8,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }}>
                  <Star size={20} fill="#eab308" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--ez-text, #0f172a)' }}>
                      {item.title}
                    </h3>
                    <Badge variant="primary">{labels[item.resource_type]}</Badge>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ez-text-secondary, #64748b)' }}>Đã lưu ngày: {new Date(item.created_at).toLocaleDateString('vi-VN')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <Button aria-label={`Xóa ${item.title}`} variant="ghost" size="sm" loading={busyId === item.id} style={{ borderRadius: '8px', color: '#ef4444' }} onClick={() => void remove(item.id)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>}
    </div>
  );
}
