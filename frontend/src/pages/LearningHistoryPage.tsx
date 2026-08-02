import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { questionApi } from '../api/questionApi';
import type { LearningHistoryItem } from '../api/questionApi';
import { getApiErrorDetail } from '../api/errors';
import { Tabs, Tooltip } from '../components/ui';
import type { TabItem } from '../components/ui';

type FilterType = 'all' | 'exam' | 'practice';

const TABS: TabItem[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'exam', label: 'Đề thi GV giao' },
  { id: 'practice', label: 'Ôn tập' },
];

export default function LearningHistoryPage() {
  const [items, setItems] = useState<LearningHistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    questionApi.listMyLearningHistory()
      .then(setItems)
      .catch((err) => setError(getApiErrorDetail(err) ?? 'Không tải được lịch sử học tập.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.item_type === filter)),
    [items, filter],
  );

  const handleRetake = (item: LearningHistoryItem) => {
    if (item.item_type === 'practice') {
      navigate(`/question-sets/${item.question_set_id}`);
    } else {
      navigate(`/take-exam/${item.exam_id}`);
    }
  };

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

        <Tabs items={TABS} value={filter} onChange={(id) => setFilter(id as FilterType)} ariaLabel="Lọc lịch sử" />

        {loading && <div className="loading-state"><p>Đang tải lịch sử...</p></div>}
        {error && <div className="alert alert-error">{error}</div>}
        {!loading && !error && filteredItems.length === 0 && (
          <div className="empty-state">Bạn chưa có lần làm bài nào.</div>
        )}
        {filteredItems.length > 0 && (
          <section className="table-card">
            <div className="table-card-header">
              <h3 className="table-title">Các lần làm bài gần đây</h3>
              <span className="tag">{filteredItems.length} lượt</span>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Tên</th><th>Loại</th><th>Kết quả</th><th>Tỷ lệ</th><th>Thời gian</th><th>Hành động</th></tr></thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const retakeDisabled = item.source_deleted || !item.can_retake;
                    const retakeButton = (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={retakeDisabled}
                        onClick={() => handleRetake(item)}
                      >
                        {item.item_type === 'practice' ? 'Xem lại / Làm lại' : (item.can_retake ? 'Xem lại / Làm lại' : 'Xem lại')}
                      </button>
                    );
                    return (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td><span className="tag">{item.item_type === 'exam' ? 'Đề thi' : 'Ôn tập'}</span></td>
                        <td>{item.score}/{item.max_score}</td>
                        <td><span className="tag">{item.percent.toFixed(1)}%</span></td>
                        <td>{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                        <td>
                          {item.source_deleted ? (
                            <Tooltip label="Tài liệu/đề thi gốc đã bị xóa">{retakeButton}</Tooltip>
                          ) : retakeButton}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
