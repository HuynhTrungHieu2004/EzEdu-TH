import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
  titleAs?: 'h1' | 'h2';
  loading?: boolean;
  className?: string;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  backTo,
  backLabel,
  titleAs: TitleTag = 'h1',
  loading = false,
  className,
}: PageHeaderProps) {
  return (
    <>
      {backTo ? (
        <Link to={backTo} className="ez-page-back">
          <ChevronLeft size={16} aria-hidden="true" />
          {backLabel ?? 'Quay lại'}
        </Link>
      ) : null}

      <div className={cx('ez-page-header', className)}>
        <div className="ez-page-header-main">
          {eyebrow ? <span className="ez-page-eyebrow">{eyebrow}</span> : null}

          {loading ? (
            <div className="ez-skeleton ez-skeleton-title" />
          ) : (
            <TitleTag className="ez-page-title">{title}</TitleTag>
          )}

          {loading ? (
            <div className="ez-skeleton ez-skeleton-text" />
          ) : description ? (
            <p className="ez-page-desc">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="ez-page-actions">{actions}</div> : null}
      </div>
    </>
  );
}

export type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  titleAs?: 'h2' | 'h3' | 'h4';
  className?: string;
};

export function SectionHeader({
  title,
  description,
  actions,
  titleAs: TitleTag = 'h2',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cx('ez-section-header', className)}>
      <div>
        <TitleTag className="ez-section-title">{title}</TitleTag>
        {description ? <p className="ez-section-desc">{description}</p> : null}
      </div>
      {actions ? <div className="ez-page-actions">{actions}</div> : null}
    </div>
  );
}
