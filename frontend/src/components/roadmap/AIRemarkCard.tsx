import { Bot, ArrowRight, Video, FileText, ClipboardList, Layers, HelpCircle } from 'lucide-react';
import type { AIRecommendation, AIRecommendationItem } from '../../data/roadmapData';
import { Badge } from '../ui';

interface AIRemarkCardProps {
  recommendation: AIRecommendation;
  onAction?: (item: AIRecommendationItem) => void;
}

export function AIRemarkCard({ recommendation, onAction }: AIRemarkCardProps) {
  const renderItemBadge = (type: AIRecommendationItem['type']) => {
    switch (type) {
      case 'video':
        return <Badge variant="secondary" size="sm"><Video size={12} style={{ marginRight: '3px' }} /> Video</Badge>;
      case 'document':
        return <Badge variant="neutral" size="sm"><FileText size={12} style={{ marginRight: '3px' }} /> Tài liệu</Badge>;
      case 'practice':
        return <Badge variant="primary" size="sm"><ClipboardList size={12} style={{ marginRight: '3px' }} /> Đề luyện tập</Badge>;
      case 'flashcard':
        return <Badge variant="warning" size="sm"><Layers size={12} style={{ marginRight: '3px' }} /> Flashcard</Badge>;
      case 'quiz':
        return <Badge variant="info" size="sm"><HelpCircle size={12} style={{ marginRight: '3px' }} /> Quiz</Badge>;
      default:
        return <Badge variant="neutral" size="sm">Gợi ý</Badge>;
    }
  };

  return (
    <div className="ez-ai-remark-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Bot size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--ez-text, #0f172a)' }}>
              🤖 AI đề xuất học tập
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--ez-text-secondary, #64748b)' }}>
              Dựa trên kết quả phân tích cá nhân hóa của bạn
            </span>
          </div>
        </div>

        <Badge variant="warning">Đề xuất cải thiện</Badge>
      </div>

      <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--ez-text, #0f172a)' }}>
        <strong>Phân tích:</strong> {recommendation.summary}
        <br />
        💡 Gợi ý ôn tập: <strong>{recommendation.suggestedChapter}</strong> ({recommendation.targetSubject})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {recommendation.items.map((item) => (
          <div key={item.id} className="ez-ai-recommendation-item">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, paddingRight: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {renderItemBadge(item.type)}
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--ez-text, #0f172a)' }}>
                  {item.title}
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--ez-text-secondary, #64748b)' }}>
                {item.description} ({item.estimatedMinutes} phút)
              </span>
            </div>

            <button
              type="button"
              className="ez-button ez-button-primary ez-button-sm"
              style={{ borderRadius: '10px', flexShrink: 0 }}
              onClick={() => onAction && onAction(item)}
            >
              Học ngay <ArrowRight size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
