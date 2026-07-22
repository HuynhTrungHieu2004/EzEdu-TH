import client from './client';
import type { FeedbackData, FeedbackResponse } from '../types/feedback';

export const feedbackApi = {
  submitFeedback: async (messageId: string, payload: FeedbackData): Promise<FeedbackResponse> => {
    const response = await client.put<FeedbackResponse>(`/chat/messages/${messageId}/feedback`, payload);
    return response.data;
  }
};
