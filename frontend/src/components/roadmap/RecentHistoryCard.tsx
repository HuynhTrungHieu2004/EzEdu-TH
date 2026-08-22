import { History, Clock, Award, ChevronRight } from 'lucide-react';
import type { RecentSubjectHistory } from '../../data/roadmapData';
import { Badge } from '../ui';

interface RecentHistoryCardProps {
  historyList: RecentSubjectHistory[];
  onResumeLesson?: (item: RecentSubjectHistory) => void;
}

export function RecentHistoryCard({ historyList, onResumeLesson }: RecentHistoryCardProps) {
  return (
    <div className="ez-recent-history-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ez-text, #0f172a)' }}>
          <History size={18} style={{ color: 'var(--ez-primary, #2563eb)' }} /> Lịch sử môn học gần đây
        </h3>
        <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>
          {historyList.length} môn đang theo học
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {historyList.map((item) => (
          <div key={item.id} className="ez-recent-history-item">
            {/* Subject Icon Container */}
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--ez-surface-muted, #f1f5f9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.35rem',
                flexShrink: 0,
              }}
            >
              {item.icon}
            </div>

            {/* Info Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ez-text, #0f172a)' }}>
                  {item.subjectName}
                </span>
                <Badge variant="neutral" size="sm">{item.gradeName}</Badge>
                {item.score && (
                  <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Award size={12} /> {item.score}/10
                  </span>
                )}
              </div>

              <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.lastLessonTitle}
              </span>

              {/* Mini Progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <div className="ez-roadmap-progress-bar-wrap" style={{ height: '4px', flex: 1 }}>
                  <div
                    className="ez-roadmap-progress-bar-fill"
                    style={{ width: `${item.progressPct}%` }}
                  />
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ez-primary, #2563eb)' }}>
                  {item.progressPct}%
                </span>
              </div>
            </div>

            {/* Time & Action Button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--ez-text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={12} /> {item.completedAt}
              </span>

              <button
                type="button"
                className="ez-button ez-button-primary ez-button-sm"
                style={{ borderRadius: '10px', padding: '0.25rem 0.65rem', fontSize: '0.8rem' }}
                onClick={() => onResumeLesson && onResumeLesson(item)}
              >
                Học tiếp <ChevronRight size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
