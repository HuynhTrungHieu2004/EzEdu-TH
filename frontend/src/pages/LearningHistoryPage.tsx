import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { questionApi } from '../api/questionApi';
import type { LearningHistoryItem } from '../api/questionApi';
import { getApiErrorDetail } from '../api/errors';

export default function LearningHistoryPage() {
  const [items, setItems] = useState<LearningHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    questionApi.listMyLearningHistory()
      .then(setItems)
      .catch((err) => setError(getApiErrorDetail(err) ?? 'Không tải được lịch sử học tập.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-wide">
        <div className="page-header">
          <div>
            <p className="eyebrow">Hồ sơ học sinh</p>
            <h1 className="section-title">Lịch sử bài thi và ôn tập</h1>
            <p className="section-subtitle">Theo dõi kết quả các lần làm bài và tiếp tục ôn tập.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => navigate('/published-questions')}>
            Bắt đầu bài thi mới
          </button>
        </div>

        {loading && <div className="loading-state"><p>Đang tải lịch sử...</p></div>}
        {error && <div className="alert alert-error">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="empty-state">Bạn chưa có lần làm bài nào.</div>
        )}
        {items.length > 0 && (
          <section className="table-card">
            <div className="table-card-header">
              <h3 className="table-title">Các lần làm bài gần đây</h3>
              <span className="tag">{items.length} lượt</span>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Học liệu</th><th>Kết quả</th><th>Tỷ lệ</th><th>Thời gian</th><th>Ôn tập</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.document_name}</td>
                      <td>{item.score}/{item.max_score}</td>
                      <td><span className="tag">{item.percent.toFixed(1)}%</span></td>
                      <td>{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                      <td><button type="button" className="btn-secondary" onClick={() => navigate(`/question-sets/${item.question_set_id}`)}>Xem lại / Làm lại</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
