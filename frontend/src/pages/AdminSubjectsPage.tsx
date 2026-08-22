import { useCallback, useEffect, useState } from 'react';

import { questionApi, type SubjectCatalogNode } from '../api/questionApi';
import { getApiErrorDetail } from '../api/errors';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  SkeletonText,
  useToast,
} from '../components/ui';

/**
 * Quản lý danh mục môn → chương.
 *
 * Cây này quyết định mục lục "Học theo môn" của học sinh và ô chọn của giáo viên
 * lúc công bố học liệu. Chưa có môn nào thì mọi học liệu rơi vào nhóm
 * "Chưa phân môn" và trang Học theo môn chỉ hơn danh sách phẳng một chút.
 *
 * Chỉ quản trị vào được: giáo viên gắn nhãn thì thoải mái, nhưng nếu ai cũng tự
 * thêm được "Toán 10" / "Toán lớp 10" / "TOÁN" thì mục lục vỡ vụn.
 */
export default function AdminSubjectsPage() {
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<SubjectCatalogNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenMonMoi, setTenMonMoi] = useState('');
  const [tenChuongMoi, setTenChuongMoi] = useState<Record<string, string>>({});
  const [dangGhi, setDangGhi] = useState(false);

  const nap = useCallback(async () => {
    setError(null);
    try {
      setSubjects(await questionApi.listSubjectOptions());
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) ?? 'Không tải được danh mục môn.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void nap());
  }, [nap]);

  /** Bọc mọi thao tác ghi: cùng một cách báo lỗi và cùng một lần nạp lại. */
  const ghi = useCallback(
    async (viec: () => Promise<void>, thanhCong: string) => {
      setDangGhi(true);
      setError(null);
      try {
        await viec();
        await nap();
        toast({ title: thanhCong, tone: 'success' });
      } catch (err: unknown) {
        // Backend trả câu tiếng Việt nói rõ vì sao ("Môn này còn 3 chương…").
        // Nuốt nó và thay bằng câu chung là bỏ người dùng ở ngõ cụt.
        setError(getApiErrorDetail(err) ?? 'Thao tác không thành công.');
      } finally {
        setDangGhi(false);
      }
    },
    [nap, toast],
  );

  if (loading) return <SkeletonText lines={8} />;

  return (
    <>
      <PageHeader
        eyebrow="Quản trị"
        title="Danh mục môn học"
        description="Cây môn → chương dùng cho trang Học theo môn của học sinh và ô chọn khi giáo viên công bố học liệu."
      />

      {error && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>
          {error}
        </Alert>
      )}

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardHeader>
          <div>
            <CardTitle as="h2">Thêm môn</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          <form
            style={{ display: 'flex', gap: 'var(--ez-space-3)', alignItems: 'flex-end' }}
            onSubmit={(event) => {
              event.preventDefault();
              const ten = tenMonMoi.trim();
              if (!ten) return;
              void ghi(async () => {
                await questionApi.createTaxonomyNode({ node_type: 'subject', name: ten });
                setTenMonMoi('');
              }, 'Đã thêm môn');
            }}
          >
            <FormField label="Tên môn" className="ez-flex-1">
              <Input
                value={tenMonMoi}
                onChange={(event) => setTenMonMoi(event.target.value)}
                placeholder="Ví dụ: Toán"
              />
            </FormField>
            <Button type="submit" disabled={dangGhi || !tenMonMoi.trim()}>
              Thêm môn
            </Button>
          </form>
        </CardBody>
      </Card>

      {subjects.length === 0 ? (
        <EmptyState
          title="Chưa có môn nào"
          description="Thêm môn ở trên, hoặc chạy lệnh nạp danh mục môn phổ thông có sẵn."
        />
      ) : (
        <div className="ez-stack">
          {subjects.map((mon) => (
            <Card key={mon.id} data-subject-admin-card>
              <CardHeader>
                <div>
                  <CardTitle as="h2">{mon.name}</CardTitle>
                </div>
                <div style={{ display: 'flex', gap: 'var(--ez-space-2)' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={dangGhi}
                    onClick={() => {
                      const ten = window.prompt('Tên môn mới', mon.name);
                      if (!ten || ten.trim() === mon.name) return;
                      void ghi(
                        () => questionApi.renameTaxonomyNode(mon.id, ten.trim()).then(() => undefined),
                        'Đã đổi tên môn',
                      );
                    }}
                  >
                    Đổi tên
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={dangGhi}
                    onClick={() => {
                      if (!window.confirm(`Xoá môn "${mon.name}"?`)) return;
                      void ghi(() => questionApi.deleteTaxonomyNode(mon.id), 'Đã xoá môn');
                    }}
                  >
                    Xoá môn
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                {mon.chapters.length === 0 ? (
                  <p className="text-muted">Chưa có chương nào.</p>
                ) : (
                  <ul className="ez-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {mon.chapters.map((chuong) => (
                      <li key={chuong.id} className="dash-row" data-chapter-row>
                        <span className="dash-row-main">
                          <span className="dash-row-title">{chuong.name}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={dangGhi}
                          onClick={() => {
                            if (!window.confirm(`Xoá chương "${chuong.name}"?`)) return;
                            void ghi(() => questionApi.deleteTaxonomyNode(chuong.id), 'Đã xoá chương');
                          }}
                        >
                          Xoá chương
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  style={{ display: 'flex', gap: 'var(--ez-space-3)', alignItems: 'flex-end', marginTop: 'var(--ez-space-4)' }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const ten = (tenChuongMoi[mon.id] ?? '').trim();
                    if (!ten) return;
                    void ghi(async () => {
                      await questionApi.createTaxonomyNode({
                        node_type: 'chapter',
                        name: ten,
                        parent_id: mon.id,
                      });
                      setTenChuongMoi((prev) => ({ ...prev, [mon.id]: '' }));
                    }, 'Đã thêm chương');
                  }}
                >
                  <FormField label={`Thêm chương cho ${mon.name}`} className="ez-flex-1">
                    <Input
                      value={tenChuongMoi[mon.id] ?? ''}
                      onChange={(event) =>
                        setTenChuongMoi((prev) => ({ ...prev, [mon.id]: event.target.value }))
                      }
                      placeholder="Ví dụ: Hàm số bậc hai"
                    />
                  </FormField>
                  <Button type="submit" variant="outline" disabled={dangGhi || !(tenChuongMoi[mon.id] ?? '').trim()}>
                    Thêm chương
                  </Button>
                </form>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
