import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Pin,
  Trash2,
  RefreshCw,
  Search,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { chatApi } from '../../api/chatApi';
import type { ConversationResponse } from '../../types/chat';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Skeleton,
} from '../../components/ui';
import '../dashboard.css';

type LoadState = 'loading' | 'ready' | 'error';

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return formatDateTime(value);
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case 'general': return 'Chung';
    case 'document': return 'Tài liệu';
    case 'multiple_documents': return 'Nhiều tài liệu';
    case 'all_documents': return 'Toàn bộ học liệu';
    case 'web_only': return 'Web';
    default: return scope;
  }
}

function scopeColor(scope: string): 'primary' | 'success' | 'warning' | 'neutral' {
  switch (scope) {
    case 'general': return 'neutral';
    case 'web_only': return 'success';
    case 'document':
    case 'multiple_documents':
    case 'all_documents': return 'primary';
    default: return 'neutral';
  }
}

export default function ChatHistoryPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchValue), 350);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadState('loading');
    setConversations([]);
    setCursor(null);
    setHasMore(false);
    try {
      const data = await chatApi.listConversations(
        { search: debouncedSearch || undefined, limit: 20 },
        signal
      );
      setConversations(data.conversations ?? []);
      setCursor(data.next_cursor ?? null);
      setHasMore(data.has_more ?? false);
      setLoadState('ready');
    } catch {
      if (signal?.aborted) return;
      setLoadState('error');
    }
  }, [debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await chatApi.listConversations({ cursor, limit: 20 });
      setConversations((prev) => [...prev, ...(data.conversations ?? [])]);
      setCursor(data.next_cursor ?? null);
      setHasMore(data.has_more ?? false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePin = async (conv: ConversationResponse) => {
    setPinningId(conv.id);
    try {
      const updated = await chatApi.patchConversation(conv.id, { is_pinned: !conv.is_pinned });
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
          .sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          })
      );
    } finally {
      setPinningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa cuộc hội thoại này? Hành động không thể hoàn tác.')) return;
    setDeletingId(id);
    try {
      await chatApi.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const openConversation = (id: string) => {
    navigate('/chat-advanced', { state: { conversationId: id } });
  };

  // Sort: pinned first, then by updated_at
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const pinnedConvs = sortedConversations.filter((c) => c.is_pinned);
  const regularConvs = sortedConversations.filter((c) => !c.is_pinned);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <PageHeader
        title="Lịch sử trò chuyện AI"
        description="Xem lại và tiếp tục các cuộc hội thoại trước đó với trợ lý AI"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/chat-advanced')}
          >
            + Cuộc hội thoại mới
          </Button>
        }
      />

      {/* Search */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Input
          id="chat-history-search"
          type="search"
          placeholder="Tìm kiếm cuộc hội thoại..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          leadingIcon={<Search size={16} />}
        />
      </div>

      {/* Loading */}
      {loadState === 'loading' && (
        <div className="ez-stack">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height="80px" />
          ))}
        </div>
      )}

      {/* Error */}
      {loadState === 'error' && (
        <ErrorState
          title="Không tải được lịch sử"
          description="Đã xảy ra lỗi khi tải danh sách cuộc hội thoại."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCw size={14} /> Thử lại
            </Button>
          }
        />
      )}

      {/* Empty */}
      {loadState === 'ready' && conversations.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={40} />}
          title={debouncedSearch ? 'Không tìm thấy cuộc hội thoại nào' : 'Chưa có cuộc hội thoại nào'}
          description={
            debouncedSearch
              ? `Không có kết quả cho "${debouncedSearch}". Thử từ khóa khác.`
              : 'Bắt đầu hỏi đáp AI để tạo cuộc hội thoại đầu tiên!'
          }
          actions={
            !debouncedSearch ? (
              <Button variant="primary" onClick={() => navigate('/chat-advanced')}>
                Bắt đầu hỏi đáp AI
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Conversation list */}
      {loadState === 'ready' && conversations.length > 0 && (
        <div className="ez-stack">
          {/* Pinned section */}
          {pinnedConvs.length > 0 && (
            <div>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--ez-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}>
                <Pin size={12} /> Đã ghim
              </div>
              <div className="ez-stack-sm">
                {pinnedConvs.map((conv) => (
                  <ConversationCard
                    key={conv.id}
                    conv={conv}
                    onOpen={openConversation}
                    onPin={handlePin}
                    onDelete={handleDelete}
                    pinning={pinningId === conv.id}
                    deleting={deletingId === conv.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regular section */}
          {regularConvs.length > 0 && (
            <div>
              {pinnedConvs.length > 0 && (
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--ez-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: '0.5rem',
                }}>
                  Tất cả cuộc hội thoại
                </div>
              )}
              <div className="ez-stack-sm">
                {regularConvs.map((conv) => (
                  <ConversationCard
                    key={conv.id}
                    conv={conv}
                    onOpen={openConversation}
                    onPin={handlePin}
                    onDelete={handleDelete}
                    pinning={pinningId === conv.id}
                    deleting={deletingId === conv.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.5rem' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Đang tải...' : (
                  <><ChevronDown size={16} /> Tải thêm</>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ConvCardProps {
  conv: ConversationResponse;
  onOpen: (id: string) => void;
  onPin: (conv: ConversationResponse) => void;
  onDelete: (id: string) => void;
  pinning: boolean;
  deleting: boolean;
}

function ConversationCard({ conv, onOpen, onPin, onDelete, pinning, deleting }: ConvCardProps) {
  return (
    <Card
      style={{
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        borderColor: conv.is_pinned ? 'var(--ez-primary)' : undefined,
        opacity: deleting ? 0.5 : 1,
      }}
      onClick={() => onOpen(conv.id)}
    >
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          {/* Icon */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '10px',
            background: 'var(--ez-primary-subtle)',
            color: 'var(--ez-primary)',
            flexShrink: 0,
          }}>
            <MessageSquare size={18} />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
              <span style={{
                fontWeight: 600,
                fontSize: '0.9rem',
                color: 'var(--ez-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '350px',
              }}>
                {conv.title || 'Cuộc hội thoại chưa đặt tên'}
              </span>
              {conv.is_pinned && (
                <Pin size={12} style={{ color: 'var(--ez-primary)', flexShrink: 0 }} />
              )}
              <Badge variant={scopeColor(conv.scope)} size="sm">
                {scopeLabel(conv.scope)}
              </Badge>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              fontSize: '0.78rem',
              color: 'var(--ez-text-muted)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={12} />
                {formatRelativeTime(conv.updated_at)}
              </span>
              <span>Tạo lúc {formatDateTime(conv.created_at)}</span>
            </div>
          </div>

          {/* Actions */}
          <div
            style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              title={conv.is_pinned ? 'Bỏ ghim' : 'Ghim cuộc hội thoại'}
              disabled={pinning}
              onClick={() => onPin(conv)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: conv.is_pinned ? 'var(--ez-primary)' : 'var(--ez-text-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--ez-surface-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <Pin size={15} />
            </button>
            <button
              type="button"
              title="Xóa cuộc hội thoại"
              disabled={deleting}
              onClick={() => onDelete(conv.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--ez-text-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = 'var(--ez-error-subtle)';
                btn.style.color = 'var(--ez-error)';
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = 'transparent';
                btn.style.color = 'var(--ez-text-muted)';
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
