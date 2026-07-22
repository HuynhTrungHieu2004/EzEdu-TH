import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse, SearchResultItem } from '../api/documentApi';
import ChatBox from '../components/ChatBox';
import VerificationPanel from '../components/VerificationPanel';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';

const DocumentDetailPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Operations state
  const [processing, setProcessing] = useState(false);
  const [verificationApplying, setVerificationApplying] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  // Content Preview (extracted text or video transcript)
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const navigate = useNavigate();
  const currentDocumentStatus = document?.status;

  const loadContent = useCallback(async (mediaKind?: DocumentResponse['media_kind']) => {
    if (!documentId) return;
    setLoadingContent(true);
    try {
      const contentRes = mediaKind === 'video'
        ? await documentApi.getTranscript(documentId)
        : await documentApi.getContent(documentId);
      setExtractedText(contentRes.extracted_text || '');
    } catch (contentError) {
      console.error('Failed to load content preview:', contentError);
    } finally {
      setLoadingContent(false);
    }
  }, [documentId]);

  const fetchDocument = useCallback(async (showLoading = true) => {
    if (!documentId) return;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const doc = await documentApi.get(documentId);
      setDocument(doc);

      if ([
        'processed',
        'transcribed',
        'indexed',
        'indexing',
        'index_failed',
      ].includes(doc.status)) {
        await loadContent(doc.media_kind);
      }
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }
      setError(
        getApiErrorDetail(err)
          ?? 'Không tải được thông tin học liệu. Có thể học liệu không tồn tại hoặc bạn không có quyền truy cập.'
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [documentId, loadContent, navigate]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    void Promise.resolve().then(() => fetchDocument());
  }, [documentId, fetchDocument, navigate]);

  // Poll document operations that run outside the current request/tab.
  useEffect(() => {
    if (
      !currentDocumentStatus
      || !['transcribing', 'indexing'].includes(currentDocumentStatus)
    ) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      await fetchDocument(false);
      if (!cancelled) {
        timer = setTimeout(() => void poll(), 4000);
      }
    };

    timer = setTimeout(() => void poll(), 4000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [currentDocumentStatus, fetchDocument]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
  };

  const handleExtractOrTranscribe = async () => {
    if (!documentId || !document) return;
    setProcessing(true);
    setActionError(null);

    const isVideo = document.media_kind === 'video';
    try {
      if (isVideo) {
        await documentApi.transcribe(documentId);
        // Set state locally to avoid waiting for polling
        setDocument(prev => prev ? { ...prev, status: 'transcribing' } : null);
      } else {
        await documentApi.extract(documentId);
        await fetchDocument(false);
      }
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setActionError(
        detail
          ?? (isVideo
          ? 'Không thể bắt đầu transcription cho video. Hãy kiểm tra dịch vụ AI.'
          : 'Trích xuất văn bản thất bại.')
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleIndexDocument = async () => {
    if (
      !documentId
      || verificationApplying
      || document?.status === 'indexing'
      || searchLoading
      || chatBusy
    ) return;
    setProcessing(true);
    setSearchResults([]);
    setActionError(null);

    try {
      await documentApi.index(documentId);
      await fetchDocument(false);
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setActionError(
        detail ?? 'Lập chỉ mục học liệu thất bại.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !documentId
      || !searchQuery.trim()
      || searchLoading
      || verificationApplying
      || document?.status === 'indexing'
    ) return;

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
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Đang tải chi tiết học liệu...</p>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.errorAlert}>{error ?? 'Không tìm thấy học liệu.'}</div>
        <button onClick={() => navigate('/documents')} style={styles.backButton}>
          ← Quay lại danh sách tài liệu
        </button>
      </div>
    );
  }

  const isVideo = document.media_kind === 'video';
  
  // Custom status mappings for the UI pipeline
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'Chờ trích xuất';
      case 'transcribing':
        return 'Đang chạy transcription...';
      case 'indexing':
        return 'Đang cập nhật chỉ mục...';
      case 'transcribed':
        return 'Đã transcribe';
      case 'processed':
        return 'Đã trích xuất text';
      case 'indexed':
        return 'Đã lập chỉ mục (Sẵn sàng)';
      case 'index_failed':
        return 'Lập chỉ mục thất bại';
      case 'failed':
        return 'Xử lý lỗi';
      default:
        return status;
    }
  };

  const isProcessedState = [
    'processed',
    'transcribed',
    'indexed',
    'indexing',
    'index_failed',
  ].includes(document.status);
  const isIndexedState = document.status === 'indexed';
  const contentLocked = verificationApplying || document.status === 'indexing';
  const isIndexingState = contentLocked;
  const downstreamBusy = searchLoading || chatBusy;

  const handleVerificationApplyingChange = (applying: boolean) => {
    setVerificationApplying(applying);
    if (applying) {
      setSearchResults([]);
    }
  };

  return (
    <div style={styles.container}>
      <main className="document-detail-main" style={styles.mainContent}>
        <div style={styles.navigation}>
          <button onClick={() => navigate('/documents')} style={styles.backButton}>
            ← Quay lại danh sách tài liệu
          </button>
        </div>

        {actionError && <div style={styles.errorAlert}>{actionError}</div>}

        {contentLocked && (
          <div className="document-operation-notice" role="status">
            <span className="small-spinner" aria-hidden="true" />
            <span>
              Đang áp dụng nội dung và cập nhật chỉ mục. Tìm kiếm, hỏi đáp và
              sinh câu hỏi được tạm khóa.
            </span>
          </div>
        )}

        <div className="document-detail-layout" style={styles.layout}>
          {/* Left Column: Metadata and Video Player */}
          <div style={styles.leftColumn}>
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.metaTitle}>
                    {isVideo ? '📹 VIDEO HỌC LIỆU' : '📄 TÀI LIỆU VĂN BẢN'}
                  </h2>
                  <h3 style={styles.documentName}>{document.original_filename}</h3>
                </div>
                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: isIndexedState ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    color: isIndexedState ? '#22c55e' : '#f59e0b',
                    borderColor: isIndexedState ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  }}
                >
                  {getStatusLabel(document.status)}
                </span>
              </div>

              {isVideo && document.cloudinary_url && (
                <div style={styles.videoContainer}>
                  <video
                    controls
                    src={
                      document.cloudinary_url.startsWith('local://')
                        ? document.cloudinary_url.replace('local://', '/static/')
                        : document.cloudinary_url
                    }
                    style={styles.videoPlayer}
                  />
                </div>
              )}

              <div className="document-detail-meta-grid" style={styles.metaGrid}>
                <div style={styles.metaItem}>
                  <strong>Định dạng file:</strong>
                  <span>{document.file_type.toUpperCase()}</span>
                </div>
                <div style={styles.metaItem}>
                  <strong>Dung lượng:</strong>
                  <span>{formatSize(document.file_size)}</span>
                </div>
                <div style={styles.metaItem}>
                  <strong>Ngày tải lên:</strong>
                  <span>{new Date(document.created_at).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            </div>

            {/* Extracted Text Preview Panel */}
            {isProcessedState && (
              <div style={styles.card}>
                <h4 style={styles.sectionTitle}>
                  {isVideo ? '📝 Bản dịch Transcript của Video' : '📖 Văn bản trích xuất từ tài liệu'}
                </h4>
                {loadingContent ? (
                  <div style={styles.previewLoading}>
                    <div style={styles.smallSpinner}></div>
                    <span>Đang tải nội dung...</span>
                  </div>
                ) : extractedText ? (
                  <div style={styles.textContainer}>
                    <div style={styles.extractedText}>
                      {extractedText}
                    </div>
                  </div>
                ) : (
                  <p style={styles.mutedText}>Không có nội dung văn bản để hiển thị.</p>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Processing Pipelines, Search, Actions */}
          <div style={styles.rightColumn}>
            {/* Step-by-Step Processing Pipeline */}
            <div style={styles.card}>
              <h4 style={styles.sectionTitle}>Quy trình xử lý học liệu</h4>
              
              <div style={styles.pipeline}>
                {/* Step 1: Upload */}
                <div style={styles.step}>
                  <div style={{ ...styles.stepCircle, backgroundColor: 'var(--success)', color: '#fff', borderColor: 'var(--success)' }}>✓</div>
                  <div style={styles.stepInfo}>
                    <strong style={styles.stepTitle}>Bước 1: Tải học liệu lên hệ thống</strong>
                    <span style={styles.stepDesc}>Học liệu đã được lưu trữ thành công trên Cloudinary.</span>
                  </div>
                </div>

                {/* Step 2: Extraction/Transcription */}
                <div style={styles.step}>
                  <div
                    style={{
                      ...styles.stepCircle,
                      backgroundColor: isProcessedState ? 'var(--success)' : document.status === 'transcribing' ? 'var(--warning)' : 'transparent',
                      color: isProcessedState || document.status === 'transcribing' ? '#fff' : 'var(--text)',
                      borderColor: isProcessedState ? 'var(--success)' : document.status === 'transcribing' ? 'var(--warning)' : 'var(--border)',
                    }}
                  >
                    {isProcessedState ? '✓' : '2'}
                  </div>
                  <div style={styles.stepInfo}>
                    <strong style={styles.stepTitle}>
                      {isVideo ? 'Bước 2: Trích xuất transcript video' : 'Bước 2: Trích xuất nội dung văn bản'}
                    </strong>
                    <span style={styles.stepDesc}>
                      {isVideo
                        ? 'Dùng AI chuyển đổi tiếng nói trong video thành văn bản.'
                        : 'Phân tích cấu trúc file PDF/DOCX/PPTX để lấy nội dung text.'}
                    </span>

                    {/* Button for Step 2 */}
                    {document.status === 'uploaded' && (
                      <button
                        onClick={handleExtractOrTranscribe}
                        disabled={processing}
                        style={styles.actionButton}
                      >
                        {processing ? '⏳ Đang xử lý...' : isVideo ? '🎙️ Tạo transcript' : '⚙️ Bắt đầu trích xuất text'}
                      </button>
                    )}

                    {document.status === 'transcribing' && (
                      <div style={styles.stepStatusInline}>
                        <div style={styles.smallSpinner}></div>
                        <span>Đang chạy transcription video trên hệ thống AI...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommended checkpoint before indexing and generation */}
                {isProcessedState && (
                  <VerificationPanel
                    key={document.id}
                    documentId={document.id}
                    documentStatus={document.status}
                    disabled={processing || contentLocked || downstreamBusy}
                    onApplied={() => fetchDocument(false)}
                    onApplyingChange={handleVerificationApplyingChange}
                  />
                )}

                {/* Step 3: Vector Indexing */}
                <div style={styles.step}>
                  <div
                    style={{
                      ...styles.stepCircle,
                      backgroundColor: isIndexingState
                        ? 'var(--warning)'
                        : isIndexedState
                          ? 'var(--success)'
                          : 'transparent',
                      color: isIndexingState || isIndexedState ? '#fff' : 'var(--text)',
                      borderColor: isIndexingState
                        ? 'var(--warning)'
                        : isIndexedState
                          ? 'var(--success)'
                          : 'var(--border)',
                    }}
                  >
                    {isIndexingState ? '…' : isIndexedState ? '✓' : '3'}
                  </div>
                  <div style={styles.stepInfo}>
                    <strong style={styles.stepTitle}>Bước 3: Lập chỉ mục Vector DB (ChromaDB)</strong>
                    <span style={styles.stepDesc}>
                      Chia nhỏ văn bản thành các đoạn (chunking) và mã hóa thành vector lưu vào cơ sở dữ liệu.
                    </span>

                    {/* Button for Step 3 */}
                    {isProcessedState && !isIndexedState && !isIndexingState && (
                      <button
                        onClick={handleIndexDocument}
                        disabled={processing || contentLocked || downstreamBusy}
                        style={{ ...styles.actionButton, background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', border: 'none' }}
                      >
                        {processing ? '⏳ Đang xử lý...' : isVideo ? '⚡ Index video' : '⚡ Lập chỉ mục Vector DB'}
                      </button>
                    )}

                    {isIndexingState && (
                      <div style={styles.stepStatusInline}>
                        <div style={styles.smallSpinner}></div>
                        <span>Đang cập nhật nội dung và lập lại chỉ mục...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 4: Ready & AI Operations */}
                <div style={styles.step}>
                  <div
                    style={{
                      ...styles.stepCircle,
                      backgroundColor: isIndexedState && !contentLocked
                        ? 'var(--accent)'
                        : 'var(--border)',
                      color: isIndexedState && !contentLocked ? '#fff' : 'var(--text)',
                    }}
                  >
                    4
                  </div>
                  <div style={styles.stepInfo}>
                    <strong style={styles.stepTitle}>Bước 4: Sẵn sàng sinh câu hỏi đánh giá</strong>
                    <span style={styles.stepDesc}>
                      Hệ thống đã sẵn sàng cho phép sinh đề trắc nghiệm/tự luận bám sát nội dung.
                    </span>

                    {isIndexedState && (
                      <button
                        onClick={() => {
                          if (!contentLocked) {
                            navigate(`/documents/${document.id}/questions`);
                          }
                        }}
                        disabled={contentLocked}
                        style={{
                          ...styles.generateButton,
                          ...(contentLocked ? styles.disabledAction : {}),
                        }}
                      >
                        {isVideo ? '✨ Sinh câu hỏi từ video' : '✨ Sinh câu hỏi bằng AI ngay'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Semantic RAG Search Box */}
            {isIndexedState && (
              <div style={styles.card}>
                <h4 style={styles.sectionTitle}>🔍 Tra cứu nội dung (RAG Search)</h4>
                <p style={styles.cardSubtitle}>
                  Tìm kiếm thông tin theo ngữ nghĩa trong cơ sở dữ liệu vector vừa lập chỉ mục.
                </p>

                <form
                  className="document-detail-search-form"
                  onSubmit={handleSearch}
                  style={styles.searchForm}
                >
                  <input
                    type="text"
                    placeholder="Nhập câu hỏi hoặc từ khóa tìm kiếm ngữ nghĩa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={styles.searchInput}
                    disabled={contentLocked}
                    required
                  />
                  <button
                    type="submit"
                    disabled={searchLoading || contentLocked}
                    style={{
                      ...styles.searchButton,
                      ...(contentLocked ? styles.disabledAction : {}),
                    }}
                  >
                    {searchLoading ? '...' : contentLocked ? 'Tạm khóa' : 'Tìm kiếm'}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div style={styles.searchResults}>
                    <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                      Kết quả phù hợp nhất:
                    </strong>
                    <div style={styles.resultsList}>
                      {searchResults.map((res) => (
                        <div key={res.id} style={styles.resultItem}>
                          <div style={styles.resultHeader}>
                            <span style={styles.resultIndex}>Đoạn #{res.metadata.chunk_index + 1}</span>
                            <span style={styles.resultScore}>
                              Độ tương đồng: {((1 - res.distance) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p style={styles.resultText}>"{res.text}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={styles.card}>
              <h4 style={styles.sectionTitle}>💬 Hỏi đáp với tài liệu</h4>
              <p style={styles.cardSubtitle}>
                Đặt câu hỏi trực tiếp với học liệu đã index. Hệ thống sẽ truy xuất các đoạn liên quan rồi trả lời bằng AI.
              </p>

              {isIndexedState ? (
                <ChatBox
                  documentId={document.id}
                  disabled={contentLocked}
                  disabledMessage="Hỏi đáp tạm khóa trong khi nội dung và chỉ mục đang được cập nhật."
                  onBusyChange={setChatBusy}
                />
              ) : (
                <div style={styles.chatNotice}>
                  Bạn cần index tài liệu trước khi hỏi đáp.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100svh',
    backgroundColor: 'var(--bg)',
    width: '100%',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
    backgroundColor: 'var(--bg)',
    gap: '16px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--border)',
    borderTop: '4px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  smallSpinner: {
    width: '18px',
    height: '18px',
    border: '2px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: 'var(--text)',
    margin: 0,
  },
  mainContent: {
    flexGrow: 1,
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
    textAlign: 'left' as const,
  },
  navigation: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  backButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  errorAlert: {
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '24px',
  },
  layout: {
    display: 'grid',
    gap: '30px',
    alignItems: 'start',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  card: {
    padding: '24px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '20px',
  },
  metaTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text)',
    letterSpacing: '0.8px',
    margin: 0,
  },
  documentName: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '4px 0 0 0',
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid transparent',
  },
  videoContainer: {
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
    backgroundColor: '#000',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: '20px',
    boxShadow: 'var(--shadow)',
  },
  videoPlayer: {
    width: '100%',
    maxHeight: '400px',
    display: 'block',
  },
  metaGrid: {
    display: 'grid',
    gap: '12px',
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    fontSize: '13px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 16px 0',
  },
  previewLoading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: 'var(--text)',
    fontSize: '14px',
    padding: '20px',
    justifyContent: 'center',
  },
  textContainer: {
    backgroundColor: 'var(--code-bg)',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    padding: '16px',
    maxHeight: '260px',
    overflowY: 'auto' as const,
  },
  extractedText: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: 'var(--text)',
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    textAlign: 'justify' as const,
  },
  mutedText: {
    color: 'var(--text)',
    opacity: 0.8,
    margin: 0,
  },
  pipeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  step: {
    display: 'flex',
    gap: '16px',
  },
  stepCircle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    fontSize: '13px',
    fontWeight: '700',
    border: '1px solid var(--border)',
    flexShrink: 0,
  },
  stepInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flexGrow: 1,
    textAlign: 'left' as const,
  },
  stepTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-h)',
  },
  stepDesc: {
    fontSize: '13px',
    color: 'var(--text)',
    lineHeight: '1.4',
  },
  actionButton: {
    alignSelf: 'flex-start',
    marginTop: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    boxShadow: 'var(--shadow)',
  },
  stepStatusInline: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#f59e0b',
    marginTop: '8px',
  },
  generateButton: {
    alignSelf: 'flex-start',
    marginTop: '10px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(15, 118, 110, 0.24)',
  },
  disabledAction: {
    cursor: 'not-allowed',
    opacity: 0.55,
    boxShadow: 'none',
  },
  cardSubtitle: {
    fontSize: '13px',
    color: 'var(--text)',
    margin: '0 0 16px 0',
  },
  chatNotice: {
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    color: '#b45309',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  searchForm: {
    display: 'flex',
    gap: '10px',
  },
  searchInput: {
    flexGrow: 1,
    padding: '10px 14px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
    outline: 'none',
  },
  searchButton: {
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  searchResults: {
    marginTop: '20px',
    borderTop: '1px solid var(--border)',
    paddingTop: '16px',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  resultItem: {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text)',
    marginBottom: '6px',
  },
  resultIndex: {
    color: 'var(--accent)',
  },
  resultScore: {
    color: '#22c55e',
  },
  resultText: {
    fontSize: '13px',
    lineHeight: '1.5',
    color: 'var(--text-h)',
    margin: 0,
    fontStyle: 'italic',
  },
};

export default DocumentDetailPage;
