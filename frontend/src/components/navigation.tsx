import type { ReactNode } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  Database,
  FileQuestion,
  Globe,
  LayoutDashboard,
  Library,
  MessageSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { hasPermission } from '../utils/adminPermissions';

export type AppArea = 'student' | 'teacher' | 'admin';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: { value: number; label: string };
}

export interface NavGroup {
  id: string;
  label?: string;
  collapsible?: boolean;
  items: NavItem[];
}

export interface NavigationInput {
  area: AppArea;
  role?: string;
  permissions: string[];
  isFeatureEnabled: (flag: string) => boolean;
  badges: Partial<Record<'pendingExams', { value: number; label: string }>>;
}

const ICON = 18;

/** Returns only the destinations available to the current app area and permissions. */
export function buildNavigation({
  area,
  role,
  permissions,
  isFeatureEnabled,
  badges,
}: NavigationInput): NavGroup[] {
  if (area === 'student') {
    const items: NavItem[] = [
      { to: '/dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={ICON} /> },
      { to: '/tools', label: 'Công cụ AI', icon: <Sparkles size={ICON} /> },
      // Đặt TRƯỚC "Bài luyện tập": đây là đường vào có cấu trúc (môn → chương),
      // còn "Bài luyện tập" là danh sách phẳng xếp theo ngày. Học sinh mở ứng
      // dụng để ôn một môn, không phải để xem cái gì vừa được công bố.
      { to: '/hoc-theo-mon', label: 'Học theo môn', icon: <BookOpen size={ICON} /> },
      {
        to: '/published-questions',
        label: 'Bài luyện tập',
        icon: <ClipboardList size={ICON} />,
        badge: badges.pendingExams,
      },
      { to: '/chat-advanced', label: 'Hỏi đáp AI', icon: <MessageSquare size={ICON} /> },
      { to: '/learning-history', label: 'Tiến độ', icon: <TrendingUp size={ICON} /> },
    ];
    if (isFeatureEnabled('enable_personalization')) {
      items.push({ to: '/personalization', label: 'Lộ trình học', icon: <Target size={ICON} /> });
    }
    return [{ id: 'student-journey', items }];
  }

  if (area === 'teacher') {
    return [{
      id: 'teacher-workspace',
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
    }];
  }

  const groups: NavGroup[] = [];
  const overview: NavItem[] = [];
  if (
    hasPermission(role, 'analytics.view', permissions)
    || hasPermission(role, 'system_health.view', permissions)
  ) {
    overview.push({ to: '/admin/dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={ICON} /> });
  }
  if (hasPermission(role, 'users.view', permissions)) {
    overview.push({ to: '/admin/users', label: 'Người dùng', icon: <Users size={ICON} /> });
  }
  if (overview.length > 0) {
    groups.push({ id: 'admin-overview', label: 'Tổng quan', collapsible: true, items: overview });
  }

  const content: NavItem[] = [];
  if (hasPermission(role, 'documents.view', permissions)) {
    content.push({ to: '/admin/documents', label: 'Học liệu', icon: <Library size={ICON} /> });
  }
  if (hasPermission(role, 'questions.view', permissions)) {
    content.push({ to: '/admin/questions', label: 'Câu hỏi', icon: <FileQuestion size={ICON} /> });
    content.push({ to: '/admin/exams', label: 'Đề thi', icon: <ClipboardList size={ICON} /> });
    // Danh mục môn quyết định mục lục "Học theo môn" của học sinh, nên nằm cùng
    // nhóm Nội dung chứ không phải nhóm Hệ thống.
    content.push({ to: '/admin/mon-hoc', label: 'Danh mục môn', icon: <BookOpen size={ICON} /> });
  }
  if (content.length > 0) {
    groups.push({ id: 'admin-content', label: 'Nội dung', collapsible: true, items: content });
  }

  const platform: NavItem[] = [];
  if (hasPermission(role, 'ai_usage.view', permissions)) {
    platform.push({ to: '/admin/ai', label: 'AI', icon: <Sparkles size={ICON} /> });
  }
  if (hasPermission(role, 'website_content.view', permissions)) {
    platform.push({ to: '/admin/website-content', label: 'Website', icon: <Globe size={ICON} /> });
  }
  if (platform.length > 0) {
    groups.push({ id: 'admin-platform', label: 'Nền tảng', collapsible: true, items: platform });
  }

  const system: NavItem[] = [];
  if (hasPermission(role, 'system_settings.view', permissions)) {
    system.push({ to: '/admin/settings', label: 'Cấu hình', icon: <Settings size={ICON} /> });
    system.push({ to: '/admin/feature-flags', label: 'Feature flags', icon: <ShieldCheck size={ICON} /> });
  }
  if (hasPermission(role, 'notifications.manage', permissions)) {
    system.push({ to: '/admin/notifications', label: 'Thông báo', icon: <Bell size={ICON} /> });
  }
  if (system.length > 0) {
    groups.push({ id: 'admin-system', label: 'Hệ thống', collapsible: true, items: system });
  }

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
  if (logs.length > 0) {
    groups.push({ id: 'admin-logs', label: 'Báo cáo & log', collapsible: true, items: logs });
  }

  return groups;
}
