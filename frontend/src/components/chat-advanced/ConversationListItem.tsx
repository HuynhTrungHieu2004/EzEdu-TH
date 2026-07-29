import React, { useState } from 'react';
import { MessageSquare, Pin } from 'lucide-react';
import type { ConversationResponse } from '../../types/chat';
import { ConversationActionsMenu } from './ConversationActionsMenu';

interface ConversationListItemProps {
  conversation: ConversationResponse;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string, pin: boolean) => void;
  onRename: (conv: ConversationResponse) => void;
  onDelete: (id: string) => void;
}

export const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  isSelected,
  onSelect,
  onPin,
  onRename,
  onDelete,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const isPinned = !!conversation.is_pinned;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(conversation.id)}
      style={{
        ...styles.itemContainer,
        ...(isSelected ? styles.itemActive : {}),
      }}
    >
      <div style={styles.content}>
        <span style={styles.itemIcon} aria-hidden="true">
          {isPinned ? <Pin size={14} /> : <MessageSquare size={14} />}
        </span>
        <span style={styles.itemText} title={conversation.title}>
          {conversation.title}
        </span>
      </div>
      {(isHovered || isSelected) && (
        <div style={styles.actions} onClick={(e) => e.stopPropagation()}>
          <ConversationActionsMenu
            isPinned={isPinned}
            onPin={() => onPin(conversation.id, !isPinned)}
            onRename={() => onRename(conversation)}
            onDelete={() => onDelete(conversation.id)}
          />
        </div>
      )}
    </div>
  );
};

const styles = {
  itemContainer: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    fontSize: '13px',
    transition: 'all 0.2s',
    userSelect: 'none' as const,
  },
  itemActive: {
    backgroundColor: 'var(--accent-bg)',
    color: 'var(--accent)',
    fontWeight: '600',
    borderLeft: '3px solid var(--accent)',
    borderRadius: '0 8px 8px 0',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
    flex: 1,
  },
  itemIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  itemText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    marginLeft: '6px',
    flexShrink: 0,
  },
};
export default ConversationListItem;
