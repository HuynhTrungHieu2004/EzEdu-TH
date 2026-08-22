import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import LandingPage from './pages/LandingPage';
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
import StudentOnboardingPage from './pages/StudentOnboardingPage';
import MaintenancePage from './pages/MaintenancePage';
import NotFoundPage from './pages/NotFoundPage';
import ProfilePage from './pages/ProfilePage';
import ProgressPage from './pages/student/ProgressPage';
import { DataPolicyPage, FaqPage, FeaturesPage, HowItWorksPage } from './pages/PublicInfoPages';
import AppLayout from './components/AppLayout';
import PublicLayout from './components/PublicLayout';
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
const AdminStudentsPage = lazy(() => import('./pages/AdminStudentsPage'));
const AdminSubjectsPage = lazy(() => import('./pages/AdminSubjectsPage'));
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
const AdminAIGenerateExamPage = lazy(() => import('./pages/admin/AdminAIGenerateExamPage'));
const AdminAIGenerateQuestionPage = lazy(() => import('./pages/admin/AdminAIGenerateQuestionPage'));
const AdminAIGradingPage = lazy(() => import('./pages/admin/AdminAIGradingPage'));
const AdminAIChatPage = lazy(() => import('./pages/admin/AdminAIChatPage'));
const AdminQuestionBankPage = lazy(() => import('./pages/admin/AdminQuestionBankPage'));
const AdminExamMatrixPage = lazy(() => import('./pages/admin/AdminExamMatrixPage'));
const AdminClassesPage = lazy(() => import('./pages/admin/AdminClassesPage'));
const AdminTeachersPage = lazy(() => import('./pages/AdminTeachersPage'));
const AdminCoursesPage = lazy(() => import('./pages/AdminCoursesPage'));
const AdminCourseEnrollmentsPage = lazy(() => import('./pages/AdminCourseEnrollmentsPage'));
const AdminCourseLessonsPage = lazy(() => import('./pages/AdminCourseLessonsPage'));
const StudentMyCoursesPage = lazy(() => import('./pages/student/StudentMyCoursesPage'));
const StudentCourseDetailPage = lazy(() => import('./pages/student/StudentCourseDetailPage'));
const TeacherGradingPage = lazy(() => import('./pages/teacher/TeacherGradingPage'));
const TeacherStudentsPage = lazy(() => import('./pages/teacher/TeacherStudentsPage'));
const AdminExamSchedulesPage = lazy(() => import('./pages/admin/AdminExamSchedulesPage'));
const AdminExamResultsPage = lazy(() => import('./pages/admin/AdminExamResultsPage'));
const AdminExamStatsPage = lazy(() => import('./pages/admin/AdminExamStatsPage'));
const AdminFavoritesPage = lazy(() => import('./pages/admin/AdminFavoritesPage'));
const QuestionBankPage = lazy(() => import('./pages/teacher/QuestionBankPage'));
const ExamBlueprintListPage = lazy(() => import('./pages/teacher/ExamBlueprintListPage'));
const TeacherCoursesPage = lazy(() => import('./pages/teacher/TeacherCoursesPage'));
const TeacherAssignmentsPage = lazy(() => import('./pages/teacher/TeacherAssignmentsPage'));
const TeacherQuestionsPage = lazy(() => import('./pages/teacher/TeacherQuestionsPage'));
const TeacherSubmissionsPage = lazy(() => import('./pages/teacher/TeacherSubmissionsPage'));
const TeacherResultsPage = lazy(() => import('./pages/teacher/TeacherResultsPage'));
const TeacherStatsPage = lazy(() => import('./pages/teacher/TeacherStatsPage'));
const TeacherSchedulesPage = lazy(() => import('./pages/teacher/TeacherSchedulesPage'));
const TeacherExamSchedulesPage = lazy(() => import('./pages/teacher/TeacherExamSchedulesPage'));
const TeacherNotificationsPage = lazy(() => import('./pages/teacher/TeacherNotificationsPage'));
const TeacherActivityLogsPage = lazy(() => import('./pages/teacher/TeacherActivityLogsPage'));
const ContentHistoryPage = lazy(() => import('./pages/teacher/ContentHistoryPage'));
const TeacherSettingsPage = lazy(() => import('./pages/teacher/TeacherSettingsPage'));
const ExamBlueprintDetailPage = lazy(() => import('./pages/teacher/ExamBlueprintDetailPage'));
const ExamGradingPage = lazy(() => import('./pages/teacher/ExamGradingPage'));
const ExamAttemptPage = lazy(() => import('./pages/student/ExamAttemptPage'));
const ChatHistoryPage = lazy(() => import('./pages/student/ChatHistoryPage'));
const StudentActivityPage = lazy(() => import('./pages/student/StudentActivityPage'));
const LearningRoadmapPage = lazy(() => import('./pages/student/LearningRoadmapPage'));
const StudentNotificationsPage = lazy(() => import('./pages/student/StudentNotificationsPage'));
const StudentOnlineSchedulesPage = lazy(() => import('./pages/student/StudentOnlineSchedulesPage'));
const StudentLearningMaterialsPage = lazy(() => import('./pages/student/StudentLearningMaterialsPage'));
const StudentCurriculumPage = lazy(() => import('./pages/student/StudentCurriculumPage'));
const SubjectCatalogPage = lazy(() => import('./pages/student/SubjectCatalogPage'));
const AttemptReviewPage = lazy(() => import('./pages/student/AttemptReviewPage'));
const StudentDashboardPage = lazy(() => import('./pages/student/StudentDashboardPage'));
const StudentPracticeListPage = lazy(() => import('./pages/student/StudentPracticeListPage'));
const StudentExamsListPage = lazy(() => import('./pages/student/StudentExamsListPage'));
const StudentResultsPage = lazy(() => import('./pages/student/StudentResultsPage'));
const StudentAIChatPage = lazy(() => import('./pages/student/StudentAIChatPage'));
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
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
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
        <Route path="/forgot-password" element={<PublicLayout><ForgotPasswordPage /></PublicLayout>} />
        <Route path="/reset-password" element={<PublicLayout><ResetPasswordPage /></PublicLayout>} />
        <Route path="/verify-email" element={<PublicLayout><VerifyEmailPage /></PublicLayout>} />
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
          path="/teacher/ai-generate-exam"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><AdminAIGenerateExamPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/ai-generate-question"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><AdminAIGenerateQuestionPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/ai-grading"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><AdminAIGradingPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/courses"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherCoursesPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/assignments"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherAssignmentsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/questions"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherQuestionsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/submissions"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherSubmissionsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/results"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherResultsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/stats"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherStatsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/schedules"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherSchedulesPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/exam-schedules"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherExamSchedulesPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/notifications"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherNotificationsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/activity-logs"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherActivityLogsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/content-history"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ContentHistoryPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/settings"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherSettingsPage /></RoleRoute></AppLayout>}
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
        {/*
         * ── STUDENT LMS ROUTES ──────────────────────────────────────────
         */}
        <Route
          path="/student/dashboard"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentDashboardPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/courses"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentMyCoursesPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/courses/:courseId"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentCourseDetailPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/practice"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentPracticeListPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/exams"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentExamsListPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/results"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentResultsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/progress"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><ProgressPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/learning-path"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><LearningRoadmapPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/ask-ai"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentAIChatPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/notifications"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentNotificationsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/profile"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><ProfilePage /></RoleRoute></AppLayout>}
        />

        <Route
          path="/published-questions"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><PublishedQuestionSetsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/online-schedules"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentOnlineSchedulesPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/learning-materials"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentLearningMaterialsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student/curriculum"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentCurriculumPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/hoc-theo-mon"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><SubjectCatalogPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/bai-lam/:attemptId"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><AttemptReviewPage /></RoleRoute></AppLayout>}
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
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><LearningRoadmapPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/notifications"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentNotificationsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/chat-history"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><ChatHistoryPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/student-activity"
          element={<AppLayout><RoleRoute allow={STUDENT_ONLY}><StudentActivityPage /></RoleRoute></AppLayout>}
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
          path="/admin/students"
          element={<AppLayout><AdminRoute><AdminStudentsPage /></AdminRoute></AppLayout>}
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
          path="/admin/mon-hoc"
          element={<AppLayout><AdminRoute><AdminSubjectsPage /></AdminRoute></AppLayout>}
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
          path="/admin/ai-generate-exam"
          element={<AppLayout><AdminRoute><AdminAIGenerateExamPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/ai-generate-question"
          element={<AppLayout><AdminRoute><AdminAIGenerateQuestionPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/ai-grading"
          element={<AppLayout><AdminRoute><AdminAIGradingPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/ai-chat"
          element={<AppLayout><AdminRoute><AdminAIChatPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/question-bank"
          element={<AppLayout><AdminRoute><AdminQuestionBankPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/exam-blueprints"
          element={<AppLayout><AdminRoute><AdminExamMatrixPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/classes"
          element={<AppLayout><AdminRoute><AdminClassesPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/teacher/grading"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherGradingPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/teacher/students"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><TeacherStudentsPage /></RoleRoute></AppLayout>}
        />
        <Route
          path="/admin/courses"
          element={<AppLayout><AdminRoute><AdminCoursesPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/course-enrollments"
          element={<AppLayout><AdminRoute><AdminCourseEnrollmentsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/courses/:courseId/lessons"
          element={<AppLayout><AdminRoute><AdminCourseLessonsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/teachers"
          element={<AppLayout><AdminRoute><AdminTeachersPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/exam-schedules"
          element={<AppLayout><AdminRoute><AdminExamSchedulesPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/exam-results"
          element={<AppLayout><AdminRoute><AdminExamResultsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/exam-stats"
          element={<AppLayout><AdminRoute><AdminExamStatsPage /></AdminRoute></AppLayout>}
        />
        <Route
          path="/admin/favorites"
          element={<AppLayout><AdminRoute><AdminFavoritesPage /></AdminRoute></AppLayout>}
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
      </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
