import { UserCheck, Award, MessageSquareQuote, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import type { TeacherRemark } from '../../data/roadmapData';
import { Badge } from '../ui';

interface TeacherRemarkCardProps {
  remark: TeacherRemark;
}

export function TeacherRemarkCard({ remark }: TeacherRemarkCardProps) {
  return (
    <div className="ez-teacher-remark-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <UserCheck size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--ez-text, #0f172a)' }}>
              👨‍🏫 {remark.teacherName}
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--ez-text-secondary, #64748b)' }}>
              {remark.teacherRole}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--ez-text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={13} /> {remark.date}
          </span>
          <Badge variant="success" size="sm">
            <Award size={12} style={{ marginRight: '3px' }} /> Đánh giá {remark.ratingScore}/10
          </Badge>
        </div>
      </div>

      {/* Block lời nhận xét dạng Quote Card */}
      <div
        style={{
          background: 'var(--ez-surface-muted, #f8fafc)',
          borderLeft: '4px solid #10b981',
          padding: '0.85rem 1rem',
          borderRadius: '0 12px 12px 0',
          fontSize: '0.88rem',
          lineHeight: '1.55',
          color: 'var(--ez-text, #0f172a)',
          display: 'flex',
          gap: '0.6rem',
        }}
      >
        <MessageSquareQuote size={18} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
        <span>{remark.content}</span>
      </div>

      {/* Điểm mạnh & Điểm cần cải thiện */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        {/* Điểm mạnh */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <CheckCircle2 size={14} /> Ưu điểm đã đạt:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {remark.strengths.map((item, index) => (
              <span
                key={index}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: '#065f46',
                  fontWeight: 500,
                }}
              >
                ✓ {item}
              </span>
            ))}
          </div>
        </div>

        {/* Cần cải thiện */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <AlertCircle size={14} /> Cần lưu ý cải thiện:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {remark.improvements.map((item, index) => (
              <span
                key={index}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#b45309',
                  fontWeight: 500,
                }}
              >
                • {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
