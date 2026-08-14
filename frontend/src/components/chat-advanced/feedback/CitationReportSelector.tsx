import React from 'react';

interface CitationInfo {
  source_id: string;
  title: string;
  type: 'internal' | 'web';
}

interface CitationReportSelectorProps {
  internalCitations?: Array<{ source_id?: string | null; document_title: string }> | null;
  webCitations?: Array<{ source_id?: string | null; title: string }> | null;
  selectedCitations: string[];
  onChange: (citations: string[]) => void;
}

export const CitationReportSelector: React.FC<CitationReportSelectorProps> = ({
  internalCitations,
  webCitations,
  selectedCitations,
  onChange,
}) => {
  // Aggregate available citation source IDs
  const items: CitationInfo[] = [];

  if (internalCitations) {
    internalCitations.forEach((c) => {
      if (c.source_id) {
        items.push({
          source_id: c.source_id,
          title: `Tài liệu: ${c.document_title}`,
          type: 'internal',
        });
      }
    });
  }

  if (webCitations) {
    webCitations.forEach((w) => {
      if (w.source_id) {
        items.push({
          source_id: w.source_id,
          title: `Web: ${w.title}`,
          type: 'web',
        });
      }
    });
  }

  if (items.length === 0) {
    return null;
  }

  const handleToggle = (sourceId: string) => {
    if (selectedCitations.includes(sourceId)) {
      onChange(selectedCitations.filter((id) => id !== sourceId));
    } else {
      if (selectedCitations.length < 5) {
        onChange([...selectedCitations, sourceId]);
      }
    }
  };

  return (
    <div style={styles.container}>
      <span style={styles.label}>Nguồn trích dẫn bị báo lỗi (Chọn tối đa 5):</span>
      <div style={styles.grid}>
        {items.map((item) => {
          const isChecked = selectedCitations.includes(item.source_id);
          const isDisabled = !isChecked && selectedCitations.length >= 5;

          return (
            <label
              key={item.source_id}
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
                onChange={() => handleToggle(item.source_id)}
                style={styles.checkboxInput}
              />
              <div style={styles.content}>
                <span
                  style={{
                    ...styles.badge,
                    backgroundColor: item.type === 'internal' ? 'var(--ez-primary-subtle)' : 'var(--ez-secondary-subtle)',
                    color: item.type === 'internal' ? 'var(--ez-primary)' : 'var(--ez-secondary)',
                  }}
                >
                  {item.source_id}
                </span>
                <span style={styles.titleText} title={item.title}>
                  {item.title}
                </span>
              </div>
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
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
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
  },
  checkboxLabelDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  checkboxInput: {
    margin: 0,
    cursor: 'pointer',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
    flex: 1,
  },
  badge: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    whiteSpace: 'nowrap' as const,
  },
  titleText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
};
