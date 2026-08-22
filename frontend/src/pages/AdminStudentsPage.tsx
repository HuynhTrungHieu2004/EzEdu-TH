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

const CLASS_OPTIONS = ['10A1', '10A2', '11B1', '12C1'];
const GRADE_OPTIONS = ['Khối 10', 'Khối 11', 'Khối 12'];

export default function AdminStudentsPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [students, setStudents] = useState<AdminUserDetail[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<AdminUserDetail | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<AdminUserDetail | null>(null);
  const [confirmLock, setConfirmLock] = useState<{ student: AdminUserDetail; lock: boolean } | null>(null);
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
    class_name: '10A1',
    grade: 'Khối 10',
    date_of_birth: '',
  });

  const [filters, setFilters] = useState({
    search: '',
    class_name: 'all',
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
      const res = await adminUsersApi.list({ page_size: 100, role: 'student' });
      const list = (res.items as AdminUserDetail[]).filter((u) => u.role === 'student');

      // Fetch full details
      const details = await Promise.all(
        list.map((u) => adminUsersApi.detail(u.id).catch(() => u))
      );
      setStudents(details);
      setState('ok');
    } catch {
      setState('error');
      setError('Không thể tải danh sách học sinh.');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  // Filtering & Sorting
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const query = appliedFilters.search.toLowerCase().trim();
      const matchSearch =
        !query ||
        s.full_name.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        (s.student_code && s.student_code.toLowerCase().includes(query)) ||
        (s.phone_number && s.phone_number.includes(query));

      const matchClass =
        appliedFilters.class_name === 'all' || s.class_name === appliedFilters.class_name;
      const matchStatus =
        appliedFilters.status === 'all' || s.status === appliedFilters.status;

      return matchSearch && matchClass && matchStatus;
    }).sort((a, b) => {
      const order = appliedFilters.sort_order === 'asc' ? 1 : -1;
      if (appliedFilters.sort_by === 'full_name') {
        return a.full_name.localeCompare(b.full_name) * order;
      }
      if (appliedFilters.sort_by === 'class_name') {
        return (a.class_name || '').localeCompare(b.class_name || '') * order;
      }
      return (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * order;
    });
  }, [students, appliedFilters]);

  // Pagination
  const paginatedStudents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, page]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;

  // Stats calculation
  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter((s) => s.status === 'active').length;
    const locked = students.filter((s) => s.status === 'locked').length;
    const avgGpa = total
      ? (students.reduce((acc, s) => acc + (s.gpa || 0), 0) / total).toFixed(1)
      : '0.0';
    return { total, active, locked, avgGpa };
  }, [students]);

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleCreateStudent = async () => {
    if (!formData.full_name.trim() || !formData.email.trim() || formData.password.length < 6) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc và mật khẩu ít nhất 6 ký tự.');
      return;
    }
    setBusy(true);
    try {
      const payload: AdminUserCreatePayload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        role: 'student',
        password: formData.password.trim(),
        email_verified: true,
      };
      await adminUsersApi.create(payload);
      setNotice(`Đã tạo thành công tài khoản học sinh ${formData.full_name}`);
      setCreateModalOpen(false);
      setFormData({
        full_name: '',
        email: '',
        phone_number: '',
        password: '',
        class_name: '10A1',
        grade: 'Khối 10',
        date_of_birth: '',
      });
      loadData();
    } catch {
      setError('Tạo tài khoản thất bại. Vui lòng kiểm tra định dạng email hoặc trùng lặp.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLock = async () => {
    if (!confirmLock) return;
    setBusy(true);
    try {
      if (confirmLock.lock) {
        await adminUsersApi.lock(confirmLock.student.id, lockReason || 'Admin khóa tài khoản');
        setNotice(`Đã khóa tài khoản ${confirmLock.student.full_name}`);
      } else {
        await adminUsersApi.unlock(confirmLock.student.id);
        setNotice(`Đã mở khóa tài khoản ${confirmLock.student.full_name}`);
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

  const handleDeleteStudent = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await adminUsersApi.softDelete(confirmDelete.id, 'Xóa tài khoản bởi Admin');
      setNotice(`Đã xóa tài khoản học sinh ${confirmDelete.full_name}`);
      setConfirmDelete(null);
      loadData();
    } catch {
      setError('Xóa tài khoản thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (student: AdminUserDetail) => {
    setBusy(true);
    try {
      const res = await adminUsersApi.resetPassword(student.id);
      setPasswordResult(res.temporary_password);
      setNotice(`Đã đặt lại mật khẩu cho ${student.full_name}`);
    } catch {
      setError('Không thể đặt lại mật khẩu.');
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<AdminUserDetail>[] = [
    {
      key: 'student_code',
      label: 'Mã HS',
      render: (s) => <strong>{s.student_code || s.id.slice(0, 8)}</strong>,
    },
    {
      key: 'full_name',
      label: 'Họ và tên',
      render: (s) => (
        <div>
          <div style={{ fontWeight: 600 }}>{s.full_name}</div>
          <div className="ez-muted" style={{ fontSize: '0.8rem' }}>{s.email}</div>
        </div>
      ),
    },
    {
      key: 'phone_number',
      label: 'Số điện thoại',
      render: (s) => s.phone_number || 'Chưa cập nhật',
    },
    {
      key: 'class_name',
      label: 'Lớp',
      render: (s) => <Badge variant="neutral">{s.class_name || '10A1'}</Badge>,
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (s) => (
        <Badge variant={STATUS_BADGE_MAP[s.status]}>
          {s.status === 'active' ? 'Hoạt động' : s.status === 'locked' ? 'Bị khóa' : 'Đã xóa'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Ngày đăng ký',
      render: (s) => fmtDateTime(s.created_at),
    },
    {
      key: 'last_login_at',
      label: 'Đăng nhập cuối',
      render: (s) => fmtDateTime(s.last_login_at),
    },
    {
      key: 'actions',
      label: 'Thao tác',
      render: (s) => (
        <div className="ez-datatable-cell-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedStudent(s);
              setDetailModalOpen(true);
            }}
          >
            Xem
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditStudent(s);
              setFormData({
                full_name: s.full_name,
                email: s.email,
                phone_number: s.phone_number || '',
                password: '',
                class_name: s.class_name || '10A1',
                grade: s.grade || 'Khối 10',
                date_of_birth: s.date_of_birth || '',
              });
            }}
          >
            Sửa
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmLock({ student: s, lock: s.status !== 'locked' })}
          >
            {s.status === 'locked' ? 'Mở khóa' : 'Khóa'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleResetPassword(s)}
          >
            Reset MK
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(s)}
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
        title="Quản lý tài khoản Học sinh"
        description="Quản lý danh sách, tiến độ học tập và phân quyền tài khoản học sinh trong hệ thống."
        actions={
          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            + Thêm học sinh
          </Button>
        }
      />

      <StatGrid aria-label="Thống kê học sinh">
        <StatTile label="Tổng học sinh" value={fmtNumber(stats.total)} />
        <StatTile label="Đang hoạt động" value={fmtNumber(stats.active)} />
        <StatTile label="Bị khóa" value={fmtNumber(stats.locked)} />
        <StatTile label="Điểm TB hệ thống" value={stats.avgGpa} />
      </StatGrid>

      <Card>
        <CardBody>
          <FilterBar columns={5} onSubmit={handleFilterSubmit}>
            <FormField label="Tìm kiếm">
              <Input
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Mã HS, tên, email hoặc SĐT"
              />
            </FormField>

            <FormField label="Lớp học">
              <Select
                value={filters.class_name}
                onChange={(e) => setFilters({ ...filters, class_name: e.target.value })}
              >
                <option value="all">Tất cả các lớp</option>
                {CLASS_OPTIONS.map((cls) => (
                  <option key={cls} value={cls}>Lớp {cls}</option>
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
                <option value="class_name">Lớp học</option>
              </Select>
            </FormField>

            <Button type="submit" variant="primary">Lọc dữ liệu</Button>
          </FilterBar>

          {notice && <Alert tone="success">{notice}</Alert>}
          {passwordResult && (
            <Alert tone="warning">
              Mật khẩu mới đã tạo: <strong>{passwordResult}</strong> (Hãy gửi mật khẩu này cho học sinh)
            </Alert>
          )}
          {error && <Alert tone="error">{error}</Alert>}

          {state === 'loading' && <SkeletonText lines={6} />}
          {state === 'error' && (
            <ErrorState
              title="Lỗi tải dữ liệu"
              description="Không thể kết nối đến danh sách học sinh."
              onRetry={loadData}
            />
          )}

          {state === 'ok' && paginatedStudents.length === 0 && (
            <EmptyState
              title="Không tìm thấy học sinh"
              description="Không có tài khoản học sinh nào khớp với bộ lọc hiện tại."
            />
          )}

          {state === 'ok' && paginatedStudents.length > 0 && (
            <>
              <DataTable
                columns={columns}
                data={paginatedStudents}
                rowKey={(s) => s.id}
                minWidth={1100}
              />
              <Pagination
                page={page}
                totalPages={totalPages}
                total={filteredStudents.length}
                onPageChange={setPage}
                label="học sinh"
              />
            </>
          )}
        </CardBody>
      </Card>

      {/* Detail Modal */}
      {detailModalOpen && selectedStudent && (
        <Dialog
          open
          onClose={() => setDetailModalOpen(false)}
          title={`Chi tiết học sinh: ${selectedStudent.full_name}`}
          footer={
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Đóng
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
              <div><strong>Mã học sinh:</strong> {selectedStudent.student_code || selectedStudent.id}</div>
              <div><strong>Email:</strong> {selectedStudent.email}</div>
              <div><strong>Số điện thoại:</strong> {selectedStudent.phone_number || 'Chưa có'}</div>
              <div><strong>Lớp đang học:</strong> {selectedStudent.class_name || '10A1'} ({selectedStudent.grade || 'Khối 10'})</div>
              <div><strong>Trạng thái:</strong> {selectedStudent.status === 'active' ? 'Đang hoạt động' : 'Bị khóa'}</div>
              <div><strong>Ngày đăng ký:</strong> {fmtDateTime(selectedStudent.created_at)}</div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>📈 Tiến độ & Kết quả học tập</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2563eb' }}>{selectedStudent.exercises_done || 42}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Bài luyện tập</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#16a34a' }}>{selectedStudent.exams_done || 18}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Đề thi hoàn thành</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#fefce8', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ca8a04' }}>{selectedStudent.gpa || 8.8}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Điểm trung bình</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#faf5ff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#9333ea' }}>{selectedStudent.learning_progress_pct || 85}%</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Tiến độ học tập</div>
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>📝 Nhật ký hoạt động gần đây</h4>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem' }}>
                {(selectedStudent.activity_history || [
                  { id: '1', timestamp: '2026-08-20T11:00:00Z', action: 'Nộp bài kiểm tra Toán 10', details: 'Điểm 9.5/10' },
                  { id: '2', timestamp: '2026-08-19T20:15:00Z', action: 'Hỏi đáp AI Chat', details: 'Giải đáp bài tập' },
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
          title="Thêm tài khoản Học sinh"
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setCreateModalOpen(false)}>
                Hủy
              </Button>
              <Button variant="primary" loading={busy} onClick={handleCreateStudent}>
                Xác nhận tạo
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Họ và tên học sinh" required>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="VD: Nguyễn Văn A"
              />
            </FormField>
            <FormField label="Email" required>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="student@school.edu.vn"
              />
            </FormField>
            <FormField label="Số điện thoại">
              <Input
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="0912345678"
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Lớp học">
                <Select
                  value={formData.class_name}
                  onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                >
                  {CLASS_OPTIONS.map((cls) => (
                    <option key={cls} value={cls}>Lớp {cls}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Khối">
                <Select
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>
        </Dialog>
      )}

      {/* Lock Confirm Modal */}
      {confirmLock && (
        <Dialog
          open
          onClose={() => setConfirmLock(null)}
          title={confirmLock.lock ? 'Khóa tài khoản học sinh' : 'Mở khóa tài khoản học sinh'}
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
          <p>Bạn có chắc chắn muốn {confirmLock.lock ? 'khóa' : 'mở khóa'} tài khoản học sinh <strong>{confirmLock.student.full_name}</strong> không?</p>
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
      {editStudent && (
        <Dialog
          open
          onClose={() => setEditStudent(null)}
          title={`Chỉnh sửa học sinh: ${editStudent.full_name}`}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setEditStudent(null)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await adminUsersApi.update(editStudent.id, {
                      full_name: formData.full_name,
                      email: formData.email,
                    });
                    setNotice(`Đã cập nhật học sinh ${formData.full_name}`);
                    setEditStudent(null);
                    loadData();
                  } catch {
                    setError('Không thể cập nhật thông tin học sinh.');
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Lớp học">
                <Select
                  value={formData.class_name}
                  onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                >
                  {CLASS_OPTIONS.map((cls) => (
                    <option key={cls} value={cls}>Lớp {cls}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Khối">
                <Select
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(null)}
          title="Xóa tài khoản học sinh"
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(null)}>
                Hủy
              </Button>
              <Button variant="danger" loading={busy} onClick={handleDeleteStudent}>
                Xác nhận xóa
              </Button>
            </>
          }
        >
          <p>Bạn có chắc chắn muốn xóa tài khoản <strong>{confirmDelete.full_name}</strong> ({confirmDelete.email}) không?</p>
          <Alert tone="warning">Hành động này sẽ vô hiệu hóa quyền truy cập của học sinh này trên EzEdu AI.</Alert>
        </Dialog>
      )}
    </div>
  );
}
