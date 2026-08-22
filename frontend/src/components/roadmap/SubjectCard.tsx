import { BookOpen, Award, Sparkles, ChevronRight, Play } from 'lucide-react';
import type { SubjectData } from '../../data/roadmapData';
import { Badge } from '../ui';

interface SubjectCardProps {
  subject: SubjectData;
  onSelect: (subject: SubjectData) => void;
  onStart: (subject: SubjectData) => void;
}

export function SubjectCard({ subject, onSelect, onStart }: SubjectCardProps) {
  const isStarted = subject.progressPct > 0;

  const difficultyVariant =
    subject.difficulty === 'Dễ' ? 'success' : subject.difficulty === 'Trung bình' ? 'warning' : 'error';

  return (
    <div className="ez-subject-card">
      <div className="ez-subject-header">
        <div className="ez-subject-icon-box">{subject.icon}</div>

        <div className="ez-subject-info">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="ez-subject-name">{subject.name}</span>
            <Badge variant={difficultyVariant} size="sm">
              {subject.difficulty}
            </Badge>
          </div>
          <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>
            {subject.chapterCount} chương • {subject.lessonCount} bài học
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="ez-subject-stats-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Award size={15} style={{ color: '#eab308' }} />
          <span>Điểm TB: <strong>{subject.avgScore > 0 ? `${subject.avgScore}/10` : '—'}</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <BookOpen size={15} style={{ color: '#2563eb' }} />
          <span>Tiến độ: <strong>{subject.progressPct}%</strong></span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="ez-roadmap-progress-bar-wrap" style={{ height: '6px' }}>
        <div
          className="ez-roadmap-progress-bar-fill"
          style={{ width: `${subject.progressPct}%` }}
        />
      </div>

      {/* AI Remark Box */}
      {subject.aiRemark && (
        <div className="ez-ai-remark-box">
          <Sparkles size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
          <span>{subject.aiRemark}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
        <button
          type="button"
          className="ez-button ez-button-outline ez-button-sm"
          style={{ flex: 1, borderRadius: '12px' }}
          onClick={() => onSelect(subject)}
        >
          Chi tiết bài học <ChevronRight size={14} />
        </button>

        <button
          type="button"
          className={`ez-button ${isStarted ? 'ez-button-primary' : 'ez-button-secondary'} ez-button-sm`}
          style={{ flex: 1, borderRadius: '12px' }}
          onClick={() => onStart(subject)}
        >
          {isStarted ? (
            <>
              <Play size={14} /> Tiếp tục
            </>
          ) : (
            'Bắt đầu'
          )}
        </button>
      </div>
    </div>
  );
}
