import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  questionApi,
  type QuestionSetSummary,
  type SubjectCatalogNode,
} from '../../api/questionApi';
import { getApiErrorDetail } from '../../api/errors';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonText,
} from '../../components/ui';
import { StaggerGroup } from '../../motion';
import '../question-set.css';

/**
 * Học theo môn — mục lục Môn → Chương → bài luyện tập.
 *
 * Trước trang này, học sinh chỉ có một danh sách phẳng xếp theo ngày công bố và
 * một ô chat AI. Muốn ôn một môn thì phải tự lọc bằng mắt qua tên tài liệu,
 * hoặc hỏi AI từng câu — đúng điều một bạn học sinh phản ánh.
 *
 * Trang này KHÔNG tạo nội dung mới, chỉ sắp xếp lại thứ đã công bố theo cây
 * phân loại chương trình vốn đã có sẵn.
 */
export default function SubjectCatalogPage() {
  const [subjects, setSubjects] = useState<SubjectCatalogNode[]>([]);
  const [chon, setChon] = useState<{ subjectId: string; chapterId?: string } | null>(null);
  const [items, setItems] = useState<QuestionSetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dangLoc, setDangLoc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    questionApi
      .listPublishedSubjects(controller.signal)
      .then(setSubjects)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorDetail(err) ?? 'Không tải được danh sách môn học.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const moMon = useCallback(async (subjectId: string, chapterId?: string) => {
    setChon({ subjectId, chapterId });
    setDangLoc(true);
    setError(null);
    try {
      const kq = await questionApi.listPublished('', undefined, {
        subject_id: subjectId,
        chapter_id: chapterId,
      });
      setItems(kq.items);
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) ?? 'Không tải được bài luyện tập của môn này.');
    } finally {
      setDangLoc(false);
    }
  }, []);

  if (loading) return <SkeletonText lines={8} />;

  if (error && subjects.length === 0) {
    return <ErrorState title="Không tải được mục lục" description={error} />;
  }

  const monDangMo = subjects.find((s) => s.id === chon?.subjectId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Học theo môn"
        title="Chọn môn để bắt đầu ôn"
        description="Học liệu giáo viên đã công bố, xếp theo môn và chương."
      />

      {subjects.length === 0 ? (
        <EmptyState
          title="Chưa có học liệu nào"
          description="Khi giáo viên công bố bài luyện tập, chúng sẽ xuất hiện ở đây theo từng môn."
        />
      ) : (
        <StaggerGroup className="ez-stack">
          {subjects.map((mon) => (
            <Card key={mon.id} data-motion-item data-subject-card>
              <CardHeader>
                <div>
                  <CardTitle as="h2">{mon.name}</CardTitle>
                </div>
                <Badge variant="info">{mon.count} bài</Badge>
              </CardHeader>
              <CardBody>
                <div className="ez-chip-group">
                  <Button
                    size="sm"
                    variant={chon?.subjectId === mon.id && !chon.chapterId ? 'primary' : 'ghost'}
                    onClick={() => void moMon(mon.id)}
                  >
                    Tất cả
                  </Button>
                  {mon.chapters.map((chuong) => (
                    <Button
                      key={chuong.id}
                      size="sm"
                      variant={chon?.chapterId === chuong.id ? 'primary' : 'ghost'}
                      onClick={() => void moMon(mon.id, chuong.id)}
                    >
                      {chuong.name} ({chuong.count})
                    </Button>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </StaggerGroup>
      )}

      {monDangMo && (
        <Card style={{ marginTop: 'var(--ez-space-6)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">
                {monDangMo.name}
                {chon?.chapterId
                  ? ` · ${monDangMo.chapters.find((c) => c.id === chon.chapterId)?.name ?? ''}`
                  : ''}
              </CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            {dangLoc ? (
              <SkeletonText lines={4} />
            ) : error ? (
              <Alert tone="error">{error}</Alert>
            ) : items.length === 0 ? (
              <EmptyState title="Chưa có bài luyện tập trong mục này" />
            ) : (
              <StaggerGroup className="ez-stack">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    to={`/question-sets/${item.id}`}
                    className="dash-row"
                    data-motion-item
                  >
                    <span className="dash-row-main">
                      <span className="dash-row-title">{item.document_name}</span>
                      <span className="dash-row-meta">
                        <span>{item.published_question_count} câu</span>
                        {item.chapter_name && <span>{item.chapter_name}</span>}
                      </span>
                    </span>
                  </Link>
                ))}
              </StaggerGroup>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
