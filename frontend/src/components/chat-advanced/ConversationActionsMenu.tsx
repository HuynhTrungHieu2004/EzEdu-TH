import React, { useState, useRef, useEffect } from 'react';

interface ConversationActionsMenuProps {
  isPinned: boolean;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export const ConversationActionsMenu: React.FC<ConversationActionsMenuProps> = ({
  isPinned,
  onPin,
  onRename,
  onDelete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleAction = (callback: () => void) => {
    callback();
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={styles.triggerBtn}
        title="Tác vụ hội thoại"
        aria-label="Mở menu tác vụ"
      >
        ⋯
      </button>
      {isOpen && (
        <div style={styles.dropdown} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleAction(onPin)}
            style={styles.menuItem}
          >
            {isPinned ? '📌 Bỏ ghim' : '📌 Ghim hội thoại'}
          </button>
          <button
            type="button"
            onClick={() => handleAction(onRename)}
            style={styles.menuItem}
          >
            ✏️ Đổi tên
          </button>
          <div style={styles.divider} />
          <button
            type="button"
            onClick={() => handleAction(onDelete)}
            style={{ ...styles.menuItem, ...styles.deleteItem }}
          >
            🗑️ Xóa hội thoại
          </button>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    position: 'relative' as const,
    display: 'inline-block',
  },
  triggerBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '4px',
    fontSize: '16px',
    lineHeight: 1,
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(0,0,0,0.05)',
      color: 'var(--text)',
    },
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    zIndex: 100,
    minWidth: '150px',
    backgroundColor: 'var(--modal-bg)',
    border: '1px solid var(--border-strong)',
    borderRadius: '8px',
    boxShadow: 'var(--modal-shadow)',
    padding: '4px 0',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  menuItem: {
    width: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    padding: '8px 12px',
    fontSize: '12px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  deleteItem: {
    color: 'var(--danger)',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--border)',
    margin: '4px 0',
  },
};
export default ConversationActionsMenu;
