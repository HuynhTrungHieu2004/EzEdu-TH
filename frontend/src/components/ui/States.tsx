import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, PowerOff, ShieldAlert } from 'lucide-react';
import { Button } from './Button';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Cho phép h1 vì có trang dùng trọn một state làm nội dung chính (ví dụ trang 404). */
export type StateTitleTag = 'h1' | 'h2' | 'h3' | 'h4';
export type StateTone = 'default' | 'error' | 'warning' | 'primary';

interface StateShellProps {
  icon: ReactNode;
  tone: StateTone;
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
  titleAs?: StateTitleTag;
  className?: string;
  role?: 'alert';
}

function StateShell({
  icon,
  tone,
  title,
  description,
  actions,
  compact = false,
  titleAs = 'h3',
  className,
  role,
}: StateShellProps) {
  const TitleTag = titleAs;

  return (
    <div
      className={cx('ez-state', compact && 'ez-state-compact', className)}
      role={role}
    >
      <div
        className={cx(
          'ez-state-icon',
          tone !== 'default' && `ez-state-icon-${tone}`,
        )}
      >
        {icon}
      </div>

      <TitleTag className="ez-state-title">{title}</TitleTag>
      {description ? <p className="ez-state-desc">{description}</p> : null}
      {actions ? <div className="ez-state-actions">{actions}</div> : null}
    </div>
  );
}

/* ── Không có dữ liệu ─────────────────────────────────────────────────── */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  titleAs?: StateTitleTag;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actions,
  compact,
  titleAs,
  className,
}: EmptyStateProps) {
  return (
    <StateShell
      icon={icon ?? <Inbox aria-hidden="true" />}
      tone="default"
      title={title}
      description={description}
      actions={actions}
      compact={compact}
      titleAs={titleAs}
      className={className}
    />
  );
}

/* ── Lỗi tải dữ liệu ──────────────────────────────────────────────────── */

export interface ErrorStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  titleAs?: StateTitleTag;
  className?: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
}

export function ErrorState({
  title,
  description,
  icon,
  actions,
  compact,
  titleAs,
  className,
  onRetry,
  retrying = false,
  retryLabel,
}: ErrorStateProps) {
  const composedActions =
    onRetry || actions ? (
      <>
        {onRetry ? (
          <Button variant="outline" loading={retrying} onClick={onRetry}>
            {retryLabel ?? 'Tải lại'}
          </Button>
        ) : null}
        {actions}
      </>
    ) : undefined;

  return (
    <StateShell
      icon={icon ?? <AlertTriangle aria-hidden="true" />}
      tone="error"
      title={title}
      description={description}
      actions={composedActions}
      compact={compact}
      titleAs={titleAs}
      className={className}
      role="alert"
    />
  );
}

/* ── Không đủ quyền ───────────────────────────────────────────────────── */

export interface PermissionDeniedStateProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function PermissionDeniedState({
  title = 'Bạn không có quyền xem nội dung này',
  description = 'Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên để được cấp quyền truy cập.',
  actions,
  compact,
  className,
}: PermissionDeniedStateProps) {
  return (
    <StateShell
      icon={<ShieldAlert aria-hidden="true" />}
      tone="warning"
      title={title}
      description={description}
      actions={actions}
      compact={compact}
      className={className}
    />
  );
}

/* ── Tính năng bị tắt ─────────────────────────────────────────────────── */

export interface FeatureDisabledStateProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function FeatureDisabledState({
  title = 'Tính năng đang tạm tắt',
  description = 'Quản trị viên đã tắt tính năng này. Vui lòng quay lại sau hoặc liên hệ quản trị viên nếu bạn cần dùng ngay.',
  actions,
  compact,
  className,
}: FeatureDisabledStateProps) {
  return (
    <StateShell
      icon={<PowerOff aria-hidden="true" />}
      tone="warning"
      title={title}
      description={description}
      actions={actions}
      compact={compact}
      className={className}
    />
  );
}
