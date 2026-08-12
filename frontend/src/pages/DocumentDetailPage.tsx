import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  BookOpen,
  Check,
  FileSearch,
  FileText,
  Library,
  Loader,
  MessageSquare,
  Mic,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse, SearchResultItem } from '../api/documentApi';
import { buildEventIdempotencyKey, getLearningSession, trackLearningEvent } from '../api/learningEventApi';
import ChatBox from '../components/ChatBox';
import VerificationPanel from '../components/VerificationPanel';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';
import { ProcessingStatusBadge } from '../components/domain/ProcessingStatusBadge';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Skeleton,
  SkeletonText,
  Tabs,
} from '../components/ui';
import './document-detail.css';

type TabKey = 'content' | 'search' | 'verify' | 'chat' | 'related';

type SimilarDocument = {
  document_id: string;
  similarity: number;
  document_name?: string;
  file_type?: string;
};

const PROCESSED_STATUSES = ['processed', 'transcribed', 'indexed', 'indexing', 'index_failed'];

export default function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();

  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [verificationApplying, setVerificationApplying] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('content');
  const [similarDocs, setSimilarDocs] = useState<SimilarDocument[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarMessage, setSimilarMessage] = useState<string | null>(null);
  const [confirmIndexOpen, setConfirmIndexOpen] = useState(false);

  const currentDocumentStatus = document?.status;

  const loadContent = useCallback(
    async (mediaKind?: DocumentResponse['media_kind']) => {
      if (!documentId) return;
      setLoadingContent(true);
      setContentError(null);
      try {
        const contentRes =
          mediaKind === 'video'
            ? await documentApi.getTranscript(documentId)
            : await documentApi.getContent(documentId);
        setExtractedText(contentRes.extracted_text || '');
      } catch {
        setExtractedText(null);
        setContentError('Không thể tải nội dung trích xuất. Vui lòng thử tải lại trang.');
      } finally {
        setLoadingContent(false);
      }
    },
    [documentId],
  );

  const fetchDocument = useCallback(
    async (showLoading = true) => {
      if (!documentId) return;
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const doc = await documentApi.get(documentId);
        setDocument(doc);
        if (PROCESSED_STATUSES.includes(doc.status)) {
          await loadContent(doc.media_kind);
        }
      } catch (err: unknown) {
        if (isUnauthorizedError(err)) {
          localStorage.removeItem('access_token');
          navigate('/login');
          return;
        }
        setError(
          getApiErrorDetail(err) ??
            'Không tải được thông tin học liệu. Có thể học liệu không tồn tại hoặc bạn không có quyền truy cập.',
        );
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [documentId, loadContent, navigate],
  );

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    void Promise.resolve().then(() => fetchDocument());
  }, [documentId, fetchDocument, navigate]);

  // Chỉ gọi API khi người dùng thực sự mở tab — tránh tốn một request cho
  // mọi lượt xem chi tiết học liệu.
  useEffect(() => {
    if (activeTab !== 'related' || !documentId) return;
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarMessage(null);
    documentApi
      .getSimilar(documentId)
      .then((data) => {
        if (cancelled) return;
        // Cosine âm hoặc bằng 0 nghĩa là hai học liệu không chung nội dung —
        // liệt kê chúng dưới nhãn "liên quan" chỉ gây hiểu nhầm.
        setSimilarDocs((data.similar_documents ?? []).filter((item) => item.similarity > 0));
        setSimilarMessage(data.message ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSimilarDocs([]);
        setSimilarMessage(getApiErrorDetail(err) ?? 'Không tải được danh sách học liệu liên quan.');
      })
      .finally(() => {
        if (!cancelled) setSimilarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, documentId]);

  useEffect(() => {
    if (!document?.id) return;
    const session = getLearningSession('document', document.id);
    const startedAt = Date.now();
    const baseParts = [session.sessionId, document.id];

    trackLearningEvent({
      event_type: 'lesson_started',
      item_id: document.id,
      document_id: document.id,
      session_id: session.sessionId,
      idempotency_key: buildEventIdempotencyKey([...baseParts, 'lesson_started']),
    });

    return () => {
      trackLearningEvent({
        event_type: 'lesson_completed',
        item_id: document.id,
        document_id: document.id,
        session_id: session.sessionId,
        idempotency_key: buildEventIdempotencyKey([...baseParts, 'lesson_completed']),
        response_time_ms: Math.max(0, Date.now() - startedAt),
        completed: true,
      });
    };
  }, [document?.id]);

  // Theo dõi các thao tác chạy nền ngoài request hiện tại (transcribe/index).
  useEffect(() => {
    if (!currentDocumentStatus || !['transcribing', 'indexing'].includes(currentDocumentStatus)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      await fetchDocument(false);
      if (!cancelled) timer = setTimeout(() => void poll(), 4000);
    };

    timer = setTimeout(() => void poll(), 4000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [currentDocumentStatus, fetchDocument]);

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
  }

  async function handleExtractOrTranscribe() {
    if (!documentId || !document) return;
    setProcessing(true);
    setActionError(null);
    const isVideo = document.media_kind === 'video';
    try {
      if (isVideo) {
        await documentApi.transcribe(documentId);
        setDocument((prev) => (prev ? { ...prev, status: 'transcribing' } : null));
      } else {
        await documentApi.extract(documentId);
        await fetchDocument(false);
      }
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setActionError(
        detail ?? (isVideo ? 'Không thể bắt đầu transcription cho video. Hãy kiểm tra dịch vụ AI.' : 'Trích xuất văn bản thất bại.'),
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleIndexDocument() {
    if (!documentId || verificationApplying || document?.status === 'indexing' || searchLoading || chatBusy) return;
    setProcessing(true);
    setSearchResults([]);
    setActionError(null);
    try {
      await documentApi.index(documentId);
      await fetchDocument(false);
      setConfirmIndexOpen(false);
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Lập chỉ mục học liệu thất bại.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!documentId || !searchQuery.trim() || searchLoading || verificationApplying || document?.status === 'indexing') return;
    setSearchLoading(true);
    setActionError(null);
    try {
      const results = await documentApi.search(documentId, searchQuery);
      setSearchResults(results);
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Tìm kiếm ngữ nghĩa thất bại.');
    } finally {
      setSearchLoading(false);
    }
  }

  function handleVerificationApplyingChange(applying: boolean) {
    setVerificationApplying(applying);
    if (applying) setSearchResults([]);
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="8rem" />
        <Skeleton height="16rem" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <ErrorState
        title="Không tìm thấy học liệu"
        description={error ?? 'Học liệu không tồn tại hoặc bạn không có quyền truy cập.'}
        actions={<Button onClick={() => navigate('/documents')}>Quay lại danh sách học liệu</Button>}
      />
    );
  }

  const isVideo = document.media_kind === 'video';
  const isProcessedState = PROCESSED_STATUSES.includes(document.status);
  const isIndexedState = document.status === 'indexed';
  const contentLocked = verificationApplying || document.status === 'indexing';
  const isIndexingState = contentLocked;
  const downstreamBusy = searchLoading || chatBusy;

  const tabItems = [
    { id: 'content', label: 'Nội dung', icon: <FileText size={16} /> },
    { id: 'search', label: 'Tìm kiếm', icon: <Search size={16} /> },
    { id: 'verify', label: 'Kiểm chứng', icon: <ShieldCheck size={16} /> },
    { id: 'chat', label: 'Hỏi đáp', icon: <MessageSquare size={16} /> },
    { id: 'related', label: 'Liên quan', icon: <Library size={16} /> },
  ];

  return (
    <>
      <PageHeader
        backTo="/documents"
        backLabel="Quay lại danh sách học liệu"
        eyebrow={isVideo ? 'Video học liệu' : 'Tài liệu văn bản'}
        title={document.original_filename}
        actions={<ProcessingStatusBadge status={document.status} />}
      />

      {actionError && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-6)' }}>
          {actionError}
        </Alert>
      )}

      {contentLocked && (
        <Alert tone="warning" style={{ marginBottom: 'var(--ez-space-6)' }}>
          Đang áp dụng nội dung và cập nhật chỉ mục. Tìm kiếm, hỏi đáp và sinh câu hỏi được tạm khoá.
        </Alert>
      )}

      <div className="dd-overview">
        <div>
          <Card>
            <CardBody>
              {isVideo && document.cloudinary_url && (
                <div className="dd-video">
                  <video
                    controls
                    src={
                      document.cloudinary_url.startsWith('local://')
                        ? document.cloudinary_url.replace('local://', '/static/')
                        : document.cloudinary_url
                    }
                  />
                </div>
              )}

              <div className="dd-meta-grid">
                <div className="dd-meta-item">
                  <span className="dd-meta-label">Định dạng file</span>
                  {document.file_type.toUpperCase()}
                </div>
                <div className="dd-meta-item">
                  <span className="dd-meta-label">Dung lượng</span>
                  {formatSize(document.file_size)}
                </div>
                <div className="dd-meta-item">
                  <span className="dd-meta-label">Ngày tải lên</span>
                  {new Date(document.created_at).toLocaleString('vi-VN')}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Quy trình xử lý học liệu</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              <div className="dd-pipeline">
                <div className="dd-step" data-status="done">
                  <span className="dd-step-marker" aria-hidden="true">
                    <Check size={14} />
                  </span>
                  <div className="dd-step-info">
                    <span className="dd-step-title">Bước 1: Tải học liệu lên hệ thống</span>
                    <span className="dd-step-desc">Học liệu đã được lưu trữ thành công.</span>
                  </div>
                </div>

                <div
                  className="dd-step"
                  data-status={isProcessedState ? 'done' : document.status === 'transcribing' ? 'active' : undefined}
                >
                  <span className="dd-step-marker" aria-hidden="true">
                    {isProcessedState ? <Check size={14} /> : '2'}
                  </span>
                  <div className="dd-step-info">
                    <span className="dd-step-title">
                      {isVideo ? 'Bước 2: Trích xuất transcript video' : 'Bước 2: Trích xuất nội dung văn bản'}
                    </span>
                    <span className="dd-step-desc">
                      {isVideo
                        ? 'Dùng AI chuyển đổi tiếng nói trong video thành văn bản.'
                        : 'Phân tích cấu trúc file để lấy nội dung văn bản.'}
                    </span>

                    {document.status === 'uploaded' && (
                      <div className="dd-step-action">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={processing}
                          leadingIcon={isVideo ? <Mic size={14} aria-hidden="true" /> : <Settings size={14} aria-hidden="true" />}
                          onClick={handleExtractOrTranscribe}
                        >
                          {isVideo ? 'Tạo transcript' : 'Bắt đầu trích xuất'}
                        </Button>
                      </div>
                    )}

                    {document.status === 'transcribing' && (
                      <div className="dd-step-status">
                        <Loader size={14} aria-hidden="true" />
                        Đang chuyển lời video...
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="dd-step"
                  data-status={isIndexingState ? 'active' : isIndexedState ? 'done' : undefined}
                >
                  <span className="dd-step-marker" aria-hidden="true">
                    {isIndexingState ? '…' : isIndexedState ? <Check size={14} /> : '3'}
                  </span>
                  <div className="dd-step-info">
                    <span className="dd-step-title">Bước 3: Lập chỉ mục để hỏi đáp và tìm kiếm</span>
                    <span className="dd-step-desc">Chia nhỏ nội dung và chuẩn bị để có thể tra cứu theo ngữ nghĩa.</span>

                    {isProcessedState && !isIndexedState && !isIndexingState && (
                      <div className="dd-step-action">
                        <Button
                          size="sm"
                          loading={processing}
                          disabled={contentLocked || downstreamBusy}
                          leadingIcon={<Zap size={14} aria-hidden="true" />}
                          onClick={() => setConfirmIndexOpen(true)}
                        >
                          {isVideo ? 'Lập chỉ mục video' : 'Lập chỉ mục'}
                        </Button>
                      </div>
                    )}

                    {isIndexingState && (
                      <div className="dd-step-status">
                        <Loader size={14} aria-hidden="true" />
                        Đang cập nhật chỉ mục...
                      </div>
                    )}
                  </div>
                </div>

                <div className="dd-step" data-status={isIndexedState && !contentLocked ? 'done' : undefined}>
                  <span className="dd-step-marker" aria-hidden="true">
                    {isIndexedState && !contentLocked ? <Check size={14} /> : '4'}
                  </span>
                  <div className="dd-step-info">
                    <span className="dd-step-title">Bước 4: Sẵn sàng sinh câu hỏi</span>
                    <span className="dd-step-desc">Tạo bộ câu hỏi bám sát nội dung học liệu này.</span>

                    {isIndexedState && (
                      <div className="dd-step-action">
                        <Button
                          size="sm"
                          disabled={contentLocked}
                          leadingIcon={<Sparkles size={14} aria-hidden="true" />}
                          onClick={() => !contentLocked && navigate(`/documents/${document.id}/questions`)}
                        >
                          Sinh câu hỏi
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardBody>
          <Tabs
            items={tabItems}
            value={activeTab}
            onChange={(id) => setActiveTab(id as TabKey)}
            ariaLabel="Chi tiết học liệu"
          >
            {activeTab === 'content' && (
              <>
                {contentError ? (
                  <Alert tone="error">{contentError}</Alert>
                ) : !isProcessedState ? (
                  <EmptyState
                    compact
                    icon={<FileText size={24} />}
                    title="Chưa có nội dung để xem"
                    description={
                      isVideo
                        ? 'Hoàn thành bước 2 (tạo transcript) trong quy trình xử lý ở trên để xem nội dung tại đây.'
                        : 'Hoàn thành bước 2 (trích xuất) trong quy trình xử lý ở trên để xem nội dung tại đây.'
                    }
                  />
                ) : loadingContent ? (
                  <SkeletonText lines={6} />
                ) : extractedText ? (
                  <div className="dd-content-box">{extractedText}</div>
                ) : (
                  <EmptyState compact icon={<BookOpen size={24} />} title="Không có nội dung văn bản để hiển thị" />
                )}
              </>
            )}

            {activeTab === 'search' && (
              <>
                {!isIndexedState ? (
                  <EmptyState
                    compact
                    icon={<Search size={24} />}
                    title="Cần lập chỉ mục trước khi tìm kiếm"
                    description="Hoàn thành bước 3 trong quy trình xử lý ở trên để tra cứu nội dung theo ngữ nghĩa."
                  />
                ) : (
                  <>
                    <form className="dd-search-form" onSubmit={handleSearch}>
                      <Input
                        type="text"
                        placeholder="Nhập câu hỏi hoặc từ khoá tìm kiếm ngữ nghĩa..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        disabled={contentLocked}
                        required
                      />
                      <Button type="submit" loading={searchLoading} disabled={contentLocked}>
                        {contentLocked ? 'Tạm khoá' : 'Tìm kiếm'}
                      </Button>
                    </form>

                    {searchResults.length === 0 ? (
                      <EmptyState
                        compact
                        icon={<FileSearch size={24} />}
                        title="Chưa có kết quả tìm kiếm"
                        description="Nhập từ khoá hoặc câu hỏi ở trên để tra cứu nội dung học liệu."
                      />
                    ) : (
                      <div className="dd-search-results">
                        {searchResults.map((res) => (
                          <div key={res.id} className="dd-search-result">
                            <div className="dd-search-result-head">
                              <span>Đoạn #{res.metadata.chunk_index + 1}</span>
                              <span className="dd-search-result-score">
                                Độ tương đồng: {((1 - res.distance) * 100).toFixed(1)}%
                              </span>
                            </div>
                            <p className="dd-search-result-text">&quot;{res.text}&quot;</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === 'verify' && (
              <>
                {!isProcessedState ? (
                  <EmptyState
                    compact
                    icon={<ShieldCheck size={24} />}
                    title="Cần trích xuất nội dung trước khi kiểm chứng"
                    description="Hoàn thành bước 2 trong quy trình xử lý ở trên."
                  />
                ) : (
                  <VerificationPanel
                    key={document.id}
                    documentId={document.id}
                    documentStatus={document.status}
                    disabled={processing || contentLocked || downstreamBusy}
                    onApplied={() => fetchDocument(false)}
                    onApplyingChange={handleVerificationApplyingChange}
                  />
                )}
              </>
            )}

            {activeTab === 'chat' && (
              <>
                {!isIndexedState ? (
                  <EmptyState
                    compact
                    icon={<MessageSquare size={24} />}
                    title="Cần lập chỉ mục trước khi hỏi đáp"
                    description="Hoàn thành bước 3 trong quy trình xử lý ở trên để hỏi đáp trên học liệu này."
                  />
                ) : (
                  <ChatBox
                    documentId={document.id}
                    disabled={contentLocked}
                    disabledMessage="Hỏi đáp tạm khoá trong khi nội dung và chỉ mục đang được cập nhật."
                    onBusyChange={setChatBusy}
                  />
                )}
              </>
            )}

            {activeTab === 'related' && (
              <>
                {!isIndexedState ? (
                  <EmptyState
                    compact
                    icon={<Library size={24} />}
                    title="Cần lập chỉ mục trước khi tìm học liệu liên quan"
                    description="Hoàn thành bước 3 trong quy trình xử lý ở trên để so sánh học liệu này với các học liệu khác."
                  />
                ) : similarLoading ? (
                  <SkeletonText lines={4} />
                ) : similarDocs.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Library size={24} />}
                    title="Chưa tìm thấy học liệu liên quan"
                    description={similarMessage ?? 'Tải lên và lập chỉ mục thêm học liệu để hệ thống so sánh nội dung.'}
                  />
                ) : (
                  <>
                    <p className="dd-related-hint">
                      So sánh bằng độ tương đồng cosine trên vector nội dung — học liệu càng gần nhau về nội dung thì
                      tỉ lệ càng cao.
                    </p>
                    <ul className="dd-related-list">
                      {similarDocs.map((item) => (
                        <li key={item.document_id}>
                          <button
                            type="button"
                            className="dd-related-item"
                            onClick={() => navigate(`/documents/${item.document_id}`)}
                          >
                            <span className="dd-related-name">
                              {item.document_name || 'Học liệu không còn tên hiển thị'}
                            </span>
                            <span
                              className="dd-related-score"
                              data-strength={item.similarity >= 0.5 ? 'high' : item.similarity >= 0.25 ? 'medium' : 'low'}
                            >
                              {Math.round(item.similarity * 100)}% tương đồng
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </Tabs>
        </CardBody>
      </Card>
      <ConfirmDialog
        open={confirmIndexOpen}
        onClose={processing ? () => undefined : () => setConfirmIndexOpen(false)}
        onConfirm={() => void handleIndexDocument()}
        title="Lập chỉ mục học liệu?"
        description={`Phạm vi xử lý: 1 ${isVideo ? 'video' : 'tài liệu'} “${document.original_filename}”. Hệ thống sẽ chia nhỏ nội dung và gọi dịch vụ embedding để phục vụ tìm kiếm và hỏi đáp.`}
        confirmLabel="Bắt đầu lập chỉ mục"
        confirmVariant="primary"
        busy={processing}
      >
        <Alert tone="warning">Thao tác có thể sử dụng quota AI và tạo tác vụ xử lý nền. Không gửi lại khi đang chạy.</Alert>
      </ConfirmDialog>
    </>
  );
}
