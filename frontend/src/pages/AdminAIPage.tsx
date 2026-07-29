import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAiApi } from '../api/adminAiApi';
import type { AIQuotaHistoryResponse, AIQuotaView, AIUsageDashboardResponse, AIUsageFilters, AIUsageStatus } from '../types/adminAi';
import { Badge, EmptyState, Pagination, dateEnd, dateStart, fmtDateTime, fmtNumber, renderObjectRows } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Select,
  StatGrid,
  StatTile,
  Textarea,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';

function money(value: number | null | undefined, currency = 'USD') {
  return `${(value ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 6 })} ${currency}`;
}

function ms(value: number | null | undefined) {
  return value == null ? 'Không có dữ liệu' : `${fmtNumber(Math.round(value))} ms`;
}

type UsageItem = AIUsageDashboardResponse['items'][number];

export default function AdminAIPage() {
  const [data, setData] = useState<AIUsageDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [feature, setFeature] = useState('');
  const [status, setStatus] = useState('');
  const [quotaUserId, setQuotaUserId] = useState('');
  const [quota, setQuota] = useState<AIQuotaView | null>(null);
  const [quotaJson, setQuotaJson] = useState('{}');
  const [quotaReason, setQuotaReason] = useState('');
  const [quotaHistory, setQuotaHistory] = useState<AIQuotaHistoryResponse | null>(null);
  const [quotaError, setQuotaError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, Record<string, number>>>({});
  const [roleDefaultsError, setRoleDefaultsError] = useState('');
  const [editingRole, setEditingRole] = useState('');
  const [roleQuotaJson, setRoleQuotaJson] = useState('{}');
  const [roleQuotaReason, setRoleQuotaReason] = useState('');
  const [pendingAction, setPendingAction] = useState<'role-default' | 'quota-save' | 'quota-reset' | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState('');

  const params = useMemo<AIUsageFilters>(() => ({
    page,
    page_size: 30,
    from_date: dateStart(from),
    to_date: dateEnd(to),
    user_id: userId || undefined,
    provider: provider || undefined,
    model: model || undefined,
    feature: feature || undefined,
    status: status ? status as AIUsageStatus : undefined,
  }), [feature, from, model, page, provider, status, to, userId]);

  const loadUsage = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    adminAiApi.usage(params, signal)
      .then(setData)
      .catch((err) => {
        if (!isCanceledError(err)) setError(apiErrorMessage(err, 'Không tải được AI usage.'));
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => loadUsage(controller.signal));
    return () => controller.abort();
  }, [loadUsage]);

  const loadRoleDefaults = useCallback((signal?: AbortSignal) => {
    adminAiApi.quotaDefaults(signal)
      .then((result) => setRoleDefaults(result.items))
      .catch((err) => {
        if (!isCanceledError(err)) setRoleDefaultsError(apiErrorMessage(err, 'Không tải được quota mặc định theo role.'));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => loadRoleDefaults(controller.signal));
    return () => controller.abort();
  }, [loadRoleDefaults]);

  const startEditRoleDefault = (role: string) => {
    setEditingRole(role);
    setRoleQuotaJson(JSON.stringify(roleDefaults[role] || {}, null, 2));
    setRoleQuotaReason('');
    setRoleDefaultsError('');
  };

  const saveRoleDefault = async () => {
    if (!editingRole || !roleQuotaReason.trim()) return;
    setBusy(true);
    setRoleDefaultsError('');
    try {
      const parsed = JSON.parse(roleQuotaJson) as Record<string, number>;
      const result = await adminAiApi.updateQuotaDefaults(editingRole, parsed, roleQuotaReason);
      setRoleDefaults((prev) => ({ ...prev, [result.role]: result.quota }));
      setEditingRole('');
      setRoleQuotaReason('');
      setPendingAction(null);
    } catch (err: unknown) {
      setRoleDefaultsError(apiErrorMessage(err, 'Không lưu được quota mặc định.'));
    } finally {
      setBusy(false);
    }
  };

  const loadQuota = async () => {
    if (!quotaUserId.trim()) return;
    setQuotaError('');
    setBusy(true);
    try {
      const result = await adminAiApi.quota(quotaUserId.trim());
      setQuota(result);
      setQuotaJson(JSON.stringify(result.override_quota || {}, null, 2));
      setQuotaHistory(await adminAiApi.quotaHistory(quotaUserId.trim()));
    } catch (err: unknown) {
      setQuotaError(apiErrorMessage(err, 'Không tải được quota user.'));
    } finally {
      setBusy(false);
    }
  };

  const saveQuota = async () => {
    if (!quota || !quotaReason.trim()) return;
    setQuotaError('');
    setBusy(true);
    try {
      const parsed = JSON.parse(quotaJson) as Record<string, unknown>;
      const result = await adminAiApi.updateQuota(quota.user_id, parsed, quotaReason);
      setQuota(result.quota);
      setQuotaJson(JSON.stringify(result.quota.override_quota || {}, null, 2));
      setQuotaReason('');
      setQuotaHistory(await adminAiApi.quotaHistory(quota.user_id));
      setPendingAction(null);
    } catch (err: unknown) {
      setQuotaError(apiErrorMessage(err, 'Không lưu được quota.'));
    } finally {
      setBusy(false);
    }
  };

  const resetQuota = async () => {
    if (!quota || !quotaReason.trim()) return;
    setQuotaError('');
    setBusy(true);
    try {
      const result = await adminAiApi.resetQuota(quota.user_id, quotaReason);
      setQuota(result.quota);
      setQuotaJson(JSON.stringify(result.quota.override_quota || {}, null, 2));
      setQuotaReason('');
      setQuotaHistory(await adminAiApi.quotaHistory(quota.user_id));
      setPendingAction(null);
      setResetConfirmation('');
    } catch (err: unknown) {
      setQuotaError(apiErrorMessage(err, 'Không reset được quota.'));
    } finally {
      setBusy(false);
    }
  };

  const usageColumns: DataTableColumn<UsageItem>[] = [
    { key: 'created_at', label: 'Thời gian', render: (item) => fmtDateTime(item.created_at) },
    { key: 'user', label: 'User', render: (item) => item.user_email || item.user_id },
    { key: 'feature', label: 'Feature', render: (item) => item.feature },
    {
      key: 'provider_model',
      label: 'Provider/model',
      render: (item) => (
        <>
          {item.provider}
          <br />
          <span className="ez-muted">{item.model}</span>
        </>
      ),
    },
    {
      key: 'tokens',
      label: 'Token',
      render: (item) => (
        <>
          {fmtNumber(item.total_tokens)}
          <br />
          <span className="ez-muted">In {fmtNumber(item.input_tokens)} · Out {fmtNumber(item.output_tokens)}</span>
        </>
      ),
    },
    { key: 'cost', label: 'Cost', render: (item) => money(item.estimated_cost, item.currency) },
    { key: 'latency', label: 'Latency', render: (item) => ms(item.latency_ms) },
    {
      key: 'status',
      label: 'Status',
      render: (item) => (
        <Badge tone={item.status === 'success' ? 'ok' : 'danger'}>
          {item.status}{item.error_code ? ` · ${item.error_code}` : ''}
        </Badge>
      ),
    },
    { key: 'request_id', label: 'Request', render: (item) => item.request_id || 'Không có dữ liệu' },
  ];

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Quản lý AI"
        description="Theo dõi lượt gọi, token, quota, lỗi, độ trễ và chi phí ước tính. Không hiển thị khóa API."
      />

      <Card>
        <CardBody>
          <FilterBar columns={4}>
            <FormField label="Từ ngày">
              <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="Đến ngày">
              <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="User ID">
              <Input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="Provider">
              <Input value={provider} onChange={(event) => { setProvider(event.target.value); setPage(1); }} placeholder="google, groq, mixed" />
            </FormField>
            <FormField label="Model">
              <Input value={model} onChange={(event) => { setModel(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="Feature">
              <Input value={feature} onChange={(event) => { setFeature(event.target.value); setPage(1); }} placeholder="advanced_chat..." />
            </FormField>
            <FormField label="Status">
              <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">Tất cả</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
              </Select>
            </FormField>
          </FilterBar>
        </CardBody>
      </Card>

      {error && <EmptyState title="Có lỗi" text={error} />}
      {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu AI usage từ backend." />}

      {!loading && data && (
        <>
          <StatGrid aria-label="Thống kê AI usage">
            <StatTile label="Tổng request" value={fmtNumber(data.summary.total_requests)} />
            <StatTile label="Thành công" value={fmtNumber(data.summary.success_requests)} />
            <StatTile label="Thất bại" value={fmtNumber(data.summary.failed_requests)} />
            <StatTile
              label="Tổng token"
              value={fmtNumber(data.summary.total_tokens)}
              hint={`Input ${fmtNumber(data.summary.input_tokens)} · Output ${fmtNumber(data.summary.output_tokens)}`}
            />
            <StatTile
              label="Chi phí ước tính"
              value={money(data.summary.estimated_cost, data.summary.currency)}
              hint="Không phải hóa đơn chính thức"
            />
            <StatTile label="Độ trễ TB" value={ms(data.summary.avg_latency_ms)} />
            <StatTile
              label="P50 / P95 / P99"
              value={`${ms(data.summary.p50_latency_ms)} / ${ms(data.summary.p95_latency_ms)} / ${ms(data.summary.p99_latency_ms)}`}
            />
          </StatGrid>

          {data.warnings.length > 0 && (
            <Card>
              <CardHeader><CardTitle as="h2">Cảnh báo</CardTitle></CardHeader>
              <CardBody>
                <div className="ez-row ez-row-wrap">
                  {data.warnings.map((item) => (
                    <Badge key={`${item.type}-${item.message}`} tone={item.severity === 'critical' ? 'danger' : item.severity === 'info' ? 'info' : 'danger'}>
                      {item.message}
                    </Badge>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <div className="ez-grid ez-grid-3">
                <Card variant="muted">
                  <CardHeader><CardTitle as="h3">User dùng nhiều</CardTitle></CardHeader>
                  <CardBody>
                    {data.top_users.length
                      ? renderObjectRows(Object.fromEntries(data.top_users.map((row) => [row.label || row.key, `${fmtNumber(row.request_count)} req · ${fmtNumber(row.total_tokens)} token`])) as Record<string, unknown>)
                      : <p className="ez-muted">Không có dữ liệu</p>}
                  </CardBody>
                </Card>
                <Card variant="muted">
                  <CardHeader><CardTitle as="h3">Model dùng nhiều</CardTitle></CardHeader>
                  <CardBody>
                    {data.top_models.length
                      ? renderObjectRows(Object.fromEntries(data.top_models.map((row) => [row.key, `${fmtNumber(row.request_count)} req · ${money(row.estimated_cost)}`])) as Record<string, unknown>)
                      : <p className="ez-muted">Không có dữ liệu</p>}
                  </CardBody>
                </Card>
                <Card variant="muted">
                  <CardHeader><CardTitle as="h3">Feature tốn token</CardTitle></CardHeader>
                  <CardBody>
                    {data.top_features.length
                      ? renderObjectRows(Object.fromEntries(data.top_features.map((row) => [row.key, `${fmtNumber(row.total_tokens)} token · ${fmtNumber(row.request_count)} req`])) as Record<string, unknown>)
                      : <p className="ez-muted">Không có dữ liệu</p>}
                  </CardBody>
                </Card>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <DataTable columns={usageColumns} data={data.items} rowKey={(item) => item.id} minWidth={1100} />
              <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
            </CardBody>
          </Card>
        </>
      )}

      <Card>
        <CardHeader><CardTitle as="h2">Quota mặc định theo role</CardTitle></CardHeader>
        <CardBody>
          <p className="ez-muted">Áp dụng ngay không cần khởi động lại server, ghi đè lên giá trị mặc định trong code.</p>
          {roleDefaultsError && <p className="ez-muted">{roleDefaultsError}</p>}
          <div className="ez-grid ez-grid-3">
            {Object.keys(roleDefaults).sort().map((role) => (
              <Card key={role} variant="muted">
                <CardHeader><CardTitle as="h3">{role}</CardTitle></CardHeader>
                <CardBody>
                  {editingRole === role ? (
                    <>
                      <FormField label="Quota JSON">
                        <Textarea rows={8} value={roleQuotaJson} onChange={(event) => setRoleQuotaJson(event.target.value)} />
                      </FormField>
                      <FormField label="Lý do">
                        <Textarea rows={3} value={roleQuotaReason} onChange={(event) => setRoleQuotaReason(event.target.value)} />
                      </FormField>
                      <div className="ez-row ez-row-wrap">
                        <Button variant="primary" disabled={busy || !roleQuotaReason.trim()} onClick={() => setPendingAction('role-default')}>Lưu</Button>
                        <Button variant="outline" disabled={busy} onClick={() => setEditingRole('')}>Huỷ</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {renderObjectRows(roleDefaults[role])}
                      <Button variant="outline" onClick={() => startEditRoleDefault(role)}>Sửa</Button>
                    </>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2">Quota theo user</CardTitle></CardHeader>
        <CardBody>
          <div className="ez-row ez-row-wrap">
            <FormField label="User ID">
              <Input value={quotaUserId} onChange={(event) => setQuotaUserId(event.target.value)} style={{ minWidth: 280 }} />
            </FormField>
            <Button variant="primary" disabled={busy || !quotaUserId.trim()} onClick={loadQuota}>Xem quota</Button>
          </div>
          {quotaError && <p className="ez-muted">{quotaError}</p>}
          {quota && (
            <div className="ez-grid ez-grid-3" style={{ marginTop: 14 }}>
              <Card variant="muted">
                <CardHeader><CardTitle as="h3">Usage hiện tại</CardTitle></CardHeader>
                <CardBody>{renderObjectRows(quota.usage)}</CardBody>
              </Card>
              <Card variant="muted">
                <CardHeader><CardTitle as="h3">Quota hiệu lực</CardTitle></CardHeader>
                <CardBody>{renderObjectRows(quota.effective_quota)}</CardBody>
              </Card>
              <Card variant="muted">
                <CardHeader><CardTitle as="h3">Override</CardTitle></CardHeader>
                <CardBody>
                  <FormField label="Quota JSON">
                    <Textarea rows={8} value={quotaJson} onChange={(event) => setQuotaJson(event.target.value)} />
                  </FormField>
                  <FormField label="Lý do">
                    <Textarea rows={3} value={quotaReason} onChange={(event) => setQuotaReason(event.target.value)} />
                  </FormField>
                  <div className="ez-row ez-row-wrap">
                    <Button variant="primary" disabled={busy || !quotaReason.trim()} onClick={() => setPendingAction('quota-save')}>Lưu quota</Button>
                    <Button variant="danger" disabled={busy || !quotaReason.trim()} onClick={() => setPendingAction('quota-reset')}>Reset quota</Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
          {quotaHistory && quotaHistory.items.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <CardTitle as="h3">Lịch sử đổi quota</CardTitle>
              {renderObjectRows(Object.fromEntries(quotaHistory.items.map((item) => [fmtDateTime(item.timestamp), `${item.admin_email_snapshot} · ${item.reason || 'Không có lý do'}`])) as Record<string, unknown>)}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingAction !== null}
        onClose={busy ? () => undefined : () => { setPendingAction(null); setResetConfirmation(''); }}
        onConfirm={() => {
          if (pendingAction === 'role-default') void saveRoleDefault();
          else if (pendingAction === 'quota-save') void saveQuota();
          else if (pendingAction === 'quota-reset') void resetQuota();
        }}
        title={pendingAction === 'role-default'
          ? 'Thay quota mặc định theo vai trò?'
          : pendingAction === 'quota-save'
            ? 'Thay quota người dùng?'
            : 'Reset quota người dùng?'}
        description={pendingAction === 'role-default'
          ? `Vai trò ${editingRole} sẽ nhận quota mặc định mới ngay lập tức. Có thể thay đổi lại bằng một lần lưu khác.`
          : pendingAction === 'quota-save'
            ? `Người dùng ${quota?.user_id ?? ''} sẽ nhận quota ghi đè mới ngay lập tức. Có thể thay đổi hoặc reset sau.`
            : `Mọi quota ghi đè của người dùng ${quota?.user_id ?? ''} sẽ bị xóa và quota mặc định sẽ có hiệu lực ngay. Không thể khôi phục tự động giá trị cũ.`}
        confirmLabel={pendingAction === 'quota-reset' ? 'Reset quota' : 'Áp dụng'}
        confirmDisabled={pendingAction === 'quota-reset' && resetConfirmation !== 'RESET'}
        busy={busy}
      >
        <Alert tone={pendingAction === 'quota-reset' ? 'error' : 'warning'}>
          Thao tác ảnh hưởng giới hạn sử dụng AI và được ghi vào nhật ký quản trị.
        </Alert>
        {pendingAction === 'quota-reset' && (
          <FormField
            label="Nhập RESET để xác nhận"
            error={resetConfirmation && resetConfirmation !== 'RESET' ? 'Nội dung xác nhận chưa đúng.' : undefined}
          >
            <Input
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              autoComplete="off"
              invalid={Boolean(resetConfirmation && resetConfirmation !== 'RESET')}
            />
          </FormField>
        )}
      </ConfirmDialog>
    </div>
  );
}
