import React, { useState } from 'react';
import { AlertTriangle, Globe, Lightbulb, Search, Shield, Zap } from 'lucide-react';
import type { LocalChatMessage } from '../../types/chat';
import type { FeedbackRating } from '../../types/feedback';
import {
  RETRIEVAL_MODE_LABELS,
  EVIDENCE_STATUS_LABELS,
  EXTERNAL_SEARCH_STATUS_LABELS,
} from '../../constants/advancedChat';
import { renderAnswerWithCitations, formatConfidence } from '../../utils/chatCitations';
import { AnswerFeedbackControls } from './feedback/AnswerFeedbackControls';
import { StudyExamCard } from './StudyExamCard';

interface AssistantMessageProps {
  message: LocalChatMessage;
  onCitationClick: (sourceId: string) => void;
  onSuggestionClick: (suggestion: string) => void;
  onRatingClick: (rating: FeedbackRating) => void;
  feedbackLoading: boolean;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message,
  onCitationClick,
  onSuggestionClick,
  onRatingClick,
  feedbackLoading,
}) => {
  const [activeTab, setActiveTab] = useState<'answer' | 'short_answer'>('answer');

  const {
    content,
    short_answer,
    retrieval_mode,
    evidence_status,
    confidence,
    external_search_status,
    follow_up_suggestions,
    model_name,
    feedback,
  } = message;

  const showShortAnswer = !!short_answer;

  const getRetrievalStyle = (mode?: string | null) => {
    switch (mode) {
      case 'internal_only':
        return { backgroundColor: 'var(--surface-muted)', color: 'var(--text)' };
      case 'web_only':
        return { backgroundColor: 'var(--ice-50)', color: 'var(--ice-500)', border: '1px solid var(--ice-200)' };
      case 'hybrid':
        return { backgroundColor: 'var(--crystal-100)', color: 'var(--crystal-600)', border: '1px solid var(--crystal-200)' };
      case 'model_knowledge':
        return { backgroundColor: 'var(--amber-50)', color: 'var(--amber-500)', border: '1px solid rgba(245, 158, 11, 0.2)' };
      case 'clarification_required':
        return { backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)' };
      default:
        return { backgroundColor: 'var(--surface-muted)', color: 'var(--text)' };
    }
  };

  const getEvidenceStyle = (status?: string | null) => {
    switch (status) {
      case 'well_supported':
        return { backgroundColor: 'var(--mint-50)', color: 'var(--mint-500)', border: '1px solid rgba(16, 185, 129, 0.2)' };
      case 'partially_supported':
        return { backgroundColor: 'var(--amber-50)', color: 'var(--amber-500)', border: '1px solid rgba(245, 158, 11, 0.2)' };
      case 'insufficient_evidence':
      case 'conflicting_sources':
      case 'unverified':
        return { backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)' };
      default:
        return { backgroundColor: 'var(--surface-muted)', color: 'var(--text)' };
    }
  };

  return (
    <div className="assistant-card" style={styles.card}>
      <div style={styles.badgeHeader}>
        {retrieval_mode && (
          <span style={{ ...styles.badge, ...getRetrievalStyle(retrieval_mode) }}>
            <Search size={12} aria-hidden="true" /><span>{RETRIEVAL_MODE_LABELS[retrieval_mode]}</span>
          </span>
        )}
        {evidence_status && (
          <span style={{ ...styles.badge, ...getEvidenceStyle(evidence_status) }}>
            <Shield size={12} aria-hidden="true" /><span>{EVIDENCE_STATUS_LABELS[evidence_status]}</span>
          </span>
        )}
        {external_search_status && external_search_status !== 'not_used' && (
          <span style={styles.searchBadge}>
            <Globe size={12} aria-hidden="true" /><span>{EXTERNAL_SEARCH_STATUS_LABELS[external_search_status]}</span>
          </span>
        )}
      </div>

      {retrieval_mode === 'model_knowledge' && (
        <div style={styles.warningAlert} role="alert">
          <Lightbulb size={14} style={styles.alertIcon} aria-hidden="true" /> <strong>Kiến thức nền tảng của AI:</strong> Câu trả lời này dựa trên tri thức có sẵn của mô hình ngôn ngữ lớn và có thể chưa được đối chiếu trực tiếp với các tài liệu học tập của bạn.
        </div>
      )}

      {evidence_status === 'insufficient_evidence' && (
        <div style={styles.warningAlert} role="alert">
          <AlertTriangle size={14} style={styles.alertIcon} aria-hidden="true" /> AI chưa tìm thấy đủ bằng chứng hoặc dữ liệu xác thực đáng tin cậy để đưa ra kết luận hoàn toàn chính xác.
        </div>
      )}

      {evidence_status === 'conflicting_sources' && (
        <div style={styles.warningAlert} role="alert">
          <Zap size={14} style={styles.alertIcon} aria-hidden="true" /> <strong>Nguồn thông tin mâu thuẫn:</strong> Các tài liệu học tập hoặc kết quả tìm kiếm có thông tin trái ngược nhau. Hãy đối chiếu từng trích dẫn nguồn ở cột bên phải.
        </div>
      )}

      {showShortAnswer && (
        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => setActiveTab('answer')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'answer' ? styles.tabBtnActive : {}),
            }}
          >
            Trả lời đầy đủ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('short_answer')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'short_answer' ? styles.tabBtnActive : {}),
            }}
          >
            Tóm tắt ngắn
          </button>
        </div>
      )}

      <div style={styles.contentText}>
        {activeTab === 'answer' ? (
          renderAnswerWithCitations(content, message.internal_citations || [], message.web_citations || [], onCitationClick)
        ) : (
          <div style={styles.shortAnswerBlock}>
            <strong>Ý chính ngắn gọn:</strong>
            <p style={{ marginTop: '4px' }}>{short_answer}</p>
          </div>
        )}
      </div>

      {message.message_kind === 'study_exam_config' && message.study_exam_config && (
        <StudyExamCard
          config={message.study_exam_config}
          conversationId={message.conversation_id}
          messageId={message.message_id}
          initialRequest={message.study_exam_request}
        />
      )}

      <div style={styles.footerRow}>
        <div style={styles.footerMeta}>
          {model_name && <span style={styles.metaItem}>Mô hình: <code>{model_name}</code></span>}
          <span style={styles.metaItem}>
            Mức tin cậy: <strong>{formatConfidence(confidence)}</strong>
          </span>
          <span style={styles.disclaimer}>
            Mức độ tin cậy phản ánh đánh giá hệ thống, không bảo đảm câu trả lời hoàn toàn chính xác.
          </span>
        </div>

        {message.message_id && (
          <div style={styles.feedbackContainer}>
            <AnswerFeedbackControls
              feedback={feedback}
              loading={feedbackLoading}
              onRatingClick={onRatingClick}
            />
          </div>
        )}
      </div>

      {follow_up_suggestions && follow_up_suggestions.length > 0 && (
        <div style={styles.suggestionsContainer}>
          <div style={styles.suggestionsTitle}>
            <Lightbulb size={14} aria-hidden="true" /><span>Gợi ý câu hỏi tiếp theo:</span>
          </div>
          <div style={styles.suggestionsList}>
            {follow_up_suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                style={styles.suggestionChip}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  card: {
    alignSelf: 'flex-start',
    width: '100%',
    padding: '18px 20px',
    borderRadius: '16px 16px 16px 4px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface-strong)',
    color: 'var(--text-h)',
    boxShadow: 'var(--shadow-soft)',
  },
  badgeHeader: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '12px',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '6px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
  },
  searchBadge: {
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'var(--surface-muted)',
    color: 'var(--text)',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
  },
  alertIcon: {
    verticalAlign: '-3px',
  },
  warningAlert: {
    fontSize: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    color: 'var(--warning-text)',
    backgroundColor: 'var(--warning-bg)',
    border: '1px solid var(--border-strong)',
    marginBottom: '12px',
    lineHeight: 1.5,
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid var(--border)',
    marginBottom: '14px',
  },
  tabBtn: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  tabBtnActive: {
    color: 'var(--accent)',
    borderBottom: '2px solid var(--accent)',
  },
  contentText: {
    fontSize: '14px',
    lineHeight: 1.65,
  },
  shortAnswerBlock: {
    backgroundColor: 'var(--surface-muted)',
    padding: '12px',
    borderRadius: '8px',
    borderLeft: '4px solid var(--accent)',
  },
  footerRow: {
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px dashed var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
    width: '100%',
  },
  footerMeta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '12px',
    fontSize: '11px',
    color: 'var(--muted)',
    flex: 1,
  },
  feedbackContainer: {
    display: 'flex',
    alignItems: 'center',
  },
  metaItem: {
    whiteSpace: 'nowrap' as const,
  },
  disclaimer: {
    fontStyle: 'italic' as const,
    textAlign: 'right' as const,
    minWidth: '220px',
  },
  suggestionsContainer: {
    marginTop: '16px',
    paddingTop: '14px',
    borderTop: '1px dashed var(--border)',
  },
  suggestionsTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text)',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  suggestionsList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  suggestionChip: {
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--bg)',
    color: 'var(--accent)',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};
