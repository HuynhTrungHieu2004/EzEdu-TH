import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { systemSettingsApi } from '../api/systemSettingsApi';
import type { FeatureFlagItem } from '../types/systemSettings';
import { EmptyState, fmtDateTime } from './AdminContentShared';
import { apiErrorMessage } from '../utils/apiError';
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

  const save = async (item: FeatureFlagItem) => {
    const reason = (reasons[item.key] || '').trim();
    if (!reason) {
      setError('Cần nhập lý do trước khi lưu feature flag.');
      return;
    }
    if (DANGEROUS_FLAGS.has(item.key) && !window.confirm(`Xác nhận thay đổi ${item.key}? Tác động có thể ảnh hưởng người dùng đang sử dụng.`)) return;
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
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không lưu được feature flag.'));
    } finally {
      setBusyKey('');
    }
  };

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>Feature Flags</h1>
          <p>Bật/tắt tính năng runtime, có rollout và giới hạn role. Backend kiểm tra flag ở các luồng quan trọng.</p>
        </div>
      </header>

      {error && <EmptyState title="Có lỗi" text={String(error)} />}
      {loading && <EmptyState title="Đang tải" text="Đang đọc feature_flags từ backend." />}

      {!loading && (
        <section className="admin-content-panel">
          <div className="admin-settings-list">
            {items.map((item) => (
              <article className="admin-settings-row admin-settings-row--flag" key={item.key}>
                <div>
                  <strong>{item.key}</strong>
                  <textarea rows={2} value={item.description} onChange={(event) => patchLocal(item.key, { description: event.target.value })} />
                  <small className="admin-content-muted">Cập nhật {fmtDateTime(item.updated_at)}</small>
                </div>
                <label className="admin-content-field">
                  <span>Trạng thái</span>
                  <select value={item.enabled ? 'true' : 'false'} onChange={(event) => patchLocal(item.key, { enabled: event.target.value === 'true' })}>
                    <option value="true">Bật</option>
                    <option value="false">Tắt</option>
                  </select>
                </label>
                <label className="admin-content-field">
                  <span>Rollout %</span>
                  <input type="number" min={0} max={100} value={item.rollout_percentage} onChange={(event) => patchLocal(item.key, { rollout_percentage: Number(event.target.value) })} />
                </label>
                <label className="admin-content-field">
                  <span>Allowed roles</span>
                  <select multiple value={item.allowed_roles} onChange={(event) => patchLocal(item.key, { allowed_roles: Array.from(event.target.selectedOptions).map((option) => option.value) })}>
                    {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </label>
                <label className="admin-content-field">
                  <span>Lý do</span>
                  <input value={reasons[item.key] || ''} onChange={(event) => setReasons({ ...reasons, [item.key]: event.target.value })} placeholder="Bắt buộc khi lưu" />
                </label>
                <button type="button" className="admin-content-btn admin-content-btn--primary" disabled={busyKey === item.key} onClick={() => save(item)}>
                  <Save size={15} aria-hidden="true" /> Lưu
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
