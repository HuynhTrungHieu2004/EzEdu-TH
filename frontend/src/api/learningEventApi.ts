import client from './client';

export type LearningEventType =
  | 'lesson_started'
  | 'lesson_completed'
  | 'question_started'
  | 'question_answered'
  | 'hint_requested'
  | 'explanation_viewed'
  | 'recommendation_shown'
  | 'recommendation_clicked'
  | 'recommendation_skipped';

export interface LearningEventPayload {
  event_type: LearningEventType;
  item_id: string;
  document_id?: string;
  session_id?: string;
  idempotency_key?: string;
  knowledge_component_ids?: string[];
  is_correct?: boolean;
  score?: number;
  response_time_ms?: number;
  hint_count?: number;
  answer_change_count?: number;
  attempt_number?: number;
  skipped?: boolean;
  completed?: boolean;
  metadata?: Record<string, unknown>;
}

interface LearningSession {
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 2;
const OFFLINE_QUEUE_KEY = 'learning-event-offline-queue';
const sentKeys = new Set<string>();

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function stableHash(parts: unknown[]) {
  const raw = JSON.stringify(parts);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function getLearningSession(contextType: 'document' | 'question_set', contextId: string): LearningSession {
  const storage = browserStorage();
  const key = `learning-session:${contextType}:${contextId}`;
  const now = Date.now();
  const existingRaw = storage?.getItem(key);

  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as LearningSession;
      if (existing.sessionId && now - existing.lastActivityAt < SESSION_TTL_MS) {
        const updated = { ...existing, lastActivityAt: now };
        storage?.setItem(key, JSON.stringify(updated));
        return updated;
      }
    } catch {
      storage?.removeItem(key);
    }
  }

  const created = {
    sessionId: `ls_${contextType}_${contextId}_${randomId()}`,
    startedAt: now,
    lastActivityAt: now,
  };
  storage?.setItem(key, JSON.stringify(created));
  return created;
}

export function buildEventIdempotencyKey(parts: unknown[]) {
  return `le_${stableHash(parts).padStart(8, '0')}`;
}

function readOfflineQueue(): LearningEventPayload[] {
  const storage = browserStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(queue: LearningEventPayload[]) {
  browserStorage()?.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(-50)));
}

function enqueueOffline(payload: LearningEventPayload) {
  if (payload.idempotency_key && sentKeys.has(payload.idempotency_key)) return;
  writeOfflineQueue([...readOfflineQueue(), payload]);
}

async function sendWithRetry(payload: LearningEventPayload, attempt = 0): Promise<void> {
  try {
    await client.post('/personalization/events', payload);
    if (payload.idempotency_key) {
      sentKeys.add(payload.idempotency_key);
    }
  } catch {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueOffline(payload);
      return;
    }
    if (attempt < MAX_RETRY_ATTEMPTS) {
      globalThis.setTimeout(() => {
        void sendWithRetry(payload, attempt + 1);
      }, 400 * (attempt + 1));
    }
  }
}

export function trackLearningEvent(payload: LearningEventPayload): void {
  if (typeof window === 'undefined') return;
  if (!payload.item_id) return;
  if (payload.idempotency_key && sentKeys.has(payload.idempotency_key)) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOffline(payload);
    return;
  }
  void sendWithRetry(payload);
}

export function flushQueuedLearningEvents(): void {
  const queue = readOfflineQueue();
  if (!queue.length) return;
  writeOfflineQueue([]);
  queue.forEach((payload) => trackLearningEvent(payload));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushQueuedLearningEvents);
}
