import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { adminReportsApi } from '../api/adminNotificationsReportsApi';
import type { ReportExportParams, ReportFormat, ReportType, ReportTypeItem } from '../types/adminNotificationsReports';
import { EmptyState, dateEnd, dateStart, fmtDateTime } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import './AdminContentPages.css';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AdminReportsPage() {
  const [types, setTypes] = useState<ReportTypeItem[]>([]);
  const [reportType, setReportType] = useState<ReportType>('users');
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [limit, setLimit] = useState(1000);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [feature, setFeature] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [maxLimit, setMaxLimit] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastFile, setLastFile] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    adminReportsApi.types(controller.signal)
      .then((data) => {
        setTypes(data.items);
        setMaxLimit(data.max_limit);
        if (data.items[0]) setReportType(data.items[0].key);
      })
      .catch((err) => {
        if (!isCanceledError(err)) setError(apiErrorMessage(err, 'Không tải được danh sách báo cáo.'));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const current = useMemo(() => types.find((item) => item.key === reportType), [reportType, types]);

  const params = useMemo<ReportExportParams>(() => ({
    report_type: reportType,
    format,
    date_from: dateStart(from),
    date_to: dateEnd(to),
    limit,
    search: search || undefined,
    role: role || undefined,
    status: status || undefined,
    user_id: userId || undefined,
    provider: provider || undefined,
    model: model || undefined,
    feature: feature || undefined,
    severity: severity || undefined,
    category: category || undefined,
    action: action || undefined,
    target_type: targetType || undefined,
  }), [action, category, feature, format, from, limit, model, provider, reportType, role, search, severity, status, targetType, to, userId]);

  const exportFile = async () => {
    setBusy(true);
    setError('');
    setLastFile('');
    try {
      const result = await adminReportsApi.export(params);
      downloadBlob(result.blob, result.filename);
      setLastFile(result.filename);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không xuất được báo cáo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>Reports</h1>
          <p>Xuất dữ liệu quản trị đã lọc, có giới hạn số dòng và loại bỏ password hash, token, secret.</p>
        </div>
      </header>

      {error && <EmptyState title="Có lỗi" text={error} />}
      {loading && <EmptyState title="Đang tải" text="Đang đọc cấu hình báo cáo từ backend." />}

      {!loading && (
        <>
          <section className="admin-content-panel">
            <h2>Chọn báo cáo</h2>
            <div className="admin-content-toolbar">
              <label className="admin-content-field">
                <span>Loại báo cáo</span>
                <select value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
                  {types.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </label>
              <label className="admin-content-field">
                <span>Định dạng</span>
                <select value={format} onChange={(event) => setFormat(event.target.value as ReportFormat)}>
                  <option value="csv">CSV</option>
                  <option value="xlsx">XLSX</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>
              <label className="admin-content-field">
                <span>Giới hạn dòng</span>
                <input type="number" min={1} max={maxLimit} value={limit} onChange={(event) => setLimit(Math.min(maxLimit, Math.max(1, Number.parseInt(event.target.value || '1', 10))))} />
              </label>
              <label className="admin-content-field">
                <span>Từ ngày</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="admin-content-field">
                <span>Đến ngày</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
            {current && (
              <p className="admin-content-muted" style={{ marginTop: 12 }}>
                {current.description} · Cập nhật manifest {fmtDateTime(new Date().toISOString())}
              </p>
            )}
          </section>

          <section className="admin-content-panel">
            <h2>Bộ lọc</h2>
            <div className="admin-content-toolbar">
              <label className="admin-content-field"><span>Tìm kiếm</span><input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <label className="admin-content-field"><span>User ID</span><input value={userId} onChange={(event) => setUserId(event.target.value)} /></label>
              <label className="admin-content-field"><span>Role</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="student, admin..." /></label>
              <label className="admin-content-field"><span>Status</span><input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="active, success..." /></label>
              <label className="admin-content-field"><span>Provider</span><input value={provider} onChange={(event) => setProvider(event.target.value)} /></label>
              <label className="admin-content-field"><span>Model</span><input value={model} onChange={(event) => setModel(event.target.value)} /></label>
              <label className="admin-content-field"><span>Feature</span><input value={feature} onChange={(event) => setFeature(event.target.value)} /></label>
              <label className="admin-content-field"><span>Severity</span><input value={severity} onChange={(event) => setSeverity(event.target.value)} /></label>
              <label className="admin-content-field"><span>Category</span><input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
              <label className="admin-content-field"><span>Action</span><input value={action} onChange={(event) => setAction(event.target.value)} /></label>
              <label className="admin-content-field"><span>Target type</span><input value={targetType} onChange={(event) => setTargetType(event.target.value)} /></label>
            </div>
          </section>

          <section className="admin-content-panel">
            <h2>Tạo file</h2>
            <div className="admin-content-actions">
              <button type="button" className="admin-content-btn admin-content-btn--primary" disabled={busy || !reportType} onClick={exportFile}>
                <Download size={15} aria-hidden="true" /> {busy ? 'Đang tạo file...' : 'Tải báo cáo'}
              </button>
              {lastFile && <span className="admin-content-muted">Đã tạo: {lastFile}</span>}
            </div>
          </section>

          <section className="admin-content-panel">
            <h2>Loại báo cáo hiện có</h2>
            <div className="admin-content-detail-grid">
              {types.map((item) => (
                <article className="admin-content-kv" key={item.key}>
                  <span>{item.key}</span>
                  <strong>{item.label}</strong>
                  <small className="admin-content-muted">{item.description}</small>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
