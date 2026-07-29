/**
 * Tiện ích dùng chung cho mọi trang Admin.
 *
 * Tập trung các hàm format, hằng số nhãn thay vì mỗi trang tự viết.
 */

/* ── Định dạng ngày giờ ─────────────────────────────────────────────────── */

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return 'Không có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  });
}

export function fmtDateTimeLong(value: string | null | undefined) {
  if (!value) return 'Không có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  });
}

/* ── Định dạng số ────────────────────────────────────────────────────────── */

export function fmtNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('vi-VN');
}

export function fmtFileSize(value: number | null | undefined) {
  const size = value ?? 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/* ── ISO date helpers cho bộ lọc (timezone +07:00) ──────────────────────── */

export function dateStart(value: string) {
  return value
    ? new Date(`${value}T00:00:00+07:00`).toISOString()
    : undefined;
}

export function dateEnd(value: string) {
  return value
    ? new Date(`${value}T23:59:59.999+07:00`).toISOString()
    : undefined;
}

/* ── Hằng số nhãn dùng chung ─────────────────────────────────────────────── */

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  support: 'Support',
  analyst: 'Analyst',
  lecturer: 'Giảng viên',
  student: 'Học sinh',
  user: 'Người dùng',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  active: 'Hoạt động',
  locked: 'Đã khóa',
  deleted: 'Đã xóa',
};
