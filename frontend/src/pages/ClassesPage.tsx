import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, School, Trash2, Users } from 'lucide-react';
import { classesApi } from '../api/classesApi';
import type { ClassSummary } from '../types/classes';
import { apiErrorMessage } from '../utils/apiError';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Dialog,
  Dropdown,
  DropdownItem,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  useToast,
} from '../components/ui';
import '../pages/dashboard.css';

type Dialog_ =
  | { kind: 'none' }
  | { kind: 'rename'; cls: ClassSummary; name: string; description: string; saving: boolean; error: string }
  | { kind: 'delete'; cls: ClassSummary; deleting: boolean };

/**
 * Lớp học của giáo viên.
 *
 * Bổ sung đổi tên và xoá lớp — backend (`PATCH`/`DELETE /classes/{id}`) và
 * client API đã có từ trước nhưng chưa từng được gọi từ giao diện.
 * Xem docs/ui-redesign/01-audit-report.md §6.3 (lỗi M8).
 */
export default function ClassesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [dialog, setDialog] = useState<Dialog_>({ kind: 'none' });
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  function load() {
    setState('loading');
    classesApi
      .list()
      .then((data) => {
        setClasses(data.items);
        setState('ready');
      })
      .catch(() => setState('error'));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setCreateError('Vui lòng nhập tên lớp.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await classesApi.create({ name: name.trim(), description: description.trim() || undefined });
      setName('');
      setDescription('');
      load();
      toast({ title: 'Đã tạo lớp học', tone: 'success' });
    } catch (err) {
      setCreateError(apiErrorMessage(err, 'Không tạo được lớp học.'));
    } finally {
      setCreating(false);
    }
  }

  function openRename(cls: ClassSummary) {
    setDialog({ kind: 'rename', cls, name: cls.name, description: cls.description ?? '', saving: false, error: '' });
  }

  async function submitRename() {
    if (dialog.kind !== 'rename') return;
    if (!dialog.name.trim()) {
      setDialog({ ...dialog, error: 'Tên lớp không được để trống.' });
      return;
    }
    setDialog({ ...dialog, saving: true, error: '' });
    try {
      await classesApi.update(dialog.cls.id, {
        name: dialog.name.trim(),
        description: dialog.description.trim() || undefined,
      });
      setDialog({ kind: 'none' });
      load();
      toast({ title: 'Đã cập nhật lớp học', tone: 'success' });
    } catch (err) {
      setDialog((current) =>
        current.kind === 'rename'
          ? { ...current, saving: false, error: apiErrorMessage(err, 'Không cập nhật được lớp học.') }
          : current,
      );
    }
  }

  async function submitDelete() {
    if (dialog.kind !== 'delete' || deleteConfirmation !== 'XÓA') return;
    setDialog({ ...dialog, deleting: true });
    try {
      await classesApi.remove(dialog.cls.id);
      setDialog({ kind: 'none' });
      setDeleteConfirmation('');
      load();
      toast({ title: 'Đã xoá lớp học', tone: 'success' });
    } catch (err) {
      toast({
        title: 'Không xoá được lớp học',
        description: apiErrorMessage(err, 'Vui lòng thử lại.'),
        tone: 'error',
      });
      setDialog({ kind: 'none' });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Quản lý lớp học"
        title="Lớp học của tôi"
        description="Tạo lớp và thêm học sinh để giao đề riêng cho từng lớp thay vì ban hành công khai cho mọi học sinh."
        actions={
          <Button variant="outline" onClick={() => navigate('/question-history')}>
            Về ngân hàng câu hỏi
          </Button>
        }
      />

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody>
          <form onSubmit={handleCreate} className="ez-stack-sm">
            <div className="ez-row ez-row-wrap" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 240px' }}>
                <FormField label="Tên lớp" required>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ví dụ: Lớp 10A1 - Toán"
                    maxLength={200}
                  />
                </FormField>
              </div>
              <div style={{ flex: '2 1 320px' }}>
                <FormField label="Mô tả" hint="Không bắt buộc">
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ví dụ: Lớp ôn thi tốt nghiệp"
                    maxLength={2000}
                    rows={1}
                  />
                </FormField>
              </div>
              <Button type="submit" loading={creating} leadingIcon={<Plus size={16} aria-hidden="true" />}>
                Tạo lớp
              </Button>
            </div>
            {createError && <Alert tone="error">{createError}</Alert>}
          </form>
        </CardBody>
      </Card>

      {state === 'loading' && (
        <div className="ez-stack-sm">
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
        </div>
      )}

      {state === 'error' && (
        <ErrorState title="Không tải được danh sách lớp" onRetry={load} />
      )}

      {state === 'ready' && classes.length === 0 && (
        <EmptyState
          icon={<School size={28} />}
          title="Bạn chưa tạo lớp học nào"
          description="Tạo lớp ở trên để bắt đầu giao đề theo từng nhóm học sinh."
        />
      )}

      {state === 'ready' && classes.length > 0 && (
        <div className="ez-list">
          {classes.map((cls) => (
            <div key={cls.id} className="ez-list-item">
              <span className="ez-list-item-icon" aria-hidden="true">
                <School size={18} />
              </span>
              <button
                type="button"
                className="ez-list-item-main"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => navigate(`/classes/${cls.id}`)}
              >
                <span className="ez-list-item-title">{cls.name}</span>
                <span className="ez-list-item-meta">
                  {cls.description ? <span>{cls.description}</span> : null}
                  <span>{new Date(cls.created_at).toLocaleDateString('vi-VN')}</span>
                </span>
              </button>
              <div className="ez-list-item-actions">
                <Badge variant="secondary">{cls.student_count} học sinh</Badge>
                <Button size="sm" variant="outline" onClick={() => navigate(`/classes/${cls.id}`)}>
                  <Users size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                  Quản lý học sinh
                </Button>
                <Dropdown
                  align="end"
                  menuLabel={`Thao tác với lớp ${cls.name}`}
                  trigger={
                    <Button variant="ghost" size="sm" iconOnly aria-label={`Thêm thao tác cho lớp ${cls.name}`}>
                      <Pencil size={14} aria-hidden="true" />
                    </Button>
                  }
                >
                  <DropdownItem icon={<Pencil size={14} />} onClick={() => openRename(cls)}>
                    Đổi tên / mô tả
                  </DropdownItem>
                  <DropdownItem
                    icon={<Trash2 size={14} />}
                    danger
                    onClick={() => { setDeleteConfirmation(''); setDialog({ kind: 'delete', cls, deleting: false }); }}
                  >
                    Xoá lớp
                  </DropdownItem>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialog.kind === 'rename'}
        onClose={dialog.kind === 'delete' && dialog.deleting ? () => undefined : () => setDialog({ kind: 'none' })}
        title="Đổi tên lớp"
        footer={
          <>
            <Button variant="outline" disabled={dialog.kind === 'delete' && dialog.deleting} onClick={() => setDialog({ kind: 'none' })}>
              Huỷ
            </Button>
            <Button
              onClick={submitRename}
              loading={dialog.kind === 'rename' && dialog.saving}
            >
              Lưu thay đổi
            </Button>
          </>
        }
      >
        {dialog.kind === 'rename' && (
          <div className="ez-stack-sm">
            <FormField label="Tên lớp" required>
              <Input
                value={dialog.name}
                onChange={(event) => setDialog({ ...dialog, name: event.target.value })}
                maxLength={200}
              />
            </FormField>
            <FormField label="Mô tả">
              <Textarea
                value={dialog.description}
                onChange={(event) => setDialog({ ...dialog, description: event.target.value })}
                maxLength={2000}
                rows={3}
              />
            </FormField>
            {dialog.error && <Alert tone="error">{dialog.error}</Alert>}
          </div>
        )}
      </Dialog>

      <Dialog
        open={dialog.kind === 'delete'}
        onClose={() => setDialog({ kind: 'none' })}
        title="Xoá lớp học?"
        description={
          dialog.kind === 'delete'
            ? `Lớp "${dialog.cls.name}" và danh sách ${dialog.cls.student_count} học sinh trong lớp sẽ không còn hiển thị. Đề đã ban hành cho lớp này vẫn giữ nguyên với những học sinh đã làm.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog({ kind: 'none' })}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              onClick={submitDelete}
              disabled={deleteConfirmation !== 'XÓA'}
              loading={dialog.kind === 'delete' && dialog.deleting}
            >
              Xoá lớp
            </Button>
          </>
        }
      >
        <FormField
          label="Nhập XÓA để xác nhận"
          error={deleteConfirmation && deleteConfirmation !== 'XÓA' ? 'Nội dung xác nhận chưa đúng.' : undefined}
        >
          <Input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            invalid={Boolean(deleteConfirmation && deleteConfirmation !== 'XÓA')}
          />
        </FormField>
      </Dialog>
    </>
  );
}
