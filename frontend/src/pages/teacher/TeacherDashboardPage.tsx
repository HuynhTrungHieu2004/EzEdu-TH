import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Database,
  FileQuestion,
  FileText,
  Library,
  MessageSquare,
  Plus,
  Sparkles,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import {
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
import { ProcessingStatusBadge } from '../../components/domain/ProcessingStatusBadge';
import { isDocumentReady } from '../../components/domain/documentStatus';
import { documentApi } from '../../api/documentApi';
import type { DocumentResponse } from '../../api/documentApi';
import { questionApi } from '../../api/questionApi';
import type { QuestionSetSummary } from '../../api/questionApi';
import { classesApi } from '../../api/classesApi';
import { useAuth } from '../../hooks/useAuth';
import { toolsForRole } from '../../data/toolRegistry';
import '../dashboard.css';

const QUICK_ACTIONS = [
  { to: '/documents', label: 'Tải học liệu', icon: Upload },
  { to: '/generate', label: 'Sinh câu hỏi', icon: Sparkles },
  { to: '/exam-blueprints', label: 'Tạo đề', icon: ClipboardList },
  { to: '/question-bank', label: 'Ngân hàng câu hỏi', icon: Database },
  { to: '/chat-advanced', label: 'Hỏi đáp AI', icon: MessageSquare },
];

type LoadState = 'loading' | 'ready' | 'error';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Tổng quan của giáo viên.
 *
 * Thay bốn thẻ điều hướng 01–04 bằng nội dung thật: học liệu gần đây kèm trạng
 * thái xử lý, bộ đề gần đây, và một hành động chính duy nhất.
 *
 * Trạng thái pipeline được diễn đạt bằng ngôn ngữ người dùng — không hiện tên
 * bước kỹ thuật, không hiện thuật ngữ embedding hay K-Means.
 */
export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [questionSets, setQuestionSets] = useState<QuestionSetSummary[]>([]);
  const [classCount, setClassCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([documentApi.list(), questionApi.listMyHistory({ limit: 5 })])
      .then(([docs, sets]) => {
        if (cancelled) return;
        setDocuments(docs ?? []);
        setQuestionSets(sets.items ?? []);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Số lớp là thông tin phụ: lỗi ở đây không được làm hỏng cả trang.
  useEffect(() => {
    let cancelled = false;
    classesApi
      .list()
      .then((res) => {
        if (!cancelled) setClassCount(res.items?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setClassCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = user?.full_name?.trim().split(/\s+/).slice(-1)[0] ?? 'bạn';
  const readyDocs = documents.filter((doc) => isDocumentReady(doc.status));
  const isNewcomer = state === 'ready' && documents.length === 0 && questionSets.length === 0;
  const teacherTools = useMemo(() => toolsForRole('teacher'), []);

  return (
    <>
      <header className="dash-greeting">
        <h1 className="dash-greeting-title">Xin chào, {firstName}</h1>
        <p className="dash-greeting-sub">Hôm nay bạn muốn chuẩn bị nội dung gì?</p>
      </header>

      <div style={{ marginBottom: 'var(--ez-space-6)' }}>
        <SearchCommand
          placeholder="Tìm công cụ, học liệu, câu hỏi hoặc đề thi..."
          tools={teacherTools}
        />
      </div>

      <div className="dash-quick-actions" style={{ marginBottom: 'var(--ez-space-8)' }}>
        {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="dash-quick-action">
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>

      {state === 'error' && (
        <ErrorState
          title="Không tải được dữ liệu"
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

      {/* Người mới: ba bước đầu tiên, thay cho lưới thẻ trống */}
      {isNewcomer && (
        <Card style={{ marginBottom: 'var(--ez-space-8)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">Ba bước để có bộ đề đầu tiên</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <ol className="dash-onboard-list">
              <li className="dash-onboard-item">
                <span className="dash-onboard-num" aria-hidden="true">
                  1
                </span>
                <div>
                  <p className="dash-onboard-title">Tải học liệu lên</p>
                  <p className="dash-onboard-desc">
                    Tài liệu PDF, DOCX, PPTX hoặc video bài giảng. Video sẽ được chuyển lời thành
                    văn bản.
                  </p>
                  <div className="dash-onboard-action">
                    <Link to="/documents">
                      <Button size="sm">Tải học liệu lên</Button>
                    </Link>
                  </div>
                </div>
              </li>
              <li className="dash-onboard-item">
                <span className="dash-onboard-num" aria-hidden="true">
                  2
                </span>
                <div>
                  <p className="dash-onboard-title">Sinh bộ câu hỏi</p>
                  <p className="dash-onboard-desc">
                    Chọn số câu, độ khó và dạng câu hỏi. Hệ thống tạo câu hỏi kèm đáp án và giải
                    thích.
                  </p>
                </div>
              </li>
              <li className="dash-onboard-item">
                <span className="dash-onboard-num" aria-hidden="true">
                  3
                </span>
                <div>
                  <p className="dash-onboard-title">Rà soát rồi ban hành</p>
                  <p className="dash-onboard-desc">
                    Bạn xem lại từng câu, sửa nếu cần, rồi ban hành cho học sinh hoặc xuất ra
                    DOCX/PDF.
                  </p>
                </div>
              </li>
            </ol>
          </CardBody>
        </Card>
      )}

      {state === 'ready' && !isNewcomer && (
        <>
          <StatGrid style={{ marginBottom: 'var(--ez-space-8)' }}>
            <StatTile label="Học liệu" value={documents.length} />
            <StatTile label="Sẵn sàng dùng" value={readyDocs.length} />
            <StatTile label="Bộ đề đã tạo" value={questionSets.length} />
            <StatTile label="Lớp học" value={classCount === null ? '—' : classCount} />
          </StatGrid>

          <div className="dash-columns">
            <div>
              <section className="dash-block">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle as="h2">Học liệu gần đây</CardTitle>
                    </div>
                    <Link to="/documents">
                      <Button variant="ghost" size="sm">
                        Xem tất cả
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardBody>
                    {documents.length === 0 ? (
                      <EmptyState
                        compact
                        icon={<Library size={24} />}
                        title="Chưa có học liệu nào"
                        description="Tải tài liệu hoặc video bài giảng lên để bắt đầu."
                        actions={
                          <Link to="/documents">
                            <Button size="sm">Tải học liệu lên</Button>
                          </Link>
                        }
                      />
                    ) : (
                      <div>
                        {documents.slice(0, 5).map((doc) => (
                          <Link key={doc.id} to={`/documents/${doc.id}`} className="dash-row">
                            <span className="dash-row-icon" aria-hidden="true">
                              {doc.media_kind === 'video' ? (
                                <Video size={18} />
                              ) : (
                                <FileText size={18} />
                              )}
                            </span>
                            <span className="dash-row-main">
                              <span className="dash-row-title">{doc.original_filename}</span>
                              <span className="dash-row-meta">
                                <span>{formatDate(doc.created_at)}</span>
                              </span>
                            </span>
                            <span className="dash-row-trail">
                              <ProcessingStatusBadge status={doc.status} />
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
              <section className="dash-block">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle as="h2">Bộ đề gần đây</CardTitle>
                    </div>
                    <Link to="/question-history">
                      <Button variant="ghost" size="sm">
                        Xem tất cả
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardBody>
                    {questionSets.length === 0 ? (
                      <EmptyState
                        compact
                        icon={<FileQuestion size={24} />}
                        title="Chưa có bộ đề nào"
                        description="Tạo bộ câu hỏi đầu tiên từ học liệu đã tải lên."
                        actions={
                          <Link to="/generate">
                            <Button size="sm" leadingIcon={<Plus size={16} aria-hidden="true" />}>
                              Tạo đề mới
                            </Button>
                          </Link>
                        }
                      />
                    ) : (
                      <div>
                        {questionSets.slice(0, 5).map((set) => (
                          <Link key={set.id} to={`/question-sets/${set.id}`} className="dash-row">
                            <span className="dash-row-icon" aria-hidden="true">
                              <FileQuestion size={18} />
                            </span>
                            <span className="dash-row-main">
                              <span className="dash-row-title">
                                {set.document_name || 'Bộ câu hỏi'}
                              </span>
                              <span className="dash-row-meta">
                                <span>{set.question_count} câu</span>
                                <span>{formatDate(set.created_at)}</span>
                                {set.published_question_count > 0 && <span>Đã ban hành</span>}
                              </span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </section>

              <section className="dash-block">
                <Card variant="muted">
                  <CardBody>
                    <p className="dash-onboard-title">Giao đề theo lớp</p>
                    <p className="dash-onboard-desc">
                      Tạo lớp và thêm học sinh để ban hành đề cho đúng nhóm người học.
                    </p>
                    <div className="dash-onboard-action">
                      <Link to="/classes">
                        <Button
                          variant="outline"
                          leadingIcon={<Users size={16} aria-hidden="true" />}
                        >
                          Quản lý lớp học
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
