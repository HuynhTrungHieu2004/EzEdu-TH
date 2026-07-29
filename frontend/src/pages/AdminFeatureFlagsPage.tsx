import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { systemSettingsApi } from '../api/systemSettingsApi';
import type { FeatureFlagItem } from '../types/systemSettings';
import { fmtDateTime } from './AdminContentShared';
import { apiErrorMessage } from '../utils/apiError';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  ChipGroup,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';
import './AdminContentPages.css';

const DANGEROUS_FLAGS = new Set([
  'enable_maintenance_mode',
  'enable_user_registration',
  'enable_advanced_chat',
  'enable_question_export',
  'enable_personalization',
]);

const ROLES = ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'lecturer', 'student', 'user'];

export default function AdminFeatureFlagsPage() {
  const [items, setItems] = useState<FeatureFlagItem[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [pendingFlag, setPendingFlag] = useState<FeatureFlagItem | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    systemSettingsApi.listFlags()
      .then((data) => setItems(data.items))
      .catch((err) => setError(apiErrorMessage(err, 'Không tải được feature flags.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const patchLocal = (key: string, patch: Partial<FeatureFlagItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const performSave = async (item: FeatureFlagItem) => {
    const reason = (reasons[item.key] || '').trim();
    setBusyKey(item.key);
    setError('');
    try {
      const updated = await systemSettingsApi.updateFlag(item.key, {
        enabled: item.enabled,
        description: item.description,
        rollout_percentage: item.rollout_percentage,
        allowed_roles: item.allowed_roles,
        reason,
      });
      patchLocal(item.key, updated);
      setReasons((prev) => ({ ...prev, [item.key]: '' }));
      setPendingFlag(null);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không lưu được feature flag.'));
    } finally {
      setBusyKey('');
    }
  };

  const requestSave = (item: FeatureFlagItem) => {
    if (!(reasons[item.key] || '').trim()) {
      setError('Cần nhập lý do trước khi lưu cờ tính năng.');
      return;
    }
    if (DANGEROUS_FLAGS.has(item.key)) {
      setPendingFlag(item);
      return;
    }
    void performSave(item);
  };

  return (
    <div className="admin-content-page">
      <PageHeader
        title="Cờ tính năng"
        description="Bật hoặc tắt một số tính năng, đặt tỷ lệ triển khai và giới hạn vai trò. Đây không phải toàn bộ cấu hình hệ thống."
      />

      {error && <EmptyState title="Có lỗi" description={String(error)} />}
      {loading && <EmptyState title="Đang tải" description="Đang tải danh sách tính năng…" />}

      {!loading && items.length === 0 && (
        <EmptyState title="Chưa có feature flag nào" description="Chưa có tính năng runtime nào được đăng ký." />
      )}

      {!loading && items.length > 0 && (
        <div className="ez-stack">
          {items.map((item) => {
            const toggleRole = (role: string) => {
              const next = item.allowed_roles.includes(role)
                ? item.allowed_roles.filter((r) => r !== role)
                : [...item.allowed_roles, role];
              patchLocal(item.key, { allowed_roles: next });
            };
            return (
              <Card key={item.key}>
                <CardBody className="ez-stack">
                  <div>
                    <strong>{item.key}</strong>
                    <p className="admin-content-muted" style={{ margin: 'var(--ez-space-1) 0 0' }}>
                      Cập nhật {fmtDateTime(item.updated_at)}
                    </p>
                  </div>
                  <FormField label="Mô tả">
                    <Textarea
                      rows={2}
                      value={item.description}
                      onChange={(event) => patchLocal(item.key, { description: event.target.value })}
                    />
                  </FormField>
                  <div style={{ display: 'flex', gap: 'var(--ez-space-4)', flexWrap: 'wrap' }}>
                    <FormField label="Trạng thái">
                      <Select
                        value={item.enabled ? 'true' : 'false'}
                        onChange={(event) => patchLocal(item.key, { enabled: event.target.value === 'true' })}
                        options={[
                          { value: 'true', label: 'Bật' },
                          { value: 'false', label: 'Tắt' },
                        ]}
                      />
                    </FormField>
                    <FormField label="Rollout %">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        style={{ width: '100px' }}
                        value={item.rollout_percentage}
                        onChange={(event) => patchLocal(item.key, { rollout_percentage: Number(event.target.value) })}
                      />
                    </FormField>
                  </div>
                  <FormField label="Vai trò được áp dụng">
                    <ChipGroup>
                      {ROLES.map((role) => (
                        <Chip key={role} selected={item.allowed_roles.includes(role)} onClick={() => toggleRole(role)}>
                          {role}
                        </Chip>
                      ))}
                    </ChipGroup>
                  </FormField>
                  <FormField label="Lý do">
                    <Input
                      value={reasons[item.key] || ''}
                      onChange={(event) => setReasons({ ...reasons, [item.key]: event.target.value })}
                      placeholder="Bắt buộc khi lưu"
                    />
                  </FormField>
                  <div>
                    <Button
                      loading={busyKey === item.key}
                      leadingIcon={<Save size={15} aria-hidden="true" />}
                      onClick={() => requestSave(item)}
                    >
                      Lưu
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={pendingFlag !== null}
        onClose={busyKey ? () => undefined : () => setPendingFlag(null)}
        onConfirm={() => pendingFlag && void performSave(pendingFlag)}
        title="Thay đổi cờ tính năng nhạy cảm?"
        description={`${pendingFlag?.key ?? ''} sẽ ${pendingFlag?.enabled ? 'được bật' : 'bị tắt'} cho phạm vi đã cấu hình. Có thể hoàn tác bằng một lần cập nhật khác.`}
        confirmLabel="Áp dụng thay đổi"
        busy={Boolean(busyKey)}
      >
        <Alert tone="warning">Thay đổi có thể ngắt luồng đang dùng của người dùng và được ghi vào nhật ký quản trị.</Alert>
      </ConfirmDialog>
    </div>
  );
}
