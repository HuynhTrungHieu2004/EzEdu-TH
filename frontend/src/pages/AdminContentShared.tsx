/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return 'Không có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', hour12: false });
}

export function fmtNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('vi-VN');
}

export function fmtFileSize(value: number | null | undefined) {
  const size = value ?? 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function dateStart(value: string) {
  return value ? new Date(`${value}T00:00:00+07:00`).toISOString() : undefined;
}

export function dateEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999+07:00`).toISOString() : undefined;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="admin-content-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function Badge({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'ok' | 'danger' }) {
  const modifier = tone === 'ok' ? ' admin-content-badge--ok' : tone === 'danger' ? ' admin-content-badge--danger' : '';
  return <span className={`admin-content-badge${modifier}`}>{children}</span>;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="admin-content-pagination">
      <span className="admin-content-muted">Tổng {fmtNumber(total)} bản ghi</span>
      <button type="button" className="admin-content-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</button>
      <span className="admin-content-muted">Trang {page}/{totalPages || 1}</span>
      <button type="button" className="admin-content-btn" disabled={!totalPages || page >= totalPages} onClick={() => onPage(page + 1)}>Sau</button>
    </div>
  );
}

export function ReasonModal({
  title,
  target,
  reason,
  busy,
  onReason,
  onCancel,
  onConfirm,
}: {
  title: string;
  target: string;
  reason: string;
  busy: boolean;
  onReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="admin-content-modal-backdrop" role="presentation">
      <section className="admin-content-modal" role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <p className="admin-content-muted">Đối tượng bị ảnh hưởng: <strong>{target}</strong></p>
        <label className="admin-content-field">
          <span>Lý do</span>
          <textarea rows={4} value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Nhập lý do thao tác" />
        </label>
        <div className="admin-content-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="admin-content-btn" disabled={busy} onClick={onCancel}>Hủy</button>
          <button type="button" className="admin-content-btn admin-content-btn--danger" disabled={busy || !reason.trim()} onClick={onConfirm}>
            {busy ? 'Đang xử lý...' : 'Xác nhận'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function renderObjectRows(value: Record<string, unknown> | Array<Record<string, unknown>>) {
  const entries = Array.isArray(value)
    ? value.flatMap((item, index) => Object.entries(item).map(([key, val]) => [`${index + 1}.${key}`, val] as const))
    : Object.entries(value);
  if (!entries.length) return <p className="admin-content-muted">Không có dữ liệu</p>;
  return (
    <div className="admin-content-pretty">
      {entries.map(([key, val]) => (
        <div key={key} className="admin-content-pretty-row">
          <strong>{key}</strong>
          <span>{typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? 'Không có dữ liệu')}</span>
        </div>
      ))}
    </div>
  );
}
