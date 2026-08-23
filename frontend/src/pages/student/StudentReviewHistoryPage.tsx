import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../../components/ui';
import { studentReviewApi } from '../../api/studentReviewApi';
import type {
  ReviewDifficulty,
  ReviewStatus,
  StudentReview,
  StudentReviewSummary,
} from '../../api/studentReviewApi';
import { createLatestRequestGuard } from '../../utils/latestRequest';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const scoreFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

const STATUS: Record<ReviewStatus, { label: string; description: string; variant: 'info' | 'warning' | 'success' | 'error' }> = {
  classifying: { label: 'Đang phân loại', description: 'Hệ thống đang đọc và phân loại học liệu.', variant: 'info' },
  needs_confirmation: { label: 'Cần xác nhận', description: 'Phân loại cần được xác nhận trước khi tạo câu hỏi.', variant: 'warning' },
  ready_to_generate: { label: 'Chờ tạo câu hỏi', description: 'Phân loại đã sẵn sàng để cấu hình bộ ôn tập.', variant: 'warning' },
  generating: { label: 'Đang tạo câu hỏi', description: 'Bộ câu hỏi đang được tạo. Bạn có thể quay lại sau.', variant: 'info' },
  ready: { label: 'Sẵn sàng', description: 'Bộ ôn tập đã sẵn sàng để làm bài.', variant: 'success' },
  failed: { label: 'Không thể hoàn tất', description: 'Bộ ôn tập gặp lỗi và chưa thể sử dụng.', variant: 'error' },
};

const DIFFICULTY: Record<ReviewDifficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const item = STATUS[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

function ReviewLoading() {
  return (
    <div className="ez-stack" role="status" aria-live="polite" aria-busy="true">
      <span className="ez-sr-only">Đang tải dữ liệu ôn tập…</span>
      <Skeleton height="2.5rem" width="45%" />
      <Skeleton height="6rem" />
      <Skeleton height="6rem" />
    </div>
  );
}

function HistoryList({ reviews }: { reviews: StudentReviewSummary[] }) {
  return (
    <ul className="ez-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {reviews.map((review) => {
        const status = STATUS[review.status];
        return (
          <li className="ez-list-item" key={review.id}>
            <span className="ez-list-item-icon" aria-hidden="true"><BookOpenCheck size={20} /></span>
            <div className="ez-list-item-main">
              <div className="ez-row ez-row-wrap">
                <h2 className="ez-list-item-title" style={{ margin: 0 }}>{review.title}</h2>
                <ReviewStatusBadge status={review.status} />
              </div>
              <div className="ez-list-item-meta">
                {review.subjectName ? <span>{review.subjectName}</span> : null}
                <span>{dateFormatter.format(new Date(review.createdAt))}</span>
                {review.status === 'ready' ? (
                  <>
                    <span>{review.questionCount ?? 0} câu</span>
                    <span>{review.attemptCount} lượt làm</span>
                    {review.latestScore != null ? <span>Gần nhất: {scoreFormatter.format(review.latestScore)} điểm</span> : null}
                    {review.bestScore != null ? <span>Cao nhất: {scoreFormatter.format(review.bestScore)} điểm</span> : null}
                  </>
                ) : <span>{review.errorMessage ?? status.description}</span>}
              </div>
              {review.warning ? <p style={{ margin: 'var(--ez-space-2) 0 0', color: 'var(--ez-warning)' }}>{review.warning}</p> : null}
            </div>
            {review.status === 'ready' ? (
              <div className="ez-list-item-actions">
                <Link className="ez-btn ez-btn-outline ez-btn-sm" to={`/student/reviews/${review.id}`}>Xem</Link>
                <Link className="ez-btn ez-btn-primary ez-btn-sm" to={`/student/reviews/${review.id}/attempt`}>Làm lại</Link>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ReviewDetail({ review }: { review: StudentReview }) {
  const status = STATUS[review.status];
  const classification = review.classification;
  const config = review.generationConfig;

  return (
    <div className="ez-stack ez-stack-lg">
      <PageHeader
        backTo="/student/review-history"
        backLabel="Về lịch sử ôn tập"
        eyebrow="Bộ ôn tập cá nhân"
        title={review.title}
        description={status.description}
        actions={<ReviewStatusBadge status={review.status} />}
      />

      {review.warning ? <Alert tone="warning">{review.warning}</Alert> : null}
      {review.errorMessage || review.status === 'failed' ? (
        <Alert tone="error">{review.errorMessage ?? 'Không thể hoàn tất bộ ôn tập. Vui lòng tạo lại từ học liệu.'}</Alert>
      ) : null}

      <div className="ez-grid ez-grid-2">
        <Card>
          <CardHeader><CardTitle as="h2">Phân loại học liệu</CardTitle></CardHeader>
          <CardBody>
            {classification ? (
              <dl className="ez-stack-sm" style={{ margin: 0 }}>
                <div><dt>Môn học</dt><dd style={{ margin: 0 }}>{review.subjectName ?? 'Đã phân loại'}</dd></div>
                <div><dt>Khối lớp</dt><dd style={{ margin: 0 }}>Lớp {classification.grade}</dd></div>
                <div><dt>Chương trình</dt><dd style={{ margin: 0 }}>{classification.curriculumVersion}</dd></div>
                <div><dt>Chủ đề</dt><dd style={{ margin: 0 }}>{classification.topicIds.length} chủ đề đã chọn</dd></div>
              </dl>
            ) : <p style={{ margin: 0, color: 'var(--ez-text-muted)' }}>Đang chờ kết quả phân loại.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Cấu hình bộ câu hỏi</CardTitle></CardHeader>
          <CardBody>
            {config ? (
              <dl className="ez-stack-sm" style={{ margin: 0 }}>
                <div><dt>Số câu</dt><dd style={{ margin: 0 }}>{review.questionCount ?? config.questionCount} câu</dd></div>
                <div><dt>Độ khó</dt><dd style={{ margin: 0 }}>{DIFFICULTY[config.difficulty]}</dd></div>
                <div><dt>Dạng câu hỏi</dt><dd style={{ margin: 0 }}>Trắc nghiệm nhiều lựa chọn</dd></div>
                {config.bloomLevel ? <div><dt>Mức Bloom</dt><dd style={{ margin: 0 }}>{config.bloomLevel}</dd></div> : null}
              </dl>
            ) : <p style={{ margin: 0, color: 'var(--ez-text-muted)' }}>Chưa cấu hình bộ câu hỏi.</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="ez-row ez-row-between ez-row-wrap">
          <div>
            <strong>Ngày tạo</strong>
            <div style={{ color: 'var(--ez-text-muted)' }}>{dateFormatter.format(new Date(review.createdAt))}</div>
          </div>
          {review.status === 'ready' ? (
            <Link className="ez-btn ez-btn-primary" to={`/student/reviews/${review.id}/attempt`}>Bắt đầu ôn tập</Link>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

export default function StudentReviewHistoryPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const [reviews, setReviews] = useState<StudentReviewSummary[]>([]);
  const [review, setReview] = useState<StudentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requests = useRef(createLatestRequestGuard());

  const load = useCallback(async () => {
    const request = requests.current.begin();
    setLoading(true);
    setError(false);
    setReviews([]);
    setReview(null);
    try {
      if (reviewId) {
        const nextReview = await studentReviewApi.get(reviewId);
        if (requests.current.isCurrent(request)) setReview(nextReview);
      } else {
        const nextReviews = await studentReviewApi.list();
        if (requests.current.isCurrent(request)) setReviews(nextReviews);
      }
    } catch {
      if (requests.current.isCurrent(request)) setError(true);
    } finally {
      if (requests.current.isCurrent(request)) setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    let active = true;
    const currentRequests = requests.current;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      currentRequests.cancel();
    };
  }, [load]);

  if (loading) return <ReviewLoading />;

  if (error || (reviewId && !review)) {
    return (
      <div className="ez-stack">
        {reviewId ? <PageHeader backTo="/student/review-history" backLabel="Về lịch sử ôn tập" title="Chi tiết bộ ôn tập" /> : null}
        <ErrorState
          title={reviewId ? 'Không tải được bộ ôn tập' : 'Không tải được lịch sử ôn tập'}
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => void load()}
        />
      </div>
    );
  }

  if (reviewId && review) return <ReviewDetail review={review} />;

  return (
    <div className="ez-stack ez-stack-lg">
      <PageHeader
        eyebrow="Học liệu cá nhân"
        title="Lịch sử ôn tập"
        description="Theo dõi các bộ câu hỏi được tạo từ học liệu của bạn và tiếp tục làm bài."
      />
      {reviews.length === 0 ? (
        <EmptyState
          title="Chưa có bộ ôn tập"
          description="Tạo bộ ôn tập đầu tiên từ một học liệu đã xử lý."
          actions={<Link className="ez-btn ez-btn-primary" to="/student/learning-materials">Đến học liệu số</Link>}
        />
      ) : <HistoryList reviews={reviews} />}
    </div>
  );
}
