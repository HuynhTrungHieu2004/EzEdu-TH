export type RetrievalMode = 'internal_only' | 'web_only' | 'hybrid' | 'model_knowledge' | 'clarification_required';

export type EvidenceStatus = 'well_supported' | 'partially_supported' | 'insufficient_evidence' | 'conflicting_sources' | 'unverified';

export type ExternalSearchStatus = 'success' | 'failed' | 'unavailable' | 'no_results' | 'not_used';

export type ResponseStyle = 'concise' | 'normal' | 'detailed' | 'beginner';

export interface WebCitation {
  title: string;
  url: string;
  publisher?: string | null;
  published_date?: string | null;
  accessed_at?: string | null;
  supporting_excerpt?: string | null;
  relevance_score?: number | null;
  source_id?: string | null;
}

export interface SourceChunkResponse {
  document_id: string;
  document_title: string;
  page_number?: number | null;
  section?: string | null;
  heading?: string | null;
  chunk_id: string;
  excerpt: string;
  relevance_score?: number | null;
  source_id?: string | null;
}

export interface AdvancedChatAskRequest {
  question: string;
  conversation_id?: string | null;
  document_ids?: string[];
  scope: 'general' | 'document' | 'multiple_documents' | 'all_documents' | 'web_only';
  use_web_search: boolean;
  response_style: ResponseStyle;
  request_id?: string | null;
}

export interface AdvancedChatResponse {
  answer: string;
  short_answer?: string | null;
  explanation?: string | null;
  key_points?: string[] | null;
  examples?: string[] | null;
  internal_citations: SourceChunkResponse[];
  web_citations: WebCitation[];
  retrieval_mode: RetrievalMode;
  evidence_status: EvidenceStatus;
  confidence: number | null;
  external_search_status: ExternalSearchStatus;
  conversation_id: string;
  message_id: string;
  model_name: string | null;
  follow_up_suggestions: string[] | null;
}

export interface ConversationResponse {
  id: string;
  title: string;
  scope: string;
  document_ids: string[];
  created_at: string;
  updated_at: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
}

export interface ConversationListResponse {
  conversations: ConversationResponse[];
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface MessageResponse {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  retrieval_mode?: RetrievalMode | null;
  evidence_status?: EvidenceStatus | null;
  confidence?: number | null;
  internal_citations?: SourceChunkResponse[] | null;
  web_citations?: WebCitation[] | null;
  status: 'pending' | 'completed' | 'failed';
  error_message?: string | null;
  created_at: string;
}

export interface ConversationMessagesListResponse {
  messages: MessageResponse[];
  next_cursor?: string | null;
  has_more?: boolean;
}

import type { FeedbackData } from './feedback';

export interface LocalChatMessage {
  local_id: string;
  message_id?: string | null;
  request_id?: string | null;
  role: 'user' | 'assistant';
  content: string;
  status: 'pending' | 'completed' | 'failed';
  retrieval_mode?: RetrievalMode | null;
  evidence_status?: EvidenceStatus | null;
  confidence?: number | null;
  internal_citations?: SourceChunkResponse[] | null;
  web_citations?: WebCitation[] | null;
  short_answer?: string | null;
  explanation?: string | null;
  key_points?: string[] | null;
  examples?: string[] | null;
  follow_up_suggestions?: string[] | null;
  model_name?: string | null;
  external_search_status?: ExternalSearchStatus | null;
  error_message?: string | null;
  created_at: string;
  feedback?: FeedbackData | null;
}

