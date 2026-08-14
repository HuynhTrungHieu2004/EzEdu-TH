import React, { useState, useRef, useEffect } from 'react';
import { Ellipsis, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';

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
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <div style={styles.dropdown} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleAction(onPin)}
            style={styles.menuItem}
          >
            {isPinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
            <span>{isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}</span>
          </button>
          <button
            type="button"
            onClick={() => handleAction(onRename)}
            style={styles.menuItem}
          >
            <Pencil size={16} aria-hidden="true" /><span>Đổi tên</span>
          </button>
          <div style={styles.divider} />
          <button
            type="button"
            onClick={() => handleAction(onDelete)}
            style={{ ...styles.menuItem, ...styles.deleteItem }}
          >
            <Trash2 size={16} aria-hidden="true" /><span>Xóa hội thoại</span>
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
    color: 'var(--ez-text-muted)',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '4px',
    fontSize: '16px',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(0,0,0,0.05)',
      color: 'var(--ez-text-secondary)',
    },
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    zIndex: 100,
    minWidth: '150px',
    backgroundColor: 'var(--modal-bg)',
    border: '1px solid var(--ez-border-strong)',
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
    color: 'var(--ez-text-secondary)',
    padding: '8px 12px',
    fontSize: '12px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  deleteItem: {
    color: 'var(--ez-error)',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--ez-border)',
    margin: '4px 0',
  },
};
export default ConversationActionsMenu;
