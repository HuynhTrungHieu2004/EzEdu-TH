import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { classesApi } from '../api/classesApi';
import type { ClassSummary } from '../types/classes';
import { apiErrorMessage } from '../utils/apiError';

const ClassesPage: React.FC = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createError, setCreateError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    classesApi.list()
      .then((data) => setClasses(data.items))
      .catch((err) => setError(apiErrorMessage(err, 'Không tải được danh sách lớp học.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setCreateError('Vui lòng nhập tên lớp.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await classesApi.create({ name: name.trim(), description: description.trim() || undefined });
      setName('');
      setDescription('');
      load();
    } catch (err) {
      setCreateError(apiErrorMessage(err, 'Không tạo được lớp học.'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-wide">
          <div className="loading-stack">
            <span className="spinner" />
            <p>Đang tải danh sách lớp học...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-wide">
        <div className="page-header">
          <div>
            <p className="eyebrow">Quản lý lớp học</p>
            <h2 className="section-title">Lớp học của tôi</h2>
            <p className="section-subtitle">
              Tạo lớp và thêm học sinh để giao đề thi riêng cho từng lớp thay vì ban hành công khai cho mọi học sinh.
            </p>
          </div>
          <button type="button" onClick={() => navigate('/question-history')} className="btn-secondary">
            Quay lại Ngân hàng câu hỏi
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <section className="table-card" style={{ marginBottom: 24 }}>
          <div className="table-card-header">
            <h3 className="table-title">Tạo lớp mới</h3>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '0 4px 4px' }}>
            <input
              type="text"
              placeholder="Tên lớp (vd: Lớp 10A1 - Toán)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: '1 1 240px', minWidth: 200 }}
              maxLength={200}
            />
            <input
              type="text"
              placeholder="Mô tả (không bắt buộc)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ flex: '2 1 320px', minWidth: 200 }}
              maxLength={2000}
            />
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Đang tạo...' : 'Tạo lớp'}
            </button>
          </form>
          {createError && <div className="alert alert-error" style={{ margin: '8px 4px 0' }}>{createError}</div>}
        </section>

        <section className="table-card">
          <div className="table-card-header">
            <h3 className="table-title">Danh sách lớp</h3>
            <span className="tag">{classes.length} lớp</span>
          </div>

          {classes.length === 0 ? (
            <div className="empty-state">
              Bạn chưa tạo lớp học nào. Tạo lớp ở trên để bắt đầu giao đề thi theo từng lớp.
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên lớp</th>
                    <th>Mô tả</th>
                    <th>Sĩ số</th>
                    <th>Ngày tạo</th>
                    <th style={{ textAlign: 'right' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((cls) => (
                    <tr key={cls.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => navigate(`/classes/${cls.id}`)}
                          className="document-link"
                        >
                          {cls.name}
                        </button>
                      </td>
                      <td>{cls.description || '—'}</td>
                      <td><span className="tag">{cls.student_count} học sinh</span></td>
                      <td>{new Date(cls.created_at).toLocaleString('vi-VN')}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={() => navigate(`/classes/${cls.id}`)} className="btn-secondary">
                            Quản lý học sinh
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

export default ClassesPage;
