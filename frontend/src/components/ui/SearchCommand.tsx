import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from './Input';
import type { ToolDefinition } from '../../data/toolRegistry';
import { searchTools, trackRecentTool } from '../../data/toolRegistry';

export interface SearchCommandProps {
  placeholder: string;
  tools: ToolDefinition[];
}

/**
 * Ô tìm kiếm lớn ở đầu dashboard — gõ để lọc nhanh trong các công cụ AI đang
 * có, Enter/bấm chọn điều hướng thẳng tới công cụ đó. Không phải command
 * palette đầy đủ (không cần thêm dependency mới) — chỉ lọc trên danh sách
 * công cụ đã đăng ký ở `data/toolRegistry.ts`.
 */
export function SearchCommand({ placeholder, tools }: SearchCommandProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => (query.trim() ? searchTools(tools, query).slice(0, 6) : []), [tools, query]);

  function openTool(tool: ToolDefinition) {
    trackRecentTool(tool.id);
    setOpen(false);
    setQuery('');
    navigate(tool.href);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (matches.length > 0) {
      openTool(matches[0]);
    } else if (query.trim()) {
      navigate(`/tools?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <form onSubmit={handleSubmit}>
        <Input
          leadingIcon={<Search size={20} aria-hidden="true" />}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          aria-label={placeholder}
          style={{
            height: 56,
            fontSize: 'var(--ez-text-h6)',
            borderRadius: 'var(--ez-radius-xl)',
            paddingLeft: 'var(--ez-space-10)',
          }}
        />
      </form>
      {open && matches.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 'var(--ez-z-dropdown)',
            background: 'var(--ez-surface)',
            border: '1px solid var(--ez-border)',
            borderRadius: 'var(--ez-radius-lg)',
            boxShadow: 'var(--ez-shadow-lg)',
            overflow: 'hidden',
          }}
        >
          {matches.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={() => openTool(tool)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--ez-space-3)',
                  width: '100%',
                  padding: 'var(--ez-space-3) var(--ez-space-4)',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'var(--ez-text)',
                }}
                className="ez-search-command-option"
              >
                <Icon size={18} aria-hidden="true" />
                <span>
                  <span style={{ display: 'block', fontWeight: 'var(--ez-weight-medium)' }}>{tool.title}</span>
                  <span style={{ display: 'block', fontSize: 'var(--ez-text-caption)', color: 'var(--ez-text-secondary)' }}>
                    {tool.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
