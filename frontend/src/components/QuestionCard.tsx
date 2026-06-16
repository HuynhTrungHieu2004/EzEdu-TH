import React, { useState } from 'react';
import type { QuestionItem } from '../api/questionApi';

interface QuestionCardProps {
  question: QuestionItem;
  index: number;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index }) => {
  const isMultipleChoice = question.question_type === 'multiple_choice';
  const isTrueFalse = question.question_type === 'true_false';
  const isShortAnswer = !question.options || Object.keys(question.options).length === 0;

  // State for multiple choice & true/false
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // State for short answer
  const [shortAnswerInput, setShortAnswerInput] = useState('');
  const [shortAnswerChecked, setShortAnswerChecked] = useState(false);

  const handleOptionClick = (key: string) => {
    if (selectedAnswer) return; // Prevent changing answer
    setSelectedAnswer(key);
  };

  const handleShortAnswerCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortAnswerInput.trim()) return;
    setShortAnswerChecked(true);
  };

  const hasOptions = question.options && Object.keys(question.options).length > 0;
  const showExplanation = hasOptions ? (selectedAnswer !== null) : shortAnswerChecked;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.badge}>Câu {index}</span>
        <span style={styles.typeBadge}>
          {isMultipleChoice ? 'Trắc nghiệm' : isTrueFalse ? 'Đúng/Sai' : 'Tự luận ngắn'}
        </span>
      </div>

      <h4 style={styles.questionText}>{question.question}</h4>

      {hasOptions && question.options && (
        <div style={styles.optionsList}>
          {Object.entries(question.options).map(([key, val]) => {
            const isSelected = key === selectedAnswer;
            let isCorrect = key.toUpperCase() === question.correct_answer.toUpperCase();
            if (isTrueFalse) {
              const ansNormal = question.correct_answer.toLowerCase();
              if (ansNormal === 'true' || ansNormal === 'a' || ansNormal === 'đúng') {
                isCorrect = key === 'A';
              } else if (ansNormal === 'false' || ansNormal === 'b' || ansNormal === 'sai') {
                isCorrect = key === 'B';
              }
            }
            const hasSelectedAny = selectedAnswer !== null;

            // Determine colors and borders dynamically
            let borderColor = 'var(--border)';
            let backgroundColor = 'var(--bg)';
            let badgeBg = 'var(--accent-bg)';
            let badgeColor = 'var(--accent)';
            let statusLabel = null;

            if (hasSelectedAny) {
              if (isCorrect) {
                // Correct option always highlighted in green
                borderColor = '#22c55e';
                backgroundColor = 'rgba(34, 197, 94, 0.05)';
                badgeBg = '#22c55e';
                badgeColor = '#fff';
                statusLabel = <span style={styles.correctLabel}>✓ Đáp án đúng</span>;
              } else if (isSelected) {
                // Wrong selected option highlighted in red
                borderColor = '#ef4444';
                backgroundColor = 'rgba(239, 68, 68, 0.05)';
                badgeBg = '#ef4444';
                badgeColor = '#fff';
                statusLabel = <span style={styles.wrongLabel}>✗ Bạn chọn sai</span>;
              }
            } else {
              // Interactive hover styles when no option is selected yet
              const isHovered = key === hoveredKey;
              if (isHovered) {
                borderColor = 'var(--accent)';
                backgroundColor = 'var(--code-bg)';
              }
            }

            return (
              <div
                key={key}
                onClick={() => handleOptionClick(key)}
                onMouseEnter={() => !hasSelectedAny && setHoveredKey(key)}
                onMouseLeave={() => !hasSelectedAny && setHoveredKey(null)}
                style={{
                  ...styles.optionItem,
                  borderColor,
                  backgroundColor,
                  cursor: hasSelectedAny ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <span
                  style={{
                    ...styles.optionLetter,
                    backgroundColor: badgeBg,
                    color: badgeColor,
                  }}
                >
                  {key}
                </span>
                <span style={styles.optionVal}>{val}</span>
                {statusLabel}
              </div>
            );
          })}
        </div>
      )}

      {isShortAnswer && (
        <div style={styles.shortAnswerSection}>
          {!shortAnswerChecked ? (
            <form onSubmit={handleShortAnswerCheck} style={styles.shortAnswerForm}>
              <input
                type="text"
                value={shortAnswerInput}
                onChange={(e) => setShortAnswerInput(e.target.value)}
                placeholder="Nhập câu trả lời của bạn vào đây..."
                style={styles.shortAnswerInput}
                required
              />
              <button type="submit" style={styles.checkButton}>
                Kiểm tra đáp án
              </button>
            </form>
          ) : (
            <div style={styles.shortAnswerResult}>
              <div style={styles.userAnswerBox}>
                <strong>Câu trả lời của bạn: </strong>
                <span
                  style={{
                    color:
                      shortAnswerInput.trim().toLowerCase() === question.correct_answer.trim().toLowerCase()
                        ? '#22c55e'
                        : '#ef4444',
                    fontWeight: 'bold',
                  }}
                >
                  {shortAnswerInput}
                </span>
                {shortAnswerInput.trim().toLowerCase() === question.correct_answer.trim().toLowerCase() ? (
                  <span style={styles.correctLabel}> (Chính xác!)</span>
                ) : (
                  <span style={styles.wrongLabel}> (Chưa chính xác)</span>
                )}
              </div>
              <div style={styles.shortAnswerExpectedBox}>
                <strong>Đáp án đúng: </strong>
                <span style={styles.answerText}>{question.correct_answer}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {showExplanation && (
        <div style={styles.explanationSection}>
          <div style={styles.explanationHeader}>💡 Giải thích chi tiết từ học liệu:</div>
          <p style={styles.explanationText}>{question.explanation}</p>
        </div>
      )}
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
    marginLeft: 'auto',
  },
  wrongLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#ef4444',
    marginLeft: 'auto',
  },
  shortAnswerSection: {
    marginTop: '6px',
  },
  shortAnswerForm: {
    display: 'flex',
    gap: '12px',
  },
  shortAnswerInput: {
    flexGrow: 1,
    padding: '10px 14px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
    outline: 'none',
  },
  checkButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  shortAnswerResult: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'var(--code-bg)',
    borderRadius: '8px',
    borderLeft: '4px solid var(--accent)',
  },
  userAnswerBox: {
    fontSize: '14px',
    color: 'var(--text-h)',
  },
  shortAnswerExpectedBox: {
    fontSize: '14px',
    color: 'var(--text-h)',
    borderTop: '1px dashed var(--border)',
    paddingTop: '8px',
    marginTop: '4px',
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
