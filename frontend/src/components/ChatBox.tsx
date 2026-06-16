import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { chatApi } from '../api/chatApi';
import type { ChatMessageResponse } from '../api/chatApi';

interface ChatBoxProps {
  documentId: string;
}

const ChatBox: React.FC<ChatBoxProps> = ({ documentId }) => {
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
      } catch (err: any) {
        if (err.response?.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/login');
          return;
        }
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Không thể tải lịch sử hỏi đáp.');
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [documentId, navigate]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!question.trim() || loading) {
      return;
    }

    const userQuestion = question.trim();
    setQuestion('');
    setLoading(true);
    setError(null);

    try {
      const response = await chatApi.ask(documentId, userQuestion);
      setMessages((prev) => [...prev, response]);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Không thể gửi câu hỏi lúc này.');
    } finally {
      setLoading(false);
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

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Nhập câu hỏi liên quan đến nội dung tài liệu..."
          style={styles.input}
          disabled={loading}
        />
        <button type="submit" disabled={!question.trim() || loading} style={styles.button}>
          {loading ? 'Đang gửi...' : 'Gửi câu hỏi'}
        </button>
      </form>
    </div>
  );
};

const styles = {
  wrapper: {
    border: '1px solid var(--border)',
    borderRadius: '16px',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 12px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-h)',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    lineHeight: 1.5,
    color: 'var(--text)',
  },
  history: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    padding: '20px 24px',
    maxHeight: '560px',
    overflowY: 'auto' as const,
    backgroundColor: 'var(--bg)',
  },
  placeholder: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'var(--text)',
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
    backgroundColor: 'var(--accent)',
    color: '#fff',
  },
  answerCard: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    padding: '14px 16px',
    borderRadius: '16px 16px 16px 4px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--code-bg)',
    color: 'var(--text-h)',
  },
  label: {
    fontSize: '11px',
    fontWeight: '700',
    marginBottom: '6px',
    opacity: 0.9,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
  },
  labelAnswer: {
    fontSize: '11px',
    fontWeight: '700',
    marginBottom: '6px',
    color: 'var(--accent)',
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
    borderTop: '1px dashed var(--border)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sourcesTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  sourceItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    fontSize: '12px',
    color: 'var(--text)',
  },
  sourceText: {
    lineHeight: 1.55,
  },
  form: {
    display: 'flex',
    gap: '12px',
    padding: '16px 24px 24px',
    borderTop: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
    fontSize: '14px',
  },
  button: {
    padding: '12px 18px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
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
