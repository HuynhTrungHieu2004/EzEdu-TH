import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { curriculumKbApi } from '../api/curriculumKbApi';
import type {
  CrawlItem,
  CurriculumSearchResultItem,
  CurriculumSource,
  CurriculumReviewStatus,
} from '../api/curriculumKbApi';
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
  FeatureDisabledState,
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
  const navigate = useNavigate();
  const { isEnabled, loading: flagsLoading } = useFeatureFlags();
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
  const [crawlUrls, setCrawlUrls] = useState('');
  const [crawlSubjectId, setCrawlSubjectId] = useState('');
  const [crawlGrade, setCrawlGrade] = useState('');
  const [crawlMaxPages, setCrawlMaxPages] = useState(20);
  const [crawlItems, setCrawlItems] = useState<CrawlItem[]>([]);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null);

  async function loadCrawlItems() {
    if (!isTeacher) return;
    try {
      const response = await curriculumKbApi.listCrawlItems();
      setCrawlItems(response.items);
    } catch {
      // The crawler may be disabled during a staged deployment.
    }
  }

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
    // Phân hệ tắt thì mọi lời gọi chắc chắn 403 — đừng bắn request vô ích.
    if (flagsLoading || !isEnabled('enable_curriculum_kb')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMySources();
    void loadCrawlItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, flagsLoading, isEnabled]);

  async function handleStartCrawl() {
    const seedUrls = crawlUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    if (!seedUrls.length || !crawlSubjectId.trim()) return;
    setCrawlLoading(true);
    setCrawlMessage(null);
    try {
      await curriculumKbApi.createCrawlBatch({
        seed_urls: seedUrls,
        subject_id: crawlSubjectId.trim(),
        grade: crawlGrade ? Number(crawlGrade) : undefined,
        max_pages: crawlMaxPages,
      });
      setCrawlMessage('Đã xếp lịch thu thập. Nội dung tìm được sẽ nằm trong khu cách ly để duyệt.');
      setCrawlUrls('');
      window.setTimeout(() => void loadCrawlItems(), 1800);
    } catch (err) {
      setActionMessage(getApiErrorDetail(err) ?? 'Không thể bắt đầu thu thập nguồn.');
    } finally {
      setCrawlLoading(false);
    }
  }

  async function handleCrawlReview(item: CrawlItem, target: 'reviewing' | 'approved' | 'rejected') {
    setActionId(item.id);
    setActionMessage(null);
    try {
      const updated = await curriculumKbApi.reviewCrawlItem(item.id, target);
      setCrawlItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    } catch (err) {
      setActionMessage(getApiErrorDetail(err) ?? 'Không thể cập nhật nội dung cách ly.');
    } finally {
      setActionId(null);
    }
  }

  async function handlePromoteCrawl(item: CrawlItem) {
    setActionId(item.id);
    setActionMessage(null);
    try {
      await curriculumKbApi.promoteCrawlItem(item.id);
      setCrawlMessage('Đã chuyển nguồn được duyệt vào kho tri thức. Bạn có thể tiếp tục nạp thành các đoạn tìm kiếm.');
      await loadMySources();
    } catch (err) {
      setActionMessage(getApiErrorDetail(err) ?? 'Không thể chuyển nguồn vào kho tri thức.');
    } finally {
      setActionId(null);
    }
  }

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

  // Hai phân hệ này bật/tắt bằng biến môi trường phía backend. Nếu đang tắt thì
  // mọi lời gọi trả 403; trước đây trang vẫn render đủ form và danh sách rỗng
  // nên người dùng tưởng chưa có dữ liệu, bấm gì cũng thất bại không rõ lý do.
  if (!flagsLoading && !isEnabled('enable_curriculum_kb')) {
    return (
      <FeatureDisabledState
        title="Kho tri thức chuẩn đang tắt"
        description="Quản trị viên chưa bật phân hệ này nên chưa thêm, thu thập hay tìm kiếm nguồn tri thức chuẩn được. Bạn vẫn dùng kho học liệu và các công cụ khác như bình thường."
        actions={
          <>
            <Button onClick={() => navigate('/documents')}>Tới kho học liệu</Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Về tổng quan
            </Button>
          </>
        }
      />
    );
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

          <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
            <CardHeader>
              <div>
                <CardTitle as="h2">Thu thập nguồn Internet vào khu cách ly</CardTitle>
              </div>
            </CardHeader>
            <CardBody className="ez-stack">
              <Alert tone="warning">
                Nội dung crawl không được dùng để sinh câu hỏi hay trả lời học sinh cho đến khi giáo viên duyệt và chuyển vào kho tri thức.
              </Alert>
              <Textarea
                placeholder={'Mỗi dòng một URL gốc, ví dụ:\nhttps://example.edu/toan-lop-10'}
                rows={4}
                value={crawlUrls}
                onChange={(event) => setCrawlUrls(event.target.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 'var(--ez-space-3)' }}>
                <Input placeholder="Mã môn (vd: toan)" value={crawlSubjectId} onChange={(event) => setCrawlSubjectId(event.target.value)} />
                <Input type="number" min={1} max={12} placeholder="Lớp" value={crawlGrade} onChange={(event) => setCrawlGrade(event.target.value)} />
                <Input type="number" min={1} max={100} value={crawlMaxPages} onChange={(event) => setCrawlMaxPages(Number(event.target.value))} />
              </div>
              <Button loading={crawlLoading} onClick={() => void handleStartCrawl()}>
                Bắt đầu thu thập có kiểm soát
              </Button>
              {crawlMessage && <Alert tone="success">{crawlMessage}</Alert>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--ez-space-3)' }}>
                <strong>Nội dung đang cách ly ({crawlItems.length})</strong>
                <Button size="sm" variant="ghost" onClick={() => void loadCrawlItems()}>Làm mới</Button>
              </div>
              {crawlItems.length === 0 ? (
                <EmptyState compact title="Chưa có nội dung crawl" />
              ) : crawlItems.map((item) => (
                <div key={item.id} className="dash-row" style={{ alignItems: 'flex-start' }}>
                  <span className="dash-row-main">
                    <span className="dash-row-title">{item.title || item.canonical_url}</span>
                    <span className="dash-row-meta" style={{ wordBreak: 'break-all' }}>{item.canonical_url}</span>
                    <span className="dash-row-meta">
                      <Badge variant={item.review_status === 'approved' ? 'success' : item.crawl_status === 'failed' ? 'error' : 'neutral'}>
                        {item.review_status === 'draft' ? 'Cách ly' : item.review_status === 'reviewing' ? 'Đang duyệt' : item.review_status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}
                      </Badge>
                      <Badge variant="neutral">{item.crawl_status}</Badge>
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--ez-space-2)', flexWrap: 'wrap' }}>
                    {item.crawl_status === 'fetched' && item.review_status === 'draft' && (
                      <Button size="sm" variant="outline" loading={actionId === item.id} onClick={() => void handleCrawlReview(item, 'reviewing')}>Gửi duyệt</Button>
                    )}
                    {item.review_status === 'reviewing' && (
                      <>
                        <Button size="sm" variant="outline" loading={actionId === item.id} onClick={() => void handleCrawlReview(item, 'rejected')}>Từ chối</Button>
                        <Button size="sm" loading={actionId === item.id} onClick={() => void handleCrawlReview(item, 'approved')}>Duyệt nguồn</Button>
                      </>
                    )}
                    {item.review_status === 'approved' && (
                      <Button size="sm" loading={actionId === item.id} onClick={() => void handlePromoteCrawl(item)}>Chuyển vào kho</Button>
                    )}
                  </div>
                </div>
              ))}
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
