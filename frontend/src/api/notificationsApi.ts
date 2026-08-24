import client from './client';
import type { NotificationPriority, NotificationType } from '../types/adminNotificationsReports';

export interface UserNotification {
  id: string;
  title: string;
  content: string;
  type: NotificationType;
  priority: NotificationPriority;
  created_at: string;
  is_read: boolean;
  action_url?: string | null;
}

export const notificationsApi = {
  list: async (): Promise<UserNotification[]> => (await client.get<UserNotification[]>('/notifications')).data,
  markRead: async (id: string): Promise<UserNotification> =>
    (await client.post<UserNotification>(`/notifications/${id}/read`)).data,
  markAllRead: async (): Promise<void> => {
    await client.post('/notifications/read-all');
  },
  dismiss: async (id: string): Promise<void> => {
    await client.delete(`/notifications/${id}`);
  },
};
