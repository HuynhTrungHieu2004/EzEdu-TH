import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { questionApi } from '../api/questionApi';
import type { QuestionSetResponse } from '../api/questionApi';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Chip,
  ChipGroup,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  RadioCard,
  Skeleton,
} from '../components/ui';
import './question-set.css';
import './dashboard.css';

const COUNTS = [3, 5, 10, 15, 20];

const DIFFICULTIES = [
  { value: 'easy', title: 'Dễ', description: 'Nhận biết & thông hiểu' },
  { value: 'medium', title: 'Trung bình', description: 'Vận dụng thấp' },
  { value: 'hard', title: 'Khó', description: 'Vận dụng cao' },
];

const BLOOM_LEVELS = [
  { value: 'remember', title: 'Nhận biết', description: 'Ghi nhớ, liệt kê, nhận diện' },
  { value: 'understand', title: 'Thông hiểu', description: 'Giải thích, so sánh, tóm tắt' },
  { value: 'apply', title: 'Vận dụng', description: 'Áp dụng vào tình huống thực tế' },
  { value: 'analyze', title: 'Vận dụng cao', description: 'Phân tích, đánh giá, sáng tạo' },
];

const QUESTION_TYPES = [
  { value: 'multiple_choice', title: 'Trắc nghiệm', description: '4 lựa chọn A-B-C-D' },
  { value: 'true_false', title: 'Đúng / Sai', description: 'Đúng hoặc Sai' },
  { value: 'short_answer', title: 'Tự luận ngắn', description: 'Điền khuyết / tự luận' },
];

function typeLabel(value: string): string {
  return QUESTION_TYPES.find((item) => item.value === value)?.title ?? value;
}

function difficultyLabel(value: string): string {
  return DIFFICULTIES.find((item) => item.value === value)?.title ?? value;
}

/**
 * Bước cấu hình & sinh câu hỏi — nơi DUY NHẤT trong ứng dụng thực hiện việc
 * này, dù vào từ học liệu đã có sẵn (`/documents/:id/questions`) hay từ luồng
 * tải nhanh vừa xử lý xong (`QuickGeneratePage` điều hướng tới đây khi sẵn
 * sàng). Trước đây `QuickGeneratePage` tự dựng lại một bộ cấu hình + kết quả
 * riêng, trùng lặp hoàn toàn với trang này — hai nơi cùng làm một việc theo
 * hai cách khác nhau. Xem docs/ui-redesign/01-audit-report.md §6.3 (lỗi M1).
 */
export default function QuestionGeneratePage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();

  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [historySets, setHistorySets] = useState<QuestionSetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);

  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [bloomLevel, setBloomLevel] = useState('understand');
  const [questionType, setQuestionType] = useState('multiple_choice');

  const fetchHistory = useCallback(async () => {
    if (!documentId) return;
    try {
      const history = await questionApi.listByDocument(documentId);
      setHistorySets(history);
    } catch {
      // Lịch sử là thông tin phụ; lỗi ở đây không cần làm hỏng cả trang.
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;

    async function load() {
      try {
        const doc = await documentApi.get(documentId as string);
        if (cancelled) return;
        setDocument(doc);
        await fetchHistory();
      } catch (err: unknown) {
        if (cancelled) return;
        if (isUnauthorizedError(err)) {
          localStorage.removeItem('access_token');
          navigate('/login');
          return;
        }
        setLoadError('Không tải được thông tin học liệu hoặc lịch sử sinh đề.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [documentId, fetchHistory, navigate]);

  async function handleGenerate() {
    if (!documentId || generating || count <= 0) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await questionApi.generate(documentId, count, difficulty, questionType, bloomLevel);
      navigate(`/question-sets/${response.id}`);
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) ?? 'Sinh câu hỏi thất bại. Vui lòng kiểm tra lại cấu hình hoặc thử lại sau.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="16rem" />
      </div>
    );
  }

  if (loadError || !document) {
    return (
      <ErrorState
        title="Không tải được học liệu"
        description={loadError ?? undefined}
        actions={<Button onClick={() => navigate('/documents')}>Về danh sách học liệu</Button>}
      />
    );
  }

  return (
    <>
      <PageHeader
        backTo={`/documents/${documentId}`}
        backLabel="Quay lại chi tiết học liệu"
        eyebrow="Sinh câu hỏi"
        title={document.original_filename}
        description={`Tạo bộ câu hỏi kiểm tra năng lực bám sát nội dung ${document.media_kind === 'video' ? 'video' : 'tài liệu'} này.`}
      />

      {error && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-6)' }}>
          {error}
        </Alert>
      )}

      <div className="qs-questions-list">
        <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">Cấu hình bộ câu hỏi</CardTitle>
              <p className="ez-card-desc">Tuỳ chỉnh số lượng, độ khó, mức vận dụng và dạng câu hỏi.</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="ez-stack-lg">
              <div>
                <h3 className="ez-label" style={{ marginBottom: 'var(--ez-space-2)' }}>Số lượng câu hỏi</h3>
                <ChipGroup label="Số lượng câu hỏi">
                  {COUNTS.map((c) => (
                    <Chip key={c} selected={count === c} onClick={() => setCount(c)}>
                      {c} câu
                    </Chip>
                  ))}
                </ChipGroup>
              </div>

              <div>
                <h3 className="ez-label" style={{ marginBottom: 'var(--ez-space-2)' }}>Mức độ khó</h3>
                <div className="qs-audience-list">
                  {DIFFICULTIES.map((item) => (
                    <RadioCard
                      key={item.value}
                      name="difficulty"
                      title={item.title}
                      description={item.description}
                      checked={difficulty === item.value}
                      onChange={() => setDifficulty(item.value)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="ez-label" style={{ marginBottom: 'var(--ez-space-2)' }}>Mức vận dụng (Bloom&apos;s Taxonomy)</h3>
                <div className="qs-audience-list">
                  {BLOOM_LEVELS.map((item) => (
                    <RadioCard
                      key={item.value}
                      name="bloom-level"
                      title={item.title}
                      description={item.description}
                      checked={bloomLevel === item.value}
                      onChange={() => setBloomLevel(item.value)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="ez-label" style={{ marginBottom: 'var(--ez-space-2)' }}>Dạng câu hỏi</h3>
                <div className="qs-audience-list">
                  {QUESTION_TYPES.map((item) => (
                    <RadioCard
                      key={item.value}
                      name="question-type"
                      title={item.title}
                      description={item.description}
                      checked={questionType === item.value}
                      onChange={() => setQuestionType(item.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--ez-space-6)' }}>
          <Button
            size="lg"
            loading={generating}
            disabled={count <= 0}
            leadingIcon={<Sparkles size={18} aria-hidden="true" />}
            onClick={() => setConfirmGenerateOpen(true)}
          >
            {generating ? 'AI đang đọc và tạo câu hỏi...' : `Sinh ${count} câu hỏi bằng AI`}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Lịch sử đề đã sinh cho học liệu này</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            {historySets.length === 0 ? (
              <EmptyState compact title="Chưa có bộ đề nào" description="Tài liệu này chưa từng được sinh câu hỏi." />
            ) : (
              historySets.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  className="dash-row"
                  style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}
                  onClick={() => navigate(`/question-sets/${set.id}`)}
                >
                  <span className="dash-row-main">
                    <span className="dash-row-title">
                      Bộ đề {set.question_count} câu ({typeLabel(set.question_type)})
                    </span>
                    <span className="dash-row-meta">
                      <span>Độ khó: {difficultyLabel(set.difficulty)}</span>
                      <span>{new Date(set.created_at).toLocaleDateString('vi-VN')}</span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmGenerateOpen}
        onClose={generating ? () => undefined : () => setConfirmGenerateOpen(false)}
        onConfirm={() => void handleGenerate()}
        title={`Sinh ${count} câu hỏi bằng AI?`}
        description={`Phạm vi xử lý: 1 học liệu “${document.original_filename}”. Hệ thống sẽ gọi dịch vụ AI để tạo ${count} câu hỏi ${typeLabel(questionType).toLocaleLowerCase('vi-VN')} ở mức ${difficultyLabel(difficulty).toLocaleLowerCase('vi-VN')}.`}
        confirmLabel="Bắt đầu sinh câu hỏi"
        confirmVariant="primary"
        confirmDisabled={count <= 0}
        busy={generating}
      >
        <Alert tone="warning">
          Thao tác này sử dụng quota AI. Không đóng trang hoặc gửi lại trong khi hệ thống đang xử lý.
        </Alert>
      </ConfirmDialog>
    </>
  );
}
