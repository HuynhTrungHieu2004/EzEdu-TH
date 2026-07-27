import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import AdvancedChatPage from './pages/AdvancedChatPage';
import LearningHistoryPage from './pages/LearningHistoryPage';
import StudentStatisticsPage from './pages/StudentStatisticsPage';
import PersonalizationPage from './pages/PersonalizationPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminActivityLogsPage from './pages/AdminActivityLogsPage';
import AdminAuditLogsPage from './pages/AdminAuditLogsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminUserDetailPage from './pages/AdminUserDetailPage';
import AdminDocumentsPage from './pages/AdminDocumentsPage';
import AdminDocumentDetailPage from './pages/AdminDocumentDetailPage';
import AdminQuestionsPage from './pages/AdminQuestionsPage';
import AdminQuestionDetailPage from './pages/AdminQuestionDetailPage';
import AdminExamsPage from './pages/AdminExamsPage';
import AdminAIPage from './pages/AdminAIPage';
import AdminWebsiteContentPage from './pages/AdminWebsiteContentPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminFeatureFlagsPage from './pages/AdminFeatureFlagsPage';
import AdminNotificationsPage from './pages/AdminNotificationsPage';
import AdminReportsPage from './pages/AdminReportsPage';
import StudentOnboardingPage from './pages/StudentOnboardingPage';
import MaintenancePage from './pages/MaintenancePage';
import LandingPage from './pages/landing';
import AppLayout from './components/AppLayout';
import PublicLayout from './components/PublicLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/*
         * ── PUBLIC ROUTES (không sidebar) ──────────────────────────────
         * LandingPage tự quản lý LandingHeader + LandingFooter bên trong.
         * LoginPage, RegisterPage dùng PublicLayout (mini header + footer).
         */}
        <Route path="/" element={<LandingPage />} />

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
          element={<ProtectedRoute><StudentOnboardingPage /></ProtectedRoute>}
        />
        <Route path="/maintenance" element={<PublicLayout><MaintenancePage /></PublicLayout>} />

        {/*
         * ── AUTHENTICATED ROUTES (có sidebar) ──────────────────────────
         * Tất cả route bên dưới đều bọc trong AppLayout (sidebar + nav).
         * Sidebar không xuất hiện ở bất kỳ route public nào ở trên.
         */}
        <Route
          path="/dashboard"
          element={<AppLayout><ProtectedRoute><DashboardPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/documents"
          element={<AppLayout><ProtectedRoute><DocumentsPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/documents/:documentId"
          element={<AppLayout><ProtectedRoute><DocumentDetailPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/documents/:documentId/questions"
          element={<AppLayout><ProtectedRoute><QuestionGeneratePage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/generate"
          element={<AppLayout><ProtectedRoute><QuickGeneratePage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/question-sets/:questionSetId"
          element={<AppLayout><ProtectedRoute><QuestionSetDetailPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/question-history"
          element={<AppLayout><ProtectedRoute><QuestionHistoryPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/classes"
          element={<AppLayout><ProtectedRoute><ClassesPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/classes/:classId"
          element={<AppLayout><ProtectedRoute><ClassDetailPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/published-questions"
          element={<AppLayout><ProtectedRoute><PublishedQuestionSetsPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/learning-history"
          element={<AppLayout><ProtectedRoute><LearningHistoryPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/student-statistics"
          element={<AppLayout><ProtectedRoute><StudentStatisticsPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/personalization"
          element={<AppLayout><ProtectedRoute><PersonalizationPage /></ProtectedRoute></AppLayout>}
        />
        <Route
          path="/chat-advanced"
          element={<AppLayout><ProtectedRoute><AdvancedChatPage /></ProtectedRoute></AppLayout>}
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

        {/* Fallback — mọi route không khớp → landing */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
