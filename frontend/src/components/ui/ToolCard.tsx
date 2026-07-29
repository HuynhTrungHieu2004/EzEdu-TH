import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardBody } from './Card';
import { Badge } from './Badge';

export interface ToolCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  roleLabel?: string;
  onOpen?: () => void;
}

/** Thẻ công cụ dùng trong Thư viện công cụ AI và các danh sách công cụ gợi ý. */
export function ToolCard({ icon, title, description, href, roleLabel, onOpen }: ToolCardProps) {
  return (
    <Card interactive style={{ height: '100%' }}>
      <Link
        to={href}
        onClick={onOpen}
        style={{ display: 'block', height: '100%', color: 'inherit', textDecoration: 'none' }}
      >
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ez-space-3)', height: '100%' }}>
          <div
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 'var(--ez-radius-md)',
              background: 'var(--ez-primary-subtle)',
              color: 'var(--ez-primary)',
            }}
          >
            {icon}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 'var(--ez-text-h6)', fontWeight: 'var(--ez-weight-semibold)' }}>{title}</h3>
            <p style={{ margin: 'var(--ez-space-1) 0 0', color: 'var(--ez-text-secondary)', fontSize: 'var(--ez-text-body-sm)' }}>
              {description}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {roleLabel ? <Badge variant="neutral">{roleLabel}</Badge> : <span />}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--ez-space-1)',
                color: 'var(--ez-primary)',
                fontSize: 'var(--ez-text-body-sm)',
                fontWeight: 'var(--ez-weight-medium)',
              }}
            >
              Mở
              <ArrowRight size={14} aria-hidden="true" />
            </span>
          </div>
        </CardBody>
      </Link>
    </Card>
  );
}
