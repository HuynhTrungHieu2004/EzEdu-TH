import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import QuestionGeneratePage from './pages/QuestionGeneratePage';
import QuickGeneratePage from './pages/QuickGeneratePage';
import QuestionSetDetailPage from './pages/QuestionSetDetailPage';
import QuestionHistoryPage from './pages/QuestionHistoryPage';
import ClassesPage from './pages/ClassesPage';
import ClassDetailPage from './pages/ClassDetailPage';
import PublishedQuestionSetsPage from './pages/PublishedQuestionSetsPage';
import PersonalizationPage from './pages/PersonalizationPage';
import StudentOnboardingPage from './pages/StudentOnboardingPage';
import MaintenancePage from './pages/MaintenancePage';
import NotFoundPage from './pages/NotFoundPage';
import ProfilePage from './pages/ProfilePage';
import ProgressPage from './pages/student/ProgressPage';
import { DataPolicyPage, FaqPage, FeaturesPage, HowItWorksPage } from './pages/PublicInfoPages';
import LandingPage from './pages/landing';
import AppLayout from './components/AppLayout';
import PublicLayout from './components/PublicLayout';
import DataNotice from './components/DataNotice';
import RoleRoute from './components/RoleRoute';
import AdminRoute from './components/AdminRoute';
import { AuthProvider } from './contexts/AuthContext';
import { SkeletonText, ToastProvider } from './components/ui';

/**
 * Tách riêng chunk cho khu vực Hỏi đáp AI và toàn bộ khu vực quản trị — hai
 * mảng chỉ một nhóm người dùng nhỏ (giáo viên/học sinh hỏi đáp nâng cao, và
 * admin) chạm tới, nhưng trước đây nằm chung một chunk ~830KB với mọi trang
 * khác. Xem docs/ui-redesign/00-progress-log.md (lỗi M5).
 */
const AdvancedChatPage = lazy(() => import('./pages/AdvancedChatPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminActivityLogsPage = lazy(() => import('./pages/AdminActivityLogsPage'));
const AdminAuditLogsPage = lazy(() => import('./pages/AdminAuditLogsPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminUserDetailPage = lazy(() => import('./pages/AdminUserDetailPage'));
const AdminDocumentsPage = lazy(() => import('./pages/AdminDocumentsPage'));
const AdminDocumentDetailPage = lazy(() => import('./pages/AdminDocumentDetailPage'));
const AdminQuestionsPage = lazy(() => import('./pages/AdminQuestionsPage'));
const AdminQuestionDetailPage = lazy(() => import('./pages/AdminQuestionDetailPage'));
const AdminExamsPage = lazy(() => import('./pages/AdminExamsPage'));
const AdminAIPage = lazy(() => import('./pages/AdminAIPage'));
const AdminWebsiteContentPage = lazy(() => import('./pages/AdminWebsiteContentPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const AdminFeatureFlagsPage = lazy(() => import('./pages/AdminFeatureFlagsPage'));
const AdminNotificationsPage = lazy(() => import('./pages/AdminNotificationsPage'));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage'));
const QuestionBankPage = lazy(() => import('./pages/teacher/QuestionBankPage'));
const ExamBlueprintListPage = lazy(() => import('./pages/teacher/ExamBlueprintListPage'));
const ExamBlueprintDetailPage = lazy(() => import('./pages/teacher/ExamBlueprintDetailPage'));
const ExamGradingPage = lazy(() => import('./pages/teacher/ExamGradingPage'));
const ContentHistoryPage = lazy(() => import('./pages/teacher/ContentHistoryPage'));
const ExamAttemptPage = lazy(() => import('./pages/student/ExamAttemptPage'));
const WebKnowledgePage = lazy(() => import('./pages/WebKnowledgePage'));
const CurriculumKbPage = lazy(() => import('./pages/CurriculumKbPage'));
const ToolLibraryPage = lazy(() => import('./pages/ToolLibraryPage'));

function RouteFallback() {
  return (
    <div className="ez-stack" style={{ padding: 'var(--ez-space-6)' }}>
      <SkeletonText lines={4} />
    </div>
  );
}

/**
 * Vai trò được phép vào từng khu vực.
 * Xem docs/ui-redesign/02-information-architecture.md §10.
 *
 * `user` là vai trò cũ, được xếp cùng giáo viên để không phá tài khoản đã có.
 * Admin KHÔNG nằm trong hai nhóm này: khu vực quản trị là khu vực riêng.
 */
const STUDENT_ONLY = ['student'];
const TEACHER_ONLY = ['lecturer', 'user'];
/** Route dùng chung cho cả học sinh và giáo viên (hỏi đáp AI, bộ câu hỏi). */
const STUDENT_AND_TEACHER = ['student', 'lecturer', 'user'];

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <ToastProvider>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/*
         * ── PUBLIC ROUTES (không sidebar) ──────────────────────────────
         * LandingPage tự quản lý LandingHeader + LandingFooter bên trong.
         * LoginPage, RegisterPage dùng PublicLayout (mini header + footer).
         */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/chinh-sach-du-lieu" element={<DataPolicyPage />} />

        <Route
          path="/login"
          element={<PublicLayout><LoginPage /></PublicLayout>}
        />
        <Route
          path="/register"
          element={<PublicLayout><RegisterPage /></PublicLayout>}
        />
        <Route
          path="/student-onboarding"
          element={<RoleRoute allow={STUDENT_ONLY}><StudentOnboardingPage /></RoleRoute>}
        />
        <Route path="/maintenance" element={<PublicLayout><MaintenancePage /></PublicLayout>} />

        {/*
         * ── AUTHENTICATED ROUTES (có sidebar) ──────────────────────────
         * Tất cả route bên dưới đều bọc trong AppLayout (sidebar + nav).
         * Sidebar không xuất hiện ở bất kỳ route public nào ở trên.
         */}
        <Route
          path="/dashboard"
          element={<AppLayout><RoleRoute allow={STUDENT_AND_TEACHER}><DashboardPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/ho-so"
          element={<AppLayout><RoleRoute allow={STUDENT_AND_TEACHER}><ProfilePage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/documents"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><DocumentsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/documents/:documentId"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><DocumentDetailPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/documents/:documentId/questions"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><QuestionGeneratePage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/generate"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><QuickGeneratePage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/question-sets/:questionSetId"
          element={<AppLayout><RoleRoute allow={STUDENT_AND_TEACHER}><QuestionSetDetailPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/question-history"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><QuestionHistoryPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/classes"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ClassesPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/classes/:classId"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ClassDetailPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/published-questions"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><PublishedQuestionSetsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/learning-history"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><ProgressPage /></RoleRoute></AppLayout>}
        />
        {/*
          Lịch sử và Thống kê đã gộp thành một trang Tiến độ. Giữ route cũ dưới
          dạng redirect để không phá bookmark và link đã chia sẻ.
        */}
        <Route path="/student-statistics" element={<Navigate to="/learning-history" replace />} />
        <Route
          path="/personalization"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><PersonalizationPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/chat-advanced"
          element={<AppLayout><RoleRoute allow={STUDENT_AND_TEACHER}><AdvancedChatPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/web-knowledge"
          element={<AppLayout><RoleRoute allow={STUDENT_AND_TEACHER}><WebKnowledgePage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/curriculum-kb"
          element={<AppLayout><RoleRoute allow={STUDENT_AND_TEACHER}><CurriculumKbPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/tools"
          element={<AppLayout><RoleRoute allow={STUDENT_AND_TEACHER}><ToolLibraryPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/question-bank"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><QuestionBankPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/exam-blueprints"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ExamBlueprintListPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/exam-blueprints/:id"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ExamBlueprintDetailPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/exams/:examId/grading"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ExamGradingPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/content-history"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ContentHistoryPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/take-exam/:examId"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><ExamAttemptPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/admin/dashboard"
          element={<AppLayout><AdminRoute><AdminDashboardPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/users"
          element={<AppLayout><AdminRoute><AdminUsersPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/users/:userId"
          element={<AppLayout><AdminRoute><AdminUserDetailPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/documents"
          element={<AppLayout><AdminRoute><AdminDocumentsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/documents/:documentId"
          element={<AppLayout><AdminRoute><AdminDocumentDetailPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/questions"
          element={<AppLayout><AdminRoute><AdminQuestionsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/questions/:questionId"
          element={<AppLayout><AdminRoute><AdminQuestionDetailPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/exams"
          element={<AppLayout><AdminRoute><AdminExamsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/ai"
          element={<AppLayout><AdminRoute><AdminAIPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/website-content"
          element={<AppLayout><AdminRoute><AdminWebsiteContentPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/settings"
          element={<AppLayout><AdminRoute><AdminSettingsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/feature-flags"
          element={<AppLayout><AdminRoute><AdminFeatureFlagsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/notifications"
          element={<AppLayout><AdminRoute><AdminNotificationsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/reports"
          element={<AppLayout><AdminRoute><AdminReportsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/activity-logs"
          element={<AppLayout><AdminRoute><AdminActivityLogsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/audit-logs"
          element={<AppLayout><AdminRoute><AdminAuditLogsPage /></AdminRoute></AppLayout>}
        />

        {/* Fallback — URL không khớp phải báo 404, không được trả về trang chủ */}
        <Route path="*" element={<PublicLayout><NotFoundPage /></PublicLayout>} />
      </Routes>
      </Suspense>
      <DataNotice />
      </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
