import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { examBankApi } from '../../api/examBankApi';
import type {
  BlueprintConstraints,
  BlueprintValidationResult,
  BloomLevel,
  Difficulty,
  ExamBlueprint,
  ExamItem,
  ExamPreviewResponse,
  QuestionType,
} from '../../api/examBankApi';
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
  ErrorState,
  FormField,
  Input,
  PageHeader,
  Select,
  SkeletonText,
  Tabs,
} from '../../components/ui';
import '../dashboard.css';

const BLOOM_OPTIONS: { value: BloomLevel; label: string }[] = [
  { value: 'remember', label: 'Nhận biết' },
  { value: 'understand', label: 'Thông hiểu' },
  { value: 'apply', label: 'Vận dụng' },
  { value: 'analyze', label: 'Vận dụng cao' },
];

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
];

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Trắc nghiệm' },
  { value: 'true_false', label: 'Đúng/Sai' },
  { value: 'short_answer', label: 'Tự luận ngắn' },
];

const GROUP_LABEL: Record<string, string> = {
  topic: 'Chủ đề',
  bloom_level: 'Mức Bloom',
  difficulty: 'Độ khó',
  question_type: 'Dạng câu hỏi',
  total: 'Tổng thể',
};

function emptyConstraints(): BlueprintConstraints {
  return { topics: [], bloom_distribution: [], difficulty_distribution: [], question_type_distribution: [] };
}

export default function ExamBlueprintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [constraints, setConstraints] = useState<BlueprintConstraints>(emptyConstraints());
  const [activeTab, setActiveTab] = useState('constraints');

  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<BlueprintValidationResult | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [codeCount, setCodeCount] = useState(2);

  const [exams, setExams] = useState<ExamItem[]>([]);
  const [preview, setPreview] = useState<ExamPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [examToPublish, setExamToPublish] = useState<ExamItem | null>(null);

  async function fetchBlueprint() {
    if (!id) return;
    setLoadError(null);
    try {
      const bp = await examBankApi.getBlueprint(id);
      setBlueprint(bp);
      setConstraints(bp.constraints);
      const examsResponse = await examBankApi.listExams(id);
      setExams(examsResponse.items);
    } catch (err) {
      setLoadError(getApiErrorDetail(err) ?? 'Không tải được ma trận đề.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchBlueprint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totals = useMemo(() => {
    const groups = [
      ...constraints.topics,
      ...constraints.bloom_distribution,
      ...constraints.difficulty_distribution,
      ...constraints.question_type_distribution,
    ];
    const questionCount = groups.reduce((sum, g) => sum + (g.question_count ?? 0), 0);
    const points = groups.reduce((sum, g) => sum + (g.points ?? 0), 0);
    return { questionCount, points };
  }, [constraints]);

  function addTopic() {
    setConstraints((c) => ({ ...c, topics: [...c.topics, { topic_id: '', question_count: 1 }] }));
  }
  function addBloom() {
    setConstraints((c) => ({ ...c, bloom_distribution: [...c.bloom_distribution, { bloom_level: 'remember', question_count: 1 }] }));
  }
  function addDifficulty() {
    setConstraints((c) => ({ ...c, difficulty_distribution: [...c.difficulty_distribution, { difficulty: 'easy', question_count: 1 }] }));
  }
  function addQuestionType() {
    setConstraints((c) => ({
      ...c,
      question_type_distribution: [...c.question_type_distribution, { question_type: 'multiple_choice', question_count: 1 }],
    }));
  }

  const isDraft = blueprint?.status === 'draft';

  async function handleSaveConstraints() {
    if (!blueprint || blueprint.status !== 'draft') return;
    setValidateError(null);
    try {
      const updated = await examBankApi.updateBlueprint(blueprint.id, blueprint.version, { constraints });
      setBlueprint(updated);
      setConstraints(updated.constraints);
    } catch (err) {
      setValidateError(getApiErrorDetail(err) ?? 'Lưu ràng buộc thất bại.');
    }
  }

  async function handleValidate() {
    if (!blueprint) return;
    setValidating(true);
    setValidateError(null);
    setValidation(null);
    try {
      await handleSaveConstraints();
      const result = await examBankApi.validateBlueprint(blueprint.id);
      setValidation(result);
      const refreshed = await examBankApi.getBlueprint(blueprint.id);
      setBlueprint(refreshed);
    } catch (err) {
      setValidateError(getApiErrorDetail(err) ?? 'Kiểm tra khả thi thất bại.');
    } finally {
      setValidating(false);
    }
  }

  async function handleGenerate() {
    if (!blueprint) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await examBankApi.generateExams(blueprint.id, codeCount);
      setExams((current) => [...result.exams, ...current]);
      setActiveTab('exams');
    } catch (err) {
      setGenerateError(getApiErrorDetail(err) ?? 'Sinh đề thất bại. Kiểm tra lại ma trận trước khi thử lại.');
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish(exam: ExamItem) {
    setExamToPublish(null);
    setPublishingId(exam.id);
    try {
      const updated = await examBankApi.publishExam(exam.id, exam.version);
      setExams((current) => current.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      setGenerateError(getApiErrorDetail(err) ?? 'Publish đề thi thất bại.');
    } finally {
      setPublishingId(null);
    }
  }

  async function handlePreview(examId: string) {
    setPreviewLoading(examId);
    try {
      const result = await examBankApi.previewExam(examId, true);
      setPreview(result);
    } catch (err) {
      setGenerateError(getApiErrorDetail(err) ?? 'Không xem trước được đề thi.');
    } finally {
      setPreviewLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <SkeletonText lines={2} />
        <SkeletonText lines={10} />
      </div>
    );
  }

  if (loadError || !blueprint) {
    return (
      <ErrorState
        title="Không tải được ma trận đề"
        description={loadError ?? 'Ma trận đề không tồn tại.'}
        actions={<Button onClick={() => navigate('/exam-blueprints')}>Về danh sách</Button>}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Ma trận đề"
        title={blueprint.name}
        description={`${blueprint.subject_id} · Lớp ${blueprint.grade} · ${blueprint.total_points} điểm · ${blueprint.duration_minutes} phút`}
        actions={
          <Button variant="outline" leadingIcon={<ArrowLeft size={16} aria-hidden="true" />} onClick={() => navigate('/exam-blueprints')}>
            Về danh sách
          </Button>
        }
      />

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody style={{ display: 'flex', gap: 'var(--ez-space-6)', flexWrap: 'wrap' }}>
          <div>
            <strong>{totals.questionCount}</strong> câu hỏi đã cấu hình theo ràng buộc
          </div>
          <div>
            <strong>{totals.points}</strong> / {blueprint.total_points} điểm theo ràng buộc
          </div>
          <Badge variant={blueprint.status === 'draft' ? 'neutral' : blueprint.status === 'validated' ? 'primary' : 'success'}>
            {blueprint.status}
          </Badge>
        </CardBody>
      </Card>

      <Tabs
        ariaLabel="Chi tiết ma trận đề"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: 'constraints', label: 'Ràng buộc' },
          { id: 'exams', label: `Đề đã sinh (${exams.length})` },
        ]}
      />

      {activeTab === 'constraints' && (
        <div className="ez-stack" style={{ marginTop: 'var(--ez-space-4)' }}>
          {validateError && <Alert tone="error">{validateError}</Alert>}
          {!isDraft && (
            <Alert tone="info">
              Ma trận đã ở trạng thái &quot;{blueprint.status}&quot; nên không thể sửa ràng buộc nữa — chỉ có thể xem lại và sinh đề.
            </Alert>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Ràng buộc theo chủ đề</CardTitle>
              </div>
              <Button size="sm" variant="outline" disabled={!isDraft} leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={addTopic}>
                Thêm chủ đề
              </Button>
            </CardHeader>
            <CardBody>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã chủ đề</th>
                    <th>Số câu</th>
                    <th>Điểm</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {constraints.topics.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <Input
                          aria-label="Mã chủ đề"
                          disabled={!isDraft}
                          value={row.topic_id}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              topics: c.topics.map((r, i) => (i === idx ? { ...r, topic_id: e.target.value } : r)),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Số câu"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          value={row.question_count ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              topics: c.topics.map((r, i) => (i === idx ? { ...r, question_count: Number(e.target.value) } : r)),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Điểm"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          step={0.25}
                          value={row.points ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              topics: c.topics.map((r, i) => (i === idx ? { ...r, points: Number(e.target.value) } : r)),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          aria-label="Xoá dòng"
                          disabled={!isDraft}
                          leadingIcon={<Trash2 size={14} aria-hidden="true" />}
                          onClick={() => setConstraints((c) => ({ ...c, topics: c.topics.filter((_, i) => i !== idx) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Ràng buộc theo mức Bloom</CardTitle>
              </div>
              <Button size="sm" variant="outline" disabled={!isDraft} leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={addBloom}>
                Thêm mức
              </Button>
            </CardHeader>
            <CardBody>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mức Bloom</th>
                    <th>Số câu</th>
                    <th>Điểm</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {constraints.bloom_distribution.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <Select
                          aria-label="Mức Bloom"
                          disabled={!isDraft}
                          value={row.bloom_level}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              bloom_distribution: c.bloom_distribution.map((r, i) =>
                                i === idx ? { ...r, bloom_level: e.target.value as BloomLevel } : r,
                              ),
                            }))
                          }
                          options={BLOOM_OPTIONS}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Số câu"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          value={row.question_count ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              bloom_distribution: c.bloom_distribution.map((r, i) =>
                                i === idx ? { ...r, question_count: Number(e.target.value) } : r,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Điểm"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          step={0.25}
                          value={row.points ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              bloom_distribution: c.bloom_distribution.map((r, i) => (i === idx ? { ...r, points: Number(e.target.value) } : r)),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          aria-label="Xoá dòng"
                          disabled={!isDraft}
                          leadingIcon={<Trash2 size={14} aria-hidden="true" />}
                          onClick={() =>
                            setConstraints((c) => ({ ...c, bloom_distribution: c.bloom_distribution.filter((_, i) => i !== idx) }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Ràng buộc theo độ khó</CardTitle>
              </div>
              <Button size="sm" variant="outline" disabled={!isDraft} leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={addDifficulty}>
                Thêm độ khó
              </Button>
            </CardHeader>
            <CardBody>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Độ khó</th>
                    <th>Số câu</th>
                    <th>Điểm</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {constraints.difficulty_distribution.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <Select
                          aria-label="Độ khó"
                          disabled={!isDraft}
                          value={row.difficulty}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              difficulty_distribution: c.difficulty_distribution.map((r, i) =>
                                i === idx ? { ...r, difficulty: e.target.value as Difficulty } : r,
                              ),
                            }))
                          }
                          options={DIFFICULTY_OPTIONS}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Số câu"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          value={row.question_count ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              difficulty_distribution: c.difficulty_distribution.map((r, i) =>
                                i === idx ? { ...r, question_count: Number(e.target.value) } : r,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Điểm"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          step={0.25}
                          value={row.points ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              difficulty_distribution: c.difficulty_distribution.map((r, i) =>
                                i === idx ? { ...r, points: Number(e.target.value) } : r,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          aria-label="Xoá dòng"
                          disabled={!isDraft}
                          leadingIcon={<Trash2 size={14} aria-hidden="true" />}
                          onClick={() =>
                            setConstraints((c) => ({
                              ...c,
                              difficulty_distribution: c.difficulty_distribution.filter((_, i) => i !== idx),
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Ràng buộc theo dạng câu hỏi</CardTitle>
              </div>
              <Button size="sm" variant="outline" disabled={!isDraft} leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={addQuestionType}>
                Thêm dạng
              </Button>
            </CardHeader>
            <CardBody>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dạng câu hỏi</th>
                    <th>Số câu</th>
                    <th>Điểm</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {constraints.question_type_distribution.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <Select
                          aria-label="Dạng câu hỏi"
                          disabled={!isDraft}
                          value={row.question_type}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              question_type_distribution: c.question_type_distribution.map((r, i) =>
                                i === idx ? { ...r, question_type: e.target.value as QuestionType } : r,
                              ),
                            }))
                          }
                          options={QUESTION_TYPE_OPTIONS}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Số câu"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          value={row.question_count ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              question_type_distribution: c.question_type_distribution.map((r, i) =>
                                i === idx ? { ...r, question_count: Number(e.target.value) } : r,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Input
                          aria-label="Điểm"
                          disabled={!isDraft}
                          type="number"
                          min={0}
                          step={0.25}
                          value={row.points ?? ''}
                          onChange={(e) =>
                            setConstraints((c) => ({
                              ...c,
                              question_type_distribution: c.question_type_distribution.map((r, i) =>
                                i === idx ? { ...r, points: Number(e.target.value) } : r,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          aria-label="Xoá dòng"
                          disabled={!isDraft}
                          leadingIcon={<Trash2 size={14} aria-hidden="true" />}
                          onClick={() =>
                            setConstraints((c) => ({
                              ...c,
                              question_type_distribution: c.question_type_distribution.filter((_, i) => i !== idx),
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Đa dạng nội dung</CardTitle>
                <p className="ez-muted-note">
                  Phân loại theo chủ đề là nhãn khai báo tay nên có thể thô — một đề đúng chủ đề, đúng mức Bloom
                  vẫn có thể dồn hết vào một dạng bài. Hệ thống phân cụm nội dung câu hỏi bằng K-Means và giới hạn
                  số câu lấy từ cùng một cụm. Để trống nếu không cần ràng buộc này.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <FormField
                label="Số câu tối đa từ cùng một cụm nội dung"
                hint="Ví dụ: đề 10 câu, đặt 3 thì đề buộc phải lấy từ ít nhất 4 cụm nội dung khác nhau."
              >
                <Input
                  type="number"
                  min={1}
                  disabled={!isDraft}
                  placeholder="Không giới hạn"
                  value={constraints.max_questions_per_content_cluster ?? ''}
                  onChange={(e) =>
                    setConstraints((c) => ({
                      ...c,
                      max_questions_per_content_cluster: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </FormField>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Kiểm tra khả thi & sinh đề</CardTitle>
              </div>
            </CardHeader>
            <CardBody className="ez-stack">
              <div style={{ display: 'flex', gap: 'var(--ez-space-3)', flexWrap: 'wrap' }}>
                <Button variant="outline" disabled={!isDraft} onClick={handleSaveConstraints}>
                  Lưu ràng buộc
                </Button>
                <Button loading={validating} onClick={handleValidate}>
                  Kiểm tra khả thi
                </Button>
              </div>

              {validation && (
                <Alert tone={validation.status === 'INFEASIBLE' ? 'error' : validation.status === 'UNKNOWN' ? 'warning' : 'success'}>
                  <strong>{validation.status}</strong> — {validation.message} ({validation.solve_time_seconds.toFixed(2)}s)
                  {validation.missing.length > 0 && (
                    <ul style={{ marginTop: 'var(--ez-space-2)' }}>
                      {validation.missing.map((m, idx) => {
                        const unit = m.group_type === 'total' ? 'điểm' : 'câu';
                        return (
                          <li key={idx}>
                            {GROUP_LABEL[m.group_type] ?? m.group_type}
                            {m.group_key ? ` · ${m.group_key}` : ''}: cần {m.required_count} {unit}, ngân hàng có{' '}
                            {m.available_count} {unit} — thiếu {m.shortfall} {unit}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Alert>
              )}

              {blueprint.status === 'validated' && (
                <div style={{ display: 'flex', gap: 'var(--ez-space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ez-space-1)' }}>
                    <span>Số mã đề tương đương</span>
                    <Input type="number" min={1} max={20} value={codeCount} onChange={(e) => setCodeCount(Number(e.target.value))} />
                  </label>
                  <Button loading={generating} onClick={handleGenerate}>
                    Sinh đề
                  </Button>
                </div>
              )}
              {generateError && <Alert tone="error">{generateError}</Alert>}
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'exams' && (
        <div className="ez-stack" style={{ marginTop: 'var(--ez-space-4)' }}>
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Các đề đã sinh từ ma trận này</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              {exams.length === 0 ? (
                <p>Chưa sinh đề nào. Kiểm tra khả thi rồi bấm Sinh đề ở tab Ràng buộc.</p>
              ) : (
                exams.map((exam) => (
                  <div key={exam.id} className="dash-row">
                    <span className="dash-row-main">
                      <span className="dash-row-title">Mã đề {exam.code}</span>
                      <span className="dash-row-meta">
                        <Badge variant={exam.status === 'published' ? 'success' : 'neutral'}>{exam.status}</Badge>
                        <span>{exam.question_ids.length} câu</span>
                        <span>{exam.total_points} điểm</span>
                      </span>
                    </span>
                    <div style={{ display: 'flex', gap: 'var(--ez-space-2)' }}>
                      <Button size="sm" variant="outline" loading={previewLoading === exam.id} onClick={() => handlePreview(exam.id)}>
                        Xem trước
                      </Button>
                      {(exam.status === 'draft' || exam.status === 'ready') && (
                        <Button size="sm" loading={publishingId === exam.id} onClick={() => setExamToPublish(exam)}>
                          Publish
                        </Button>
                      )}
                      {exam.status === 'published' && (
                        <Button size="sm" variant="outline" onClick={() => navigate(`/exams/${exam.id}/grading`)}>
                          Chấm bài
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          {preview && (
            <Card variant="muted">
              <CardHeader>
                <div>
                  <CardTitle as="h2">Xem trước — Mã đề {preview.exam.code}</CardTitle>
                </div>
              </CardHeader>
              <CardBody className="ez-stack">
                {preview.questions.map((q) => (
                  <div key={q.question_id} className="dash-row" style={{ alignItems: 'flex-start' }}>
                    <span className="dash-row-main">
                      <span className="dash-row-title">
                        Câu {q.order}. {q.content}
                      </span>
                      {q.options && (
                        <span className="dash-row-meta">
                          {Object.entries(q.options).map(([key, text]) => (
                            <span key={key}>
                              {key}. {text}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={examToPublish !== null}
        onClose={() => setExamToPublish(null)}
        title="Publish đề thi?"
        description={
          examToPublish
            ? `Mã đề ${examToPublish.code} sẽ hiển thị cho học sinh làm bài. Sau khi publish, đề không thể sửa lại.`
            : undefined
        }
        footer={
          <DialogFooter>
            <Button variant="outline" onClick={() => setExamToPublish(null)}>
              Huỷ
            </Button>
            <Button loading={publishingId === examToPublish?.id} onClick={() => examToPublish && void handlePublish(examToPublish)}>
              Publish
            </Button>
          </DialogFooter>
        }
      />
    </>
  );
}
