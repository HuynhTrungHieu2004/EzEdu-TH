import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, History, MessageSquare, Play, TrendingUp } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  SearchCommand,
  SkeletonText,
  StatGrid,
  StatTile,
} from '../../components/ui';
import { questionApi } from '../../api/questionApi';
import type { LearningHistoryItem, QuestionSetSummary } from '../../api/questionApi';
import CharacterIllustration from '../../components/public/CharacterIllustration';
import { useAuth } from '../../hooks/useAuth';
import { toolsEnabledBy, toolsForRole } from '../../data/toolRegistry';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { AnimatedCounter, StaggerGroup } from '../../motion';
import '../dashboard.css';

type LoadState = 'loading' | 'ready' | 'error';

const percentFormatter = (value: number) => `${value}%`;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Tổng quan học tập của học sinh.
 *
 * Dashboard cũ là bốn thẻ đánh số 01–04 trỏ đúng về bốn mục đã có trong sidebar
 * — điều hướng trùng lặp, không phải dashboard. Bản này trả lời câu hỏi "giờ tôi
 * nên làm gì" bằng dữ liệu thật: bài chưa làm, lần làm gần nhất, tiến độ.
 * Xem docs/ui-redesign/01-audit-report.md §6.2 (lỗi H6).
 */
export default function StudentDashboardPage() {
  const { user, onboardingCompleted } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [published, setPublished] = useState<QuestionSetSummary[]>([]);
  const [history, setHistory] = useState<LearningHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([questionApi.listPublished(), questionApi.listMyLearningHistory()])
      .then(([publishedRes, historyRes]) => {
        if (cancelled) return;
        setPublished(publishedRes.items ?? []);
        setHistory((historyRes ?? []).filter((item) => item.item_type === 'practice'));
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const attemptedSetIds = new Set(history.map((item) => item.question_set_id));
  const pending = published.filter((set) => !attemptedSetIds.has(set.id));
  const latestAttempt = history[0];

  const completedCount = attemptedSetIds.size;
  const averagePercent =
    history.length > 0
      ? Math.round(history.reduce((sum, item) => sum + item.percent, 0) / history.length)
      : null;
  const bestPercent =
    history.length > 0 ? Math.round(Math.max(...history.map((item) => item.percent))) : null;

  const firstName = user?.full_name?.trim().split(/\s+/).slice(-1)[0] ?? 'bạn';
  const nextSet = pending[0];
  const isNewcomer = state === 'ready' && published.length === 0 && history.length === 0;
  const { isEnabled } = useFeatureFlags();
  const studentTools = useMemo(() => toolsEnabledBy(toolsForRole('student'), isEnabled), [isEnabled]);
  const quickActions = [
    { to: nextSet ? `/question-sets/${nextSet.id}` : '/published-questions', label: 'Tiếp tục học', icon: Play },
    { to: '/published-questions', label: 'Luyện tập', icon: ClipboardList },
    { to: '/chat-advanced', label: 'Hỏi AI', icon: MessageSquare },
    { to: '/learning-history', label: 'Xem kết quả', icon: TrendingUp },
  ];

  return (
    <>
      <div className="ez-dashboard-banner">
        <header className="dash-greeting">
          <h1 className="dash-greeting-title">Chào {firstName}</h1>
          <p className="dash-greeting-sub">Hôm nay bạn muốn học gì?</p>
        </header>
        <CharacterIllustration variant="student" className="ez-dashboard-banner-art" />
      </div>

      <div style={{ marginBottom: 'var(--ez-space-6)' }}>
        <SearchCommand
          placeholder="Tìm học liệu, bài luyện tập hoặc hỏi AI..."
          tools={studentTools}
        />
      </div>

      <div style={{ marginBottom: 'var(--ez-space-8)' }}>
        <StaggerGroup className="dash-quick-actions" selector=".dash-quick-action">
          {quickActions.map(({ to, label, icon: Icon }) => (
            <Link key={label} to={to} className="dash-quick-action">
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </StaggerGroup>
      </div>

      {/* Nhắc thiết lập, nhưng không chặn — học sinh vẫn dùng được mọi thứ */}
      {!onboardingCompleted && (
        <Alert
          tone="info"
          title="Hoàn tất thiết lập để nhận nội dung phù hợp hơn"
          style={{ marginBottom: 'var(--ez-space-6)' }}
        >
          <p>Cho biết lớp và các môn bạn muốn cải thiện để hệ thống ưu tiên nội dung đúng hơn.</p>
          <div className="ez-alert-actions">
            <Link to="/student-onboarding">
              <Button size="sm">Thiết lập ngay</Button>
            </Link>
          </div>
        </Alert>
      )}

      {state === 'error' && (
        <ErrorState
          title="Không tải được dữ liệu học tập"
          description="Kết nối tới hệ thống đang gặp sự cố. Bạn có thể thử lại."
          onRetry={() => window.location.reload()}
        />
      )}

      {state === 'loading' && (
        <Card style={{ marginBottom: 'var(--ez-space-8)' }}>
          <CardBody>
            <SkeletonText lines={3} />
          </CardBody>
        </Card>
      )}

      {/* Việc nên làm tiếp theo */}
      {state === 'ready' && nextSet && (
        <section className="dash-primary" aria-labelledby="tiep-tuc-title">
          <div className="dash-primary-main">
            <span className="dash-primary-eyebrow">Tiếp tục học</span>
            <h2 className="dash-primary-title" id="tiep-tuc-title">
              {nextSet.document_name || 'Bài luyện tập'}
            </h2>
            <div className="dash-primary-meta">
              <span>{nextSet.published_question_count || nextSet.question_count} câu</span>
              <span>Ban hành {formatDate(nextSet.created_at)}</span>
            </div>
          </div>
          <div className="dash-primary-actions">
            <Link to={`/question-sets/${nextSet.id}`}>
              <Button size="lg" leadingIcon={<Play size={18} aria-hidden="true" />}>
                Làm bài
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* Người mới: hướng dẫn ba việc có thể làm, thay cho lưới thẻ trống */}
      {isNewcomer && (
        <Card style={{ marginBottom: 'var(--ez-space-8)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">Bắt đầu với EzEdu AI</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <ol className="dash-onboard-list">
              <li className="dash-onboard-item">
                <span className="dash-onboard-num" aria-hidden="true">
                  1
                </span>
                <div>
                  <p className="dash-onboard-title">Chờ giáo viên ban hành bài luyện tập</p>
                  <p className="dash-onboard-desc">
                    Bài mới sẽ xuất hiện ở mục Bài luyện tập và được đánh dấu cho tới khi bạn hoàn
                    thành.
                  </p>
                </div>
              </li>
              <li className="dash-onboard-item">
                <span className="dash-onboard-num" aria-hidden="true">
                  2
                </span>
                <div>
                  <p className="dash-onboard-title">Hỏi AI về nội dung bạn đang học</p>
                  <p className="dash-onboard-desc">
                    Mỗi câu trả lời kèm trích dẫn phần học liệu đã dùng để bạn kiểm lại được.
                  </p>
                  <div className="dash-onboard-action">
                    <Link to="/chat-advanced">
                      <Button size="sm" variant="outline">
                        Mở hỏi đáp AI
                      </Button>
                    </Link>
                  </div>
                </div>
              </li>
              <li className="dash-onboard-item">
                <span className="dash-onboard-num" aria-hidden="true">
                  3
                </span>
                <div>
                  <p className="dash-onboard-title">Theo dõi tiến độ sau mỗi lần làm bài</p>
                  <p className="dash-onboard-desc">
                    Điểm số và thời điểm từng lần làm được lưu lại để bạn thấy mình tiến bộ ra sao.
                  </p>
                </div>
              </li>
            </ol>
          </CardBody>
        </Card>
      )}

      {state === 'ready' && !isNewcomer && (
        <>
          <StaggerGroup selector=".ez-stat">
            <StatGrid style={{ marginBottom: 'var(--ez-space-8)' }}>
              <StatTile label="Bài đã hoàn thành" value={<AnimatedCounter value={completedCount} />} />
              <StatTile label="Bài chưa làm" value={<AnimatedCounter value={pending.length} />} />
              <StatTile
                label="Điểm trung bình"
                value={
                  averagePercent === null
                    ? '—'
                    : <AnimatedCounter value={averagePercent} formatter={percentFormatter} />
                }
                hint={history.length > 0 ? `Từ ${history.length} lượt làm` : undefined}
              />
              <StatTile
                label="Kết quả cao nhất"
                value={
                  bestPercent === null
                    ? '—'
                    : <AnimatedCounter value={bestPercent} formatter={percentFormatter} />
                }
              />
            </StatGrid>
          </StaggerGroup>

          <div className="dash-columns">
            <div>
              <section className="dash-block" aria-labelledby="can-lam-title">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle as="h2">Bài cần làm</CardTitle>
                    </div>
                    <Link to="/published-questions">
                      <Button variant="ghost" size="sm">
                        Xem tất cả
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardBody>
                    <h3 className="ez-sr-only" id="can-lam-title">
                      Bài luyện tập chưa làm
                    </h3>
                    {pending.length === 0 ? (
                      <EmptyState
                        compact
                        icon={<ClipboardList size={24} />}
                        title="Bạn đã làm hết bài hiện có"
                        description="Bài mới từ giáo viên sẽ xuất hiện ở đây."
                      />
                    ) : (
                      <div>
                        {pending.slice(0, 5).map((set) => (
                          <Link key={set.id} to={`/question-sets/${set.id}`} className="dash-row">
                            <span className="dash-row-icon" aria-hidden="true">
                              <ClipboardList size={18} />
                            </span>
                            <span className="dash-row-main">
                              <span className="dash-row-title">
                                {set.document_name || 'Bài luyện tập'}
                              </span>
                              <span className="dash-row-meta">
                                <span>
                                  {set.published_question_count || set.question_count} câu
                                </span>
                                <span>{formatDate(set.created_at)}</span>
                              </span>
                            </span>
                            <span className="dash-row-trail">
                              <Play size={16} aria-hidden="true" />
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </section>
            </div>

            <div>
              <section className="dash-block" aria-labelledby="gan-nhat-title">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle as="h2">Lần làm gần nhất</CardTitle>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <h3 className="ez-sr-only" id="gan-nhat-title">
                      Kết quả làm bài gần nhất
                    </h3>
                    {!latestAttempt ? (
                      <EmptyState
                        compact
                        icon={<History size={24} />}
                        title="Chưa có lần làm bài nào"
                        description="Hoàn thành một bài luyện tập để thấy kết quả ở đây."
                        actions={
                          <Link to="/published-questions">
                            <Button size="sm">Tới bài luyện tập</Button>
                          </Link>
                        }
                      />
                    ) : (
                      <>
                        {history.slice(0, 4).map((item) => (
                          <Link
                            key={item.id}
                            to={`/question-sets/${item.question_set_id}`}
                            className="dash-row"
                          >
                            <span className="dash-row-main">
                              <span className="dash-row-title">{item.title}</span>
                              <span className="dash-row-meta">
                                <span>{formatDate(item.created_at)}</span>
                                <span>
                                  {item.score}/{item.max_score} câu đúng
                                </span>
                              </span>
                            </span>
                            <span className="dash-row-trail">
                              <span className="dash-score">{Math.round(item.percent)}%</span>
                            </span>
                          </Link>
                        ))}
                        <div style={{ marginTop: 'var(--ez-space-4)' }}>
                          <Link to="/learning-history">
                            <Button
                              variant="outline"
                              block
                              leadingIcon={<TrendingUp size={16} aria-hidden="true" />}
                            >
                              Xem tiến độ
                            </Button>
                          </Link>
                        </div>
                      </>
                    )}
                  </CardBody>
                </Card>
              </section>

              <section className="dash-block">
                <Card variant="muted">
                  <CardBody>
                    <p className="dash-onboard-title">Cần giải thích thêm về một nội dung?</p>
                    <p className="dash-onboard-desc">
                      Hỏi AI theo học liệu, mỗi câu trả lời đều kèm nguồn trích dẫn.
                    </p>
                    <div className="dash-onboard-action">
                      <Link to="/chat-advanced">
                        <Button
                          variant="outline"
                          leadingIcon={<MessageSquare size={16} aria-hidden="true" />}
                        >
                          Mở hỏi đáp AI
                        </Button>
                      </Link>
                    </div>
                  </CardBody>
                </Card>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
