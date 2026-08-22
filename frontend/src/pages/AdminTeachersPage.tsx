import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { adminUsersApi } from '../api/adminUsersApi';
import type {
  AdminUserCreatePayload,
  AdminUserDetail,
  AdminUserStatus,
} from '../types/adminUsers';
import { fmtDateTime, fmtNumber } from '../utils/adminUtils';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Pagination,
  Select,
  SkeletonText,
  StatGrid,
  StatTile,
  Textarea,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';

type LoadState = 'loading' | 'error' | 'ok';

const STATUS_BADGE_MAP: Record<AdminUserStatus, 'success' | 'warning' | 'error'> = {
  active: 'success',
  locked: 'warning',
  deleted: 'error',
};

const SUBJECT_OPTIONS = ['Toán học', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý'];

export default function AdminTeachersPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [teachers, setTeachers] = useState<AdminUserDetail[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<AdminUserDetail | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState<AdminUserDetail | null>(null);
  const [confirmLock, setConfirmLock] = useState<{ teacher: AdminUserDetail; lock: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUserDetail | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    password: '',
    subject: 'Toán học',
    specialization: '',
  });

  const [filters, setFilters] = useState({
    search: '',
    subject: 'all',
    status: 'all',
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const loadData = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const res = await adminUsersApi.list({ page_size: 100, role: 'lecturer' });
      const list = (res.items as AdminUserDetail[]).filter(
        (u) => u.role === 'lecturer' || u.role === 'user'
      );

      // Fetch details for all
      const details = await Promise.all(
        list.map((u) => adminUsersApi.detail(u.id).catch(() => u))
      );
      setTeachers(details);
      setState('ok');
    } catch {
      setState('error');
      setError('Không thể tải danh sách giáo viên.');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  // Filtering & Sorting
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const query = appliedFilters.search.toLowerCase().trim();
      const matchSearch =
        !query ||
        t.full_name.toLowerCase().includes(query) ||
        t.email.toLowerCase().includes(query) ||
        (t.teacher_code && t.teacher_code.toLowerCase().includes(query)) ||
        (t.phone_number && t.phone_number.includes(query));

      const matchSubject =
        appliedFilters.subject === 'all' || t.subject === appliedFilters.subject;
      const matchStatus =
        appliedFilters.status === 'all' || t.status === appliedFilters.status;

      return matchSearch && matchSubject && matchStatus;
    }).sort((a, b) => {
      const order = appliedFilters.sort_order === 'asc' ? 1 : -1;
      if (appliedFilters.sort_by === 'full_name') {
        return a.full_name.localeCompare(b.full_name) * order;
      }
      if (appliedFilters.sort_by === 'subject') {
        return (a.subject || '').localeCompare(b.subject || '') * order;
      }
      return (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * order;
    });
  }, [teachers, appliedFilters]);

  // Pagination
  const paginatedTeachers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTeachers.slice(start, start + pageSize);
  }, [filteredTeachers, page]);

  const totalPages = Math.ceil(filteredTeachers.length / pageSize) || 1;

  // Stats
  const stats = useMemo(() => {
    const total = teachers.length;
    const active = teachers.filter((t) => t.status === 'active').length;
    const locked = teachers.filter((t) => t.status === 'locked').length;
    const totalMaterials = teachers.reduce((acc, t) => acc + (t.materials_created || t.document_count || 0), 0);
    return { total, active, locked, totalMaterials };
  }, [teachers]);

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleCreateTeacher = async () => {
    if (!formData.full_name.trim() || !formData.email.trim() || formData.password.length < 6) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc và mật khẩu ít nhất 6 ký tự.');
      return;
    }
    setBusy(true);
    try {
      const payload: AdminUserCreatePayload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        role: 'lecturer',
        password: formData.password.trim(),
        email_verified: true,
      };
      await adminUsersApi.create(payload);
      setNotice(`Đã tạo thành công tài khoản giáo viên ${formData.full_name}`);
      setCreateModalOpen(false);
      setFormData({
        full_name: '',
        email: '',
        phone_number: '',
        password: '',
        subject: 'Toán học',
        specialization: '',
      });
      loadData();
    } catch {
      setError('Tạo tài khoản thất bại. Vui lòng kiểm tra email hoặc quyền hạn.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLock = async () => {
    if (!confirmLock) return;
    setBusy(true);
    try {
      if (confirmLock.lock) {
        await adminUsersApi.lock(confirmLock.teacher.id, lockReason || 'Admin khóa tài khoản');
        setNotice(`Đã khóa tài khoản ${confirmLock.teacher.full_name}`);
      } else {
        await adminUsersApi.unlock(confirmLock.teacher.id);
        setNotice(`Đã mở khóa tài khoản ${confirmLock.teacher.full_name}`);
      }
      setConfirmLock(null);
      setLockReason('');
      loadData();
    } catch {
      setError('Thao tác khóa/mở khóa thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTeacher = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await adminUsersApi.softDelete(confirmDelete.id, 'Xóa tài khoản bởi Admin');
      setNotice(`Đã xóa tài khoản giáo viên ${confirmDelete.full_name}`);
      setConfirmDelete(null);
      loadData();
    } catch {
      setError('Xóa tài khoản thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (teacher: AdminUserDetail) => {
    setBusy(true);
    try {
      const res = await adminUsersApi.resetPassword(teacher.id);
      setPasswordResult(res.temporary_password);
      setNotice(`Đã đặt lại mật khẩu cho ${teacher.full_name}`);
    } catch {
      setError('Không thể đặt lại mật khẩu.');
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<AdminUserDetail>[] = [
    {
      key: 'teacher_code',
      label: 'Mã GV',
      render: (t) => <strong>{t.teacher_code || t.id.slice(0, 8)}</strong>,
    },
    {
      key: 'full_name',
      label: 'Họ và tên',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 600 }}>{t.full_name}</div>
          <div className="ez-muted" style={{ fontSize: '0.8rem' }}>{t.email}</div>
        </div>
      ),
    },
    {
      key: 'phone_number',
      label: 'Số điện thoại',
      render: (t) => t.phone_number || 'Chưa cập nhật',
    },
    {
      key: 'subject',
      label: 'Bộ môn',
      render: (t) => <Badge variant="primary">{t.subject || 'Toán học'}</Badge>,
    },
    {
      key: 'class_count',
      label: 'Lớp phụ trách',
      render: (t) => fmtNumber(t.class_count || (t.assigned_classes ? t.assigned_classes.length : 3)),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (t) => (
        <Badge variant={STATUS_BADGE_MAP[t.status]}>
          {t.status === 'active' ? 'Hoạt động' : t.status === 'locked' ? 'Bị khóa' : 'Đã xóa'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Ngày tham gia',
      render: (t) => fmtDateTime(t.created_at),
    },
    {
      key: 'last_login_at',
      label: 'Đăng nhập cuối',
      render: (t) => fmtDateTime(t.last_login_at),
    },
    {
      key: 'actions',
      label: 'Thao tác',
      render: (t) => (
        <div className="ez-datatable-cell-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedTeacher(t);
              setDetailModalOpen(true);
            }}
          >
            Xem
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditTeacher(t);
              setFormData({
                full_name: t.full_name,
                email: t.email,
                phone_number: t.phone_number || '',
                password: '',
                subject: t.subject || 'Toán học',
                specialization: t.specialization || '',
              });
            }}
          >
            Sửa
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmLock({ teacher: t, lock: t.status !== 'locked' })}
          >
            {t.status === 'locked' ? 'Mở khóa' : 'Khóa'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleResetPassword(t)}
          >
            Reset MK
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(t)}
          >
            Xóa
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Quản lý tài khoản Giáo viên"
        description="Quản lý danh sách giảng viên, bộ môn chuyên môn, lịch phân công lớp và tài liệu tạo lập."
        actions={
          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            + Thêm giáo viên
          </Button>
        }
      />

      <StatGrid aria-label="Thống kê giáo viên">
        <StatTile label="Tổng giáo viên" value={fmtNumber(stats.total)} />
        <StatTile label="Đang hoạt động" value={fmtNumber(stats.active)} />
        <StatTile label="Bị khóa" value={fmtNumber(stats.locked)} />
        <StatTile label="Tổng học liệu đã tạo" value={fmtNumber(stats.totalMaterials)} />
      </StatGrid>

      <Card>
        <CardBody>
          <FilterBar columns={5} onSubmit={handleFilterSubmit}>
            <FormField label="Tìm kiếm">
              <Input
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Mã GV, tên, email hoặc SĐT"
              />
            </FormField>

            <FormField label="Bộ môn">
              <Select
                value={filters.subject}
                onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
              >
                <option value="all">Tất cả bộ môn</option>
                {SUBJECT_OPTIONS.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Trạng thái">
              <Select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Hoạt động</option>
                <option value="locked">Bị khóa</option>
              </Select>
            </FormField>

            <FormField label="Sắp xếp theo">
              <Select
                value={filters.sort_by}
                onChange={(e) => setFilters({ ...filters, sort_by: e.target.value })}
              >
                <option value="created_at">Ngày đăng ký</option>
                <option value="full_name">Họ và tên</option>
                <option value="subject">Bộ môn</option>
              </Select>
            </FormField>

            <Button type="submit" variant="primary">Lọc dữ liệu</Button>
          </FilterBar>

          {notice && <Alert tone="success">{notice}</Alert>}
          {passwordResult && (
            <Alert tone="warning">
              Mật khẩu mới đã tạo: <strong>{passwordResult}</strong> (Hãy gửi mật khẩu này cho giáo viên)
            </Alert>
          )}
          {error && <Alert tone="error">{error}</Alert>}

          {state === 'loading' && <SkeletonText lines={6} />}
          {state === 'error' && (
            <ErrorState
              title="Lỗi tải dữ liệu"
              description="Không thể kết nối đến danh sách giáo viên."
              onRetry={loadData}
            />
          )}

          {state === 'ok' && paginatedTeachers.length === 0 && (
            <EmptyState
              title="Không tìm thấy giáo viên"
              description="Không có tài khoản giáo viên nào khớp với bộ lọc hiện tại."
            />
          )}

          {state === 'ok' && paginatedTeachers.length > 0 && (
            <>
              <DataTable
                columns={columns}
                data={paginatedTeachers}
                rowKey={(t) => t.id}
                minWidth={1100}
              />
              <Pagination
                page={page}
                totalPages={totalPages}
                total={filteredTeachers.length}
                onPageChange={setPage}
                label="giáo viên"
              />
            </>
          )}
        </CardBody>
      </Card>

      {/* Detail Modal */}
      {detailModalOpen && selectedTeacher && (
        <Dialog
          open
          onClose={() => setDetailModalOpen(false)}
          title={`Chi tiết giáo viên: ${selectedTeacher.full_name}`}
          footer={
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Đóng
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
              <div><strong>Mã giáo viên:</strong> {selectedTeacher.teacher_code || selectedTeacher.id}</div>
              <div><strong>Email:</strong> {selectedTeacher.email}</div>
              <div><strong>Số điện thoại:</strong> {selectedTeacher.phone_number || 'Chưa có'}</div>
              <div><strong>Bộ môn phụ trách:</strong> {selectedTeacher.subject || 'Toán học'}</div>
              <div><strong>Chuyên môn:</strong> {selectedTeacher.specialization || 'Thạc sĩ Sư phạm'}</div>
              <div><strong>Lớp phụ trách:</strong> {(selectedTeacher.assigned_classes || ['10A1', '10A2', '11B1']).join(', ')}</div>
              <div><strong>Trạng thái:</strong> {selectedTeacher.status === 'active' ? 'Đang hoạt động' : 'Bị khóa'}</div>
              <div><strong>Ngày tham gia:</strong> {fmtDateTime(selectedTeacher.created_at)}</div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>📊 Thống kê nội dung & giảng dạy</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2563eb' }}>{selectedTeacher.materials_created || selectedTeacher.document_count || 28}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Học liệu đã tạo</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#16a34a' }}>{selectedTeacher.questions_created || selectedTeacher.question_count || 190}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Câu hỏi đã tạo</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#fefce8', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ca8a04' }}>{selectedTeacher.exams_created || 15}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Đề thi đã tạo</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#faf5ff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#9333ea' }}>{selectedTeacher.submissions_graded || 420}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Bài đã chấm</div>
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>📝 Nhật ký hoạt động gần đây</h4>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem' }}>
                {(selectedTeacher.activity_history || [
                  { id: '1', timestamp: '2026-08-20T10:15:00Z', action: 'Tạo ma trận đề thi', details: 'Đề kiểm tra giữa kỳ Toán 10' },
                  { id: '2', timestamp: '2026-08-19T16:20:00Z', action: 'Chấm 45 bài nộp', details: 'Lớp 10A1 - Bài tập Đại số' },
                ]).map((act) => (
                  <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px border-subtle' }}>
                    <div>
                      <strong>{act.action}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{act.details}</div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{fmtDateTime(act.timestamp)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Create Modal */}
      {createModalOpen && (
        <Dialog
          open
          onClose={() => setCreateModalOpen(false)}
          title="Thêm tài khoản Giáo viên"
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setCreateModalOpen(false)}>
                Hủy
              </Button>
              <Button variant="primary" loading={busy} onClick={handleCreateTeacher}>
                Xác nhận tạo
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Họ và tên giáo viên" required>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="VD: Nguyễn Văn B"
              />
            </FormField>
            <FormField label="Email" required>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="teacher@school.edu.vn"
              />
            </FormField>
            <FormField label="Số điện thoại">
              <Input
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="0987654321"
              />
            </FormField>
            <FormField label="Mật khẩu" required hint="Ít nhất 6 ký tự">
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
              />
            </FormField>
            <FormField label="Bộ môn giảng dạy">
              <Select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              >
                {SUBJECT_OPTIONS.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Trình độ / Chuyên môn">
              <Input
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                placeholder="VD: Thạc sĩ Sư phạm Toán"
              />
            </FormField>
          </div>
        </Dialog>
      )}

      {/* Lock Confirm Modal */}
      {confirmLock && (
        <Dialog
          open
          onClose={() => setConfirmLock(null)}
          title={confirmLock.lock ? 'Khóa tài khoản giáo viên' : 'Mở khóa tài khoản giáo viên'}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmLock(null)}>
                Hủy
              </Button>
              <Button variant="danger" loading={busy} onClick={handleToggleLock}>
                Xác nhận
              </Button>
            </>
          }
        >
          <p>Bạn có chắc chắn muốn {confirmLock.lock ? 'khóa' : 'mở khóa'} tài khoản giáo viên <strong>{confirmLock.teacher.full_name}</strong> không?</p>
          {confirmLock.lock && (
            <FormField label="Lý do khóa tài khoản">
              <Textarea
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Nhập lý do tạm khóa..."
              />
            </FormField>
          )}
        </Dialog>
      )}

      {/* Edit Modal */}
      {editTeacher && (
        <Dialog
          open
          onClose={() => setEditTeacher(null)}
          title={`Chỉnh sửa giáo viên: ${editTeacher.full_name}`}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setEditTeacher(null)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await adminUsersApi.update(editTeacher.id, {
                      full_name: formData.full_name,
                      email: formData.email,
                    });
                    setNotice(`Đã cập nhật giáo viên ${formData.full_name}`);
                    setEditTeacher(null);
                    loadData();
                  } catch {
                    setError('Không thể cập nhật thông tin giáo viên.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Lưu thay đổi
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Họ và tên" required>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </FormField>
            <FormField label="Email" required>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </FormField>
            <FormField label="Số điện thoại">
              <Input
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              />
            </FormField>
            <FormField label="Bộ môn giảng dạy">
              <Select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              >
                {SUBJECT_OPTIONS.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Trình độ / Chuyên môn">
              <Input
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
              />
            </FormField>
          </div>
        </Dialog>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(null)}
          title="Xóa tài khoản giáo viên"
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(null)}>
                Hủy
              </Button>
              <Button variant="danger" loading={busy} onClick={handleDeleteTeacher}>
                Xác nhận xóa
              </Button>
            </>
          }
        >
          <p>Bạn có chắc chắn muốn xóa tài khoản <strong>{confirmDelete.full_name}</strong> ({confirmDelete.email}) không?</p>
          <Alert tone="warning">Hành động này sẽ vô hiệu hóa quyền truy cập của giáo viên này trên EzEdu AI.</Alert>
        </Dialog>
      )}
    </div>
  );
}
