import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Ellipsis,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserCog,
} from 'lucide-react';
import { questionApi } from '../api/questionApi';
import { useAuth } from '../hooks/useAuth';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useTheme } from '../contexts/ThemeContext';
import { PageEntrance } from '../motion';
import { buildNavigation, type NavGroup, type NavItem } from './navigation';
import { usePathnameNavigationEpoch } from './PathnameNavigationEpochContext';
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

interface SidebarNavigationGroupProps {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  renderNavLink: (item: NavItem) => ReactNode;
}

const ICON = 18;

function SidebarNavigationGroup({ group, isOpen, onToggle, renderNavLink }: SidebarNavigationGroupProps) {
  const panelId = `nav-group-${group.id}`;

  return (
    <div className="ez-nav-group">
      {group.collapsible ? (
        <button
          type="button"
          className="ez-nav-group-label"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {group.label ?? group.id}
        </button>
      ) : group.label ? <span className="ez-nav-group-label">{group.label}</span> : null}
      <div id={panelId} hidden={!isOpen}>
        {group.items.map((item) => renderNavLink(item))}
      </div>
    </div>
  );
}

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
  const pathnameNavigationEpoch = usePathnameNavigationEpoch();
  const [pendingExams, setPendingExams] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsedNavigation, setCollapsedNavigation] = useState(() => ({
    pathnameNavigationEpoch,
    groupIds: new Set<string>(),
  }));

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

  const groups = area
    ? buildNavigation({
      area,
      role,
      permissions,
      isFeatureEnabled: isEnabled,
      badges: pendingBadgeCount > 0
        ? { pendingExams: { value: pendingBadgeCount, label: `${pendingBadgeCount} bài luyện tập chưa làm` } }
        : {},
    })
    : [];
  const allItems = groups.flatMap((g) => g.items);
  const activeItem = allItems.find((item) => isActive(item.to));
  const collapsedGroupIds = collapsedNavigation.pathnameNavigationEpoch === pathnameNavigationEpoch
    ? collapsedNavigation.groupIds
    : new Set<string>();

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
            groups.map((group) => (
              <SidebarNavigationGroup
                key={group.id}
                group={group}
                isOpen={!group.collapsible || !collapsedGroupIds.has(group.id)}
                onToggle={() => {
                  setCollapsedNavigation((current) => {
                    const groupIds = current.pathnameNavigationEpoch === pathnameNavigationEpoch
                      ? new Set(current.groupIds)
                      : new Set<string>();
                    if (groupIds.has(group.id)) groupIds.delete(group.id);
                    else groupIds.add(group.id);
                    return {
                      pathnameNavigationEpoch,
                      groupIds,
                    };
                  });
                }}
                renderNavLink={renderNavLink}
              />
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
