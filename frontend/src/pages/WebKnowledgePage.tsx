import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { webKnowledgeApi } from '../api/webKnowledgeApi';
import type { ExploreResult, WebKnowledgeSource, WebKnowledgeSourceStatus } from '../api/webKnowledgeApi';
import { curriculumKbApi } from '../api/curriculumKbApi';
import { getApiErrorDetail } from '../api/errors';
import { CitationPanel } from '../components/chat-advanced/CitationPanel';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  PageHeader,
  SkeletonText,
} from '../components/ui';
import './question-set.css';
import './dashboard.css';

const EVIDENCE_LABEL: Record<string, string> = {
  well_supported: 'Có căn cứ vững chắc',
  partially_supported: 'Có căn cứ một phần',
  insufficient_evidence: 'Chưa đủ bằng chứng',
  conflicting_sources: 'Nguồn mâu thuẫn nhau',
  unverified: 'Chưa kiểm chứng được',
};

const EVIDENCE_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  well_supported: 'success',
  partially_supported: 'warning',
  insufficient_evidence: 'error',
  conflicting_sources: 'error',
  unverified: 'warning',
};

const STATUS_LABEL: Record<WebKnowledgeSourceStatus, string> = {
  draft: 'Nháp',
  reviewing: 'Đang duyệt',
  approved: 'Đã duyệt',
  published: 'Đã xuất bản',
  archived: 'Đã lưu trữ',
};

const NEXT_STATUS: Partial<Record<WebKnowledgeSourceStatus, WebKnowledgeSourceStatus>> = {
  draft: 'reviewing',
  reviewing: 'approved',
  approved: 'published',
};

const NEXT_LABEL: Partial<Record<WebKnowledgeSourceStatus, string>> = {
  draft: 'Gửi duyệt',
  reviewing: 'Duyệt',
  approved: 'Xuất bản',
};

/**
 * Khám phá kiến thức Internet có kiểm chứng — dùng Claude Web Search.
 * Học sinh và giáo viên đều dùng được; chỉ giáo viên lưu kết quả thành học
 * liệu chờ duyệt.
 */
export default function WebKnowledgePage() {
  const { area } = useAuth();
  const isTeacher = area === 'teacher';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [mySources, setMySources] = useState<WebKnowledgeSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function loadMySources() {
    if (!isTeacher) return;
    setSourcesLoading(true);
    try {
      const response = await webKnowledgeApi.listSources();
      setMySources(response.items);
    } catch {
      // best-effort — không chặn trang khám phá nếu tải danh sách lỗi
    } finally {
      setSourcesLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMySources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher]);

  async function handleExplore() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await webKnowledgeApi.explore(query.trim());
      setResult(response);
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Khám phá thất bại — thử lại.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await webKnowledgeApi.saveSource({
        query: result.query,
        answer: result.answer,
        citations: result.citations,
      });
      setSaveMessage('Đã lưu vào học liệu — đang ở trạng thái Nháp, gửi duyệt khi sẵn sàng.');
      await loadMySources();
    } catch (err) {
      setSaveMessage(getApiErrorDetail(err) ?? 'Lưu học liệu thất bại.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvance(source: WebKnowledgeSource) {
    const target = NEXT_STATUS[source.status];
    if (!target) return;
    setReviewingId(source.id);
    try {
      const updated = await webKnowledgeApi.reviewSource(source.id, source.version, target);
      setMySources((current) => current.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setSaveMessage(getApiErrorDetail(err) ?? 'Cập nhật trạng thái thất bại.');
    } finally {
      setReviewingId(null);
    }
  }

  async function handlePromoteToCurriculumKb(source: WebKnowledgeSource) {
    setReviewingId(source.id);
    try {
      await curriculumKbApi.createFromWebKnowledge(source.id);
      setSaveMessage('Đã đưa vào kho tri thức chuẩn — vào trang Kho tri thức chuẩn để nạp và xuất bản.');
    } catch (err) {
      setSaveMessage(getApiErrorDetail(err) ?? 'Đưa vào kho tri thức chuẩn thất bại.');
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Khám phá kiến thức"
        title="Khám phá kiến thức Internet có kiểm chứng"
        description="Tra cứu qua AI có tìm kiếm, ưu tiên nguồn chính thống — trả lời kèm nguồn trích dẫn và độ ưu tiên nguồn (chính phủ/giáo dục cao nhất)."
      />

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody className="ez-stack">
          <div style={{ display: 'flex', gap: 'var(--ez-space-3)' }}>
            <Input
              placeholder="Nhập câu hỏi cần tra cứu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleExplore()}
              style={{ flex: 1 }}
            />
            <Button loading={loading} onClick={() => void handleExplore()}>
              Khám phá
            </Button>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
        </CardBody>
      </Card>

      {loading && (
        <div className="ez-stack">
          <SkeletonText lines={4} />
        </div>
      )}

      {result && !loading && (
        <div className="ez-stack" style={{ marginBottom: 'var(--ez-space-6)' }}>
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Kết quả</CardTitle>
              </div>
              <div style={{ display: 'flex', gap: 'var(--ez-space-2)', alignItems: 'center' }}>
                <Badge variant={EVIDENCE_VARIANT[result.evidence_status] ?? 'warning'}>
                  {EVIDENCE_LABEL[result.evidence_status] ?? result.evidence_status}
                </Badge>
                <span>Độ tin cậy: {Math.round(result.confidence * 100)}%</span>
                {result.from_cache && <Badge variant="neutral">Từ bộ nhớ đệm</Badge>}
              </div>
            </CardHeader>
            <CardBody className="ez-stack">
              <p>{result.answer}</p>
              {isTeacher && (
                <div>
                  <Button size="sm" variant="outline" loading={saving} onClick={() => void handleSave()}>
                    Lưu làm học liệu
                  </Button>
                  {saveMessage && <p style={{ marginTop: 'var(--ez-space-2)' }}>{saveMessage}</p>}
                </div>
              )}
            </CardBody>
          </Card>

          <CitationPanel internalCitations={[]} webCitations={result.citations} focusedCitationId={null} />
        </div>
      )}

      {isTeacher && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Học liệu Internet của tôi</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            {sourcesLoading ? (
              <SkeletonText lines={4} />
            ) : mySources.length === 0 ? (
              <EmptyState compact title="Chưa lưu học liệu nào" description="Khám phá và bấm 'Lưu làm học liệu' để thêm vào đây." />
            ) : (
              mySources.map((source) => (
                <div key={source.id} className="dash-row">
                  <span className="dash-row-main">
                    <span className="dash-row-title">{source.query}</span>
                    <span className="dash-row-meta">
                      <Badge variant={source.status === 'published' ? 'success' : 'neutral'}>
                        {STATUS_LABEL[source.status]}
                      </Badge>
                      <span>{source.citations.length} nguồn trích dẫn</span>
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--ez-space-2)' }}>
                    {NEXT_STATUS[source.status] && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={reviewingId === source.id}
                        onClick={() => void handleAdvance(source)}
                      >
                        {NEXT_LABEL[source.status]}
                      </Button>
                    )}
                    {(source.status === 'approved' || source.status === 'published') && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={reviewingId === source.id}
                        onClick={() => void handlePromoteToCurriculumKb(source)}
                      >
                        Đưa vào kho tri thức chuẩn
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
