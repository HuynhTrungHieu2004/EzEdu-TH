import client from './client';

export type KnowledgeStatus = 'weak' | 'uncertain' | 'unassessed' | 'mastered' | 'at_risk_of_forgetting';

export interface KnowledgeSignal {
  knowledge_component_id: string;
  status: KnowledgeStatus;
  mastery_probability?: number | null;
  uncertainty?: number | null;
  attempt_count: number;
  recent_accuracy?: number | null;
  average_response_time_ms?: number | null;
  hint_rate?: number | null;
  forgetting_risk?: number | null;
  confidence: number;
  reason_codes: string[];
  reason: string;
}

export interface ContentPreferences {
  preferred_subjects: string[];
  preferred_content_types: string[];
  preferred_explanation_style?: string | null;
  preferred_session_minutes?: number | null;
}

export interface BehaviorSummary {
  recent_event_count: number;
  question_answered_count: number;
  recent_accuracy?: number | null;
  average_response_time_ms?: number | null;
  hint_rate?: number | null;
  answer_change_rate?: number | null;
  skip_rate?: number | null;
  completion_rate?: number | null;
  active_session_count: number;
}

export interface RecentProgress {
  recent_event_count: number;
  question_answered_count: number;
  recent_accuracy?: number | null;
  completed_count: number;
  last_active_at?: string | null;
}

export interface RecommendedDifficultyRange {
  min_difficulty: number;
  max_difficulty: number;
  target_probability_min: number;
  target_probability_max: number;
  basis: string;
}

export interface DataQuality {
  event_count: number;
  assessed_knowledge_count: number;
  unassessed_knowledge_count: number;
  recent_event_count: number;
  confidence: number;
  issues: string[];
}

export interface ClusterMembership {
  cluster_type: string;
  cluster_id?: string | null;
  confidence: number;
  model_version?: string | null;
  provisional: boolean;
  outlier: boolean;
}

export interface PersonalizationProfile {
  user_id: string;
  current_level?: string | null;
  grade_level?: number | null;
  strong_subjects: string[];
  weak_subjects: string[];
  target_exam_combinations: string[];
  onboarding_completed: boolean;
  global_ability?: number | null;
  profile_confidence: number;
  strengths: KnowledgeSignal[];
  weaknesses: KnowledgeSignal[];
  prerequisite_gaps: KnowledgeSignal[];
  at_risk_knowledge: KnowledgeSignal[];
  learning_goals: string[];
  content_preferences: ContentPreferences;
  behavior_summary: BehaviorSummary;
  cluster_memberships: ClusterMembership[];
  recent_progress: RecentProgress;
  recommended_difficulty_range: RecommendedDifficultyRange;
  data_quality: DataQuality;
  model_versions: Record<string, string>;
  generated_at: string;
}

export interface KnowledgeStatesResponse {
  strengths: KnowledgeSignal[];
  weaknesses: KnowledgeSignal[];
  prerequisite_gaps: KnowledgeSignal[];
  at_risk_knowledge: KnowledgeSignal[];
  data_quality: DataQuality;
  model_versions: Record<string, string>;
  generated_at: string;
}

export interface RecommendationExplanation {
  short_reason: string;
  learning_objective: string;
  expected_benefit: string;
  suggested_action: string;
  confidence: number;
}

export interface RecommendationItem {
  recommendation_log_id?: string | null;
  item_id: string;
  item_type: string;
  title: string;
  preview?: string | null;
  difficulty?: number | null;
  knowledge_components: Array<{ id: string; name?: string | null }>;
  final_score?: number | null;
  reason_codes: string[];
  explanation?: RecommendationExplanation | null;
  source_document?: { id: string; title?: string | null } | null;
  estimated_duration?: number | null;
  model_versions: Record<string, string>;
  generated_at: string;
}

export interface RecommendationsResponse {
  user_id: string;
  items: RecommendationItem[];
  generated_at: string;
  model_versions: Record<string, string>;
}

export type RecommendationFeedbackType =
  | 'clicked'
  | 'skipped'
  | 'completed'
  | 'too_easy'
  | 'too_hard'
  | 'not_relevant'
  | 'helpful'
  | 'not_helpful';

export interface RecommendationFeedbackPayload {
  recommendation_log_id: string;
  item_id: string;
  feedback_type: RecommendationFeedbackType;
}

export interface LearningGoalsUpdatePayload {
  learning_goals: string[];
  preferred_subjects: string[];
  preferred_content_types: string[];
  preferred_explanation_style: 'concise' | 'normal' | 'detailed' | 'beginner';
  preferred_session_minutes?: number | null;
}

export interface StudentOnboardingOptions {
  grades: number[];
  subjects: Array<{ id: string; label: string }>;
  exam_combinations: Array<{
    code: string;
    label: string;
    subjects: string[];
    group: string;
  }>;
}

export interface StudentOnboardingPayload {
  grade_level: number;
  strong_subjects: string[];
  weak_subjects: string[];
  target_exam_combinations: string[];
}

export interface StudentOnboardingProfile extends StudentOnboardingPayload {
  user_id: string;
  onboarding_completed: boolean;
  onboarding_completed_at?: string | null;
  updated_at?: string | null;
}

export const personalizationApi = {
  getMyPersonalizationProfile: async (): Promise<PersonalizationProfile> => {
    const response = await client.get<PersonalizationProfile>('/personalization/me');
    return response.data;
  },

  getMyKnowledgeStates: async (): Promise<KnowledgeStatesResponse> => {
    const response = await client.get<KnowledgeStatesResponse>('/personalization/me/knowledge');
    return response.data;
  },

  getMyRecommendations: async (limit = 8): Promise<RecommendationsResponse> => {
    const response = await client.get<RecommendationsResponse>('/personalization/recommendations/me', {
      params: { limit, language: 'vi' },
    });
    return response.data;
  },

  sendRecommendationFeedback: async (payload: RecommendationFeedbackPayload): Promise<void> => {
    await client.post('/personalization/recommendations/me/feedback', payload);
  },

  updateLearningGoals: async (payload: LearningGoalsUpdatePayload): Promise<PersonalizationProfile> => {
    const response = await client.patch<PersonalizationProfile>('/personalization/me/goals', payload);
    return response.data;
  },

  getStudentOnboardingOptions: async (): Promise<StudentOnboardingOptions> => {
    const response = await client.get<StudentOnboardingOptions>('/personalization/me/onboarding/options');
    return response.data;
  },

  getMyStudentOnboarding: async (): Promise<StudentOnboardingProfile | null> => {
    const response = await client.get<StudentOnboardingProfile | null>('/personalization/me/onboarding');
    return response.data;
  },

  updateMyStudentOnboarding: async (payload: StudentOnboardingPayload): Promise<StudentOnboardingProfile> => {
    const response = await client.put<StudentOnboardingProfile>('/personalization/me/onboarding', payload);
    return response.data;
  },
};
