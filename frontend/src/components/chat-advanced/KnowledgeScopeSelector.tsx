import React from 'react';
import { SCOPE_LABELS } from '../../constants/advancedChat';

interface KnowledgeScopeSelectorProps {
  scope: 'general' | 'document' | 'multiple_documents' | 'all_documents' | 'web_only';
  useWebSearch: boolean;
  onScopeChange: (scope: 'general' | 'document' | 'multiple_documents' | 'all_documents' | 'web_only') => void;
  onWebSearchToggle: (val: boolean) => void;
  disabled?: boolean;
}

export const KnowledgeScopeSelector: React.FC<KnowledgeScopeSelectorProps> = ({
  scope,
  useWebSearch,
  onScopeChange,
  onWebSearchToggle,
  disabled = false,
}) => {
  const scopes: Array<'general' | 'document' | 'multiple_documents' | 'all_documents' | 'web_only'> = [
    'general',
    'document',
    'multiple_documents',
    'all_documents',
    'web_only',
  ];

  return (
    <div style={styles.container}>
      <div style={styles.label}>Phạm vi kiến thức:</div>
      <div style={styles.btnGrid}>
        {scopes.map((s) => {
          const isActive = s === scope;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onScopeChange(s)}
              style={{
                ...styles.btn,
                ...(isActive ? styles.btnActive : {}),
              }}
            >
              {SCOPE_LABELS[s]}
            </button>
          );
        })}
      </div>

      <div style={styles.toggleRow}>
        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={scope === 'web_only' ? true : useWebSearch}
            disabled={disabled || scope === 'web_only'}
            onChange={(e) => onWebSearchToggle(e.target.checked)}
            style={styles.checkbox}
          />
          <span style={styles.toggleText}>Cho phép AI tìm kiếm Internet khi cần</span>
        </label>
        <span style={styles.helpText}>
          {scope === 'web_only' 
            ? 'Ở chế độ chỉ tìm kiếm Internet, tùy chọn này luôn được bật.' 
            : 'Khi bật, AI có thể tìm thêm nguồn Internet để kiểm chứng hoặc bổ sung thông tin.'}
        </span>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '16px 20px',
    backgroundColor: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
  },
  label: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-h)',
  },
  btnGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  btn: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  btnActive: {
    backgroundColor: 'var(--accent)',
    color: '#fff',
    borderColor: 'var(--accent)',
    boxShadow: 'var(--shadow-soft)',
  },
  toggleRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    marginTop: '6px',
  },
  toggleLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: 'var(--accent)',
    cursor: 'pointer',
  },
  toggleText: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-h)',
  },
  helpText: {
    fontSize: '11px',
    color: 'var(--muted)',
    paddingLeft: '24px',
  },
};
