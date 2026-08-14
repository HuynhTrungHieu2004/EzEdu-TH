import React from 'react';
import { BookOpen, Flag, Globe, Library, Pin } from 'lucide-react';
import type { SourceChunkResponse, WebCitation } from '../../types/chat';

interface CitationPanelProps {
  internalCitations: SourceChunkResponse[];
  webCitations: WebCitation[];
  focusedCitationId: string | null;
  onClose?: () => void;
  onReportCitation?: (sourceId: string) => void;
}

export const CitationPanel: React.FC<CitationPanelProps> = ({
  internalCitations,
  webCitations,
  focusedCitationId,
  onClose,
  onReportCitation,
}) => {
  const hasCitations = internalCitations.length > 0 || webCitations.length > 0;

  return (
    <div style={styles.container}>
      {/* data-citation-header: khi panel nằm trong drawer, tiêu đề của drawer đã
          nói đúng nội dung này nên CSS ẩn dòng tiêu đề nội bộ đi. */}
      <div style={styles.header} data-citation-header>
        <span style={styles.title}><Pin size={16} aria-hidden="true" /><span>Nguồn trích dẫn</span></span>
        {onClose && (
          <button type="button" onClick={onClose} style={styles.closeBtn}>
            Đóng
          </button>
        )}
      </div>

      <div style={styles.content}>
        {!hasCitations ? (
          <div style={styles.empty}>
            <span style={styles.emptyIcon} aria-hidden="true"><BookOpen size={36} /></span>
            <p>Chọn câu trả lời có nguồn trích dẫn để hiển thị chi tiết tại đây.</p>
          </div>
        ) : (
          <div style={styles.list}>
            {internalCitations.length > 0 && (
              <div>
                <h5 style={styles.sectionTitle}>
                  <Library size={14} aria-hidden="true" />
                  <span>Tài liệu học tập ({internalCitations.length})</span>
                </h5>
                <div style={styles.sectionList}>
                  {internalCitations.map((chunk) => {
                    const isFocused = chunk.source_id === focusedCitationId;
                    return (
                      <div
                        key={chunk.chunk_id}
                        id={`cite-${chunk.source_id}`}
                        style={{
                          ...styles.card,
                          ...(isFocused ? styles.cardFocused : {}),
                        }}
                      >
                        <div style={styles.cardHeader}>
                          <span style={styles.sourceTag}>{chunk.source_id}</span>
                          <span style={styles.docTitle} title={chunk.document_title}>
                            {chunk.document_title}
                          </span>
                          {onReportCitation && chunk.source_id && (
                            <button
                              type="button"
                              onClick={() => chunk.source_id && onReportCitation(chunk.source_id)}
                              style={styles.flagBtn}
                              title="Báo lỗi trích dẫn"
                              aria-label={`Báo cáo trích dẫn ${chunk.source_id}`}
                            >
                              <Flag size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <p style={styles.excerpt}>{chunk.excerpt}</p>
                        <div style={styles.cardFooter}>
                          {chunk.page_number && <span>Trang: {chunk.page_number}</span>}
                          {chunk.relevance_score !== undefined && chunk.relevance_score !== null && (
                            <span>Độ liên quan: {Math.round(chunk.relevance_score * 100)}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {webCitations.length > 0 && (
              <div>
                <h5 style={styles.sectionTitle}>
                  <Globe size={14} aria-hidden="true" />
                  <span>Tìm kiếm Internet ({webCitations.length})</span>
                </h5>
                <div style={styles.sectionList}>
                  {webCitations.map((web) => {
                    const isFocused = web.source_id === focusedCitationId;
                    return (
                      <div
                        key={web.url}
                        id={`cite-${web.source_id}`}
                        style={{
                          ...styles.card,
                          ...(isFocused ? styles.cardFocused : {}),
                        }}
                      >
                        <div style={styles.cardHeader}>
                          <span style={styles.sourceTagWeb}>{web.source_id}</span>
                          <a
                            href={web.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.webLink}
                            title={web.title}
                          >
                            {web.title}
                          </a>
                          {onReportCitation && web.source_id && (
                            <button
                              type="button"
                              onClick={() => web.source_id && onReportCitation(web.source_id)}
                              style={styles.flagBtn}
                              title="Báo lỗi trích dẫn"
                              aria-label={`Báo cáo trích dẫn ${web.source_id}`}
                            >
                              <Flag size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {web.supporting_excerpt && <p style={styles.excerpt}>{web.supporting_excerpt}</p>}
                        <div style={styles.cardFooter}>
                          {web.publisher && <span>Nhà xuất bản: {web.publisher}</span>}
                          {web.relevance_score !== undefined && web.relevance_score !== null && (
                            <span>Độ tin cậy: {Math.round(web.relevance_score * 100)}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '320px',
    height: '100%',
    backgroundColor: 'var(--conv-sidebar-bg)',
    borderLeft: '1px solid var(--border)',
    overflowY: 'auto' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-h)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  closeBtn: {
    display: 'none',
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'var(--surface-muted)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    padding: '16px 20px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    color: 'var(--muted)',
    marginTop: '60px',
    fontSize: '13px',
  },
  emptyIcon: {
    display: 'inline-flex',
    marginBottom: '12px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-h)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  sectionList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  card: {
    padding: '12px',
    borderRadius: '10px',
    backgroundColor: 'var(--surface-strong)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-soft)',
    transition: 'all 0.3s ease',
  },
  cardFocused: {
    borderColor: 'var(--accent)',
    boxShadow: 'var(--shadow-glow)',
    transform: 'scale(1.02)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  flagBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '2px 4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted)',
    transition: 'transform 0.2s, color 0.2s',
    outline: 'none',
  },
  sourceTag: {
    fontSize: '10px',
    fontWeight: '800',
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-bg)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  sourceTagWeb: {
    fontSize: '10px',
    fontWeight: '800',
    color: 'var(--accent-2)',
    backgroundColor: 'var(--accent-2-bg)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  docTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-h)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  webLink: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--accent-2)',
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  excerpt: {
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--text)',
    margin: '0 0 8px 0',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: 'var(--muted)',
  },
};
