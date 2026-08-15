import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import {
  TOOL_CATEGORY_LABEL,
  getRecentToolIds,
  searchTools,
  toolsForRole,
  toolsEnabledBy,
  trackRecentTool,
} from '../data/toolRegistry';
import type { ToolCategory } from '../data/toolRegistry';
import { Chip, ChipGroup, EmptyState, Input, PageHeader, ToolCard } from '../components/ui';
import './dashboard.css';

type FilterValue = 'all' | 'recent' | ToolCategory;

/**
 * Thư viện công cụ AI — nơi duy nhất liệt kê MỌI công cụ đang hoạt động thật,
 * phân loại theo nhóm. Không hiện công cụ chưa có backend (đúng yêu cầu
 * "không tạo hàng chục công cụ giả").
 */
export default function ToolLibraryPage() {
  const { area } = useAuth();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [filter, setFilter] = useState<FilterValue>('all');

  const role = area === 'teacher' ? 'teacher' : 'student';
  const { isEnabled } = useFeatureFlags();
  const myTools = useMemo(() => toolsEnabledBy(toolsForRole(role), isEnabled), [role, isEnabled]);

  const categories = useMemo(() => {
    const set = new Set(myTools.map((t) => t.category));
    return Array.from(set);
  }, [myTools]);

  const recentIds = useMemo(() => getRecentToolIds(), []);

  const filtered = useMemo(() => {
    let base = myTools;
    if (filter === 'recent') {
      base = recentIds.map((id) => myTools.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
    } else if (filter !== 'all') {
      base = base.filter((t) => t.category === filter);
    }
    return searchTools(base, query);
  }, [myTools, filter, query, recentIds]);

  return (
    <>
      <PageHeader
        eyebrow="Công cụ AI"
        title="Thư viện công cụ AI"
        description="Toàn bộ công cụ bạn có thể dùng, phân loại theo mục đích."
      />

      <div className="ez-stack" style={{ marginBottom: 'var(--ez-space-6)' }}>
        <Input
          leadingIcon={<Search size={18} aria-hidden="true" />}
          placeholder="Tìm công cụ theo tên hoặc mô tả…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm công cụ"
        />
        <ChipGroup label="Lọc công cụ theo nhóm">
          <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
            Tất cả
          </Chip>
          {categories.map((cat) => (
            <Chip key={cat} selected={filter === cat} onClick={() => setFilter(cat)}>
              {TOOL_CATEGORY_LABEL[cat]}
            </Chip>
          ))}
          {recentIds.length > 0 && (
            <Chip selected={filter === 'recent'} onClick={() => setFilter('recent')}>
              Gần đây
            </Chip>
          )}
        </ChipGroup>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Không tìm thấy công cụ phù hợp"
          description="Thử từ khoá khác hoặc chọn lại bộ lọc."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 'var(--ez-space-5)',
          }}
        >
          {filtered.map((tool) => (
            <ToolCard
              key={tool.id}
              icon={<tool.icon size={20} aria-hidden="true" />}
              title={tool.title}
              description={tool.description}
              href={tool.href}
              roleLabel={tool.roles.length > 1 ? 'Giáo viên & Học sinh' : tool.roles[0] === 'teacher' ? 'Giáo viên' : 'Học sinh'}
              onOpen={() => trackRecentTool(tool.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
