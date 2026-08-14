import React, { useState } from 'react';
import type { DocumentResponse } from '../../api/documentApi';

interface DocumentSelectorProps {
  documents: DocumentResponse[];
  selectedIds: string[];
  scope: 'general' | 'document' | 'multiple_documents' | 'all_documents' | 'web_only';
  loading: boolean;
  error: string | null;
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export const DocumentSelector: React.FC<DocumentSelectorProps> = ({
  documents,
  selectedIds,
  scope,
  loading,
  error,
  onChange,
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (scope !== 'document' && scope !== 'multiple_documents') {
    return null;
  }

  const indexedDocs = documents.filter((doc) => doc.status === 'indexed');
  const filteredDocs = indexedDocs.filter((doc) =>
    doc.original_filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = (id: string) => {
    if (disabled) return;

    if (scope === 'document') {
      onChange([id]);
    } else {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        if (selectedIds.length >= 10) {
          alert('Bạn chỉ được chọn tối đa 10 tài liệu.');
          return;
        }
        onChange([...selectedIds, id]);
      }
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>
          Chọn tài liệu ({scope === 'document' ? 'Chọn 1 tài liệu' : `Đã chọn: ${selectedIds.length}/10`})
        </span>
        {scope === 'multiple_documents' && selectedIds.length >= 10 && (
          <span style={styles.warning}>Đã đạt giới hạn tối đa 10 tài liệu</span>
        )}
      </div>

      <input
        type="text"
        placeholder="Tìm kiếm tài liệu học tập theo tên..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        disabled={disabled || loading}
        style={styles.search}
      />

      <div style={styles.list}>
        {loading ? (
          <p style={styles.statusText}>Đang tải kho học liệu...</p>
        ) : error ? (
          <p style={styles.statusError}>{error}</p>
        ) : indexedDocs.length === 0 ? (
          <p style={styles.statusText}>Bạn không có tài liệu nào đã index. Vui lòng tải tài liệu lên và Lập Chỉ Mục Vector trước.</p>
        ) : filteredDocs.length === 0 ? (
          <p style={styles.statusText}>Không tìm thấy tài liệu phù hợp.</p>
        ) : (
          filteredDocs.map((doc) => {
            const isChecked = selectedIds.includes(doc.id);
            return (
              <label key={doc.id} style={styles.itemLabel}>
                <input
                  type={scope === 'document' ? 'radio' : 'checkbox'}
                  checked={isChecked}
                  disabled={disabled}
                  onChange={() => handleToggle(doc.id)}
                  style={styles.inputCheck}
                />
                <span style={styles.itemText} title={doc.original_filename}>
                  {doc.original_filename}
                </span>
                <span style={styles.itemBadge}>indexed</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    padding: '16px 20px',
    backgroundColor: 'var(--ez-surface-muted)',
    borderBottom: '1px solid var(--ez-border)',
    maxHeight: '220px',
    overflowY: 'auto' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--ez-text)',
  },
  warning: {
    fontSize: '11px',
    color: 'var(--ez-error)',
    fontWeight: '600',
  },
  search: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text)',
    fontSize: '13px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  itemLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--ez-text-secondary)',
    backgroundColor: 'var(--ez-bg)',
    border: '1px solid var(--ez-border)',
    overflow: 'hidden',
  },
  inputCheck: {
    cursor: 'pointer',
    accentColor: 'var(--ez-primary)',
  },
  itemText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--ez-success)',
    backgroundColor: 'var(--ez-success-subtle)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  statusText: {
    fontSize: '12px',
    color: 'var(--ez-text-muted)',
    textAlign: 'center' as const,
    margin: '10px 0',
  },
  statusError: {
    fontSize: '12px',
    color: 'var(--ez-error)',
    textAlign: 'center' as const,
    margin: '10px 0',
  },
};
