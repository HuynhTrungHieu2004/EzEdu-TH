import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { systemSettingsApi } from '../api/systemSettingsApi';
import type { SettingCategory, SystemSettingItem } from '../types/systemSettings';
import { fmtDateTime } from './AdminContentShared';
import { apiErrorMessage } from '../utils/apiError';
import {
  Alert,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SectionHeader,
} from '../components/ui';
import './AdminContentPages.css';

const CATEGORY_LABELS: Record<SettingCategory, string> = {
  upload: 'Upload',
  question_generation: 'Sinh câu hỏi',
  ai: 'AI',
  user: 'Người dùng',
  logs: 'Logs',
};

const DANGEROUS_SETTINGS = new Set([
  'max_file_size_mb',
  'max_documents_per_user',
  'registration_enabled',
  'default_role',
  'timeout_seconds',
  'retry_count',
  'rag_distance_threshold',
  'audit_log_retention_days',
]);

function valueToInput(item: SystemSettingItem) {
  if (item.value_type === 'list') return Array.isArray(item.value) ? item.value.join(', ') : '';
  if (item.value_type === 'bool') return item.value ? 'true' : 'false';
  return String(item.value ?? '');
}

function parseValue(item: SystemSettingItem, value: string) {
  if (item.value_type === 'list') return value.split(',').map((part) => part.trim()).filter(Boolean);
  if (item.value_type === 'bool') return value === 'true';
  if (item.value_type === 'int') return Number.parseInt(value, 10);
  if (item.value_type === 'float') return Number.parseFloat(value);
  return value;
}

export default function AdminSettingsPage() {
  const [items, setItems] = useState<SystemSettingItem[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [pendingSetting, setPendingSetting] = useState<SystemSettingItem | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<SettingCategory, SystemSettingItem[]>();
    items.forEach((item) => {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    });
    return map;
  }, [items]);

  const load = () => {
    setLoading(true);
    setError('');
    systemSettingsApi.listSettings()
      .then((data) => {
        setItems(data.items);
        setEdits(Object.fromEntries(data.items.map((item) => [item.key, valueToInput(item)])));
      })
      .catch((err) => setError(apiErrorMessage(err, 'Không tải được cấu hình hệ thống.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const performSave = async (item: SystemSettingItem) => {
    const reason = (reasons[item.key] || '').trim();
    setSavingKey(item.key);
    setError('');
    try {
      const updated = await systemSettingsApi.updateSetting(item.key, parseValue(item, edits[item.key] ?? ''), reason);
      setItems((prev) => prev.map((row) => (row.key === item.key ? updated : row)));
      setEdits((prev) => ({ ...prev, [item.key]: valueToInput(updated) }));
      setReasons((prev) => ({ ...prev, [item.key]: '' }));
      setPendingSetting(null);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không lưu được setting.'));
    } finally {
      setSavingKey('');
    }
  };

  const requestSave = (item: SystemSettingItem) => {
    if (!(reasons[item.key] || '').trim()) {
      setError('Cần nhập lý do trước khi lưu cấu hình.');
      return;
    }
    if (DANGEROUS_SETTINGS.has(item.key)) {
      setPendingSetting(item);
      return;
    }
    void performSave(item);
  };

  return (
    <div className="admin-content-page">
      <PageHeader
        title="Cấu hình hệ thống"
        description="Thay đổi cấu hình vận hành an toàn; không hiển thị hoặc lưu thông tin bí mật."
      />

      {error && <EmptyState title="Có lỗi" description={String(error)} />}
      {loading && <EmptyState title="Đang tải" description="Đang tải cấu hình hệ thống…" />}

      {!loading && Array.from(grouped.entries()).map(([category, rows]) => (
        <section key={category} style={{ marginBottom: 'var(--ez-space-6)' }}>
          <SectionHeader title={CATEGORY_LABELS[category]} />
          <div className="ez-stack">
            {rows.map((item) => {
              const dirty = edits[item.key] !== valueToInput(item);
              return (
                <Card key={item.key}>
                  <CardBody className="ez-stack">
                    <div>
                      <strong>{item.key}</strong>
                      <p className="admin-content-muted">{item.description}</p>
                      <small className="admin-content-muted">
                        {item.value_type} · {item.is_public ? 'public' : 'private'} · cập nhật {fmtDateTime(item.updated_at)}
                      </small>
                    </div>
                    <FormField label="Giá trị">
                      {item.value_type === 'bool' ? (
                        <Select
                          value={edits[item.key] ?? valueToInput(item)}
                          onChange={(event) => setEdits({ ...edits, [item.key]: event.target.value })}
                          options={[
                            { value: 'true', label: 'Bật' },
                            { value: 'false', label: 'Tắt' },
                          ]}
                        />
                      ) : (
                        <Input
                          value={edits[item.key] ?? valueToInput(item)}
                          onChange={(event) => setEdits({ ...edits, [item.key]: event.target.value })}
                        />
                      )}
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
                        disabled={!dirty}
                        loading={savingKey === item.key}
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
        </section>
      ))}
      <ConfirmDialog
        open={pendingSetting !== null}
        onClose={savingKey ? () => undefined : () => setPendingSetting(null)}
        onConfirm={() => pendingSetting && void performSave(pendingSetting)}
        title="Thay đổi cấu hình nhạy cảm?"
        description={`Cấu hình ${pendingSetting?.key ?? ''} sẽ được áp dụng ngay cho hệ thống. Có thể hoàn tác bằng cách lưu lại giá trị cũ; hệ thống không tự hoàn tác.`}
        confirmLabel="Áp dụng thay đổi"
        busy={Boolean(savingKey)}
      >
        <Alert tone="warning">Thay đổi có thể ảnh hưởng người dùng đang hoạt động và được ghi vào nhật ký quản trị.</Alert>
      </ConfirmDialog>
    </div>
  );
}
