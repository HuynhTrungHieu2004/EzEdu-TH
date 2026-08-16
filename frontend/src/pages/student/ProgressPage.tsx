import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, RotateCcw, TrendingUp } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
  StatGrid,
  StatTile,
  Tabs,
  Tooltip,
} from '../../components/ui';
import type { TabItem } from '../../components/ui';
import { questionApi } from '../../api/questionApi';
import type { LearningHistoryItem } from '../../api/questionApi';
import '../dashboard.css';

type LoadState = 'loading' | 'ready' | 'error';
type RangeKey = 'all' | '7' | '30' | '90';
type ItemFilter = 'all' | 'exam' | 'practice';

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'all', label: 'Toàn bộ thời gian' },
  { value: '7', label: '7 ngày qua' },
  { value: '30', label: '30 ngày qua' },
  { value: '90', label: '90 ngày qua' },
];

const ITEM_FILTER_TABS: TabItem[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'exam', label: 'Đề thi GV giao' },
  { id: 'practice', label: 'Ôn tập' },
];

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

/** Nhãn đánh giá kèm màu — luôn có chữ, không chỉ dựa vào màu để truyền đạt. */
function verdictOf(percent: number): { label: string; variant: 'success' | 'warning' | 'error' } {
  if (percent >= 80) return { label: 'Tốt', variant: 'success' };
  if (percent >= 50) return { label: 'Đạt', variant: 'warning' };
  return { label: 'Cần ôn tập', variant: 'error' };
}

/**
 * Đích điều hướng khi bấm vào 1 dòng lịch sử: XEM LẠI, không phải làm lại.
 *
 * Trước đây dòng lịch sử trỏ thẳng vào đường làm lại. Với đề không cho làm
 * lại, backend trả 403 "Đề thi này không cho phép làm lại" — học sinh bấm vào
 * lịch sử của chính mình và bị từ chối. Với đề cho làm lại thì mở ra một lượt
 * mới tinh, bài cũ và nhận xét AI biến mất.
 *
 * Đường làm lại không mất đi: nó nằm trong chính trang xem lại, và chỉ hiện khi
 * đề cho phép.
 */
function reviewPathOf(item: LearningHistoryItem): string {
  return item.item_type === 'practice'
    ? `/bai-lam/${item.id}?loai=practice&bo=${item.question_set_id ?? ''}`
    : `/bai-lam/${item.id}${item.can_retake ? '?lam_lai=1' : ''}`;
}

/**
 * Tiến độ học tập — gộp từ hai trang cũ.
 *
 * `LearningHistoryPage` và `StudentStatisticsPage` trước đây gọi đúng cùng hai
 * API (`listMyLearningHistory` + `listPublished`) rồi mỗi trang tự tính lại số
 * liệu. Đó là hai góc nhìn của một tập dữ liệu, không phải hai chức năng, nên
 * gộp thành một trang: phần tổng quan ở trên, phần chi tiết ở dưới.
 * Xem docs/ui-redesign/01-audit-report.md §6.3 (lỗi M4).
 *
 * Phần tổng quan (StatGrid) chỉ tính trên item ôn tập (`item_type==='practice'`)
 * — các số này gắn với "bài luyện tập đã giao" (`assignedCount`), không liên
 * quan đề thi giảng viên giao. Phần danh sách chi tiết bên dưới gộp cả 2 loại,
 * có tab lọc + khoá nút làm lại theo `can_retake`/`source_deleted`.
 */
export default function ProgressPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [attempts, setAttempts] = useState<LearningHistoryItem[]>([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [range, setRange] = useState<RangeKey>('all');
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all');
  // Thời điểm "bây giờ" cho bộ lọc khoảng ngày. Đọc đồng hồ đúng một lần bằng
  // hàm khởi tạo lười của useState — cách duy nhất gọi Date.now() mà không bị
  // coi là gọi hàm không thuần khiết ngay trong thân render. "Vài ngày" không
  // cần chính xác tới từng giây nên giá trị cố định trong vòng đời trang là đủ.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    // Một lần tải cho cả phần tổng quan và phần chi tiết.
    Promise.all([questionApi.listMyLearningHistory(), questionApi.listPublished()])
      .then(([history, published]) => {
        if (cancelled) return;
        setAttempts(history ?? []);
        setAssignedCount(published.items?.length ?? 0);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const practiceAttempts = useMemo(
    () => attempts.filter((item) => item.item_type === 'practice'),
    [attempts],
  );

  const filtered = useMemo(() => {
    let list = attempts;
    if (itemFilter !== 'all') {
      list = list.filter((item) => item.item_type === itemFilter);
    }
    if (range !== 'all') {
      const days = Number(range);
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      list = list.filter((item) => {
        const t = new Date(item.created_at).getTime();
        return Number.isFinite(t) && t >= cutoff;
      });
    }
    return list;
  }, [attempts, itemFilter, range, now]);

  const stats = useMemo(() => {
    // Chỉ tính trên item ôn tập — xem quyết định thiết kế ở docstring trên.
    const completedIds = new Set(practiceAttempts.map((item) => item.question_set_id));
    const average =
      practiceAttempts.length > 0
        ? practiceAttempts.reduce((sum, item) => sum + item.percent, 0) / practiceAttempts.length
        : null;
    const best = practiceAttempts.length > 0 ? Math.max(...practiceAttempts.map((item) => item.percent)) : null;

    // Bài yếu nhất để gợi ý ôn lại: lấy lần làm gần nhất của mỗi bộ đề rồi chọn điểm thấp nhất.
    const latestBySet = new Map<string, LearningHistoryItem>();
    for (const attempt of practiceAttempts) {
      if (attempt.question_set_id && !latestBySet.has(attempt.question_set_id)) {
        latestBySet.set(attempt.question_set_id, attempt);
      }
    }
    const weakest = [...latestBySet.values()].sort((a, b) => a.percent - b.percent)[0] ?? null;

    return {
      completed: completedIds.size,
      pending: Math.max(0, assignedCount - completedIds.size),
      average,
      best,
      weakest,
    };
  }, [practiceAttempts, assignedCount]);

  const hasData = attempts.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Học tập"
        title="Tiến độ"
        description="Kết quả từng lần làm bài và mức tiến bộ của bạn theo thời gian."
        actions={
          stats.weakest ? (
            <Link to={`/question-sets/${stats.weakest.question_set_id}`}>
              <Button leadingIcon={<RotateCcw size={16} aria-hidden="true" />}>
                Ôn lại bài yếu nhất
              </Button>
            </Link>
          ) : (
            <Link to="/published-questions">
              <Button>Tới bài luyện tập</Button>
            </Link>
          )
        }
      />

      {state === 'loading' && (
        <div className="ez-stack">
          <Skeleton height="6rem" />
          <Skeleton height="16rem" />
        </div>
      )}

      {state === 'error' && (
        <ErrorState
          title="Không tải được tiến độ học tập"
          description="Kết nối tới hệ thống đang gặp sự cố. Bạn có thể thử lại."
          onRetry={() => window.location.reload()}
        />
      )}

      {state === 'ready' && !hasData && (
        <EmptyState
          icon={<History size={28} />}
          title="Bạn chưa có lần làm bài nào"
          description="Hoàn thành một bài luyện tập, kết quả và mức tiến bộ sẽ hiện ở đây."
          actions={
            <Link to="/published-questions">
              <Button>Bắt đầu bài luyện tập đầu tiên</Button>
            </Link>
          }
        />
      )}

      {state === 'ready' && hasData && (
        <>
          {/* Phần tổng quan — trước đây là cả một trang riêng, chỉ tính trên ôn tập */}
          <StatGrid style={{ marginBottom: 'var(--ez-space-8)' }}>
            <StatTile label="Bài đã hoàn thành" value={stats.completed} />
            <StatTile label="Bài chưa làm" value={stats.pending} />
            <StatTile
              label="Điểm trung bình"
              value={stats.average === null ? '—' : `${stats.average.toFixed(1)}%`}
              hint={`Từ ${practiceAttempts.length} lượt làm`}
            />
            <StatTile
              label="Kết quả cao nhất"
              value={stats.best === null ? '—' : `${stats.best.toFixed(1)}%`}
            />
          </StatGrid>

          {/* Phần chi tiết — trước đây là trang Lịch sử, giờ gộp cả đề thi GV giao */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Các lần làm bài</CardTitle>
              </div>
              <Select
                aria-label="Lọc theo khoảng thời gian"
                value={range}
                onChange={(event) => setRange(event.target.value as RangeKey)}
                style={{ width: 'auto' }}
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </CardHeader>
            <CardBody>
              <Tabs
                items={ITEM_FILTER_TABS}
                value={itemFilter}
                onChange={(id) => setItemFilter(id as ItemFilter)}
                ariaLabel="Lọc theo loại"
              />
              {filtered.length === 0 ? (
                <EmptyState
                  compact
                  icon={<TrendingUp size={24} />}
                  title="Không có lần làm bài nào trong khoảng này"
                  description="Hãy chọn khoảng thời gian hoặc loại rộng hơn."
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRange('all');
                        setItemFilter('all');
                      }}
                    >
                      Xem toàn bộ
                    </Button>
                  }
                />
              ) : (
                <div>
                  {filtered.map((item) => {
                    const verdict = verdictOf(item.percent);
                    const canOpen = !item.source_deleted && item.can_retake;
                    const rowContent = (
                      <>
                        <span className="dash-row-main">
                          <span className="dash-row-title">{item.title}</span>
                          <span className="dash-row-meta">
                            <span>{formatDateTime(item.created_at)}</span>
                            <span>
                              {item.score}/{item.max_score} {item.item_type === 'exam' ? 'điểm' : 'câu đúng'}
                            </span>
                          </span>
                        </span>
                        <span className="dash-row-trail">
                          <Badge variant={item.item_type === 'exam' ? 'info' : 'neutral'}>
                            {item.item_type === 'exam' ? 'Đề thi' : 'Ôn tập'}
                          </Badge>
                          <Badge variant={verdict.variant}>{verdict.label}</Badge>
                          <span className="dash-score">{item.percent.toFixed(1)}%</span>
                        </span>
                      </>
                    );
                    if (!canOpen) {
                      const disabledRow = (
                        <span key={item.id} className="dash-row dash-row-disabled" aria-disabled="true">
                          {rowContent}
                        </span>
                      );
                      return item.source_deleted ? (
                        <Tooltip key={item.id} label="Tài liệu/đề thi gốc đã bị xóa">
                          {disabledRow}
                        </Tooltip>
                      ) : (
                        disabledRow
                      );
                    }
                    return (
                      <Link key={item.id} to={reviewPathOf(item)} className="dash-row">
                        {rowContent}
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
