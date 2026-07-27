import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import type { UserResponse } from '../types/auth';

const DashboardPage = () => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch {
        setError('Không tải được thông tin người dùng. Vui lòng đăng nhập lại.');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-stack">
          <span className="spinner" />
          <p>Đang tải thông tin hệ thống...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-state">
        <div className="loading-stack">
          <div className="alert alert-error">{error}</div>
          <button type="button" onClick={handleLogout} className="btn-secondary">
            Quay lại đăng nhập
          </button>
        </div>
      </div>
    );
  }

  const isStudent = user?.role === 'student';

  if (isStudent) {
    return (
      <div className="page">
        <div className="page-wide">
          <section className="welcome-panel">
            <div>
              <p className="eyebrow">Hồ sơ học sinh</p>
              <h2>Chào mừng trở lại, {user.full_name}</h2>
              <p>Không gian học tập dành cho học sinh: làm bài thi, ôn tập và theo dõi kết quả học tập.</p>
            </div>
            <div className="welcome-metric" aria-label="Tóm tắt khu vực học sinh">
              <span className="metric-pill"><strong>Học sinh</strong><span>Bạn Là</span></span>
              <span className="metric-pill"><strong>Ôn tập</strong><span>Làm lại bộ câu hỏi</span></span>
              <span className="metric-pill"><strong>Lịch sử</strong><span>Theo dõi kết quả</span></span>
            </div>
          </section>
          <section className="dashboard-grid" aria-label="Các thao tác học tập">
            <article className="dashboard-card">
              <span className="dashboard-kicker">01</span>
              <h3>Bắt đầu bài thi</h3>
              <p>Chọn bộ câu hỏi đã được giảng viên xuất bản và bắt đầu làm bài.</p>
              <button type="button" onClick={() => navigate('/published-questions')} className="btn-primary">Xem ngân hàng đề</button>
            </article>
            <article className="dashboard-card">
              <span className="dashboard-kicker">02</span>
              <h3>Lịch sử bài thi</h3>
              <p>Xem điểm số, tỷ lệ đúng và thời gian của các lần làm bài.</p>
              <button type="button" onClick={() => navigate('/learning-history')} className="btn-secondary">Xem lịch sử</button>
            </article>
            <article className="dashboard-card">
              <span className="dashboard-kicker">03</span>
              <h3>Lịch sử ôn tập</h3>
              <p>Mở lại bộ câu hỏi đã làm để xem đáp án và tiếp tục luyện tập.</p>
              <button type="button" onClick={() => navigate('/learning-history')} className="btn-secondary">Tiếp tục ôn tập</button>
            </article>
            <article className="dashboard-card">
              <span className="dashboard-kicker">04</span>
              <h3>Thống kê kết quả</h3>
              <p>Xem số bài đã hoàn thành, điểm trung bình và thành tích cao nhất.</p>
              <button type="button" onClick={() => navigate('/student-statistics')} className="btn-secondary">Xem thống kê</button>
            </article>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-wide">
        <section className="welcome-panel">
          <div>
            <p className="eyebrow">Bảng điều khiển</p>
            <h2>Chào mừng trở lại, {user?.full_name}</h2>
            <p>
              Không gian làm việc dành cho giáo viên: quản lý học liệu, lập chỉ mục nội dung,
              hỏi đáp theo ngữ cảnh và tạo bộ câu hỏi đánh giá năng lực.
            </p>
          </div>
          <div className="welcome-metric" aria-label="Tóm tắt luồng làm việc">
            <span className="metric-pill">
              <strong>4 bước</strong>
              <span>Upload đến xuất đề</span>
            </span>
            <span className="metric-pill">
              <strong>RAG</strong>
              <span>Tra cứu theo ngữ nghĩa</span>
            </span>
            <span className="metric-pill">
              <strong>DOCX/PDF</strong>
              <span>Xuất bộ câu hỏi</span>
            </span>
          </div>
        </section>

        <section className="dashboard-grid" aria-label="Các thao tác chính">
          <article className="dashboard-card">
            <span className="dashboard-kicker">01</span>
            <h3>Upload tài liệu / bài giảng</h3>
            <p>Tải lên PDF, DOCX, PPTX hoặc video để hệ thống chuẩn bị dữ liệu học tập.</p>
            <button type="button" onClick={() => navigate('/documents')} className="btn-primary">
              Upload học liệu
            </button>
          </article>

          <article className="dashboard-card">
            <span className="dashboard-kicker">02</span>
            <h3>Ngân hàng câu hỏi</h3>
            <p>Xem các bộ câu hỏi AI đã soạn, duyệt và ban hành đề thi cho học sinh.</p>
            <button type="button" onClick={() => navigate('/question-history')} className="btn-secondary">
              Mở ngân hàng câu hỏi
            </button>
          </article>

          <article className="dashboard-card">
            <span className="dashboard-kicker">03</span>
            <h3>Sinh đề nhanh</h3>
            <p>Upload một file, chọn cấu hình và tạo bộ câu hỏi ngay trong cùng một luồng.</p>
            <button type="button" onClick={() => navigate('/generate')} className="btn-primary">
              Sinh đề nhanh
            </button>
          </article>

          <article className="dashboard-card">
            <span className="dashboard-kicker">04</span>
            <h3>Hỏi đáp tài liệu</h3>
            <p>Tra cứu nội dung theo ngữ nghĩa và đặt câu hỏi trực tiếp với học liệu đã index.</p>
            <button type="button" onClick={() => navigate('/documents')} className="btn-secondary">
              Chọn tài liệu
            </button>
          </article>
        </section>

        <footer className="page-footer">
          © 2026 EzEdu AI. Hệ thống hỗ trợ giảng dạy và đánh giá năng lực.
        </footer>
      </div>
    </div>
  );
};

export default DashboardPage;
