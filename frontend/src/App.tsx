import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import QuestionGeneratePage from './pages/QuestionGeneratePage';
import QuickGeneratePage from './pages/QuickGeneratePage';
import QuestionSetDetailPage from './pages/QuestionSetDetailPage';
import QuestionHistoryPage from './pages/QuestionHistoryPage';
import PublishedQuestionSetsPage from './pages/PublishedQuestionSetsPage';
import AdvancedChatPage from './pages/AdvancedChatPage';
import LearningHistoryPage from './pages/LearningHistoryPage';
import StudentStatisticsPage from './pages/StudentStatisticsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { buildApiUrl, isApiBaseUrlConfigured } from './config/api';

function WelcomeScreen() {
  const [backendStatus, setBackendStatus] = useState(
    isApiBaseUrlConfigured ? 'Đang kết nối...' : 'Thiếu cấu hình VITE_API_BASE_URL'
  );
  const [isConnected, setIsConnected] = useState<'connecting' | 'connected' | 'disconnected'>(
    isApiBaseUrlConfigured ? 'connecting' : 'disconnected'
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (!isApiBaseUrlConfigured) {
      return;
    }

    axios
      .get(buildApiUrl('/health'))
      .then((res) => {
        setBackendStatus(`Kết nối backend thành công (Trạng thái: ${res.data.status})`);
        setIsConnected('connected');
      })
      .catch((error) => {
        console.error(error);
        setBackendStatus('Lỗi: Không kết nối được tới máy chủ backend');
        setIsConnected('disconnected');
      });
  }, []);

  const hasToken = !!localStorage.getItem('access_token');

  return (
    <section className="hero-home">
      <div className="hero-content">
        <div className="hero-mark" translate="no">AI</div>
        <div>
          <p className="eyebrow">Learning Assessment Studio</p>
          <h1 className="hero-title">Tạo câu hỏi đánh giá từ học liệu trong vài phút</h1>
        </div>
        <p className="hero-copy">
          Tải lên tài liệu hoặc video, trích xuất nội dung, hỏi đáp theo ngữ cảnh và sinh bộ câu hỏi
          có đáp án, giải thích, mức độ khó và xuất file phục vụ giảng dạy.
        </p>

        <div className="hero-status">
          <span className={`status-indicator ${isConnected}`} />
          <span>{backendStatus}</span>
        </div>

        <div className="hero-actions">
          {hasToken ? (
            <button type="button" onClick={() => navigate('/dashboard')} className="btn-primary">
              Vào Dashboard
            </button>
          ) : (
            <>
              <button type="button" onClick={() => navigate('/login')} className="btn-primary">
                Đăng nhập
              </button>
              <button type="button" onClick={() => navigate('/register')} className="btn-secondary">
                Tạo tài khoản
              </button>
            </>
          )}
        </div>
      </div>

      <figure className="hero-visual" aria-label="Minh họa không gian AI phân tích học liệu">
        <img src="/visuals/ai-education-hero.png" alt="" />
        <figcaption className="hero-visual-caption">
          <span className="hero-chip">
            <strong>PDF</strong>
            <span>Word, slide, video</span>
          </span>
          <span className="hero-chip">
            <strong>RAG</strong>
            <span>Tìm kiếm theo ngữ nghĩa</span>
          </span>
          <span className="hero-chip">
            <strong>Quiz</strong>
            <span>Đáp án và giải thích</span>
          </span>
        </figcaption>
      </figure>

      <div className="feature-grid" aria-label="Tính năng chính">
        <article className="feature-tile">
          <span className="feature-kicker">01</span>
          <h2 className="feature-title">Đọc học liệu</h2>
          <p className="feature-text">Nhận PDF, DOCX, PPTX và video để trích xuất nội dung học tập.</p>
        </article>
        <article className="feature-tile">
          <span className="feature-kicker">02</span>
          <h2 className="feature-title">Lập chỉ mục</h2>
          <p className="feature-text">Chia nhỏ nội dung và tạo dữ liệu truy xuất cho hỏi đáp theo ngữ nghĩa.</p>
        </article>
        <article className="feature-tile">
          <span className="feature-kicker">03</span>
          <h2 className="feature-title">Sinh câu hỏi</h2>
          <p className="feature-text">Tạo câu hỏi theo số lượng, độ khó, dạng câu hỏi và mức Bloom.</p>
        </article>
        <article className="feature-tile">
          <span className="feature-kicker">04</span>
          <h2 className="feature-title">Xuất bộ đề</h2>
          <p className="feature-text">Xem đáp án, giải thích và tải bộ câu hỏi phục vụ kiểm tra đánh giá.</p>
        </article>
      </div>
    </section>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
          {/* Protected routes */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/documents" 
            element={
              <ProtectedRoute>
                <DocumentsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/documents/:documentId" 
            element={
              <ProtectedRoute>
                <DocumentDetailPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/documents/:documentId/questions" 
            element={
              <ProtectedRoute>
                <QuestionGeneratePage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/generate" 
            element={
              <ProtectedRoute>
                <QuickGeneratePage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/question-sets/:questionSetId" 
            element={
              <ProtectedRoute>
                <QuestionSetDetailPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/question-history" 
            element={
              <ProtectedRoute>
                <QuestionHistoryPage />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/published-questions"
            element={
              <ProtectedRoute>
                <PublishedQuestionSetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/learning-history"
            element={
              <ProtectedRoute>
                <LearningHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student-statistics"
            element={
              <ProtectedRoute>
                <StudentStatisticsPage />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/chat-advanced" 
            element={
              <ProtectedRoute>
                <AdvancedChatPage />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminDashboardPage />
              </AdminRoute>
            }
          />

          <Route path="*" element={<WelcomeScreen />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

export default App;
