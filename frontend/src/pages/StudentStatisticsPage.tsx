import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { questionApi } from '../api/questionApi';
import type { LearningHistoryItem } from '../api/questionApi';
import { getApiErrorDetail } from '../api/errors';

export default function StudentStatisticsPage() {
  const [attempts, setAttempts] = useState<LearningHistoryItem[]>([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([questionApi.listMyLearningHistory(), questionApi.listPublished()])
      .then(([history, published]) => {
        setAttempts(history);
        setAssignedCount(published.items.length);
      })
      .catch((err) => setError(getApiErrorDetail(err) ?? 'Không tải được thống kê kết quả.'))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const completedIds = new Set(attempts.map((item) => item.question_set_id));
    const average = attempts.length
      ? attempts.reduce((sum, item) => sum + item.percent, 0) / attempts.length
      : 0;
    const best = attempts.length ? Math.max(...attempts.map((item) => item.percent)) : 0;
    const latestByExam = new Map<string, LearningHistoryItem>();
    for (const attempt of attempts) {
      if (!latestByExam.has(attempt.question_set_id)) latestByExam.set(attempt.question_set_id, attempt);
    }
    return {
      completed: completedIds.size,
      pending: Math.max(0, assignedCount - completedIds.size),
      average,
      best,
      latest: Array.from(latestByExam.values()),
    };
  }, [attempts, assignedCount]);

  if (loading) return <div className="loading-state"><p>Đang tổng hợp kết quả học tập...</p></div>;

  return (
    <div className="page">
      <div className="page-wide">
        <div className="page-header">
          <div>
            <p className="eyebrow">Hồ sơ học tập</p>
            <h1 className="section-title">Thống kê kết quả</h1>
            <p className="section-subtitle">Điểm số được cập nhật tự động sau mỗi lần bạn nộp bài.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => navigate('/published-questions')}>Bài thi của bạn</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {!error && (
          <>
            <section className="dashboard-grid" aria-label="Chỉ số kết quả học tập">
              <article className="dashboard-card"><span className="dashboard-kicker">01</span><h3>{stats.completed}</h3><p>Bài thi đã hoàn thành</p></article>
              <article className="dashboard-card"><span className="dashboard-kicker">02</span><h3>{stats.pending}</h3><p>Bài thi chưa hoàn thành</p></article>
              <article className="dashboard-card"><span className="dashboard-kicker">03</span><h3>{stats.average.toFixed(1)}%</h3><p>Điểm trung bình của {attempts.length} lượt làm</p></article>
              <article className="dashboard-card"><span className="dashboard-kicker">04</span><h3>{stats.best.toFixed(1)}%</h3><p>Kết quả cao nhất</p></article>
            </section>

            <section className="table-card" style={{ marginTop: '24px' }}>
              <div className="table-card-header"><h3 className="table-title">Kết quả gần nhất theo bài thi</h3><span className="tag">{stats.latest.length} bài</span></div>
              {stats.latest.length === 0 ? (
                <div className="empty-state">Bạn chưa có điểm số. Hãy hoàn thành và nộp một bài thi.</div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>Bài thi</th><th>Điểm</th><th>Tỷ lệ</th><th>Đánh giá</th><th>Thời gian</th><th></th></tr></thead>
                    <tbody>
                      {stats.latest.map((item) => (
                        <tr key={item.id}>
                          <td>{item.document_name}</td>
                          <td>{item.score}/{item.max_score}</td>
                          <td><strong>{item.percent.toFixed(1)}%</strong></td>
                          <td><span className="tag">{item.percent >= 80 ? 'Tốt' : item.percent >= 50 ? 'Đạt' : 'Cần ôn tập'}</span></td>
                          <td>{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                          <td><button type="button" className="btn-secondary" onClick={() => navigate(`/question-sets/${item.question_set_id}`)}>Xem lại</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
