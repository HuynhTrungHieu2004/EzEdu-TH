import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { documentApi } from '../api/documentApi';
import { getApiErrorDetail } from '../api/errors';
import { Alert, Button, Card, CardBody } from './ui';
import './file-upload.css';

interface FileUploadProps {
  onUploadSuccess: () => Promise<void> | void;
}

const FileUpload = ({ onUploadSuccess }: FileUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reused, setReused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(false);
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      const docExts = ['pdf', 'docx', 'pptx'];
      const videoExts = ['mp4', 'mov', 'webm', 'mkv'];
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';

      if (!docExts.includes(ext) && !videoExts.includes(ext)) {
        setError('Hệ thống chỉ hỗ trợ các định dạng .pdf, .docx, .pptx, .mp4, .mov, .webm, .mkv.');
        setFile(null);
        return;
      }

      if (docExts.includes(ext) && selectedFile.size > 20 * 1024 * 1024) {
        setError('Dung lượng tệp tài liệu vượt quá giới hạn cho phép (20MB).');
        setFile(null);
        return;
      }

      if (videoExts.includes(ext) && selectedFile.size > 100 * 1024 * 1024) {
        setError('Dung lượng tệp video vượt quá giới hạn cho phép (100MB).');
        setFile(null);
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);
    setReused(false);

    try {
      const result = await documentApi.upload(file);
      setSuccess(true);
      setReused(Boolean(result.reused));
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      await onUploadSuccess();
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setError(
        detail ?? 'Tải tài liệu lên thất bại. Vui lòng kiểm tra kết nối mạng và thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="ez-upload" style={{ marginBottom: 'var(--ez-space-6)' }}>
      <CardBody>
        <form onSubmit={handleUpload} className="ez-upload-form">
          <div className="ez-upload-dropzone">
            <input
              ref={inputRef}
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.docx,.pptx,.mp4,.mov,.webm,.mkv"
              disabled={loading}
              id="file-upload-input"
              className="ez-upload-input"
            />
            <label htmlFor="file-upload-input" className="ez-upload-label">
              <span className="ez-upload-icon" aria-hidden="true">
                <UploadCloud size={22} />
              </span>
              <span className="ez-upload-title">
                {file ? file.name : 'Chọn học liệu hoặc kéo thả tệp vào đây'}
              </span>
              <span className="ez-upload-subtitle">
                PDF, DOCX, PPTX tối đa 20MB; MP4, MOV, WEBM, MKV tối đa 100MB.
              </span>
            </label>
          </div>

          {error && <Alert tone="error">{error}</Alert>}
          {success && (
            <Alert tone="success">
              {reused
                ? 'File này đã có trong học liệu của bạn — đã dùng lại bản cũ, không tải trùng.'
                : 'Tải tài liệu lên thành công.'}
            </Alert>
          )}

          <Button type="submit" size="lg" block disabled={!file} loading={loading}>
            Tải lên hệ thống
          </Button>
        </form>
      </CardBody>
    </Card>
  );
};

export default FileUpload;
