import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { classesApi } from '../api/classesApi';
import type {
  ClassAbilityGroupsResponse,
  ClassDetail,
  StudentSearchResult,
} from '../types/classes';
import { apiErrorMessage } from '../utils/apiError';

const ClassDetailPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [actionError, setActionError] = useState('');
  const [groups, setGroups] = useState<ClassAbilityGroupsResponse | null>(null);

  const load = () => {
    if (!classId) return;
    setLoading(true);
    setError('');
    classesApi.detail(classId)
      .then((data) => setDetail(data))
      .catch((err) => setError(apiErrorMessage(err, 'Không tải được thông tin lớp học.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    queueMicrotask(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // Phân nhóm chỉ có nghĩa khi học sinh đã làm bài. Lỗi ở đây không được
  // chặn màn hình lớp học — đây là thông tin bổ trợ cho giáo viên.
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    classesApi
      .abilityGroups(classId)
      .then((data) => {
        if (!cancelled) setGroups(data);
      })
      .catch(() => {
        if (!cancelled) setGroups(null);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setActionError('');
    try {
      const data = await classesApi.searchStudents(query.trim());
      setResults(data.items);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Không tìm được học sinh.'));
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (studentId: string) => {
    if (!classId) return;
    setAddingId(studentId);
    setActionError('');
    try {
      const data = await classesApi.addStudents(classId, [studentId]);
      setDetail(data);
      setResults((prev) => prev.filter((item) => item.id !== studentId));
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Không thêm được học sinh vào lớp.'));
    } finally {
      setAddingId('');
    }
  };

  const handleRemove = async (studentId: string) => {
    if (!classId) return;
    setRemovingId(studentId);
    setActionError('');
    try {
      const data = await classesApi.removeStudent(classId, studentId);
      setDetail(data);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Không xoá được học sinh khỏi lớp.'));
    } finally {
      setRemovingId('');
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-wide">
          <div className="loading-stack">
            <span className="spinner" />
            <p>Đang tải thông tin lớp học...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="page">
        <div className="page-wide">
          <div className="alert alert-error">{error || 'Không tìm thấy lớp học.'}</div>
          <button type="button" onClick={() => navigate('/classes')} className="btn-secondary">
            Quay lại danh sách lớp
          </button>
        </div>
      </div>
    );
  }

  const memberIds = new Set(detail.students.map((s) => s.id));

  return (
    <div className="page">
      <div className="page-wide">
        <div className="page-header">
          <div>
            <p className="eyebrow">Lớp học</p>
            <h2 className="section-title">{detail.name}</h2>
            <p className="section-subtitle">{detail.description || 'Không có mô tả.'}</p>
          </div>
          <button type="button" onClick={() => navigate('/classes')} className="btn-secondary">
            Quay lại danh sách lớp
          </button>
        </div>

        {actionError && <div className="alert alert-error">{actionError}</div>}

        {groups && groups.status === 'ok' && groups.groups.length > 0 && (
          <section className="table-card" style={{ marginBottom: 24 }}>
            <div className="table-card-header">
              <h3 className="table-title">Nhóm năng lực trong lớp</h3>
              <span className="muted">
                {groups.analyzed_count}/{groups.student_count} em đã có bài làm
                {groups.clustering
                  ? ` · K-Means chia ${groups.clustering.selected_k} nhóm (silhouette ${groups.clustering.silhouette_score.toFixed(2)})`
                  : ''}
              </span>
            </div>
            <div style={{ padding: '0 4px 12px', display: 'grid', gap: 12 }}>
              {groups.groups.map((group) => {
                const members = groups.students.filter((s) => s.cluster_id === group.cluster_id);
                const setName = (id: string) => groups.question_set_names[id] || id;
                return (
                  <article key={group.cluster_id} className="cls-group">
                    <div className="cls-group-head">
                      <strong>
                        Nhóm {group.cluster_id + 1} · {group.size} em
                      </strong>
                      <span className="muted">Trung bình {group.average_percent}%</span>
                    </div>
                    <p className="cls-group-weak">
                      Cần phụ đạo nhất: <strong>{setName(group.weakest_set_id)}</strong> (
                      {group.centroid[group.weakest_set_id]}%) · Vững nhất:{' '}
                      {setName(group.strongest_set_id)} ({group.centroid[group.strongest_set_id]}%)
                    </p>
                    <ul className="cls-group-members">
                      {members.map((student) => (
                        <li key={student.user_id}>
                          {student.full_name || student.user_id}
                          <span className="cls-group-score"> {student.average_percent}%</span>
                          {student.needs_attention && (
                            <span className="cls-group-attention" title="Kết quả lệch hẳn so với nhóm — nên xem riêng">
                              cần xem riêng
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="table-card" style={{ marginBottom: 24 }}>
          <div className="table-card-header">
            <h3 className="table-title">Thêm học sinh vào lớp</h3>
          </div>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, padding: '0 4px 12px' }}>
            <input
              type="text"
              placeholder="Tìm theo tên hoặc email học sinh..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1 }}
              maxLength={120}
            />
            <button type="submit" className="btn-primary" disabled={searching}>
              {searching ? 'Đang tìm...' : 'Tìm kiếm'}
            </button>
          </form>
          {results.length > 0 && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'right' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((student) => (
                    <tr key={student.id}>
                      <td>{student.full_name}</td>
                      <td>{student.email}</td>
                      <td>
                        <div className="row-actions">
                          {memberIds.has(student.id) ? (
                            <span className="tag">Đã ở trong lớp</span>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={addingId === student.id}
                              onClick={() => handleAdd(student.id)}
                            >
                              {addingId === student.id ? 'Đang thêm...' : 'Thêm vào lớp'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="table-card">
          <div className="table-card-header">
            <h3 className="table-title">Danh sách học sinh trong lớp</h3>
            <span className="tag">{detail.students.length} học sinh</span>
          </div>
          {detail.students.length === 0 ? (
            <div className="empty-state">Lớp chưa có học sinh nào. Tìm kiếm ở trên để thêm học sinh.</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'right' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.students.map((student) => (
                    <tr key={student.id}>
                      <td>{student.full_name}</td>
                      <td>{student.email}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-danger"
                            disabled={removingId === student.id}
                            onClick={() => handleRemove(student.id)}
                          >
                            {removingId === student.id ? 'Đang xoá...' : 'Xoá khỏi lớp'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ClassDetailPage;
