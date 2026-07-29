/* eslint-disable react-refresh/only-export-components */
import { useState, type ReactNode } from 'react';
import {
  Badge as UiBadge,
  ConfirmDialog,
  EmptyState as UiEmptyState,
  FormField,
  Input,
  Pagination as UiPagination,
  Textarea,
} from '../components/ui';

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
  return <UiEmptyState title={title} description={text} compact />;
}

export function Badge({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'ok' | 'danger' }) {
  const variant = tone === 'ok' ? 'success' : tone === 'danger' ? 'error' : 'info';
  return <UiBadge variant={variant}>{children}</UiBadge>;
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
  return <UiPagination page={page} totalPages={totalPages} total={total} onPageChange={onPage} />;
}

export function ReasonModal({
  title,
  target,
  reason,
  busy,
  onReason,
  onCancel,
  onConfirm,
  consequence,
  reversible = true,
  confirmationText,
}: {
  title: string;
  target: string;
  reason: string;
  busy: boolean;
  onReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  consequence?: string;
  reversible?: boolean;
  confirmationText?: string;
}) {
  const [confirmation, setConfirmation] = useState('');
  const confirmationMatches = !confirmationText || confirmation === confirmationText;
  return (
    <ConfirmDialog
      open
      onClose={busy ? () => undefined : onCancel}
      onConfirm={onConfirm}
      title={title}
      description={`Đối tượng bị ảnh hưởng: ${target}. ${consequence ?? 'Thao tác sẽ được ghi vào nhật ký quản trị.'} ${reversible ? 'Có thể hoàn tác bằng thao tác khôi phục phù hợp.' : 'Không thể hoàn tác.'}`}
      confirmLabel="Xác nhận"
      confirmDisabled={!reason.trim() || !confirmationMatches}
      busy={busy}
    >
      <FormField
        label="Lý do"
        error={!reason.trim() ? 'Cần nhập lý do trước khi xác nhận.' : undefined}
      >
        <Textarea
          rows={4}
          value={reason}
          onChange={(event) => onReason(event.target.value)}
          placeholder="Nhập lý do thao tác"
          invalid={!reason.trim()}
        />
      </FormField>
      {confirmationText && (
        <FormField
          label={`Nhập ${confirmationText} để xác nhận`}
          error={confirmation && !confirmationMatches ? 'Nội dung xác nhận chưa đúng.' : undefined}
        >
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            invalid={Boolean(confirmation && !confirmationMatches)}
          />
        </FormField>
      )}
    </ConfirmDialog>
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
