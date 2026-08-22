import React, { useState } from 'react';

interface DeleteConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteConversationDialog: React.FC<DeleteConversationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError(null);
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
      if (axiosErr.response?.status === 409) {
        setError('Hội thoại đang bận xử lý câu hỏi khác, vui lòng thử lại sau.');
      } else {
        setError(axiosErr.response?.data?.detail || 'Không thể xóa hội thoại. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h4 style={styles.title}>Xác nhận xóa cuộc trò chuyện</h4>
        <p style={styles.desc}>
          Bạn có chắc chắn muốn xóa cuộc trò chuyện này? Lịch sử tin nhắn và các phản hồi đánh giá của cuộc trò chuyện sẽ bị ẩn vĩnh viễn và không thể truy cập lại.
        </p>
        {error && <p style={styles.errorText}>{error}</p>}
        <div style={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            style={styles.cancelBtn}
            disabled={loading}
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={styles.deleteBtn}
            disabled={loading}
          >
            {loading ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
          </button>
        </div>
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
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  desc: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: 'var(--muted)',
    lineHeight: 1.5,
  },
  errorText: {
    color: 'var(--danger)',
    fontSize: '12px',
    margin: '0 0 16px 0',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--surface-strong)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  deleteBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--danger)',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
};
export default DeleteConversationDialog;
