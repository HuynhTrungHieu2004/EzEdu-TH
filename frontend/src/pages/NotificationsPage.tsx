import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { notificationsApi, type UserNotification } from '../api/notificationsApi';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';

export default function NotificationsPage({ mode = 'student' }: { mode?: 'student' | 'teacher' }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'read'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const filtered = useMemo(
    () => notifications.filter((item) => activeTab === 'all' || (activeTab === 'read' ? item.is_read : !item.is_read)),
    [activeTab, notifications],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setNotifications(await notificationsApi.list());
    } catch {
      setError('Không thể tải thông báo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const markRead = async (id: string) => {
    try {
      const item = await notificationsApi.markRead(id);
      setNotifications((items) => items.map((current) => current.id === id ? item : current));
    } catch {
      setError('Không thể cập nhật thông báo.');
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
    } catch {
      setError('Không thể cập nhật thông báo.');
    }
  };

  const dismiss = async (id: string) => {
    try {
      await notificationsApi.dismiss(id);
      setNotifications((items) => items.filter((item) => item.id !== id));
    } catch {
      setError('Không thể ẩn thông báo.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <PageHeader
        title={mode === 'teacher' ? 'Thông báo Giảng dạy' : 'Thông báo hệ thống'}
        description="Các thông báo được quản trị viên xuất bản cho tài khoản của bạn."
        actions={unreadCount > 0 && <Button variant="outline" onClick={() => void markAllRead()}><Check size={16} /> Đánh dấu tất cả đã đọc</Button>}
      />

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['all', 'unread', 'read'] as const).map((tab) => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'ghost'} size="sm" onClick={() => setActiveTab(tab)}>
            {tab === 'all' ? `Tất cả (${notifications.length})` : tab === 'unread' ? `Chưa đọc (${unreadCount})` : `Đã đọc (${notifications.length - unreadCount})`}
          </Button>
        ))}
        {unreadCount > 0 && <Badge variant="error">{unreadCount} thông báo mới</Badge>}
      </div>

      {loading ? (
        <Card style={{ padding: '3rem', textAlign: 'center' }}>Đang tải...</Card>
      ) : error ? (
        <Card style={{ padding: '3rem', textAlign: 'center', color: '#b91c1c' }}>{error} <Button variant="outline" size="sm" onClick={() => void load()}>Thử lại</Button></Card>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '2rem' }}><EmptyState title="Không có thông báo nào" description="Bạn đã xem hết thông báo trong mục này." /></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: '1rem', padding: '1.15rem', borderRadius: '16px', background: item.is_read ? 'var(--ez-surface, #fff)' : 'rgba(37,99,235,0.04)', border: item.is_read ? '1px solid var(--ez-border-subtle, #e2e8f0)' : '1px solid var(--ez-primary, #2563eb)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--ez-primary-soft, rgba(37,99,235,0.08))', display: 'grid', placeItems: 'center', color: 'var(--ez-primary, #2563eb)', flexShrink: 0 }}><Bell size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <strong>{item.title}</strong>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '0.25rem', alignItems: 'center' }}><Clock size={13} /> {new Date(item.created_at).toLocaleString('vi-VN')}</span>
                </div>
                <p style={{ margin: '0.35rem 0 0', color: '#475569' }}>{item.content}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {!item.is_read && <Button aria-label={`Đánh dấu đã đọc ${item.title}`} variant="ghost" size="sm" onClick={() => void markRead(item.id)}><CheckCircle2 size={16} /></Button>}
                <Button aria-label={`Ẩn ${item.title}`} variant="ghost" size="sm" onClick={() => void dismiss(item.id)}><Trash2 size={16} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
