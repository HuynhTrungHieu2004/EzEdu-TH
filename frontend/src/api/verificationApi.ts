import client from './client';

export type VerificationStatus = 'pending' | 'processing' | 'completed' | 'partially_completed' | 'failed';
export type VerificationIssueType =
  | 'ocr_error'
  | 'factual_error'
  | 'suspicious_number'
  | 'terminology_error'
  | 'internal_contradiction'
  | 'incomplete_content'
  | 'outdated_information'
  | 'missing_context'
  | 'misleading_statement'
  | 'unsupported_claim'
  | 'needs_verification';
export type VerificationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type VerificationResolution = 'pending' | 'accepted' | 'rejected' | 'edited';
export type VerificationResolutionAction = Exclude<VerificationResolution, 'pending'>;

export interface VerificationSession {
  session_id: string;
  document_id: string;
  status: VerificationStatus;
  total_chunks: number;
  total_chunks_processed: number;
  total_issues_found: number;
  issues_accepted: number;
  issues_rejected: number;
  issues_pending: number;
  successful_chunks?: number;
  failed_chunks?: number;
  ai_model?: string | null;
  summary?: string | null;
  severity_stats?: Record<string, number> | null;
  is_stale?: boolean;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface VerificationIssue {
  id: string;
  session_id: string;
  document_id: string;
  chunk_index: number;
  issue_type: VerificationIssueType;
  severity: VerificationSeverity;
  original_text: string;
  suggested_fix: string;
  reason: string;
  confidence: number;
  source_reference: string | null;
  external_verified: boolean;
  ai_provider: string;
  resolution: VerificationResolution;
  user_edited_text: string | null;
  resolved_at: string | null;
  /** Set after this fix has been written to extracted_text. */
  applied_at: string | null;
  created_at: string;
}

export interface IssueResolution {
  issue_id: string;
  action: VerificationResolutionAction;
  edited_text?: string;
}

export interface VerifyTriggerResponse {
  session_id: string;
  status: VerificationStatus;
  message: string;
}

export interface ResolveResponse {
  resolved_count: number;
  message: string;
}

export interface ApplyResponse {
  applied_count: number;
  reindexed: boolean;
  message: string;
}

export const verificationApi = {
  trigger: async (documentId: string): Promise<VerifyTriggerResponse> => {
    const response = await client.post<VerifyTriggerResponse>(`/documents/${documentId}/verify`);
    return response.data;
  },

  getStatus: async (documentId: string, signal?: AbortSignal): Promise<VerificationSession> => {
    const response = await client.get<VerificationSession>(`/documents/${documentId}/verify/status`, {
      signal,
    });
    return response.data;
  },

  getIssues: async (
    documentId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<VerificationIssue[]> => {
    const response = await client.get<VerificationIssue[]>(`/documents/${documentId}/verify/issues`, {
      params: { session_id: sessionId },
      signal,
    });
    return response.data;
  },

  resolve: async (
    documentId: string,
    sessionId: string,
    resolutions: IssueResolution[],
  ): Promise<ResolveResponse> => {
    const response = await client.post<ResolveResponse>(
      `/documents/${documentId}/verify/resolve`,
      { session_id: sessionId, resolutions },
    );
    return response.data;
  },

  apply: async (documentId: string, sessionId: string): Promise<ApplyResponse> => {
    const response = await client.post<ApplyResponse>(
      `/documents/${documentId}/verify/apply`,
      { session_id: sessionId },
    );
    return response.data;
  },
};
