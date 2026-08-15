import React, { useState, useEffect } from 'react';
import { Check, Eye, EyeOff, GraduationCap, Lightbulb, X } from 'lucide-react';
import type { QuestionItem } from '../api/questionApi';

interface QuestionCardProps {
  question: QuestionItem;
  index: number;
  /** When true, answers/explanations are hidden until user clicks "Hiện đáp án". */
  studyMode?: boolean;
  /** External signal to reveal/hide answer in study mode. */
  forceReveal?: boolean;
  savedAnswer?: string;
  onAnswerChange?: (questionIndex: number, answer: string) => void;
  onExplanationViewed?: (questionIndex: number) => void;
  examMode?: boolean;
  submittedResult?: {
    is_correct: boolean;
    correct_answer: string;
  };
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  studyMode = false,
  forceReveal = false,
  savedAnswer,
  onAnswerChange,
  onExplanationViewed,
  examMode = false,
  submittedResult,
}) => {
  const isMultipleChoice = question.question_type === 'multiple_choice';
  const isTrueFalse = question.question_type === 'true_false';
  const isShortAnswer = !question.options || Object.keys(question.options).length === 0;
  const hasOptions = question.options && Object.keys(question.options).length > 0;
  const statusLabels: Record<string, string> = {
    draft: 'Bản nháp',
    review_pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    published: 'Đã xuất bản',
  };

  // State for multiple choice & true/false
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(savedAnswer || null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // State for short answer
  const [shortAnswerInput, setShortAnswerInput] = useState(savedAnswer || '');
  const [shortAnswerChecked, setShortAnswerChecked] = useState(false);

  // Study mode: manual reveal toggle
  const [manualReveal, setManualReveal] = useState(false);

  // Sync forceReveal from parent
  useEffect(() => {
    void Promise.resolve().then(() => {
      setManualReveal(forceReveal);
      if (forceReveal) {
        onExplanationViewed?.(index - 1);
      }
      if (!forceReveal) {
        // Reset interactive state when hiding answers
        setSelectedAnswer(null);
        setShortAnswerChecked(false);
        setShortAnswerInput('');
      }
    });
  }, [forceReveal, index, onExplanationViewed]);

  useEffect(() => {
    if (submittedResult) {
      onExplanationViewed?.(index - 1);
    }
  }, [submittedResult, index, onExplanationViewed]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (hasOptions) {
        setSelectedAnswer(savedAnswer || null);
      } else {
        setShortAnswerInput(savedAnswer || '');
      }
    });
  }, [savedAnswer, hasOptions]);

  const handleOptionClick = (key: string) => {
    if (selectedAnswer && !examMode) return; // Prevent changing answer outside exam mode
    setSelectedAnswer(key);
    onAnswerChange?.(index - 1, key);
  };

  const handleShortAnswerCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortAnswerInput.trim()) return;
    setShortAnswerChecked(true);
    onAnswerChange?.(index - 1, shortAnswerInput.trim());
  };

  // Determine if explanation/answer should be shown
  const isRevealed = studyMode ? manualReveal : true;
  const showExplanation = examMode
    ? Boolean(submittedResult)
    : hasOptions
      ? (selectedAnswer !== null)
      : shortAnswerChecked;

  // In study mode with reveal off, hide answer feedback
  const showAnswerFeedback = examMode
    ? Boolean(submittedResult)
    : studyMode
      ? (manualReveal || selectedAnswer !== null)
      : true;

  return (
    <div style={cardStyles.card}>
      <div style={cardStyles.header}>
        <span style={cardStyles.badge}>Câu {index}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={cardStyles.typeBadge}>
            {isMultipleChoice ? 'Trắc nghiệm' : isTrueFalse ? 'Đúng/Sai' : 'Tự luận ngắn'}
          </span>
          {question.status && (
            <span style={cardStyles.typeBadge}>
              {statusLabels[question.status] || question.status}
            </span>
          )}
          {question.bloom_level && (() => {
            const bloomMap: Record<string, { label: string; color: string }> = {
              remember: { label: 'Nhận biết', color: '#22c55e' },
              understand: { label: 'Thông hiểu', color: '#3b82f6' },
              apply: { label: 'Vận dụng', color: '#f59e0b' },
              analyze: { label: 'Vận dụng cao', color: '#ef4444' },
            };
            const bloom = bloomMap[question.bloom_level];
            if (!bloom) return null;
            return (
              <span style={{
                fontSize: '12px',
                padding: '3px 10px',
                borderRadius: '12px',
                background: `${bloom.color}15`,
                color: bloom.color,
                fontWeight: 600,
                border: `1px solid ${bloom.color}30`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <GraduationCap size={12} aria-hidden="true" />
                <span>{bloom.label}</span>
              </span>
            );
          })()}
          {(question.tags || []).map((tag) => (
            <span key={tag} style={cardStyles.tagBadge}>{tag}</span>
          ))}
          {/* Study mode reveal toggle */}
          {studyMode && !examMode && (
            <button
              type="button"
              onClick={() => {
                setManualReveal((prev) => {
                  if (prev) {
                    // Hiding: reset interactive state
                    setSelectedAnswer(null);
                    setShortAnswerChecked(false);
                    setShortAnswerInput('');
                  } else {
                    onExplanationViewed?.(index - 1);
                  }
                  return !prev;
                });
              }}
              style={{
                fontSize: '12px',
                padding: '3px 10px',
                borderRadius: '12px',
                background: manualReveal ? 'rgba(16, 185, 129, 0.1)' : 'var(--ez-primary-subtle)',
                color: manualReveal ? '#10b981' : 'var(--ez-primary)',
                fontWeight: 600,
                border: `1px solid ${manualReveal ? 'rgba(16, 185, 129, 0.3)' : 'var(--ez-primary-border)'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {manualReveal ? (
                <>
                  <EyeOff size={12} aria-hidden="true" />
                  <span>Ẩn đáp án</span>
                </>
              ) : (
                <>
                  <Eye size={12} aria-hidden="true" />
                  <span>Hiện đáp án</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <h4 style={cardStyles.questionText}>{question.question}</h4>

      {hasOptions && question.options && (
        <div style={cardStyles.optionsList}>
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
            let borderColor = 'var(--ez-border)';
            let backgroundColor = 'var(--ez-bg)';
            let badgeBg = 'var(--ez-primary-subtle)';
            let badgeColor = 'var(--ez-primary)';
            let statusLabel = null;

            const shouldShowResult = showAnswerFeedback && hasSelectedAny;

            if (shouldShowResult) {
              if (isCorrect) {
                // Correct option always highlighted in green
                borderColor = '#22c55e';
                backgroundColor = 'rgba(34, 197, 94, 0.05)';
                badgeBg = '#22c55e';
                badgeColor = '#fff';
                statusLabel = (
                  <span style={cardStyles.correctLabel}>
                    <Check size={14} aria-hidden="true" style={{ verticalAlign: 'text-bottom' }} /> Đáp án đúng
                  </span>
                );
              } else if (isSelected) {
                // Wrong selected option highlighted in red
                borderColor = '#ef4444';
                backgroundColor = 'rgba(239, 68, 68, 0.05)';
                badgeBg = '#ef4444';
                badgeColor = '#fff';
                statusLabel = (
                  <span style={cardStyles.wrongLabel}>
                    <X size={14} aria-hidden="true" style={{ verticalAlign: 'text-bottom' }} /> Bạn chọn sai
                  </span>
                );
              }
            } else if (examMode && isSelected) {
              borderColor = 'var(--ez-primary)';
              backgroundColor = 'var(--ez-surface-muted)';
            } else {
              // Interactive hover styles when no option is selected yet
              const isHovered = key === hoveredKey;
              if (isHovered) {
                borderColor = 'var(--ez-primary)';
                backgroundColor = 'var(--ez-surface-muted)';
              }
            }

            return (
              <div
                key={key}
                onClick={() => handleOptionClick(key)}
                onMouseEnter={() => !hasSelectedAny && setHoveredKey(key)}
                onMouseLeave={() => !hasSelectedAny && setHoveredKey(null)}
                style={{
                  ...cardStyles.optionItem,
                  borderColor,
                  backgroundColor,
                  cursor: hasSelectedAny && !examMode ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <span
                  style={{
                    ...cardStyles.optionLetter,
                    backgroundColor: badgeBg,
                    color: badgeColor,
                  }}
                >
                  {key}
                </span>
                <span style={cardStyles.optionVal}>{val}</span>
                {statusLabel}
              </div>
            );
          })}
        </div>
      )}

      {isShortAnswer && (
        <div style={cardStyles.shortAnswerSection}>
          {!shortAnswerChecked ? (
            <form onSubmit={handleShortAnswerCheck} style={cardStyles.shortAnswerForm}>
              <input
                type="text"
                value={shortAnswerInput}
                onChange={(e) => setShortAnswerInput(e.target.value)}
                placeholder="Nhập câu trả lời của bạn vào đây..."
                style={cardStyles.shortAnswerInput}
                required
              />
              <button type="submit" style={cardStyles.checkButton}>
                Kiểm tra đáp án
              </button>
            </form>
          ) : (
            <div style={cardStyles.shortAnswerResult}>
              <div style={cardStyles.userAnswerBox}>
                <strong>Câu trả lời của bạn: </strong>
                <span
                  style={{
                    color: examMode && !submittedResult
                      ? 'var(--ez-text)'
                      : (submittedResult?.is_correct ?? shortAnswerInput.trim().toLowerCase() === question.correct_answer.trim().toLowerCase())
                        ? '#22c55e'
                        : '#ef4444',
                    fontWeight: 'bold',
                  }}
                >
                  {shortAnswerInput}
                </span>
                {(!examMode || submittedResult) && (
                  (submittedResult?.is_correct ?? shortAnswerInput.trim().toLowerCase() === question.correct_answer.trim().toLowerCase()) ? (
                    <span style={cardStyles.correctLabel}> (Chính xác!)</span>
                  ) : (
                    <span style={cardStyles.wrongLabel}> (Chưa chính xác)</span>
                  )
                )}
              </div>
              {examMode && !submittedResult && (
                <div style={cardStyles.shortAnswerExpectedBox}>
                  <strong>Đã ghi nhận câu trả lời. </strong>
                  Hệ thống sẽ chấm sau khi bạn nộp bài.
                </div>
              )}
              {isRevealed && !examMode && (
                <div style={cardStyles.shortAnswerExpectedBox}>
                  <strong>Đáp án đúng: </strong>
                  <span style={cardStyles.answerText}>{question.correct_answer}</span>
                </div>
              )}
              {examMode && submittedResult && (
                <div style={cardStyles.shortAnswerExpectedBox}>
                  <strong>Đáp án đúng: </strong>
                  <span style={cardStyles.answerText}>{submittedResult.correct_answer}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Study mode: show revealed answer without interaction */}
      {studyMode && manualReveal && !examMode && !selectedAnswer && hasOptions && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          backgroundColor: 'rgba(34, 197, 94, 0.06)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          fontSize: '14px',
          color: 'var(--ez-text)',
        }}>
          <strong style={{ color: '#22c55e' }}>
            <Check size={14} aria-hidden="true" style={{ verticalAlign: 'text-bottom' }} /> Đáp án đúng:
          </strong>{' '}
          {question.correct_answer}
          {question.options && question.options[question.correct_answer]
            ? ` — ${question.options[question.correct_answer]}`
            : ''}
        </div>
      )}

      {showExplanation && (examMode || isRevealed) && (
        <div style={cardStyles.explanationSection}>
          <div style={cardStyles.explanationHeader}>
            <Lightbulb size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
            Giải thích chi tiết từ học liệu:
          </div>
          <p style={cardStyles.explanationText}>{question.explanation}</p>
        </div>
      )}

      {/* Study mode: show explanation on manual reveal even without interaction */}
      {studyMode && manualReveal && !showExplanation && (
        <div style={cardStyles.explanationSection}>
          <div style={cardStyles.explanationHeader}>
            <Lightbulb size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
            Giải thích chi tiết từ học liệu:
          </div>
          <p style={cardStyles.explanationText}>{question.explanation}</p>
        </div>
      )}
    </div>
  );
};

const cardStyles = {
  card: {
    padding: '24px',
    borderRadius: '12px',
    border: '1px solid var(--ez-border)',
    boxShadow: 'var(--ez-shadow-lg)',
    backgroundColor: 'var(--ez-bg)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    textAlign: 'left' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  badge: {
    fontSize: '12px',
    fontWeight: 'bold',
    backgroundColor: 'var(--ez-primary-subtle)',
    color: 'var(--ez-primary)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  typeBadge: {
    fontSize: '12px',
    color: 'var(--ez-text-secondary)',
    backgroundColor: 'var(--ez-surface-muted)',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid var(--ez-border)',
  },
  tagBadge: {
    fontSize: '12px',
    color: '#0f766e',
    backgroundColor: 'rgba(20, 184, 166, 0.1)',
    padding: '3px 8px',
    borderRadius: '999px',
    border: '1px solid rgba(20, 184, 166, 0.25)',
    fontWeight: 600,
  },
  questionText: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--ez-text)',
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
    border: '1px solid var(--ez-border)',
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
    color: 'var(--ez-text)',
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
    border: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text)',
    outline: 'none',
  },
  checkButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--ez-primary)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  shortAnswerResult: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'var(--ez-surface-muted)',
    borderRadius: '8px',
    borderLeft: '4px solid var(--ez-primary)',
  },
  userAnswerBox: {
    fontSize: '14px',
    color: 'var(--ez-text)',
  },
  shortAnswerExpectedBox: {
    fontSize: '14px',
    color: 'var(--ez-text)',
    borderTop: '1px dashed var(--ez-border)',
    paddingTop: '8px',
    marginTop: '4px',
  },
  answerText: {
    color: 'var(--ez-primary)',
    fontWeight: 'bold',
  },
  explanationSection: {
    marginTop: '10px',
    paddingTop: '12px',
    borderTop: '1px solid var(--ez-border)',
  },
  explanationHeader: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--ez-text-secondary)',
    marginBottom: '6px',
  },
  explanationText: {
    fontSize: '14px',
    lineHeight: '1.5',
    color: 'var(--ez-text-secondary)',
    margin: 0,
    fontStyle: 'italic',
  },
};

export default QuestionCard;
