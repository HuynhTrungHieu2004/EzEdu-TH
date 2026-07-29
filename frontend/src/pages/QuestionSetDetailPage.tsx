import { Navigate } from 'react-router-dom';
import { Skeleton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import QuestionSetEditorPage from './teacher/QuestionSetEditorPage';
import PracticeAttemptPage from './student/PracticeAttemptPage';

/**
 * Điều phối trang chi tiết bộ câu hỏi theo vai trò.
 *
 * Trước đây một component duy nhất (`QuestionSetDetailPage`) tự tách nhánh
 * bên trong bằng state `currentRole` lấy từ client, phục vụ cả việc soạn đề
 * của giáo viên lẫn việc làm bài của học sinh trong cùng một cây JSX — hai
 * mục tiêu và hai tập hành động rất khác nhau bị trộn vào một trang.
 * Xem docs/ui-redesign/01-audit-report.md §6.1.
 *
 * Route giữ nguyên (`/question-sets/:questionSetId`) để không phá bookmark
 * hay link đã chia sẻ; chỉ có thân trang được tách theo vai trò.
 */
export default function QuestionSetDetailPage() {
  const { status, area } = useAuth();

  if (status === 'loading') {
    return (
      <div className="ez-stack">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="16rem" />
      </div>
    );
  }

  if (area === 'teacher') return <QuestionSetEditorPage />;
  if (area === 'student') return <PracticeAttemptPage />;

  return <Navigate to="/login" replace />;
}
