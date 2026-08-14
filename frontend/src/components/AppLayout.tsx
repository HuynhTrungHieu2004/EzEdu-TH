import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  ClipboardList,
  Database,
  Ellipsis,
  FileQuestion,
  Globe,
  LayoutDashboard,
  Library,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';
import { questionApi } from '../api/questionApi';
import { hasPermission } from '../utils/adminPermissions';
import { useAuth } from '../hooks/useAuth';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useTheme } from '../contexts/ThemeContext';
import { PageEntrance } from '../motion';
import {
  Badge,
  Button,
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
  const { isEnabled } = useFeatureFlags();
  const { preference, setPreference } = useTheme();
  const [pendingExams, setPendingExams] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  const permissions = user?.permissions_override ?? [];
  const pendingBadgeCount = area === 'student' ? pendingExams : 0;

  // Chỉ gọi API khi là học sinh. Với vai trò khác, giá trị được bỏ qua lúc render
  // thay vì ghi 0 vào state trong effect.
  useEffect(() => {
    if (area !== 'student') return;
    let cancelled = false;
    questionApi
      .pendingPublishedCount()
      .then((count) => {
        if (!cancelled) setPendingExams(count);
      })
      .catch(() => {
        // Giữ nguyên giá trị trước đó; badge không phải thông tin thiết yếu.
      });
    return () => {
      cancelled = true;
    };
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
      const items: NavItem[] = [
        { to: '/dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={ICON} /> },
        { to: '/tools', label: 'Công cụ AI', icon: <Sparkles size={ICON} /> },
        {
          to: '/published-questions',
          label: 'Bài luyện tập',
          icon: <ClipboardList size={ICON} />,
          badge:
            pendingBadgeCount > 0
              ? { value: pendingBadgeCount, label: `${pendingBadgeCount} bài luyện tập chưa làm` }
              : undefined,
        },
        { to: '/chat-advanced', label: 'Hỏi đáp AI', icon: <MessageSquare size={ICON} /> },
        { to: '/learning-history', label: 'Tiến độ', icon: <TrendingUp size={ICON} /> },
      ];
      // Chỉ hiện khi flag bật — tránh dẫn người dùng tới trang chắc chắn 403.
      if (isEnabled('enable_personalization')) {
        items.push({ to: '/personalization', label: 'Lộ trình học', icon: <Target size={ICON} /> });
      }
      return [{ items }];
    }

    if (area === 'teacher') {
      return [
        {
          items: [
            { to: '/dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={ICON} /> },
            { to: '/tools', label: 'Công cụ AI', icon: <Sparkles size={ICON} /> },
            { to: '/documents', label: 'Học liệu', icon: <Library size={ICON} /> },
            { to: '/teacher/content-history', label: 'Lịch sử', icon: <ClipboardList size={ICON} /> },
            { to: '/question-history', label: 'Đề & câu hỏi', icon: <FileQuestion size={ICON} /> },
            { to: '/question-bank', label: 'Ngân hàng câu hỏi', icon: <Database size={ICON} /> },
            { to: '/exam-blueprints', label: 'Ma trận đề', icon: <ClipboardList size={ICON} /> },
            { to: '/chat-advanced', label: 'Hỏi đáp AI', icon: <MessageSquare size={ICON} /> },
            { to: '/classes', label: 'Lớp học', icon: <Users size={ICON} /> },
          ],
        },
      ];
    }

    if (area === 'admin') {
      const groups: NavGroup[] = [];
      const overview: NavItem[] = [];
      if (
        hasPermission(role, 'analytics.view', permissions) ||
        hasPermission(role, 'system_health.view', permissions)
      ) {
        overview.push({
          to: '/admin/dashboard',
          label: 'Tổng quan',
          icon: <LayoutDashboard size={ICON} />,
        });
      }
      if (hasPermission(role, 'users.view', permissions)) {
        overview.push({ to: '/admin/users', label: 'Người dùng', icon: <Users size={ICON} /> });
      }
      if (overview.length > 0) groups.push({ items: overview });

      const content: NavItem[] = [];
      if (hasPermission(role, 'documents.view', permissions)) {
        content.push({ to: '/admin/documents', label: 'Học liệu', icon: <Library size={ICON} /> });
      }
      if (hasPermission(role, 'questions.view', permissions)) {
        content.push({ to: '/admin/questions', label: 'Câu hỏi', icon: <FileQuestion size={ICON} /> });
        content.push({ to: '/admin/exams', label: 'Đề thi', icon: <ClipboardList size={ICON} /> });
      }
      if (content.length > 0) groups.push({ label: 'Nội dung', items: content });

      const platform: NavItem[] = [];
      if (hasPermission(role, 'ai_usage.view', permissions)) {
        platform.push({ to: '/admin/ai', label: 'AI', icon: <Sparkles size={ICON} /> });
      }
      if (hasPermission(role, 'website_content.view', permissions)) {
        platform.push({ to: '/admin/website-content', label: 'Website', icon: <Globe size={ICON} /> });
      }
      if (platform.length > 0) groups.push({ label: 'Nền tảng', items: platform });

      const system: NavItem[] = [];
      if (hasPermission(role, 'system_settings.view', permissions)) {
        system.push({ to: '/admin/settings', label: 'Cấu hình', icon: <Settings size={ICON} /> });
        system.push({ to: '/admin/feature-flags', label: 'Feature flags', icon: <ShieldCheck size={ICON} /> });
      }
      if (hasPermission(role, 'notifications.manage', permissions)) {
        system.push({ to: '/admin/notifications', label: 'Thông báo', icon: <Bell size={ICON} /> });
      }
      if (system.length > 0) groups.push({ label: 'Hệ thống', items: system });

      const logs: NavItem[] = [];
      if (hasPermission(role, 'reports.export', permissions)) {
        logs.push({ to: '/admin/reports', label: 'Báo cáo', icon: <BarChart3 size={ICON} /> });
      }
      if (hasPermission(role, 'activity_logs.view', permissions)) {
        logs.push({ to: '/admin/activity-logs', label: 'Nhật ký hoạt động', icon: <ScrollText size={ICON} /> });
      }
      if (hasPermission(role, 'admin_audit_logs.view', permissions)) {
        logs.push({ to: '/admin/audit-logs', label: 'Nhật ký quản trị', icon: <ScrollText size={ICON} /> });
      }
      if (logs.length > 0) groups.push({ label: 'Báo cáo & log', items: logs });

      return groups;
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
        onClick={() => {
          logout();
          navigate('/login', { replace: true });
        }}
      >
        Đăng xuất
      </DropdownItem>
    </>
  );

  function renderNavLink(item: NavItem, onNavigate?: () => void) {
    const active = isActive(item.to);
    return (
      <Link
        key={item.to}
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
          <PageEntrance key={location.pathname} routeKey={location.pathname}>
            {children}
          </PageEntrance>
        </main>

        {tabItems.length > 0 ? (
          <nav className="ez-tabbar" aria-label="Điều hướng chính">
            {tabItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
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
    </div>
  );
}
