import React, { useState, useEffect, useRef } from 'react';
import { chatApi } from '../api/chatApi';
import type { ChatAskResponse } from '../api/chatApi';

interface ChatBoxProps {
  documentId: string;
}

const ChatBox: React.FC<ChatBoxProps> = ({ documentId }) => {
  const [messages, setMessages] = useState<ChatAskResponse[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await chatApi.getHistory(documentId);
        setMessages(history);
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };
    
    fetchHistory();
  }, [documentId]);

  useEffect(() => {
    // Scroll to bottom
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userQuery = input.trim();
    setInput('');
    setLoading(true);
    setError(null);

    // Append temporary message for optimistic UI response
    const tempUserMsg: ChatAskResponse = {
      id: `temp_${Date.now()}`,
      question: userQuery,
      answer: '',
      sources: [],
      created_at: new Date().toISOString(),
    };
    
    // We add user's query block
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await chatApi.ask(documentId, userQuery);
      // Replace temporary message with actual response
      setMessages((prev) => 
        prev.map((m) => (m.id === tempUserMsg.id ? response : m))
      );
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Hỏi đáp thất bại. Hãy chắc chắn tài liệu của bạn đã được Index.'
      );
      // Remove temporary message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.chatWrapper}>
      <div style={styles.chatHeader}>
        <span style={styles.headerIcon}>💬</span>
        <strong>Trợ Lý AI Hỏi Đáp Học Liệu (RAG Chat)</strong>
      </div>

      <div style={styles.messageList}>
        {messages.length === 0 && !loading && (
          <div style={styles.emptyState}>
            Chưa có tin nhắn nào. Hãy hỏi bất kỳ câu hỏi nào liên quan đến tài liệu này!
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={styles.msgGroup}>
            {/* User message */}
            <div style={styles.userBubble}>
              <div style={styles.sender}>Bạn</div>
              <div style={styles.text}>{msg.question}</div>
            </div>

            {/* AI Response */}
            {msg.answer && (
              <div style={styles.aiBubble}>
                <div style={styles.senderAI}>Trợ Lý AI</div>
                <div style={styles.text}>{msg.answer}</div>
                
                {/* Source trace items */}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={styles.sourcesBox}>
                    <div style={styles.sourcesHeader}>📌 Trích đoạn ngữ cảnh tham chiếu:</div>
                    {msg.sources.map((src, sIdx) => (
                      <div key={sIdx} style={styles.sourceItem}>
                        <strong>Trích đoạn {src.chunk_index !== null ? src.chunk_index + 1 : sIdx + 1}:</strong> "{src.text}"
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={styles.aiBubble}>
            <div style={styles.senderAI}>Trợ Lý AI</div>
            <div style={styles.typingIndicator}>
              <span style={styles.dot}>.</span>
              <span style={styles.dot}>.</span>
              <span style={styles.dot}>.</span>
              <span style={styles.typingText}>AI đang suy nghĩ và tìm kiếm câu trả lời...</span>
            </div>
          </div>
        )}

        {error && <div style={styles.errorAlert}>{error}</div>}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSend} style={styles.inputArea}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập câu hỏi từ tài liệu học tập..."
          disabled={loading}
          style={styles.input}
        />
        <button type="submit" disabled={!input.trim() || loading} style={styles.sendButton}>
          Gửi
        </button>
      </form>
    </div>
  );
};

const styles = {
  chatWrapper: {
    border: '1px solid var(--border)',
    borderRadius: '12px',
    backgroundColor: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '520px',
    boxShadow: 'var(--shadow)',
    overflow: 'hidden',
  },
  chatHeader: {
    padding: '16px 20px',
    backgroundColor: 'var(--accent-bg)',
    borderBottom: '1px solid var(--accent-border)',
    color: 'var(--text-h)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '15px',
  },
  headerIcon: {
    fontSize: '18px',
  },
  messageList: {
    flexGrow: 1,
    overflowY: 'auto' as const,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  emptyState: {
    textAlign: 'center' as const,
    color: 'var(--text)',
    fontSize: '14px',
    marginTop: '60px',
    fontStyle: 'italic',
  },
  msgGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    padding: '12px 16px',
    borderRadius: '16px 16px 0 16px',
    maxWidth: '85%',
    marginLeft: 'auto',
    textAlign: 'left' as const,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--code-bg)',
    color: 'var(--text-h)',
    padding: '12px 16px',
    borderRadius: '16px 16px 16px 0',
    maxWidth: '85%',
    marginRight: 'auto',
    textAlign: 'left' as const,
    border: '1px solid var(--border)',
  },
  sender: {
    fontSize: '11px',
    fontWeight: 'bold',
    opacity: 0.8,
    marginBottom: '4px',
  },
  senderAI: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: 'var(--accent)',
    marginBottom: '4px',
  },
  text: {
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap' as const,
  },
  sourcesBox: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px dashed var(--border)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  sourcesHeader: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: 'var(--text)',
  },
  sourceItem: {
    fontSize: '12px',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    lineHeight: '1.4',
    fontStyle: 'italic',
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  dot: {
    animation: 'spin 1s infinite',
    fontSize: '20px',
    lineHeight: '1',
  },
  typingText: {
    fontSize: '13px',
    color: 'var(--text)',
    marginLeft: '8px',
  },
  errorAlert: {
    padding: '10px 14px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  inputArea: {
    padding: '16px 20px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: '12px',
    backgroundColor: 'var(--bg)',
  },
  input: {
    flexGrow: 1,
    padding: '12px 16px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
    outline: 'none',
  },
  sendButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

export default ChatBox;
