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
    backgroundColor: 'var(--ez-surface)',
    borderBottom: '1px solid var(--ez-border)',
  },
  label: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--ez-text)',
  },
  btnGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  btn: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text-secondary)',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  btnActive: {
    backgroundColor: 'var(--ez-primary)',
    color: '#fff',
    borderColor: 'var(--ez-primary)',
    boxShadow: 'var(--ez-shadow-md)',
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
    accentColor: 'var(--ez-primary)',
    cursor: 'pointer',
  },
  toggleText: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--ez-text)',
  },
  helpText: {
    fontSize: '11px',
    color: 'var(--ez-text-muted)',
    paddingLeft: '24px',
  },
};
