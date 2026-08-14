import React, { useState, useEffect } from 'react';
import type { ConversationResponse } from '../../types/chat';

interface RenameConversationDialogProps {
  isOpen: boolean;
  conversation: ConversationResponse | null;
  onClose: () => void;
  onSubmit: (id: string, newTitle: string) => Promise<void>;
}

export const RenameConversationDialog: React.FC<RenameConversationDialogProps> = ({
  isOpen,
  conversation,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (conversation && isOpen) {
      const id = requestAnimationFrame(() => {
        setTitle(conversation.title);
        setError(null);
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [conversation, isOpen]);

  if (!isOpen || !conversation) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Tiêu đề không được để trống.');
      return;
    }
    if (trimmedTitle.length > 100) {
      setError('Tiêu đề tối đa 100 ký tự.');
      return;
    }
    // Check control chars
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f-\x9f]/u.test(trimmedTitle)) {
      setError('Tiêu đề chứa ký tự không hợp lệ.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(conversation.id, trimmedTitle);
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Lỗi khi cập nhật tiêu đề.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h4 style={styles.title}>Đổi tên cuộc trò chuyện</h4>
        <form onSubmit={handleSave}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            disabled={loading}
            maxLength={100}
            autoFocus
          />
          {error && <p style={styles.errorText}>{error}</p>}
          <div style={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelBtn}
              disabled={loading}
            >
              Hủy
            </button>
            <button
              type="submit"
              style={styles.submitBtn}
              disabled={loading}
            >
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--overlay-bg)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'var(--modal-bg)',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: 'var(--modal-shadow)',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--ez-text-secondary)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--ez-border-strong)',
    fontSize: '14px',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--ez-text)',
    outline: 'none',
    marginBottom: '12px',
  },
  errorText: {
    color: 'var(--ez-error)',
    fontSize: '12px',
    margin: '-8px 0 12px 0',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-surface)',
    color: 'var(--ez-text-secondary)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  submitBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--ez-primary)',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
};
export default RenameConversationDialog;
