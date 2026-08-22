import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ═══════════════════════════════════════════════════════════════════════
   DataTable — bảng dữ liệu responsive dùng chung cho Admin
   ═══════════════════════════════════════════════════════════════════════ */

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Nội dung cell header mobile — mặc định dùng label */
  headerMobile?: string;
  /** className thêm cho <th> */
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Min-width cho desktop — mặc định 980px */
  minWidth?: number;
  className?: string;
  /** Nội dung khi đang loading */
  loading?: boolean;
  /** Nội dung khi không có dữ liệu */
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  minWidth = 980,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cx('ez-datatable-wrap', className)}>
      <table
        className="ez-datatable"
        style={{ minWidth: `${minWidth}px` }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key} data-label={col.headerMobile ?? col.label}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Pagination
   ═══════════════════════════════════════════════════════════════════════ */

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Đơn vị hiển thị, ví dụ "người dùng", "tài liệu" — mặc định "bản ghi" */
  label?: string;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  label = 'bản ghi',
  className,
}: PaginationProps) {
  return (
    <div className={cx('ez-pagination', className)}>
      <span className="ez-pagination-info">
        Trang {page}/{Math.max(totalPages, 1)} · {total.toLocaleString('vi-VN')} {label}
      </span>
      <div className="ez-pagination-controls">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!totalPages || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   FilterBar — responsive filter grid
   ═══════════════════════════════════════════════════════════════════════ */

export interface FilterBarProps {
  children: ReactNode;
  /** Số cột ở desktop — mặc định 4 */
  columns?: number;
  className?: string;
  /** Nếu true, render <form> thay vì <div> */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function FilterBar({
  children,
  columns = 4,
  className,
  onSubmit,
}: FilterBarProps) {
  const style = {
    '--ez-filter-cols': columns,
  } as React.CSSProperties;

  if (onSubmit) {
    return (
      <form
        className={cx('ez-filter-bar', className)}
        style={style}
        onSubmit={onSubmit}
      >
        {children}
      </form>
    );
  }

  return (
    <div className={cx('ez-filter-bar', className)} style={style}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ConfirmDialog — dialog xác nhận hành động với textarea lý do (optional)
   ═══════════════════════════════════════════════════════════════════════ */

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  /** Nhãn nút xác nhận — mặc định "Xác nhận" */
  confirmLabel?: string;
  /** Biến thể nút xác nhận — mặc định "danger" */
  confirmVariant?: 'primary' | 'danger';
  confirmDisabled?: boolean;
  busy?: boolean;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Xác nhận',
  confirmVariant = 'danger',
  confirmDisabled = false,
  busy = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      description={description}
      closeOnOverlayClick={!busy}
      footer={
        <div className="ez-dialog-footer">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant={confirmVariant}
            disabled={busy || confirmDisabled}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children}
    </Dialog>
  );
}
