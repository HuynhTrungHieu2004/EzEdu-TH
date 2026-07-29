import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, LogOut, Monitor, Moon, Settings, Sun, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonText,
} from '../components/ui';
import { classesApi } from '../api/classesApi';
import type { ClassMemberView } from '../types/classes';
import { personalizationApi } from '../api/personalizationApi';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemePreference } from '../contexts/ThemeContext';
import './dashboard.css';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'student':
      return 'Học sinh';
    case 'lecturer':
    case 'user':
      return 'Giáo viên';
    default:
      return 'Người dùng';
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: React.ReactNode }> = [
  { value: 'light', label: 'Sáng', icon: <Sun size={16} aria-hidden="true" /> },
  { value: 'dark', label: 'Tối', icon: <Moon size={16} aria-hidden="true" /> },
  { value: 'system', label: 'Theo hệ thống', icon: <Monitor size={16} aria-hidden="true" /> },
];

/** Khối "Lớp của tôi" — dùng `GET /classes/mine`, endpoint đã có backend nhưng chưa từng có UI. */
function MyClassesBlock() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [classes, setClasses] = useState<ClassMemberView[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    classesApi
      .listMine(controller.signal)
      .then((res) => {
        setClasses(res.items ?? []);
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">Lớp của tôi</CardTitle>
        </div>
      </CardHeader>
      <CardBody>
        {state === 'loading' && <SkeletonText lines={2} />}
        {state === 'error' && (
          <ErrorState compact title="Không tải được danh sách lớp" />
        )}
        {state === 'ready' && classes.length === 0 && (
          <EmptyState
            compact
            icon={<Users size={24} />}
            title="Bạn chưa thuộc lớp nào"
            description="Giáo viên sẽ thêm bạn vào lớp khi cần giao đề theo nhóm."
          />
        )}
        {state === 'ready' &&
          classes.map((item) => (
            <div key={item.id} className="dash-row">
              <span className="dash-row-icon" aria-hidden="true">
                <Users size={18} />
              </span>
              <span className="dash-row-main">
                <span className="dash-row-title">{item.name}</span>
                {typeof item.student_count === 'number' && (
                  <span className="dash-row-meta">
                    <span>{item.student_count} học sinh</span>
                  </span>
                )}
              </span>
            </div>
          ))}
      </CardBody>
    </Card>
  );
}

/** Thiết lập học tập của học sinh — chỉ đọc, sửa qua trang thiết lập. */
function StudyProfileBlock() {
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [grade, setGrade] = useState<number | null>(null);
  const [strong, setStrong] = useState<string[]>([]);
  const [weak, setWeak] = useState<string[]>([]);
  const [combos, setCombos] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    personalizationApi
      .getMyStudentOnboarding()
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setState('empty');
          return;
        }
        setGrade(data.grade_level ?? null);
        setStrong(data.strong_subjects ?? []);
        setWeak(data.weak_subjects ?? []);
        setCombos(data.target_exam_combinations ?? []);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">Thiết lập học tập</CardTitle>
        </div>
        <Link to="/student-onboarding">
          <Button variant="ghost" size="sm">
            Cập nhật
          </Button>
        </Link>
      </CardHeader>
      <CardBody>
        {state === 'loading' && <SkeletonText lines={2} />}
        {state === 'error' && <ErrorState compact title="Không tải được thiết lập học tập" />}
        {state === 'empty' && (
          <EmptyState
            compact
            icon={<GraduationCap size={24} />}
            title="Chưa có thiết lập"
            description="Cho biết lớp và các môn cần cải thiện để hệ thống ưu tiên nội dung phù hợp."
            actions={
              <Link to="/student-onboarding">
                <Button size="sm">Thiết lập ngay</Button>
              </Link>
            }
          />
        )}
        {state === 'ready' && (
          <dl className="profile-facts">
            <div>
              <dt className="profile-fact-label">Lớp</dt>
              <dd className="profile-fact-value">{grade ? `Lớp ${grade}` : '—'}</dd>
            </div>
            <div>
              <dt className="profile-fact-label">Tổ hợp hướng tới</dt>
              <dd className="profile-fact-value">{combos.length > 0 ? combos.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="profile-fact-label">Môn là điểm mạnh</dt>
              <dd className="profile-fact-value">{strong.length > 0 ? strong.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="profile-fact-label">Môn cần cải thiện</dt>
              <dd className="profile-fact-value">{weak.length > 0 ? weak.join(', ') : '—'}</dd>
            </div>
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Hồ sơ và cài đặt, dùng chung cho học sinh và giáo viên; nội dung khác nhau
 * theo vai trò. Trước đây không có trang này ở bất kỳ vai trò nào, dù
 * `GET /auth/me` đã có sẵn dữ liệu.
 * Xem docs/ui-redesign/01-audit-report.md §6.2 (lỗi H5).
 */
export default function ProfilePage() {
  const { user, role, area, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();

  const displayName = user?.full_name || 'Người dùng';

  return (
    <>
      <PageHeader
        title="Hồ sơ & cài đặt"
        description="Thông tin tài khoản, thiết lập học tập và giao diện."
      />

      <div className="profile-grid">
        <div className="ez-stack-lg">
          <Card>
            <CardBody>
              <div className="profile-identity">
                <span className="profile-avatar" aria-hidden="true">
                  {initialsOf(displayName)}
                </span>
                <div>
                  <p className="profile-name">{displayName}</p>
                  <p className="profile-email">{user?.email}</p>
                </div>
              </div>

              <dl className="profile-facts" style={{ marginTop: 'var(--ez-space-6)' }}>
                <div>
                  <dt className="profile-fact-label">Vai trò</dt>
                  <dd className="profile-fact-value">{roleLabel(role)}</dd>
                </div>
                <div>
                  <dt className="profile-fact-label">Ngày tạo tài khoản</dt>
                  <dd className="profile-fact-value">{formatDate(user?.created_at)}</dd>
                </div>
                <div>
                  <dt className="profile-fact-label">Đăng nhập gần nhất</dt>
                  <dd className="profile-fact-value">{formatDate(user?.last_login_at)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {area === 'student' && <StudyProfileBlock />}
          {area === 'student' && <MyClassesBlock />}
        </div>

        <div className="ez-stack-lg">
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Giao diện</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              <div
                className="profile-theme-options"
                role="group"
                aria-label="Chọn chế độ giao diện"
              >
                {THEME_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={preference === option.value ? 'primary' : 'outline'}
                    size="sm"
                    leadingIcon={option.icon}
                    aria-pressed={preference === option.value}
                    onClick={() => setPreference(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Tài khoản</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              <p className="dash-onboard-desc" style={{ marginBottom: 'var(--ez-space-4)' }}>
                Đăng xuất khỏi thiết bị này. Dữ liệu học tập của bạn vẫn được giữ nguyên.
              </p>
              <Button
                variant="outline"
                leadingIcon={<LogOut size={16} aria-hidden="true" />}
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
              >
                Đăng xuất
              </Button>
            </CardBody>
          </Card>

          {area === 'teacher' && (
            <Card variant="muted">
              <CardBody>
                <p className="dash-onboard-title">Cần đổi cấu hình hệ thống?</p>
                <p className="dash-onboard-desc">
                  Hạn mức AI, định dạng cho phép và các thiết lập chung do quản trị viên cấu hình.
                  Hãy liên hệ quản trị viên nếu bạn cần thay đổi.
                </p>
                <div className="dash-onboard-action">
                  <span className="ezp-tool-meta-item">
                    <Settings size={14} aria-hidden="true" />
                    Không khả dụng với tài khoản giáo viên
                  </span>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
