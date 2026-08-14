import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { classesApi } from '../api/classesApi';
import type {
  ClassAbilityGroupsResponse,
  ClassDetail,
  StudentSearchResult,
} from '../types/classes';
import { apiErrorMessage } from '../utils/apiError';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SkeletonText,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';
import './class-detail.css';

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
      <div className="ez-stack">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <ErrorState
        title="Không tìm thấy lớp học"
        description={error || undefined}
        actions={<Button onClick={() => navigate('/classes')}>Quay lại danh sách lớp</Button>}
      />
    );
  }

  const memberIds = new Set(detail.students.map((s) => s.id));

  const searchColumns: DataTableColumn<StudentSearchResult>[] = [
    { key: 'name', label: 'Họ tên', render: (student) => student.full_name },
    { key: 'email', label: 'Email', render: (student) => student.email },
    {
      key: 'actions',
      label: 'Hành động',
      render: (student) => (
        <div className="ez-datatable-cell-actions">
          {memberIds.has(student.id) ? (
            <Badge variant="neutral">Đã ở trong lớp</Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              loading={addingId === student.id}
              onClick={() => handleAdd(student.id)}
            >
              Thêm vào lớp
            </Button>
          )}
        </div>
      ),
    },
  ];

  const memberColumns: DataTableColumn<ClassDetail['students'][number]>[] = [
    { key: 'name', label: 'Họ tên', render: (student) => student.full_name },
    { key: 'email', label: 'Email', render: (student) => student.email },
    {
      key: 'actions',
      label: 'Hành động',
      render: (student) => (
        <div className="ez-datatable-cell-actions">
          <Button
            variant="danger"
            size="sm"
            loading={removingId === student.id}
            onClick={() => handleRemove(student.id)}
          >
            Xoá khỏi lớp
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        backTo="/classes"
        backLabel="Danh sách lớp"
        eyebrow="Lớp học"
        title={detail.name}
        description={detail.description || 'Không có mô tả.'}
      />

      {actionError && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>
          {actionError}
        </Alert>
      )}

      {groups && groups.status === 'ok' && groups.groups.length > 0 && (
        <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">Nhóm năng lực trong lớp</CardTitle>
              <p className="ez-card-desc">
                {groups.analyzed_count}/{groups.student_count} em đã có bài làm
                {groups.clustering
                  ? ` · K-Means chia ${groups.clustering.selected_k} nhóm (silhouette ${groups.clustering.silhouette_score.toFixed(2)})`
                  : ''}
              </p>
            </div>
          </CardHeader>
          <CardBody className="ez-stack">
            {groups.groups.map((group) => {
              const members = groups.students.filter((s) => s.cluster_id === group.cluster_id);
              const setName = (id: string) => groups.question_set_names[id] || id;
              return (
                <article key={group.cluster_id} className="ez-cls-group">
                  <div className="ez-cls-group-head">
                    <strong>
                      Nhóm {group.cluster_id + 1} · {group.size} em
                    </strong>
                    <Badge variant="neutral">Trung bình {group.average_percent}%</Badge>
                  </div>
                  <p className="ez-cls-group-weak">
                    Cần phụ đạo nhất: <strong>{setName(group.weakest_set_id)}</strong> (
                    {group.centroid[group.weakest_set_id]}%) · Vững nhất:{' '}
                    {setName(group.strongest_set_id)} ({group.centroid[group.strongest_set_id]}%)
                  </p>
                  <ul className="ez-cls-group-members">
                    {members.map((student) => (
                      <li key={student.user_id}>
                        <span>{student.full_name || student.user_id}</span>
                        <span className="ez-cls-group-score">{student.average_percent}%</span>
                        {student.needs_attention && (
                          <Badge variant="warning">Cần xem riêng</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </CardBody>
        </Card>
      )}

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardHeader>
          <div>
            <CardTitle as="h2">Thêm học sinh vào lớp</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSearch} className="ez-cls-search">
            <Input
              type="search"
              placeholder="Tìm theo tên hoặc email học sinh…"
              aria-label="Tìm học sinh"
              value={query}
              maxLength={120}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" loading={searching}>
              Tìm kiếm
            </Button>
          </form>

          {results.length > 0 && (
            <DataTable
              className="ez-cls-table"
              columns={searchColumns}
              data={results}
              rowKey={(student) => student.id}
              minWidth={620}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Danh sách học sinh trong lớp</CardTitle>
          </div>
          <Badge variant="neutral">{detail.students.length} học sinh</Badge>
        </CardHeader>
        <CardBody>
          {detail.students.length === 0 ? (
            <EmptyState
              compact
              title="Lớp chưa có học sinh nào"
              description="Tìm kiếm ở khối bên trên để thêm học sinh vào lớp."
            />
          ) : (
            <DataTable
              columns={memberColumns}
              data={detail.students}
              rowKey={(student) => student.id}
              minWidth={620}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
};

export default ClassDetailPage;
