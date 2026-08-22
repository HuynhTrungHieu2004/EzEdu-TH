import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Calendar,
  ClipboardList,
  Database,
  Ellipsis,
  FileQuestion,
  LayoutDashboard,
  Library,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  School,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Star,
  Sun,
  Target,
  TrendingUp,
  User,
  UserCog,
  Users,
  Video,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import { notificationsApi } from '../api/notificationsApi';
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  Skeleton,
} from './ui';
import './app-layout.css';

interface AppLayoutProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Số hiển thị ở cuối mục, kèm nhãn đọc được cho trình đọc màn hình. */
  badge?: { value: number; label: string };
  onClick?: () => void;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const ICON = 18;

function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'student':
      return 'Học sinh';
    case 'lecturer':
    case 'user':
      return 'Giáo viên';
    case 'super_admin':
      return 'Quản trị cấp cao';
    case 'admin':
      return 'Quản trị viên';
    case 'moderator':
      return 'Kiểm duyệt';
    case 'support':
      return 'Hỗ trợ';
    case 'analyst':
      return 'Phân tích';
    default:
      return 'Người dùng';
  }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user, role, area, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (area !== 'student') return;
    let active = true;
    notificationsApi.list()
      .then((items) => {
        if (active) setUnreadNotifications(items.filter((item) => !item.is_read).length);
      })
      .catch(() => {
        if (active) setUnreadNotifications(0);
      });
    return () => { active = false; };
  }, [area]);

  function isActive(path: string): boolean {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  /**
   * Nhóm mục điều hướng theo khu vực.
   *
   * Điểm khác biệt quan trọng so với bản trước: mỗi khu vực chỉ nhận đúng nhóm
   * của mình. Trước đây `isLecturerRole` bao gồm cả `admin` và `super_admin`,
   * nên tài khoản quản trị thấy thêm 5 mục của giáo viên — những mục gọi API
   * theo quyền sở hữu nên gần như luôn rỗng với admin.
   * Xem docs/ui-redesign/01-audit-report.md §6.2 (lỗi H2).
   */
  function buildGroups(): NavGroup[] {
    if (area === 'student') {
      return [
        {
          label: '🏠 Học tập & Tổng quan',
          items: [
            { to: '/student/dashboard', label: 'Tổng quan Dashboard', icon: <LayoutDashboard size={ICON} /> },
            { to: '/student/courses', label: 'Khóa học của tôi', icon: <BookOpen size={ICON} /> },
            { to: '/student/online-schedules', label: 'Lịch học Online', icon: <Video size={ICON} /> },
            { to: '/student/learning-materials', label: 'Học liệu số', icon: <Library size={ICON} /> },
            { to: '/hoc-theo-mon', label: 'Học theo môn', icon: <BookOpen size={ICON} /> },
            { to: '/student/practice', label: 'Bài luyện tập', icon: <ClipboardList size={ICON} /> },
            { to: '/student/exams', label: 'Đề thi chính thức', icon: <FileQuestion size={ICON} /> },
          ],
        },
        {
          label: '📊 Kết quả & Tiến độ',
          items: [
            { to: '/student/results', label: 'Kết quả học tập', icon: <Award size={ICON} /> },
            { to: '/student/progress', label: 'Tiến độ học tập', icon: <TrendingUp size={ICON} /> },
            { to: '/student/learning-path', label: 'Lộ trình học cá nhân', icon: <Target size={ICON} /> },
          ],
        },
        {
          label: '🤖 Trợ lý AI & Thông báo',
          items: [
            { to: '/student/ask-ai', label: 'Hỏi AI trợ lý', icon: <Bot size={ICON} /> },
            {
              to: '/student/notifications',
              label: 'Thông báo',
              icon: <Bell size={ICON} />,
              badge: unreadNotifications > 0
                ? { value: unreadNotifications, label: `${unreadNotifications} thông báo mới` }
                : undefined,
            },
            { to: '/student/profile', label: 'Tài khoản cá nhân', icon: <User size={ICON} /> },
            { to: '#logout', label: 'Đăng xuất', icon: <LogOut size={ICON} />, onClick: () => setShowLogoutConfirm(true) },
          ],
        },
      ];
    }

    if (area === 'teacher') {
      return [
        {
          label: '📊 Tổng quan',
          items: [
            { to: '/dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={ICON} /> },
          ],
        },
        {
          label: '🤖 AI',
          items: [
            { to: '/chat-advanced', label: 'Hỏi đáp AI', icon: <MessageSquare size={ICON} /> },
            { to: '/tools', label: 'Công cụ AI', icon: <Sparkles size={ICON} /> },
            { to: '/teacher/ai-generate-exam', label: 'Tạo đề AI', icon: <Sparkles size={ICON} /> },
            { to: '/teacher/ai-generate-question', label: 'Sinh câu hỏi', icon: <Bot size={ICON} /> },
            { to: '/teacher/ai-grading', label: 'Chấm điểm AI', icon: <Award size={ICON} /> },
          ],
        },
        {
          label: '📚 Quản lý giảng dạy',
          items: [
            { to: '/teacher/courses', label: 'Khóa học', icon: <BookOpen size={ICON} /> },
            { to: '/documents', label: 'Học liệu', icon: <Library size={ICON} /> },
            { to: '/classes', label: 'Lớp học', icon: <School size={ICON} /> },
            { to: '/teacher/assignments', label: 'Bài tập', icon: <ClipboardList size={ICON} /> },
            { to: '/question-history', label: 'Đề thi', icon: <FileQuestion size={ICON} /> },
            { to: '/teacher/questions', label: 'Câu hỏi', icon: <FileQuestion size={ICON} /> },
            { to: '/question-bank', label: 'Ngân hàng câu hỏi', icon: <Database size={ICON} /> },
            { to: '/exam-blueprints', label: 'Ma trận đề', icon: <ScrollText size={ICON} /> },
            { to: '/teacher/content-history', label: 'Lịch sử nội dung', icon: <Activity size={ICON} /> },
          ],
        },
        {
          label: '📝 Chấm điểm',
          items: [
            { to: '/teacher/submissions', label: 'Bài nộp của học sinh', icon: <ClipboardList size={ICON} /> },
            { to: '/teacher/results', label: 'Kết quả', icon: <Award size={ICON} /> },
            { to: '/teacher/stats', label: 'Thống kê', icon: <BarChart3 size={ICON} /> },
          ],
        },
        {
          label: '📅 Lịch',
          items: [
            { to: '/teacher/schedules', label: 'Lịch dạy', icon: <Calendar size={ICON} /> },
            { to: '/teacher/exam-schedules', label: 'Lịch thi', icon: <Calendar size={ICON} /> },
            { to: '/teacher/notifications', label: 'Thông báo', icon: <Bell size={ICON} /> },
          ],
        },
        {
          label: '👤 Cá nhân',
          items: [
            { to: '/ho-so', label: 'Hồ sơ', icon: <User size={ICON} /> },
            { to: '/teacher/activity-logs', label: 'Nhật ký hoạt động', icon: <Activity size={ICON} /> },
            { to: '/teacher/settings', label: 'Cài đặt', icon: <Settings size={ICON} /> },
            { to: '#logout', label: 'Đăng xuất', icon: <LogOut size={ICON} />, onClick: () => setShowLogoutConfirm(true) },
          ],
        },
      ];
    }

    if (area === 'admin') {
      return [
        {
          label: 'Dashboard',
          items: [
            { to: '/admin/dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={ICON} /> },
          ],
        },
        {
          label: '🤖 AI',
          items: [
            { to: '/admin/ai-generate-exam', label: 'Tạo đề AI', icon: <Sparkles size={ICON} /> },
            { to: '/admin/ai-generate-question', label: 'Sinh câu hỏi', icon: <Bot size={ICON} /> },
            { to: '/admin/ai-grading', label: 'Chấm điểm AI', icon: <Award size={ICON} /> },
            { to: '/admin/ai-chat', label: 'Chat AI', icon: <MessageSquare size={ICON} /> },
          ],
        },
        {
          label: '📚 Quản lý nội dung',
          items: [
            { to: '/admin/documents', label: 'Học liệu', icon: <Library size={ICON} /> },
            { to: '/admin/exams', label: 'Đề thi', icon: <ClipboardList size={ICON} /> },
            { to: '/admin/questions', label: 'Câu hỏi', icon: <FileQuestion size={ICON} /> },
            { to: '/admin/question-bank', label: 'Ngân hàng câu hỏi', icon: <Database size={ICON} /> },
            { to: '/admin/exam-blueprints', label: 'Ma trận đề', icon: <ScrollText size={ICON} /> },
            { to: '/admin/mon-hoc', label: 'Danh mục môn', icon: <BookOpen size={ICON} /> },
          ],
        },
        {
          label: '👥 Quản lý tài khoản',
          items: [
            { to: '/admin/users', label: 'Tất cả tài khoản', icon: <Users size={ICON} /> },
            { to: '/admin/students', label: 'Học sinh', icon: <User size={ICON} /> },
            { to: '/admin/teachers', label: 'Giáo viên', icon: <UserCog size={ICON} /> },
            { to: '/admin/users?role=admin', label: 'Admin', icon: <Shield size={ICON} /> },
          ],
        },
        {
          label: '🎓 Quản lý đào tạo',
          items: [
            { to: '/admin/courses', label: 'Khóa học', icon: <BookOpen size={ICON} /> },
            { to: '/admin/classes', label: 'Lớp học', icon: <School size={ICON} /> },
            { to: '/admin/teachers', label: 'Giáo viên', icon: <UserCog size={ICON} /> },
            { to: '/admin/course-enrollments', label: 'Đăng ký khóa học', icon: <Users size={ICON} /> },
            { to: '/admin/courses', label: 'Bài học', icon: <BookOpen size={ICON} /> },
            { to: '/admin/exams', label: 'Bài kiểm tra', icon: <FileQuestion size={ICON} /> },
            { to: '/admin/exam-results', label: 'Kết quả học tập', icon: <Award size={ICON} /> },
          ],
        },
        {
          label: '📅 Thi cử',
          items: [
            { to: '/admin/exam-schedules', label: 'Lịch thi', icon: <Calendar size={ICON} /> },
            { to: '/admin/exam-results', label: 'Kết quả', icon: <Award size={ICON} /> },
            { to: '/admin/exam-stats', label: 'Thống kê', icon: <BarChart3 size={ICON} /> },
            { to: '/admin/reports', label: 'Báo cáo', icon: <ScrollText size={ICON} /> },
          ],
        },
        {
          label: '👤 Cá nhân',
          items: [
            { to: '/admin/notifications', label: 'Thông báo', icon: <Bell size={ICON} /> },
            { to: '/admin/favorites', label: 'Yêu thích', icon: <Star size={ICON} /> },
            { to: '/admin/audit-logs', label: 'Lịch sử', icon: <Activity size={ICON} /> },
            { to: '/admin/settings', label: 'Cài đặt', icon: <Settings size={ICON} /> },
            { to: '#logout', label: 'Đăng xuất', icon: <LogOut size={ICON} />, onClick: () => setShowLogoutConfirm(true) },
          ],
        },
      ];
    }

    return [];
  }

  const groups = buildGroups();
  const allItems = groups.flatMap((g) => g.items);
  const activeItem = allItems.find((item) => isActive(item.to));

  /** Tối đa 4 mục ở thanh dưới cùng trên mobile; phần còn lại vào "Thêm". */
  const tabItems = allItems.slice(0, 4);
  const overflowItems = allItems.slice(4);

  const displayName = user?.full_name || 'Người dùng';

  const userMenu = (
    <>
      <DropdownLabel>{displayName}</DropdownLabel>
      <DropdownSeparator />
      {area !== 'admin' && (
        <DropdownItem icon={<UserCog size={16} />} onClick={() => navigate('/ho-so')}>
          Hồ sơ & cài đặt
        </DropdownItem>
      )}
      <DropdownSeparator />
      <DropdownLabel>Giao diện</DropdownLabel>
      <DropdownItem
        icon={<Sun size={16} />}
        onClick={() => setPreference('light')}
        aria-current={preference === 'light' ? 'true' : undefined}
      >
        Sáng
      </DropdownItem>
      <DropdownItem
        icon={<Moon size={16} />}
        onClick={() => setPreference('dark')}
        aria-current={preference === 'dark' ? 'true' : undefined}
      >
        Tối
      </DropdownItem>
      <DropdownItem
        icon={<Monitor size={16} />}
        onClick={() => setPreference('system')}
        aria-current={preference === 'system' ? 'true' : undefined}
      >
        Theo hệ thống
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem
        icon={<LogOut size={16} />}
        danger
        onClick={() => setShowLogoutConfirm(true)}
      >
        Đăng xuất
      </DropdownItem>
    </>
  );

  function renderNavLink(item: NavItem, onNavigate?: () => void) {
    if (item.onClick || item.to === '#logout') {
      return (
        <button
          key={item.label}
          type="button"
          className="ez-nav-item"
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.6rem 0.85rem',
            borderRadius: '10px',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
          onClick={() => {
            if (onNavigate) onNavigate();
            if (item.onClick) item.onClick();
            else setShowLogoutConfirm(true);
          }}
        >
          <span className="ez-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="ez-nav-label">{item.label}</span>
        </button>
      );
    }

    const active = isActive(item.to);
    return (
      <Link
        key={`${item.to}:${item.label}`}
        to={item.to}
        className={active ? 'ez-nav-item ez-nav-item-active' : 'ez-nav-item'}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className="ez-nav-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="ez-nav-label">{item.label}</span>
        {item.badge ? (
          <>
            <Badge variant="error" count className="ez-nav-badge" aria-hidden="true">
              {item.badge.value}
            </Badge>
            <span className="ez-sr-only">{item.badge.label}</span>
          </>
        ) : null}
      </Link>
    );
  }

  return (
    <div className="ez-shell">
      <a className="ez-skip-link" href="#main">
        Bỏ qua tới nội dung chính
      </a>

      <aside className="ez-sidebar">
        <Link to={area === 'admin' ? '/admin/dashboard' : '/dashboard'} className="ez-brand">
          <span className="ez-brand-mark" aria-hidden="true" translate="no">
            Ez
          </span>
          <span className="ez-brand-text">
            <span className="ez-brand-name">EzEdu AI</span>
            {area === 'admin' ? <span className="ez-brand-area">Quản trị</span> : null}
          </span>
        </Link>

        <nav className="ez-sidebar-nav" aria-label="Điều hướng chính">
          {status === 'loading' ? (
            <div className="ez-stack-sm" aria-hidden="true">
              <Skeleton height="2.5rem" />
              <Skeleton height="2.5rem" />
              <Skeleton height="2.5rem" />
              <Skeleton height="2.5rem" />
            </div>
          ) : (
            groups.map((group, index) => (
              <div key={group.label ?? `group-${index}`} className="ez-nav-group">
                {group.label ? <span className="ez-nav-group-label">{group.label}</span> : null}
                {group.items.map((item) => renderNavLink(item))}
              </div>
            ))
          )}
        </nav>

        <div className="ez-sidebar-footer">
          <Dropdown
            align="start"
            direction="up"
            menuLabel="Tài khoản và cài đặt"
            trigger={
              <button type="button" className="ez-user-chip">
                <span className="ez-avatar" aria-hidden="true">
                  {initialsOf(displayName)}
                </span>
                <span className="ez-user-text">
                  <span className="ez-user-name">{displayName}</span>
                  <span className="ez-user-role">{roleLabel(role)}</span>
                </span>
                <Ellipsis size={16} aria-hidden="true" />
                <span className="ez-sr-only">Mở menu tài khoản</span>
              </button>
            }
          >
            {userMenu}
          </Dropdown>
        </div>
      </aside>

      <div className="ez-shell-main">
        <header className="ez-topbar">
          <span className="ez-topbar-title">{activeItem?.label ?? 'EzEdu AI'}</span>
          <Dropdown
            menuLabel="Tài khoản và cài đặt"
            trigger={
              <Button variant="ghost" size="sm" iconOnly aria-label="Mở menu tài khoản">
                <span className="ez-avatar ez-avatar-sm" aria-hidden="true">
                  {initialsOf(displayName)}
                </span>
              </Button>
            }
          >
            {userMenu}
          </Dropdown>
        </header>

        <main id="main" className="ez-main" tabIndex={-1}>
          {children}
        </main>

        {tabItems.length > 0 ? (
          <nav className="ez-tabbar" aria-label="Điều hướng chính">
            {tabItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={`${item.to}:${item.label}`}
                  to={item.to}
                  className={active ? 'ez-tab-item ez-tab-item-active' : 'ez-tab-item'}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="ez-tab-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="ez-tab-label">{item.label}</span>
                  {item.badge ? (
                    <>
                      <span className="ez-tab-dot" aria-hidden="true" />
                      <span className="ez-sr-only">{item.badge.label}</span>
                    </>
                  ) : null}
                </Link>
              );
            })}
            {overflowItems.length > 0 ? (
              <button
                type="button"
                className="ez-tab-item"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
              >
                <span className="ez-tab-icon" aria-hidden="true">
                  <Ellipsis size={ICON} />
                </span>
                <span className="ez-tab-label">Thêm</span>
              </button>
            ) : null}
          </nav>
        ) : null}
      </div>

      <Drawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        side="bottom"
        title="Thêm"
      >
        <div className="ez-nav-group">
          {overflowItems.map((item) => renderNavLink(item, () => setMoreOpen(false)))}
        </div>
      </Drawer>

      <ConfirmDialog
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
          navigate('/login', { replace: true });
        }}
        title="Xác nhận đăng xuất"
        description="Bạn có chắc chắn muốn đăng xuất khỏi hệ thống EzEdu AI không?"
        confirmLabel="Đăng xuất"
        confirmVariant="danger"
      />
    </div>
  );
}
