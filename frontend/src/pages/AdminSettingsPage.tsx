import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { systemSettingsApi } from '../api/systemSettingsApi';
import type { SettingCategory, SystemSettingItem } from '../types/systemSettings';
import { EmptyState, fmtDateTime } from './AdminContentShared';
import { apiErrorMessage } from '../utils/apiError';
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

  const save = async (item: SystemSettingItem) => {
    const reason = (reasons[item.key] || '').trim();
    if (!reason) {
      setError('Cần nhập lý do trước khi lưu cấu hình.');
      return;
    }
    if (DANGEROUS_SETTINGS.has(item.key) && !window.confirm(`Xác nhận thay đổi cấu hình ${item.key}?`)) return;
    setSavingKey(item.key);
    setError('');
    try {
      const updated = await systemSettingsApi.updateSetting(item.key, parseValue(item, edits[item.key] ?? ''), reason);
      setItems((prev) => prev.map((row) => (row.key === item.key ? updated : row)));
      setEdits((prev) => ({ ...prev, [item.key]: valueToInput(updated) }));
      setReasons((prev) => ({ ...prev, [item.key]: '' }));
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không lưu được setting.'));
    } finally {
      setSavingKey('');
    }
  };

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>System Settings</h1>
          <p>Thay đổi cấu hình runtime an toàn, không lưu secret và không cần sửa .env/source code.</p>
        </div>
      </header>

      {error && <EmptyState title="Có lỗi" text={String(error)} />}
      {loading && <EmptyState title="Đang tải" text="Đang đọc system_settings từ backend." />}

      {!loading && Array.from(grouped.entries()).map(([category, rows]) => (
        <section className="admin-content-panel" key={category}>
          <h2>{CATEGORY_LABELS[category]}</h2>
          <div className="admin-settings-list">
            {rows.map((item) => {
              const dirty = edits[item.key] !== valueToInput(item);
              return (
                <article className="admin-settings-row" key={item.key}>
                  <div>
                    <strong>{item.key}</strong>
                    <p className="admin-content-muted">{item.description}</p>
                    <small className="admin-content-muted">
                      {item.value_type} · {item.is_public ? 'public' : 'private'} · cập nhật {fmtDateTime(item.updated_at)}
                    </small>
                  </div>
                  <label className="admin-content-field">
                    <span>Giá trị</span>
                    {item.value_type === 'bool' ? (
                      <select value={edits[item.key] ?? valueToInput(item)} onChange={(event) => setEdits({ ...edits, [item.key]: event.target.value })}>
                        <option value="true">Bật</option>
                        <option value="false">Tắt</option>
                      </select>
                    ) : (
                      <input value={edits[item.key] ?? valueToInput(item)} onChange={(event) => setEdits({ ...edits, [item.key]: event.target.value })} />
                    )}
                  </label>
                  <label className="admin-content-field">
                    <span>Lý do</span>
                    <input value={reasons[item.key] || ''} onChange={(event) => setReasons({ ...reasons, [item.key]: event.target.value })} placeholder="Bắt buộc khi lưu" />
                  </label>
                  <button type="button" className="admin-content-btn admin-content-btn--primary" disabled={!dirty || savingKey === item.key} onClick={() => save(item)}>
                    <Save size={15} aria-hidden="true" /> Lưu
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
