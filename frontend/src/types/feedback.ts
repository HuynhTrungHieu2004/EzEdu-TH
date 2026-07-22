export type FeedbackRating = 'helpful' | 'not_helpful';

export type FeedbackReasonCode =
  | 'incorrect_information'
  | 'off_topic'
  | 'incomplete'
  | 'hard_to_understand'
  | 'unsupported_citation'
  | 'unreliable_web_source'
  | 'wrong_document_source'
  | 'hallucinated_information'
  | 'outdated_information'
  | 'other';

export interface FeedbackData {
  rating: FeedbackRating;
  reason_codes: FeedbackReasonCode[];
  comment?: string | null;
  reported_citation_ids: string[];
}

export interface FeedbackResponse {
  id: string;
  message_id: string;
  rating: FeedbackRating;
  reason_codes: FeedbackReasonCode[];
  comment?: string | null;
  reported_citation_ids: string[];
  created_at: string;
  updated_at: string;
}
