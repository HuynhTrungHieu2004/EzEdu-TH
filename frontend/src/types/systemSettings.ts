export type SettingValueType = 'string' | 'int' | 'float' | 'bool' | 'list';
export type SettingCategory = 'upload' | 'question_generation' | 'ai' | 'user' | 'logs';

export interface SystemSettingItem {
  key: string;
  value: unknown;
  value_type: SettingValueType;
  category: SettingCategory;
  description: string;
  is_public: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

export interface SystemSettingsResponse {
  items: SystemSettingItem[];
  generated_at: string;
}

export interface FeatureFlagItem {
  key: string;
  enabled: boolean;
  description: string;
  rollout_percentage: number;
  allowed_roles: string[];
  updated_by: string | null;
  updated_at: string | null;
}

export interface FeatureFlagsResponse {
  items: FeatureFlagItem[];
  generated_at: string;
}

export interface PublicRuntimeConfig {
  settings: Record<string, unknown>;
  feature_flags: Record<string, boolean>;
  generated_at: string;
}
