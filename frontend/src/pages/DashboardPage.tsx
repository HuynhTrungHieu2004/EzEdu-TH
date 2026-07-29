import { Navigate } from 'react-router-dom';
import { SkeletonText } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import StudentDashboardPage from './student/StudentDashboardPage';
import TeacherDashboardPage from './teacher/TeacherDashboardPage';

/**
 * Điều phối dashboard theo vai trò.
 *
 * Trước đây một component duy nhất tự tách nhánh bên trong bằng `user.role`, nên
 * hai dashboard rất khác nhau bị trộn trong cùng một file và cùng một cây JSX.
 * Giờ mỗi khu vực có trang riêng; file này chỉ chọn đúng trang.
 */
export default function DashboardPage() {
  const { status, area } = useAuth();

  if (status === 'loading') {
    return <SkeletonText lines={4} />;
  }

  if (area === 'student') return <StudentDashboardPage />;
  if (area === 'teacher') return <TeacherDashboardPage />;

  // Admin không có dashboard người dùng thường; RoleRoute đã chặn nhưng vẫn
  // giữ nhánh này để không bao giờ render trang trắng.
  if (area === 'admin') return <Navigate to="/admin/dashboard" replace />;

  return <Navigate to="/login" replace />;
}
