import React from 'react';
import { X } from 'lucide-react';

interface ConversationSearchProps {
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
}

export const ConversationSearch: React.FC<ConversationSearchProps> = ({
  value,
  onChange,
  onClear,
}) => {
  return (
    <div style={styles.container}>
      <input
        type="text"
        placeholder="Tìm kiếm hội thoại..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
        maxLength={100}
        aria-label="Tìm kiếm hội thoại"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          style={styles.clearBtn}
          title="Xóa tìm kiếm"
          aria-label="Xóa từ khóa tìm kiếm"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

const styles = {
  container: {
    position: 'relative' as const,
    width: '100%',
    marginBottom: '12px',
  },
  input: {
    width: '100%',
    padding: '8px 32px 8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--input-bg)',
    fontSize: '13px',
    color: 'var(--text-h)',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  clearBtn: {
    position: 'absolute' as const,
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '4px',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
