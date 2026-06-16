import React, { useRef, useState } from 'react';
import { documentApi } from '../api/documentApi';

interface FileUploadProps {
  onUploadSuccess: () => Promise<void> | void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(false);
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      // Validate format
      const docExts = ['pdf', 'docx', 'pptx'];
      const videoExts = ['mp4', 'mov', 'webm', 'mkv'];
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
      
      if (!docExts.includes(ext) && !videoExts.includes(ext)) {
        setError('Hệ thống chỉ hỗ trợ các định dạng .pdf, .docx, .pptx, .mp4, .mov, .webm, .mkv.');
        setFile(null);
        return;
      }

      // Validate size based on media kind
      if (docExts.includes(ext)) {
        if (selectedFile.size > 20 * 1024 * 1024) {
          setError('Dung lượng tệp tài liệu vượt quá giới hạn cho phép (20MB).');
          setFile(null);
          return;
        }
      } else if (videoExts.includes(ext)) {
        if (selectedFile.size > 100 * 1024 * 1024) {
          setError('Dung lượng tệp video vượt quá giới hạn cho phép (100MB).');
          setFile(null);
          return;
        }
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await documentApi.upload(file);
      setSuccess(true);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      await onUploadSuccess();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Tải tài liệu lên thất bại. Vui lòng kiểm tra kết nối mạng và thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleUpload} style={styles.form}>
        <div style={styles.dropZone}>
          <input
            ref={inputRef}
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.docx,.pptx,.mp4,.mov,.webm,.mkv"
            disabled={loading}
            id="file-upload-input"
            style={styles.fileInput}
          />
          <label htmlFor="file-upload-input" style={styles.uploadLabel}>
            <div style={styles.icon}>📁</div>
            <div style={styles.labelTitle}>
              {file ? file.name : 'Nhấp để chọn học liệu hoặc kéo thả tệp vào đây'}
            </div>
            <div style={styles.labelSubtitle}>
              Hỗ trợ PDF, DOCX, PPTX (Tối đa 20MB) & MP4, MOV, WEBM, MKV (Tối đa 100MB)
            </div>
          </label>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}
        {success && <div style={styles.successAlert}>Tải tài liệu lên thành công.</div>}

        <button
          type="submit"
          disabled={!file || loading}
          style={{
            ...styles.button,
            opacity: !file || loading ? 0.6 : 1,
            cursor: !file || loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Đang tải tài liệu lên...' : 'Tải lên Hệ thống'}
        </button>
      </form>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    border: '1px dashed var(--border)',
    borderRadius: '12px',
    backgroundColor: 'var(--code-bg)',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  dropZone: {
    position: 'relative' as const,
    border: '2px dashed var(--border)',
    borderRadius: '8px',
    padding: '30px 20px',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg)',
    transition: 'border-color 0.2s ease',
    cursor: 'pointer',
  },
  fileInput: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
  },
  uploadLabel: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  icon: {
    fontSize: '36px',
  },
  labelTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-h)',
  },
  labelSubtitle: {
    fontSize: '13px',
    color: 'var(--text)',
  },
  errorAlert: {
    padding: '10px 14px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    borderRadius: '6px',
    fontSize: '14px',
  },
  successAlert: {
    padding: '10px 14px',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
    borderRadius: '6px',
    fontSize: '14px',
  },
  button: {
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
  },
};

export default FileUpload;
