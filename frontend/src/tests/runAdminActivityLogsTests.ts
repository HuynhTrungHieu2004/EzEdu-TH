import { ACTIVITY_ACTIONS, ACTIVITY_CATEGORIES } from '../types/activityLogs';
import {
  activityActionLabel,
  activityCategoryLabel,
  hasPrivateMetadataKey,
} from '../utils/activityLogsUi';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const requiredActions = [
  'user_registered',
  'login_success',
  'login_failed',
  'logout',
  'password_changed',
  'profile_updated',
  'document_uploaded',
  'document_processing_started',
  'document_processing_completed',
  'document_processing_failed',
  'document_deleted',
  'question_generation_started',
  'question_generation_completed',
  'question_generation_failed',
  'exam_created',
  'exam_exported',
  'ai_chat_started',
  'ai_chat_completed',
  'ai_chat_failed',
  'quota_exceeded',
  'permission_denied',
];

const requiredCategories = [
  'auth',
  'document',
  'question',
  'exam',
  'chat',
  'ai',
  'export',
  'profile',
  'security',
  'system',
];

requiredActions.forEach((action) => {
  assert(ACTIVITY_ACTIONS.includes(action as (typeof ACTIVITY_ACTIONS)[number]), `Missing activity action: ${action}`);
  assert(activityActionLabel(action) !== action, `Missing action label: ${action}`);
});

requiredCategories.forEach((category) => {
  assert(ACTIVITY_CATEGORIES.includes(category as (typeof ACTIVITY_CATEGORIES)[number]), `Missing activity category: ${category}`);
  assert(activityCategoryLabel(category) !== category, `Missing category label: ${category}`);
});

assert(hasPrivateMetadataKey({ password: 'x' }), 'Sensitive password key should be detected');
assert(hasPrivateMetadataKey({ prompt: 'private' }), 'Sensitive prompt key should be detected');
assert(!hasPrivateMetadataKey({ model_ai: 'gemini', total_tokens: 42 }), 'Safe metadata should not be flagged');

console.log('Admin activity logs UI tests passed.');
