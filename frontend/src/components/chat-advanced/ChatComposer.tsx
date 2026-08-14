import React, { useState } from 'react';
import type { KeyboardEvent } from 'react';

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({ onSend, disabled = false }) => {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isButtonDisabled = !text.trim() || disabled;

  return (
    <div style={styles.container}>
      <textarea
        placeholder="Nhập câu hỏi liên quan đến nội dung tài liệu học tập hoặc tra cứu Internet..."
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={2}
        style={styles.textarea}
        aria-label="Nhập câu hỏi"
      />
      <div style={styles.footer}>
        <span style={styles.counter}>{text.length}/2000 ký tự</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isButtonDisabled}
          style={{
            ...styles.button,
            ...(isButtonDisabled ? styles.buttonDisabled : {}),
          }}
          aria-label="Gửi câu hỏi"
        >
          {disabled ? 'Đang gửi...' : 'Gửi câu hỏi'}
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '16px 20px',
    backgroundColor: 'var(--ez-surface)',
    borderTop: '1px solid var(--ez-border)',
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text)',
    fontSize: '14px',
    lineHeight: 1.5,
    resize: 'vertical' as const,
    outline: 'none',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    fontSize: '12px',
    color: 'var(--ez-text-muted)',
  },
  button: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--ez-primary)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    cursor: 'not-allowed',
    opacity: 0.55,
  },
};
