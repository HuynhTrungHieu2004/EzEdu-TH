import React from 'react';
import type { QuestionItem } from '../api/questionApi';

interface QuestionCardProps {
  question: QuestionItem;
  index: number;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index }) => {
  const isMultipleChoice = question.question_type === 'multiple_choice';
  const isTrueFalse = question.question_type === 'true_false';

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.badge}>Câu {index}</span>
        <span style={styles.typeBadge}>
          {isMultipleChoice ? 'Trắc nghiệm' : isTrueFalse ? 'Đúng/Sai' : 'Tự luận ngắn'}
        </span>
      </div>

      <h4 style={styles.questionText}>{question.question}</h4>

      {question.options && Object.keys(question.options).length > 0 && (
        <div style={styles.optionsList}>
          {Object.entries(question.options).map(([key, val]) => {
            const isCorrect = key === question.correct_answer;
            return (
              <div
                key={key}
                style={{
                  ...styles.optionItem,
                  borderColor: isCorrect ? '#22c55e' : 'var(--border)',
                  backgroundColor: isCorrect ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg)',
                }}
              >
                <span
                  style={{
                    ...styles.optionLetter,
                    backgroundColor: isCorrect ? '#22c55e' : 'var(--accent-bg)',
                    color: isCorrect ? '#fff' : 'var(--accent)',
                  }}
                >
                  {key}
                </span>
                <span style={styles.optionVal}>{val}</span>
                {isCorrect && <span style={styles.correctLabel}>✓ Đáp án đúng</span>}
              </div>
            );
          })}
        </div>
      )}

      {(!question.options || Object.keys(question.options).length === 0) && (
        <div style={styles.shortAnswerBox}>
          <strong>Đáp án mong đợi:</strong> <span style={styles.answerText}>{question.correct_answer}</span>
        </div>
      )}

      <div style={styles.explanationSection}>
        <div style={styles.explanationHeader}>💡 Giải thích chi tiết từ tài liệu:</div>
        <p style={styles.explanationText}>{question.explanation}</p>
      </div>
    </div>
  );
};

const styles = {
  card: {
    padding: '24px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    backgroundColor: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    textAlign: 'left' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    fontSize: '12px',
    fontWeight: 'bold',
    backgroundColor: 'var(--accent-bg)',
    color: 'var(--accent)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  typeBadge: {
    fontSize: '12px',
    color: 'var(--text)',
    backgroundColor: 'var(--code-bg)',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
  },
  questionText: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: 0,
    lineHeight: '1.5',
  },
  optionsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    marginTop: '6px',
  },
  optionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '14px',
  },
  optionLetter: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    fontWeight: 'bold',
    fontSize: '12px',
  },
  optionVal: {
    color: 'var(--text-h)',
    flexGrow: 1,
  },
  correctLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#22c55e',
  },
  shortAnswerBox: {
    padding: '12px 16px',
    backgroundColor: 'var(--code-bg)',
    borderLeft: '4px solid var(--accent)',
    borderRadius: '0 8px 8px 0',
    fontSize: '14px',
    color: 'var(--text-h)',
  },
  answerText: {
    color: 'var(--accent)',
    fontWeight: 'bold',
  },
  explanationSection: {
    marginTop: '10px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border)',
  },
  explanationHeader: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text)',
    marginBottom: '6px',
  },
  explanationText: {
    fontSize: '14px',
    lineHeight: '1.5',
    color: 'var(--text)',
    margin: 0,
    fontStyle: 'italic',
  },
};

export default QuestionCard;
