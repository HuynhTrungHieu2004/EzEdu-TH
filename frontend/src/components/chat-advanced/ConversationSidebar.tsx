import React from 'react';
import type { ConversationResponse } from '../../types/chat';
import { ConversationSearch } from './ConversationSearch';
import { ConversationListItem } from './ConversationListItem';

interface ConversationSidebarProps {
  conversations: ConversationResponse[];
  currentConversationId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  // Search Props
  searchValue: string;
  onSearchChange: (val: string) => void;
  onSearchClear: () => void;
  // Mutation Props
  onPin: (id: string, pin: boolean) => void;
  onRename: (conv: ConversationResponse) => void;
  onDelete: (id: string) => void;
  // Pagination Props
  hasMoreConversations: boolean;
  onLoadMoreConversations: () => void;
  loadingMoreConversations: boolean;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  currentConversationId,
  loading,
  error,
  onSelect,
  onNewChat,
  searchValue,
  onSearchChange,
  onSearchClear,
  onPin,
  onRename,
  onDelete,
  hasMoreConversations,
  onLoadMoreConversations,
  loadingMoreConversations,
}) => {
  return (
    <div className="conv-sidebar" style={styles.container}>
      <div style={styles.header}>
        <button type="button" onClick={onNewChat} className="btn-primary" style={styles.newChatBtn}>
          <span style={styles.btnIcon}>+</span> Hội thoại mới
        </button>
      </div>

      <ConversationSearch
        value={searchValue}
        onChange={onSearchChange}
        onClear={onSearchClear}
      />

      <div className="sidebar-divider" style={styles.divider} />

      <span className="sidebar-label" style={styles.label}>Lịch sử hội thoại</span>

      <div style={styles.list}>
        {loading && conversations.length === 0 ? (
          <p style={styles.statusText}>Đang tải lịch sử...</p>
        ) : error ? (
          <p style={styles.statusError}>{error}</p>
        ) : conversations.length === 0 ? (
          <p style={styles.statusText}>Chưa có cuộc trò chuyện nào.</p>
        ) : (
          <>
            {conversations.map((conv) => {
              const isSelected = conv.id === currentConversationId;
              return (
                <ConversationListItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={isSelected}
                  onSelect={onSelect}
                  onPin={onPin}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              );
            })}
            
            {hasMoreConversations && (
              <button
                type="button"
                onClick={onLoadMoreConversations}
                disabled={loadingMoreConversations}
                style={styles.loadMoreBtn}
              >
                {loadingMoreConversations ? 'Đang tải...' : 'Xem thêm hội thoại'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '260px',
    height: '100%',
    backgroundColor: 'var(--conv-sidebar-bg)',
    borderRight: '1px solid var(--ez-border)',
    padding: '16px 12px',
    overflowY: 'auto' as const,
  },
  header: {
    marginBottom: '12px',
  },
  newChatBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: '10px',
    fontWeight: '600',
    fontSize: '14px',
  },
  btnIcon: {
    fontSize: '18px',
    lineHeight: 1,
  },
  divider: {
    margin: '12px 0',
  },
  label: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--ez-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
    marginBottom: '10px',
    paddingLeft: '6px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flex: 1,
  },
  statusText: {
    fontSize: '13px',
    color: 'var(--ez-text-muted)',
    textAlign: 'center' as const,
    margin: '20px 0',
    lineHeight: 1.5,
  },
  statusError: {
    fontSize: '13px',
    color: 'var(--ez-error)',
    textAlign: 'center' as const,
    margin: '20px 0',
    lineHeight: 1.5,
  },
  loadMoreBtn: {
    width: '100%',
    padding: '8px',
    borderRadius: '8px',
    border: '1px dashed var(--ez-border)',
    backgroundColor: 'transparent',
    color: 'var(--ez-primary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    textAlign: 'center' as const,
  },
};
export default ConversationSidebar;

