import { useCallback, useEffect, useState } from 'react';
import {
  LogIn,
  MessageSquare,
  FileText,
  BookOpen,
  Shield,
  RefreshCw,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { activityLogsApi } from '../../api/activityLogsApi';
import type { UserActivityLogItem } from '../../types/activityLogs';
import {
  activityActionLabel,
  activityCategoryLabel,
  activityStatusLabel,
} from '../../utils/activityLogsUi';
import type { ActivityStatus } from '../../types/activityLogs';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatGrid,
  StatTile,
} from '../../components/ui';
import '../dashboard.css';

type LoadState = 'loading' | 'ready' | 'error';

const STATUS_BADGE_MAP: Record<ActivityStatus, 'success' | 'warning' | 'error'> = {
  success: 'success',
  failure: 'error',
  started: 'warning',
  denied: 'error',
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'auth': return <LogIn size={16} />;
    case 'chat': return <MessageSquare size={16} />;
    case 'document': return <FileText size={16} />;
    case 'exam':
    case 'question': return <BookOpen size={16} />;
    case 'security': return <Shield size={16} />;
    default: return <Activity size={16} />;
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'auth': return 'var(--ez-primary)';
    case 'chat': return 'var(--ez-success)';
    case 'document': return 'var(--ez-warning)';
    case 'exam':
    case 'question': return 'var(--ez-info, #6366f1)';
    case 'security': return 'var(--ez-error)';
    default: return 'var(--ez-text-muted)';
  }
}

export default function StudentActivityPage() {
  const [items, setItems] = useState<UserActivityLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<{
    total_today: number;
    success_count: number;
    failure_count: number;
  } | null>(null);

  const PAGE_SIZE = 15;

  const loadStats = useCallback(async () => {
    try {
      const data = await activityLogsApi.selfStatistics();
      setStats({
        total_today: data.total_today,
        success_count: data.success_count,
        failure_count: data.failure_count,
      });
    } catch {
      setStats(null);
    }
  }, []);

  const loadLogs = useCallback(async (pageNum: number, signal?: AbortSignal) => {
    if (pageNum === 1) setLoadState('loading');
    else setLoadingMore(true);
    try {
      const data = await activityLogsApi.selfActivity({ page: pageNum, page_size: PAGE_SIZE }, signal);
      if (pageNum === 1) setItems(data.items ?? []);
      else setItems((prev) => [...prev, ...(data.items ?? [])]);
      setTotal(data.total);
      setLoadState('ready');
    } catch {
      if (signal?.aborted) return;
      setLoadState('error');
    } finally {
      if (pageNum !== 1) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      void loadStats();
      void loadLogs(1, controller.signal);
    });
    return () => controller.abort();
  }, [loadStats, loadLogs]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    await loadLogs(nextPage);
  };

  const hasMore = items.length < total;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <PageHeader
        title="Nhật ký hoạt động"
        subtitle="Xem lại toàn bộ các hành động của bạn trên hệ thống"
      />

      {/* Stats */}
      {stats && (
        <StatGrid cols={3} style={{ marginBottom: '1.5rem' }}>
          <StatTile
            label="Hôm nay"
            value={stats.total_today.toLocaleString('vi-VN')}
            icon={<Activity size={20} />}
          />
          <StatTile
            label="Thành công"
            value={stats.success_count.toLocaleString('vi-VN')}
            icon={<Activity size={20} />}
          />
          <StatTile
            label="Thất bại"
            value={stats.failure_count.toLocaleString('vi-VN')}
            icon={<Activity size={20} />}
          />
        </StatGrid>
      )}

      {/* Loading */}
      {loadState === 'loading' && (
        <div className="ez-stack">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height="72px" />
          ))}
        </div>
      )}

      {/* Error */}
      {loadState === 'error' && (
        <ErrorState
          title="Không tải được nhật ký"
          description="Đã xảy ra lỗi khi tải nhật ký hoạt động của bạn."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void loadLogs(1)}>
              <RefreshCw size={14} /> Thử lại
            </Button>
          }
        />
      )}

      {/* Empty */}
      {loadState === 'ready' && items.length === 0 && (
        <EmptyState
          icon={<Activity size={40} />}
          title="Chưa có hoạt động nào"
          description="Các hành động như đăng nhập, làm bài, chat AI sẽ hiển thị tại đây."
        />
      )}

      {/* Activity list */}
      {loadState === 'ready' && items.length > 0 && (
        <div className="ez-stack">
          <div style={{
            fontSize: '0.85rem',
            color: 'var(--ez-text-muted)',
            marginBottom: '0.25rem',
          }}>
            Tổng cộng {total.toLocaleString('vi-VN')} hoạt động
          </div>

          <div className="ez-stack-sm">
            {items.map((item) => (
              <ActivityLogCard key={item.id} item={item} />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.5rem' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Đang tải...' : (
                  <><ChevronDown size={16} /> Tải thêm ({total - items.length} còn lại)</>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityLogCard({ item }: { item: UserActivityLogItem }) {
  const statusVariant = STATUS_BADGE_MAP[item.status as ActivityStatus] ?? 'neutral';
  const iconColor = getCategoryColor(item.category);

  return (
    <Card>
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Category icon */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '10px',
            background: `${iconColor}18`,
            color: iconColor,
            flexShrink: 0,
          }}>
            {getCategoryIcon(item.category)}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.2rem',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--ez-text)' }}>
                {activityActionLabel(item.action)}
              </span>
              <Badge variant={statusVariant} size="sm">
                {activityStatusLabel(item.status)}
              </Badge>
              <Badge variant="neutral" size="sm">
                {activityCategoryLabel(item.category)}
              </Badge>
            </div>
            <div style={{
              fontSize: '0.78rem',
              color: 'var(--ez-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}>
              <span>{formatDateTime(item.timestamp)}</span>
              {item.resource_type && (
                <span>{item.resource_type}{item.resource_id ? ` · ${item.resource_id.slice(0, 8)}…` : ''}</span>
              )}
              {item.duration_ms != null && (
                <span>{item.duration_ms} ms</span>
              )}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
