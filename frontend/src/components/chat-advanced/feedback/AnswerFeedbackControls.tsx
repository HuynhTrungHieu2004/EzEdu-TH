import React from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { FeedbackRating, FeedbackData } from '../../../types/feedback';

interface AnswerFeedbackControlsProps {
  feedback?: FeedbackData | null;
  loading: boolean;
  onRatingClick: (rating: FeedbackRating) => void;
}

export const AnswerFeedbackControls: React.FC<AnswerFeedbackControlsProps> = ({
  feedback,
  loading,
  onRatingClick,
}) => {
  const currentRating = feedback?.rating;

  return (
    <div style={styles.container}>
      <button
        type="button"
        onClick={() => !loading && onRatingClick('helpful')}
        style={{
          ...styles.btn,
          ...(currentRating === 'helpful' ? styles.btnHelpfulActive : {}),
        }}
        aria-label="Câu trả lời hữu ích"
        aria-pressed={currentRating === 'helpful'}
        disabled={loading}
      >
        <span style={styles.icon} aria-hidden="true"><ThumbsUp size={14} /></span>
        <span style={styles.text}>Hữu ích</span>
      </button>

      <button
        type="button"
        onClick={() => !loading && onRatingClick('not_helpful')}
        style={{
          ...styles.btn,
          ...(currentRating === 'not_helpful' ? styles.btnNotHelpfulActive : {}),
        }}
        aria-label="Câu trả lời không hữu ích"
        aria-pressed={currentRating === 'not_helpful'}
        disabled={loading}
      >
        <span style={styles.icon} aria-hidden="true"><ThumbsDown size={14} /></span>
        <span style={styles.text}>Chưa tốt</span>
      </button>

      {loading && <span className="spinner" style={styles.spinner} />}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface)',
    color: 'var(--muted)',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    userSelect: 'none' as const,
    outline: 'none',
  },
  btnHelpfulActive: {
    borderColor: 'var(--mint-500)',
    backgroundColor: 'var(--mint-50)',
    color: 'var(--mint-500)',
  },
  btnNotHelpfulActive: {
    borderColor: 'var(--danger)',
    backgroundColor: 'var(--danger-bg)',
    color: 'var(--danger)',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  text: {
    lineHeight: 1,
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
