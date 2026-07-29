import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { adminReportsApi } from '../api/adminNotificationsReportsApi';
import type { ReportExportParams, ReportFormat, ReportType, ReportTypeItem } from '../types/adminNotificationsReports';
import { dateEnd, dateStart, fmtDateTime } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Select,
  SkeletonText,
} from '../components/ui';

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
  const [typesGeneratedAt, setTypesGeneratedAt] = useState('');
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
        setTypesGeneratedAt(data.generated_at);
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
  const effectiveFormat = useMemo(() => {
    if (current && current.formats.length > 0 && !current.formats.includes(format)) {
      return current.formats[0];
    }
    return format;
  }, [current, format]);

  const params = useMemo<ReportExportParams>(() => ({
    report_type: reportType,
    format: effectiveFormat,
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
  }), [action, category, effectiveFormat, feature, from, limit, model, provider, reportType, role, search, severity, status, targetType, to, userId]);

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
    <div className="ez-admin-page">
      <PageHeader
        title="Báo cáo"
        description="Xuất dữ liệu quản trị đã lọc, có giới hạn số dòng và tự loại bỏ mật khẩu băm, token cùng thông tin bí mật."
      />

      {error && <Alert tone="error" role="alert">{error}</Alert>}
      {loading && <SkeletonText lines={5} />}

      {!loading && (
        <>
          <Card>
            <CardBody>
              <CardTitle as="h2">Chọn báo cáo</CardTitle>
              <FilterBar columns={5}>
                <FormField label="Loại báo cáo">
                  <Select value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
                    {types.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Định dạng">
                  <Select value={effectiveFormat} onChange={(event) => setFormat(event.target.value as ReportFormat)}>
                    {(current?.formats ?? ['csv', 'xlsx', 'pdf']).map((f) => (
                      <option key={f} value={f}>{f.toUpperCase()}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Giới hạn dòng">
                  <Input
                    type="number"
                    min={1}
                    max={maxLimit}
                    value={limit}
                    onChange={(event) => setLimit(Math.min(maxLimit, Math.max(1, Number.parseInt(event.target.value || '1', 10))))}
                  />
                </FormField>
                <FormField label="Từ ngày">
                  <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                </FormField>
                <FormField label="Đến ngày">
                  <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </FormField>
              </FilterBar>
              {current && (
                <p className="ez-muted" style={{ marginTop: 12 }}>
                  {current.description}
                  {typesGeneratedAt && <> · Cập nhật danh sách báo cáo {fmtDateTime(typesGeneratedAt)}</>}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle as="h2">Bộ lọc</CardTitle>
              <FilterBar columns={4}>
                <FormField label="Tìm kiếm"><Input value={search} onChange={(event) => setSearch(event.target.value)} /></FormField>
                <FormField label="User ID"><Input value={userId} onChange={(event) => setUserId(event.target.value)} /></FormField>
                <FormField label="Role"><Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="student, admin..." /></FormField>
                <FormField label="Status"><Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="active, success..." /></FormField>
                <FormField label="Provider"><Input value={provider} onChange={(event) => setProvider(event.target.value)} /></FormField>
                <FormField label="Model"><Input value={model} onChange={(event) => setModel(event.target.value)} /></FormField>
                <FormField label="Feature"><Input value={feature} onChange={(event) => setFeature(event.target.value)} /></FormField>
                <FormField label="Severity"><Input value={severity} onChange={(event) => setSeverity(event.target.value)} /></FormField>
                <FormField label="Category"><Input value={category} onChange={(event) => setCategory(event.target.value)} /></FormField>
                <FormField label="Action"><Input value={action} onChange={(event) => setAction(event.target.value)} /></FormField>
                <FormField label="Target type"><Input value={targetType} onChange={(event) => setTargetType(event.target.value)} /></FormField>
              </FilterBar>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle as="h2">Tạo file</CardTitle>
              <div className="ez-row ez-row-wrap" style={{ marginTop: 12 }}>
                <Button
                  variant="primary"
                  disabled={busy || !reportType}
                  loading={busy}
                  leadingIcon={<Download size={15} aria-hidden="true" />}
                  onClick={exportFile}
                >
                  {busy ? 'Đang tạo file...' : 'Tải báo cáo'}
                </Button>
                {lastFile && <span className="ez-muted">Đã tạo: {lastFile}</span>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle as="h2">Loại báo cáo hiện có</CardTitle>
              <dl className="ez-kv-grid" style={{ marginTop: 12 }}>
                {types.map((item) => (
                  <div key={item.key} title={item.key}>
                    <dt>{item.label}</dt>
                    <dd>{item.description}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
