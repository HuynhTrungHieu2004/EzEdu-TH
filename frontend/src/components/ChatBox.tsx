import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { chatApi } from '../api/chatApi';
import type { ChatMessageResponse } from '../api/chatApi';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';

interface ChatBoxProps {
  documentId: string;
  disabled?: boolean;
  disabledMessage?: string;
  onBusyChange?: (busy: boolean) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({
  documentId,
  disabled = false,
  disabledMessage = 'Hỏi đáp tạm khóa trong khi hệ thống cập nhật nội dung.',
  onBusyChange,
}) => {
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHistory = async () => {
      setLoadingHistory(true);
      setError(null);
      try {
        const history = await chatApi.getHistory(documentId);
        setMessages(history);
      } catch (err: unknown) {
        if (isUnauthorizedError(err)) {
          localStorage.removeItem('access_token');
          navigate('/login');
          return;
        }
        setError(getApiErrorDetail(err) ?? 'Không thể tải lịch sử hỏi đáp.');
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [documentId, navigate]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!question.trim() || loading || disabled) {
      return;
    }

    const userQuestion = question.trim();
    setQuestion('');
    setLoading(true);
    onBusyChange?.(true);
    setError(null);

    try {
      const response = await chatApi.ask(documentId, userQuestion);
      setMessages((prev) => [...prev, response]);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }
      setError(getApiErrorDetail(err) ?? 'Không thể gửi câu hỏi lúc này.');
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div>
          <h4 style={styles.title}>Hỏi đáp với tài liệu</h4>
          <p style={styles.subtitle}>
            Hệ thống sẽ truy xuất các đoạn liên quan trong tài liệu đã index rồi mới trả lời bằng AI.
          </p>
        </div>
      </div>

      <div style={styles.history}>
        {loadingHistory ? (
          <p style={styles.placeholder}>Đang tải lịch sử hỏi đáp...</p>
        ) : messages.length === 0 ? (
          <p style={styles.placeholder}>Chưa có câu hỏi nào. Hãy bắt đầu với một câu hỏi liên quan đến tài liệu này.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} style={styles.messageGroup}>
              <div style={styles.userBubble}>
                <div style={styles.label}>Bạn hỏi</div>
                <div style={styles.messageText}>{message.question}</div>
              </div>

              <div style={styles.answerCard}>
                <div style={styles.labelAnswer}>Trợ lý học tập</div>
                <div style={styles.messageText}>{message.answer}</div>

                {message.source_chunks.length > 0 && (
                  <div style={styles.sourcesBlock}>
                    <div style={styles.sourcesTitle}>Nguồn tham chiếu</div>
                    {message.source_chunks.map((source, index) => (
                      <div key={`${message.id}-${index}`} style={styles.sourceItem}>
                        <strong>
                          Đoạn {source.chunk_index !== null && source.chunk_index !== undefined ? source.chunk_index + 1 : index + 1}
                        </strong>
                        <span style={styles.sourceText}>{source.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div style={styles.answerCard}>
            <div style={styles.labelAnswer}>Trợ lý học tập</div>
            <div style={styles.messageText}>Đang truy xuất nội dung tài liệu và soạn câu trả lời...</div>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}
        <div ref={endRef} />
      </div>

      {disabled && (
        <div style={styles.disabledNotice} role="status">
          {disabledMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form} aria-disabled={disabled}>
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Nhập câu hỏi liên quan đến nội dung tài liệu..."
          style={styles.input}
          disabled={loading || disabled}
        />
        <button
          type="submit"
          disabled={!question.trim() || loading || disabled}
          style={{
            ...styles.button,
            ...(disabled ? styles.buttonDisabled : {}),
          }}
        >
          {loading ? 'Đang gửi...' : disabled ? 'Tạm khóa' : 'Gửi câu hỏi'}
        </button>
      </form>
    </div>
  );
};

const styles = {
  wrapper: {
    border: '1px solid var(--ez-border)',
    borderRadius: '16px',
    backgroundColor: 'var(--ez-bg)',
    boxShadow: 'var(--ez-shadow-lg)',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 12px',
    borderBottom: '1px solid var(--ez-border)',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--ez-text)',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    lineHeight: 1.5,
    color: 'var(--ez-text-secondary)',
  },
  history: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    padding: '20px 24px',
    maxHeight: '560px',
    overflowY: 'auto' as const,
    backgroundColor: 'var(--ez-bg)',
  },
  placeholder: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'var(--ez-text-secondary)',
  },
  messageGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    padding: '14px 16px',
    borderRadius: '16px 16px 4px 16px',
    backgroundColor: 'var(--ez-primary)',
    color: '#fff',
  },
  answerCard: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    padding: '14px 16px',
    borderRadius: '16px 16px 16px 4px',
    border: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-surface-muted)',
    color: 'var(--ez-text)',
  },
  label: {
    fontSize: '12px',
    fontWeight: '700',
    marginBottom: '6px',
    opacity: 0.9,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
  },
  labelAnswer: {
    fontSize: '12px',
    fontWeight: '700',
    marginBottom: '6px',
    color: 'var(--ez-primary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
  },
  messageText: {
    fontSize: '14px',
    lineHeight: 1.65,
    whiteSpace: 'pre-wrap' as const,
  },
  sourcesBlock: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px dashed var(--ez-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sourcesTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--ez-text-secondary)',
  },
  sourceItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: 'var(--ez-bg)',
    border: '1px solid var(--ez-border)',
    fontSize: '12px',
    color: 'var(--ez-text-secondary)',
  },
  sourceText: {
    lineHeight: 1.55,
  },
  form: {
    display: 'flex',
    gap: '12px',
    padding: '16px 24px 24px',
    borderTop: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-bg)',
  },
  disabledNotice: {
    margin: '0 24px',
    padding: '10px 12px',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: '10px',
    color: '#9a6510',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text)',
    fontSize: '14px',
  },
  button: {
    padding: '12px 18px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: 'var(--ez-primary)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  buttonDisabled: {
    cursor: 'not-allowed',
    opacity: 0.55,
  },
  error: {
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    color: '#ef4444',
    fontSize: '14px',
  },
};

export default ChatBox;
