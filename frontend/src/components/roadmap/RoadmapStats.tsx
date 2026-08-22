import { Flame, Award, BookCheck, Clock, Layers, CheckCircle2 } from 'lucide-react';
import type { RoadmapOverallStats } from '../../data/roadmapData';

interface RoadmapStatsProps {
  stats: RoadmapOverallStats;
}

export function RoadmapStats({ stats }: RoadmapStatsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Grid các chỉ số */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="ez-stat-tile" style={{ padding: '1rem 1.25rem', background: 'var(--ez-surface, #fff)', border: '1px solid var(--ez-border-subtle, #e2e8f0)', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>Tổng môn học</span>
            <Layers size={18} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ez-text, #0f172a)' }}>
            {stats.totalSubjects}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#10b981' }}>Tất cả 12 khối lớp</span>
        </div>

        <div className="ez-stat-tile" style={{ padding: '1rem 1.25rem', background: 'var(--ez-surface, #fff)', border: '1px solid var(--ez-border-subtle, #e2e8f0)', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>Bài đã hoàn thành</span>
            <CheckCircle2 size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ez-text, #0f172a)' }}>
            {stats.completedLessons} / {stats.totalLessons}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--ez-text-secondary, #64748b)' }}>Còn {stats.remainingLessons} bài</span>
        </div>

        <div className="ez-stat-tile" style={{ padding: '1rem 1.25rem', background: 'var(--ez-surface, #fff)', border: '1px solid var(--ez-border-subtle, #e2e8f0)', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>Điểm trung bình</span>
            <BookCheck size={18} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ez-text, #0f172a)' }}>
            {stats.avgScore}/10
          </div>
          <span style={{ fontSize: '0.78rem', color: '#10b981' }}>Xếp loại Giỏi</span>
        </div>

        <div className="ez-stat-tile" style={{ padding: '1rem 1.25rem', background: 'var(--ez-surface, #fff)', border: '1px solid var(--ez-border-subtle, #e2e8f0)', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>Số giờ học</span>
            <Clock size={18} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ez-text, #0f172a)' }}>
            {stats.totalStudyHours} giờ
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--ez-text-secondary, #64748b)' }}>Tích lũy hệ thống</span>
        </div>

        <div className="ez-stat-tile" style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.15))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#d97706' }}>Chuỗi ngày học</span>
            <Flame size={20} style={{ color: '#ef4444' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>
            {stats.streakDays} ngày 🔥
          </div>
          <span style={{ fontSize: '0.78rem', color: '#d97706' }}>Học liên tục xuất sắc!</span>
        </div>
      </div>

      {/* Danh sách Huy hiệu đạt được */}
      <div
        style={{
          background: 'var(--ez-surface, #fff)',
          border: '1px solid var(--ez-border-subtle, #e2e8f0)',
          borderRadius: '16px',
          padding: '1.25rem',
        }}
      >
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Award size={18} style={{ color: '#eab308' }} /> Huy hiệu thành tích đạt được ({stats.badges.length})
        </h4>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.85rem',
          }}
        >
          {stats.badges.map((badge) => (
            <div
              key={badge.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                borderRadius: '12px',
                background: 'var(--ez-surface-muted, #f8fafc)',
                border: '1px solid var(--ez-border-subtle, #e2e8f0)',
              }}
            >
              <span style={{ fontSize: '1.75rem' }}>{badge.icon}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--ez-text, #0f172a)' }}>
                  {badge.title}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ez-text-secondary, #64748b)' }}>
                  {badge.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
