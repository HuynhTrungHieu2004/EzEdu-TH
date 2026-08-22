import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { curriculumKbApi } from '../api/curriculumKbApi';
import type { CurriculumSearchResultItem, CurriculumSource, CurriculumReviewStatus } from '../api/curriculumKbApi';
import { getApiErrorDetail } from '../api/errors';
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
  Textarea,
} from '../components/ui';
import './question-set.css';
import './dashboard.css';

const REVIEW_LABEL: Record<CurriculumReviewStatus, string> = {
  draft: 'Nháp',
  reviewing: 'Đang duyệt',
  approved: 'Đã duyệt',
  published: 'Đã xuất bản',
  archived: 'Đã lưu trữ',
};

const NEXT_STATUS: Partial<Record<CurriculumReviewStatus, CurriculumReviewStatus>> = {
  draft: 'reviewing',
  reviewing: 'approved',
  approved: 'published',
};

const NEXT_LABEL: Partial<Record<CurriculumReviewStatus, string>> = {
  draft: 'Gửi duyệt',
  reviewing: 'Duyệt',
  approved: 'Xuất bản',
};

const INGEST_LABEL: Record<string, string> = {
  not_ingested: 'Chưa nạp',
  pending: 'Đang xếp hàng nạp…',
  ingested: 'Đã nạp vào kho',
  failed: 'Nạp thất bại',
};

/**
 * Kho tri thức chuẩn — tìm kiếm nội dung đã qua kiểm duyệt (khác "Khám phá
 * kiến thức Internet" ở chỗ đây chỉ tìm trong nội dung đã được giáo viên
 * duyệt VÀ nạp vào kho, không gọi AI/Internet trực tiếp mỗi lần tìm).
 */
export default function CurriculumKbPage() {
  const { area } = useAuth();
  const isTeacher = area === 'teacher';

  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<CurriculumSearchResultItem[] | null>(null);

  const [mySources, setMySources] = useState<CurriculumSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadMySources() {
    if (!isTeacher) return;
    setSourcesLoading(true);
    try {
      const response = await curriculumKbApi.listMySources();
      setMySources(response.items);
    } catch {
      // best-effort
    } finally {
      setSourcesLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMySources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const response = await curriculumKbApi.search(query.trim(), subjectFilter ? { subject_id: subjectFilter } : undefined);
      setResults(response.results);
    } catch (err) {
      setSearchError(getApiErrorDetail(err) ?? 'Tìm kiếm thất bại — thử lại.');
    } finally {
      setSearching(false);
    }
  }

  async function handleCreate() {
    if (!title.trim() || !content.trim() || !subjectId.trim()) return;
    setCreating(true);
    setActionMessage(null);
    try {
      await curriculumKbApi.createSource({ title: title.trim(), content_text: content.trim(), subject_id: subjectId.trim() });
      setTitle('');
      setContent('');
      setSubjectId('');
      await loadMySources();
    } catch (err) {
      setActionMessage(getApiErrorDetail(err) ?? 'Tạo nguồn thất bại.');
    } finally {
      setCreating(false);
    }
  }

  async function handleAdvance(source: CurriculumSource) {
    const target = NEXT_STATUS[source.review_status];
    if (!target) return;
    setActionId(source.id);
    try {
      const updated = await curriculumKbApi.reviewSource(source.id, source.version, target);
      setMySources((current) => current.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setActionMessage(getApiErrorDetail(err) ?? 'Cập nhật trạng thái thất bại.');
    } finally {
      setActionId(null);
    }
  }

  async function handleIngest(source: CurriculumSource) {
    setActionId(source.id);
    try {
      await curriculumKbApi.ingestSource(source.id);
      await loadMySources();
    } catch (err) {
      setActionMessage(getApiErrorDetail(err) ?? 'Nạp vào kho thất bại.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Kho tri thức chuẩn"
        title="Kho tri thức chuẩn"
        description="Tìm kiếm nội dung giáo khoa đã được giáo viên kiểm duyệt và nạp vào kho — khác 'Khám phá kiến thức Internet' (tra cứu trực tiếp qua AI mỗi lần)."
      />

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody className="ez-stack">
          <div style={{ display: 'flex', gap: 'var(--ez-space-3)' }}>
            <Input
              placeholder="Nhập từ khoá cần tìm…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              style={{ flex: 2 }}
            />
            <Input
              placeholder="Mã môn (vd: math)"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button loading={searching} onClick={() => void handleSearch()}>
              Tìm kiếm
            </Button>
          </div>
          {searchError && <Alert tone="error">{searchError}</Alert>}
        </CardBody>
      </Card>

      {searching && <SkeletonText lines={4} />}

      {results && !searching && (
        <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">Kết quả ({results.length})</CardTitle>
            </div>
          </CardHeader>
          <CardBody className="ez-stack">
            {results.length === 0 ? (
              <EmptyState compact title="Không tìm thấy nội dung phù hợp trong kho" />
            ) : (
              results.map((r, idx) => (
                <div key={idx} className="dash-row" style={{ alignItems: 'flex-start' }}>
                  <span className="dash-row-main">
                    <span className="dash-row-title">{r.title}</span>
                    <span className="dash-row-meta">
                      <span>{r.chunk_text}</span>
                    </span>
                    <span className="dash-row-meta">
                      <Badge variant="neutral">{r.subject_id}</Badge>
                      {r.grade && <Badge variant="neutral">Lớp {r.grade}</Badge>}
                      <span>Độ liên quan: {Math.round(r.relevance_score * 100)}%</span>
                    </span>
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      )}

      {isTeacher && (
        <>
          {actionMessage && (
            <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>
              {actionMessage}
            </Alert>
          )}

          <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
            <CardHeader>
              <div>
                <CardTitle as="h2">Thêm nguồn thủ công</CardTitle>
              </div>
            </CardHeader>
            <CardBody className="ez-stack">
              <Input placeholder="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder="Mã môn (vd: math)" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
              <Textarea placeholder="Nội dung tri thức chuẩn…" rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
              <Button loading={creating} onClick={() => void handleCreate()}>
                Tạo nguồn (bản nháp)
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Nguồn tri thức của tôi</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              {sourcesLoading ? (
                <SkeletonText lines={4} />
              ) : mySources.length === 0 ? (
                <EmptyState compact title="Chưa có nguồn tri thức nào" />
              ) : (
                mySources.map((source) => (
                  <div key={source.id} className="dash-row">
                    <span className="dash-row-main">
                      <span className="dash-row-title">{source.title}</span>
                      <span className="dash-row-meta">
                        <Badge variant={source.review_status === 'published' ? 'success' : 'neutral'}>
                          {REVIEW_LABEL[source.review_status]}
                        </Badge>
                        <Badge variant={source.ingest_status === 'ingested' ? 'success' : source.ingest_status === 'failed' ? 'error' : 'neutral'}>
                          {INGEST_LABEL[source.ingest_status]}
                        </Badge>
                        {source.chunk_count > 0 && <span>{source.chunk_count} đoạn</span>}
                      </span>
                    </span>
                    <div style={{ display: 'flex', gap: 'var(--ez-space-2)' }}>
                      {NEXT_STATUS[source.review_status] && (
                        <Button size="sm" variant="outline" loading={actionId === source.id} onClick={() => void handleAdvance(source)}>
                          {NEXT_LABEL[source.review_status]}
                        </Button>
                      )}
                      {(source.review_status === 'approved' || source.review_status === 'published') &&
                        source.ingest_status !== 'ingested' && (
                          <Button size="sm" loading={actionId === source.id} onClick={() => void handleIngest(source)}>
                            Nạp vào kho
                          </Button>
                        )}
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
