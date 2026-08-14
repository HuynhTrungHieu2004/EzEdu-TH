import React from 'react';
import type { FeedbackReasonCode } from '../../../types/feedback';

interface FeedbackReasonSelectorProps {
  selectedReasons: FeedbackReasonCode[];
  onChange: (reasons: FeedbackReasonCode[]) => void;
}

const REASON_LABELS: Record<FeedbackReasonCode, string> = {
  incorrect_information: 'Thông tin chưa chính xác',
  off_topic: 'Trả lời lan man, lạc đề',
  incomplete: 'Câu trả lời chưa đầy đủ, thiếu ý',
  hard_to_understand: 'Văn phong lủng củng, khó hiểu',
  unsupported_citation: 'Trích dẫn nguồn không khớp với câu trả lời',
  unreliable_web_source: 'Nguồn tìm kiếm web không đáng tin cậy',
  wrong_document_source: 'Trích dẫn sai nội dung trong học liệu nội bộ',
  hallucinated_information: 'AI bịa đặt hoặc tự nghĩ ra thông tin',
  outdated_information: 'Thông tin cũ hoặc đã lỗi thời',
  other: 'Lý do khác',
};

export const FeedbackReasonSelector: React.FC<FeedbackReasonSelectorProps> = ({
  selectedReasons,
  onChange,
}) => {
  const handleToggle = (code: FeedbackReasonCode) => {
    if (selectedReasons.includes(code)) {
      onChange(selectedReasons.filter((r) => r !== code));
    } else {
      if (selectedReasons.length < 5) {
        onChange([...selectedReasons, code]);
      }
    }
  };

  return (
    <div style={styles.container}>
      <span style={styles.label}>Lý do lỗi (Chọn tối đa 5):</span>
      <div style={styles.grid}>
        {(Object.keys(REASON_LABELS) as FeedbackReasonCode[]).map((code) => {
          const isChecked = selectedReasons.includes(code);
          const isDisabled = !isChecked && selectedReasons.length >= 5;

          return (
            <label
              key={code}
              style={{
                ...styles.checkboxLabel,
                ...(isChecked ? styles.checkboxLabelChecked : {}),
                ...(isDisabled ? styles.checkboxLabelDisabled : {}),
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => handleToggle(code)}
                style={styles.checkboxInput}
              />
              <span style={styles.labelText}>{REASON_LABELS[code]}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    marginBottom: '16px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--ez-text)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-surface)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontSize: '12px',
    color: 'var(--ez-text-secondary)',
    userSelect: 'none' as const,
  },
  checkboxLabelChecked: {
    borderColor: 'var(--ez-error)',
    backgroundColor: 'var(--ez-error-subtle)',
    color: 'var(--ez-error)',
  },
  checkboxLabelDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  checkboxInput: {
    margin: 0,
    cursor: 'pointer',
  },
  labelText: {
    lineHeight: 1.2,
  },
};
