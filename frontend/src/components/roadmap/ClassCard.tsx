import { BookOpen, Clock, ChevronRight, Play, GraduationCap, School, BookCheck } from 'lucide-react';
import type { GradeData } from '../../data/roadmapData';
import { Badge } from '../ui';

interface ClassCardProps {
  grade: GradeData;
  onSelect: (grade: GradeData) => void;
  onContinue?: (grade: GradeData) => void;
}

export function ClassCard({ grade, onSelect, onContinue }: ClassCardProps) {
  const isStarted = grade.completionRate > 0;
  const isCompleted = grade.completionRate === 100;

  const levelBadgeVariant =
    grade.level === 'Tiểu học' ? 'success' : grade.level === 'THCS' ? 'primary' : 'warning';

  const levelIcon =
    grade.level === 'Tiểu học' ? (
      <School size={24} style={{ color: '#10b981' }} />
    ) : grade.level === 'THCS' ? (
      <BookOpen size={24} style={{ color: '#2563eb' }} />
    ) : (
      <GraduationCap size={24} style={{ color: '#8b5cf6' }} />
    );

  const levelBg =
    grade.level === 'Tiểu học'
      ? 'rgba(16, 185, 129, 0.08)'
      : grade.level === 'THCS'
      ? 'rgba(37, 99, 235, 0.08)'
      : 'rgba(139, 92, 246, 0.08)';

  return (
    <div
      className="ez-grade-card"
      onClick={() => onSelect(grade)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(grade);
        }
      }}
    >
      <div
        className="ez-grade-card-header-box"
        style={{
          padding: '1rem 1.25rem',
          background: levelBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--ez-border-subtle, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--ez-surface, #ffffff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
            }}
          >
            {levelIcon}
          </div>
          <Badge variant={levelBadgeVariant} size="sm">
            {grade.level}
          </Badge>
        </div>

        <Badge variant={isCompleted ? 'success' : isStarted ? 'primary' : 'neutral'}>
          {isCompleted ? 'Hoàn thành' : isStarted ? 'Đang học' : 'Chưa học'}
        </Badge>
      </div>

      <div className="ez-grade-card-body">
        <div className="ez-grade-card-title">
          <span>{grade.name}</span>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--ez-primary, #2563eb)' }}>
            {grade.completionRate}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="ez-roadmap-progress-bar-wrap" style={{ height: '6px' }}>
          <div
            className="ez-roadmap-progress-bar-fill"
            style={{ width: `${grade.completionRate}%` }}
          />
        </div>

        <div className="ez-grade-card-meta">
          <div className="ez-grade-card-meta-item">
            <BookOpen size={14} style={{ color: 'var(--ez-primary, #2563eb)' }} />
            <span>{grade.subjectCount} môn học</span>
          </div>
          <div className="ez-grade-card-meta-item">
            <BookCheck size={14} style={{ color: 'var(--ez-primary, #2563eb)' }} />
            <span>{grade.lessonCount} bài</span>
          </div>
          <div className="ez-grade-card-meta-item">
            <Clock size={14} style={{ color: 'var(--ez-primary, #2563eb)' }} />
            <span>{grade.studyHours}h học</span>
          </div>
        </div>

        <div className="ez-grade-card-actions">
          <button
            type="button"
            className="ez-button ez-button-outline ez-button-sm"
            style={{ flex: 1, borderRadius: '12px' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(grade);
            }}
          >
            Xem chi tiết <ChevronRight size={14} />
          </button>

          <button
            type="button"
            className={`ez-button ${isStarted ? 'ez-button-primary' : 'ez-button-secondary'} ez-button-sm`}
            style={{ flex: 1, borderRadius: '12px' }}
            onClick={(e) => {
              e.stopPropagation();
              if (onContinue) onContinue(grade);
              else onSelect(grade);
            }}
          >
            {isStarted ? (
              <>
                <Play size={14} /> Tiếp tục học
              </>
            ) : (
              'Bắt đầu học'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
