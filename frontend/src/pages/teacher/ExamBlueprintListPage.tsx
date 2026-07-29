import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { examBankApi } from '../../api/examBankApi';
import type { BlueprintStatus, ExamBlueprint } from '../../api/examBankApi';
import { getApiErrorDetail } from '../../api/errors';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  DialogFooter,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  PageHeader,
  SkeletonText,
} from '../../components/ui';
import '../dashboard.css';

const STATUS_LABEL: Record<BlueprintStatus, string> = {
  draft: 'Nháp',
  validated: 'Đã kiểm tra khả thi',
  published: 'Đã publish',
  archived: 'Đã lưu trữ',
};

const STATUS_VARIANT: Record<BlueprintStatus, 'neutral' | 'success' | 'primary'> = {
  draft: 'neutral',
  validated: 'primary',
  published: 'success',
  archived: 'neutral',
};

export default function ExamBlueprintListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ExamBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [grade, setGrade] = useState(10);
  const [curriculumVersion, setCurriculumVersion] = useState('2018');
  const [totalPoints, setTotalPoints] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(45);

  async function fetchBlueprints() {
    setError(null);
    try {
      const response = await examBankApi.listBlueprints();
      setItems(response.items);
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Không tải được danh sách ma trận đề.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchBlueprints();
  }, []);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await examBankApi.createBlueprint({
        name,
        subject_id: subjectId,
        grade,
        curriculum_version: curriculumVersion,
        total_points: totalPoints,
        duration_minutes: durationMinutes,
        constraints: { topics: [], bloom_distribution: [], difficulty_distribution: [], question_type_distribution: [] },
      });
      setShowCreate(false);
      navigate(`/exam-blueprints/${created.id}`);
    } catch (err) {
      setCreateError(getApiErrorDetail(err) ?? 'Tạo ma trận đề thất bại.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <SkeletonText lines={2} />
        <SkeletonText lines={6} />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Không tải được ma trận đề" description={error} actions={<Button onClick={() => void fetchBlueprints()}>Thử lại</Button>} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Ma trận đề"
        title="Ma trận đề thi"
        description="Định nghĩa số câu/điểm theo chủ đề, mức Bloom, độ khó, dạng câu — hệ thống tự chọn câu từ ngân hàng theo đúng ma trận."
        actions={
          <Button leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={() => setShowCreate(true)}>
            Tạo ma trận mới
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Danh sách ma trận</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          {items.length === 0 ? (
            <EmptyState
              compact
              title="Chưa có ma trận đề nào"
              description="Tạo ma trận để định nghĩa cấu trúc đề thi, sau đó hệ thống tự sinh đề từ ngân hàng câu hỏi."
              actions={<Button onClick={() => setShowCreate(true)}>Tạo ma trận mới</Button>}
            />
          ) : (
            items.map((bp) => (
              <button
                key={bp.id}
                type="button"
                className="dash-row"
                style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}
                onClick={() => navigate(`/exam-blueprints/${bp.id}`)}
              >
                <span className="dash-row-main">
                  <span className="dash-row-title">{bp.name}</span>
                  <span className="dash-row-meta">
                    <Badge variant={STATUS_VARIANT[bp.status]}>{STATUS_LABEL[bp.status]}</Badge>
                    <span>{bp.total_points} điểm</span>
                    <span>{bp.duration_minutes} phút</span>
                  </span>
                </span>
              </button>
            ))
          )}
        </CardBody>
      </Card>

      <Dialog
        open={showCreate}
        onClose={() => !creating && setShowCreate(false)}
        title="Tạo ma trận đề mới"
        description="Sau khi tạo, bạn sẽ vào trang cấu hình chi tiết từng ràng buộc."
        footer={
          <DialogFooter>
            <Button variant="outline" disabled={creating} onClick={() => setShowCreate(false)}>
              Huỷ
            </Button>
            <Button loading={creating} disabled={!name || !subjectId} onClick={handleCreate}>
              Tạo & cấu hình
            </Button>
          </DialogFooter>
        }
      >
        <div className="ez-stack">
          {createError && <Alert tone="error">{createError}</Alert>}
          <FormField label="Tên ma trận" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Kiểm tra giữa kỳ Toán 10" />
          </FormField>
          <FormField label="Mã môn học" required hint="Ví dụ: math, physics — khớp với môn của câu hỏi trong ngân hàng.">
            <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="math" />
          </FormField>
          <FormField label="Lớp" required>
            <Input type="number" min={1} max={12} value={grade} onChange={(e) => setGrade(Number(e.target.value))} />
          </FormField>
          <FormField label="Chương trình">
            <Input value={curriculumVersion} onChange={(e) => setCurriculumVersion(e.target.value)} />
          </FormField>
          <FormField label="Tổng điểm" required>
            <Input type="number" min={1} step={0.5} value={totalPoints} onChange={(e) => setTotalPoints(Number(e.target.value))} />
          </FormField>
          <FormField label="Thời gian làm bài (phút)" required>
            <Input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
          </FormField>
        </div>
      </Dialog>
    </>
  );
}
