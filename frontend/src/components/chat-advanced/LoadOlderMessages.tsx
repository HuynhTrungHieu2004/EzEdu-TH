import React from 'react';

interface LoadOlderMessagesProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoad: () => void;
}

export const LoadOlderMessages: React.FC<LoadOlderMessagesProps> = ({
  hasMore,
  isLoading,
  onLoad,
}) => {
  if (!hasMore) return null;

  return (
    <div style={styles.container}>
      <button
        type="button"
        onClick={onLoad}
        disabled={isLoading}
        style={styles.button}
      >
        {isLoading ? 'Đang tải tin nhắn cũ...' : 'Tải tin nhắn cũ hơn'}
      </button>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 0',
    width: '100%',
  },
  button: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--glass-white-strong)',
    color: 'var(--accent)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    outline: 'none',
  },
};
export default LoadOlderMessages;
