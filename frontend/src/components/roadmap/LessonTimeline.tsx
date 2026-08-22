import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, Play, Lock, Circle, Clock, FileText, Video, HelpCircle, Award } from 'lucide-react';
import type { ChapterData, LessonItem, LessonStatus } from '../../data/roadmapData';
import { Badge } from '../ui';

interface LessonTimelineProps {
  chapters: ChapterData[];
  onSelectLesson?: (lesson: LessonItem) => void;
}

export function LessonTimeline({ chapters, onSelectLesson }: LessonTimelineProps) {
  // Trạng thái mở/gập cho từng chương. Mặc định mở chương 1 và chương 2
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    chapters.forEach((ch, idx) => {
      initial[ch.id] = idx < 2; // Mở 2 chương đầu
    });
    return initial;
  });

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [chapterId]: !prev[chapterId],
    }));
  };

  const renderStatusIcon = (status: LessonStatus) => {
    switch (status) {
      case 'completed':
        return (
          <div className="ez-timeline-icon-node status-completed" title="Đã hoàn thành">
            <Check size={14} />
          </div>
        );
      case 'in_progress':
        return (
          <div className="ez-timeline-icon-node status-in_progress" title="Đang học">
            <Play size={12} style={{ marginLeft: '1px' }} />
          </div>
        );
      case 'locked':
        return (
          <div className="ez-timeline-icon-node status-locked" title="Bài học bị khóa">
            <Lock size={12} />
          </div>
        );
      default:
        return (
          <div className="ez-timeline-icon-node" title="Chưa học">
            <Circle size={10} style={{ color: '#94a3b8' }} />
          </div>
        );
    }
  };

  const renderTypeIcon = (type?: LessonItem['type']) => {
    switch (type) {
      case 'video':
        return <Video size={14} style={{ color: '#8b5cf6' }} />;
      case 'quiz':
        return <HelpCircle size={14} style={{ color: '#f59e0b' }} />;
      case 'exercise':
        return <Award size={14} style={{ color: '#10b981' }} />;
      default:
        return <FileText size={14} style={{ color: '#2563eb' }} />;
    }
  };

  const statusLabel = (status: LessonStatus) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success" size="sm">Đã học</Badge>;
      case 'in_progress':
        return <Badge variant="primary" size="sm">Đang học</Badge>;
      case 'locked':
        return <Badge variant="neutral" size="sm">🔒 Đang khóa</Badge>;
      default:
        return <Badge variant="neutral" size="sm">Chưa học</Badge>;
    }
  };

  return (
    <div className="ez-timeline-container">
      {chapters.map((chapter) => {
        const isExpanded = expandedChapters[chapter.id];

        return (
          <div key={chapter.id} className="ez-chapter-accordion">
            <div
              className="ez-chapter-header"
              onClick={() => toggleChapter(chapter.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleChapter(chapter.id);
                }
              }}
            >
              <div className="ez-chapter-title">
                {chapter.title}
                <Badge variant={chapter.completionRate === 100 ? 'success' : chapter.completionRate > 0 ? 'primary' : 'neutral'} size="sm">
                  {chapter.completionRate}% hoàn thành
                </Badge>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--ez-text-secondary, #64748b)' }}>
                  {chapter.lessons.length} bài
                </span>
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>

            {/* Content List */}
            {isExpanded && (
              <div className="ez-timeline-list">
                {chapter.lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="ez-timeline-item"
                    style={{
                      opacity: lesson.status === 'locked' ? 0.6 : 1,
                      cursor: lesson.status === 'locked' ? 'not-allowed' : 'pointer',
                    }}
                    onClick={() => {
                      if (lesson.status !== 'locked' && onSelectLesson) {
                        onSelectLesson(lesson);
                      }
                    }}
                  >
                    {renderStatusIcon(lesson.status)}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, paddingRight: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {renderTypeIcon(lesson.type)}
                        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ez-text, #0f172a)' }}>
                          {lesson.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.78rem', color: 'var(--ez-text-secondary, #64748b)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={12} /> {lesson.durationMinutes} phút
                        </span>
                        {lesson.score !== undefined && (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>
                            Điểm: {lesson.score}/10
                          </span>
                        )}
                        {lesson.completedAt && <span>Đã xong: {lesson.completedAt}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {statusLabel(lesson.status)}
                      {lesson.status !== 'locked' && (
                        <button
                          type="button"
                          className="ez-button ez-button-outline ez-button-sm"
                          style={{ borderRadius: '8px', padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}
                        >
                          {lesson.status === 'completed' ? 'Ôn lại' : 'Học ngay'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
