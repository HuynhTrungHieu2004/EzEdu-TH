import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Plus } from 'lucide-react';
import { examBankApi } from '../../api/examBankApi';
import type { QuestionBankItem, QuestionBankStatus } from '../../api/examBankApi';
import { getApiErrorDetail } from '../../api/errors';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  PageHeader,
  Select,
  SkeletonText,
} from '../../components/ui';
import '../question-set.css';
import '../dashboard.css';

const STATUS_LABEL: Record<QuestionBankStatus, string> = {
  draft: 'Nháp',
  reviewing: 'Đang duyệt',
  approved: 'Đã duyệt',
  published: 'Đã xuất bản',
  archived: 'Đã lưu trữ',
};

const STATUS_VARIANT: Record<QuestionBankStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  reviewing: 'warning',
  approved: 'success',
  published: 'success',
  archived: 'neutral',
};

const BLOOM_LABEL: Record<string, string> = {
  remember: 'Nhận biết',
  understand: 'Thông hiểu',
  apply: 'Vận dụng',
  analyze: 'Vận dụng cao',
};

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' };

/**
 * Ngân hàng câu hỏi — dùng chung nhiều đề, tách khỏi `question_sets` hiện có
 * (xem docs/feature-expansion/02-data-model-plan.md). Chỉ giáo viên/admin
 * dùng được — route đã gate qua RoleRoute ở App.tsx, không cần kiểm tra lại
 * ở đây.
 */
export default function QuestionBankPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<QuestionBankStatus | ''>('');
  const [bloomFilter, setBloomFilter] = useState<string>('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approve' | 'archive' | null>(null);

  const fetchQuestions = useCallback(async () => {
    setError(null);
    try {
      const response = await examBankApi.listQuestions({
        status: statusFilter || undefined,
        bloom_level: (bloomFilter || undefined) as never,
        difficulty: (difficultyFilter || undefined) as never,
        limit: 100,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Không tải được ngân hàng câu hỏi.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, bloomFilter, difficultyFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetchQuestions();
  }, [fetchQuestions]);

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    setActionError(null);
    try {
      await examBankApi.bulkApprove(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkAction(null);
      await fetchQuestions();
    } catch (err) {
      setActionError(getApiErrorDetail(err) ?? 'Duyệt hàng loạt thất bại.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkArchive() {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    setActionError(null);
    try {
      await examBankApi.bulkArchive(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkAction(null);
      await fetchQuestions();
    } catch (err) {
      setActionError(getApiErrorDetail(err) ?? 'Lưu trữ hàng loạt thất bại.');
    } finally {
      setBulkBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Không tải được ngân hàng câu hỏi" description={error} actions={<Button onClick={() => void fetchQuestions()}>Thử lại</Button>} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Ngân hàng câu hỏi"
        title="Ngân hàng câu hỏi"
        description={`${total} câu hỏi — dùng chung cho nhiều ma trận đề, khác với bộ câu hỏi sinh nhanh theo tài liệu.`}
        actions={
          <Button leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={() => navigate('/exam-blueprints')}>
            Tạo ma trận đề
          </Button>
        }
      />

      {actionError && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>
          {actionError}
        </Alert>
      )}

      {/* Cùng một thanh lọc như các trang danh sách khác thay vì grid inline riêng */}
      <div style={{ marginBottom: 'var(--ez-space-6)' }}>
        <FilterBar columns={3}>
        <FormField label="Trạng thái">
          <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as QuestionBankStatus | '')}
              options={[
                { value: '', label: 'Mọi trạng thái' },
                { value: 'draft', label: 'Nháp' },
                { value: 'reviewing', label: 'Đang duyệt' },
                { value: 'approved', label: 'Đã duyệt' },
                { value: 'published', label: 'Đã xuất bản' },
                { value: 'archived', label: 'Đã lưu trữ' },
              ]}
          />
        </FormField>
        <FormField label="Mức Bloom">
          <Select
              value={bloomFilter}
              onChange={(e) => setBloomFilter(e.target.value)}
              options={[
                { value: '', label: 'Mọi mức Bloom' },
                { value: 'remember', label: 'Nhận biết' },
                { value: 'understand', label: 'Thông hiểu' },
                { value: 'apply', label: 'Vận dụng' },
                { value: 'analyze', label: 'Vận dụng cao' },
              ]}
          />
        </FormField>
        <FormField label="Độ khó">
          <Select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              options={[
                { value: '', label: 'Mọi độ khó' },
                { value: 'easy', label: 'Dễ' },
                { value: 'medium', label: 'Trung bình' },
                { value: 'hard', label: 'Khó' },
              ]}
          />
        </FormField>
        </FilterBar>
      </div>

      {selectedIds.size > 0 && (
        <Card variant="muted" style={{ marginBottom: 'var(--ez-space-4)' }}>
          <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--ez-space-3)' }}>
            <span>
              <CheckSquare size={16} aria-hidden="true" style={{ marginRight: 'var(--ez-space-2)' }} />
              Đã chọn {selectedIds.size} câu hỏi
            </span>
            <div style={{ display: 'flex', gap: 'var(--ez-space-2)' }}>
              <Button size="sm" disabled={bulkBusy} onClick={() => setBulkAction('approve')}>
                Duyệt hàng loạt
              </Button>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => setBulkAction('archive')}>
                Lưu trữ hàng loạt
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Danh sách câu hỏi</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          {items.length === 0 ? (
            <EmptyState
              compact
              title="Chưa có câu hỏi nào trong ngân hàng"
              description="Đưa câu hỏi từ bộ đề đã sinh vào ngân hàng, hoặc tạo thủ công, để dùng cho ma trận đề."
            />
          ) : (
            items.map((item) => (
              <div key={item.id} className="dash-row" style={{ alignItems: 'flex-start' }}>
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  label="Chọn"
                  aria-label={`Chọn câu hỏi: ${item.content}`}
                />
                <span className="dash-row-main">
                  <span className="dash-row-title">{item.content}</span>
                  <span className="dash-row-meta">
                    <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                    <span>{BLOOM_LABEL[item.bloom_level] ?? item.bloom_level}</span>
                    <span>{DIFFICULTY_LABEL[item.difficulty] ?? item.difficulty}</span>
                    <span>{item.points} điểm</span>
                    {item.usage_count > 0 && <span>Đã dùng {item.usage_count} lần</span>}
                  </span>
                </span>
              </div>
            ))
          )}
        </CardBody>
      </Card>
      <ConfirmDialog
        open={bulkAction !== null}
        onClose={bulkBusy ? () => undefined : () => setBulkAction(null)}
        onConfirm={() => {
          if (bulkAction === 'approve') void handleBulkApprove();
          else if (bulkAction === 'archive') void handleBulkArchive();
        }}
        title={bulkAction === 'approve' ? 'Duyệt câu hỏi hàng loạt?' : 'Lưu trữ câu hỏi hàng loạt?'}
        description={`${selectedIds.size} câu hỏi đã chọn sẽ được xử lý trong ngân hàng câu hỏi. ${
          bulkAction === 'archive'
            ? 'Câu hỏi lưu trữ không còn sẵn sàng cho các luồng tạo đề; có thể đổi trạng thái lại sau.'
            : 'Chỉ những câu ở trạng thái hợp lệ và thuộc quyền của bạn mới được duyệt.'
        }`}
        confirmLabel={bulkAction === 'approve' ? 'Duyệt câu hỏi' : 'Lưu trữ'}
        busy={bulkBusy}
      />
    </>
  );
}
