import React, { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { LocalChatMessage } from '../../types/chat';
import type { FeedbackRating } from '../../types/feedback';
import { AssistantMessage } from './AssistantMessage';
import { LoadOlderMessages } from './LoadOlderMessages';

interface ChatMessageListProps {
  messages: LocalChatMessage[];
  onRetry: (msg: LocalChatMessage) => void;
  onCitationClick: (sourceId: string, msgIndex: number) => void;
  onSuggestionClick: (suggestion: string) => void;
  isBusy: boolean;
  onRatingClick: (msgIndex: number, rating: FeedbackRating) => void;
  feedbackLoadingMap: Record<string, boolean>;
  // Pagination Props
  hasMoreMessages: boolean;
  onLoadMoreMessages: () => void;
  loadingMoreMessages: boolean;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  onRetry,
  onCitationClick,
  onSuggestionClick,
  isBusy,
  onRatingClick,
  feedbackLoadingMap,
  hasMoreMessages,
  onLoadMoreMessages,
  loadingMoreMessages,
}) => {
  const endRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);

  // Scroll to bottom only when new message is appended at the end
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const lastLocalId = lastMsg.local_id;

    if (lastLocalId !== lastMessageIdRef.current || isBusy) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      lastMessageIdRef.current = lastLocalId;
    }
  }, [messages, isBusy]);

  // Preserve scroll position when prepending messages
  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      if (prevScrollHeightRef.current > 0) {
        const delta = container.scrollHeight - prevScrollHeightRef.current;
        if (delta > 0) {
          container.scrollTop = prevScrollTopRef.current + delta;
        }
      }
      prevScrollHeightRef.current = container.scrollHeight;
      prevScrollTopRef.current = container.scrollTop;
    }
  }, [messages]);

  const handleScroll = () => {
    if (containerRef.current) {
      prevScrollHeightRef.current = containerRef.current.scrollHeight;
      prevScrollTopRef.current = containerRef.current.scrollTop;
    }
  };

  return (
    <div ref={containerRef} onScroll={handleScroll} style={styles.container}>
      <LoadOlderMessages
        hasMore={hasMoreMessages}
        isLoading={loadingMoreMessages}
        onLoad={onLoadMoreMessages}
      />

      {messages.length === 0 ? (
        <div style={styles.empty}>
          <span style={styles.emptyIcon} aria-hidden="true"><Sparkles size={48} /></span>
          <p style={styles.emptyText}>Bắt đầu đặt câu hỏi đầu tiên của bạn cho trợ lý AI.</p>
          <p style={styles.emptySub}>
            Bạn có thể hỏi đáp nâng cao, kết hợp tài liệu học liệu và tìm kiếm Internet có nguồn trích dẫn đầy đủ.
          </p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.local_id} style={styles.messageRow}>
              {isUser ? (
                <div style={styles.userBubble}>
                  <div style={styles.label}>Học viên</div>
                  <div style={styles.text}>{msg.content}</div>
                  
                  {msg.status === 'failed' && (
                    <div style={styles.failedRow}>
                      <span style={styles.failedText}>Gửi tin nhắn thất bại</span>
                      <button
                        type="button"
                        onClick={() => onRetry(msg)}
                        style={styles.retryBtn}
                      >
                        Thử lại
                      </button>
                    </div>
                  )}
                </div>
              ) : msg.status === 'pending' ? (
                <div style={styles.assistantLoading} role="status" aria-live="polite">
                  <span className="spinner" style={styles.spinner} />
                  <span style={styles.loadingText}>Hệ thống đang chuẩn bị câu trả lời...</span>
                </div>
              ) : (
                <AssistantMessage
                  message={msg}
                  onCitationClick={(sourceId) => onCitationClick(sourceId, index)}
                  onSuggestionClick={onSuggestionClick}
                  onRatingClick={(rating) => onRatingClick(index, rating)}
                  feedbackLoading={!!(msg.message_id && feedbackLoadingMap[msg.message_id])}
                />
              )}
            </div>
          );
        })
      )}

      {isBusy && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
        <div style={styles.messageRow}>
          <div style={styles.assistantLoading}>
            <span className="spinner" style={styles.spinner} />
            <span style={styles.loadingText}>AI đang tìm kiếm và tổng hợp câu trả lời...</span>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    padding: '24px 20px',
    overflowY: 'auto' as const,
    flex: 1,
    // Danh sách tin nhắn là vùng cuộn duy nhất của cột chat.
    minHeight: 0,
    backgroundColor: 'var(--bg)',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    flex: 1,
    padding: '40px 20px',
  },
  emptyIcon: {
    display: 'inline-flex',
    color: 'var(--accent)',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 8px 0',
  },
  emptySub: {
    fontSize: '13px',
    color: 'var(--muted)',
    maxWidth: '380px',
    lineHeight: 1.5,
    margin: 0,
  },
  messageRow: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    padding: '14px 16px',
    borderRadius: '16px 16px 4px 16px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    boxShadow: 'var(--shadow-soft)',
  },
  label: {
    fontSize: '10px',
    fontWeight: '700',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    opacity: 0.9,
    letterSpacing: '0.6px',
  },
  text: {
    fontSize: '14px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
  },
  failedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
    fontSize: '12px',
  },
  failedText: {
    color: '#fee2e2',
  },
  retryBtn: {
    padding: '2px 8px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#fff',
    color: 'var(--danger)',
    fontWeight: '600',
    cursor: 'pointer',
  },
  assistantLoading: {
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderRadius: '14px',
    backgroundColor: 'var(--surface-muted)',
    border: '1px solid var(--border)',
  },
  spinner: {
    width: '18px',
    height: '18px',
    border: '2px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: '13px',
    color: 'var(--text)',
  },
};
