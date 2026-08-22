import client from './client';

export type ScheduleEventType = 'class' | 'exam' | 'meeting' | 'online';
export type ScheduleStatus = 'scheduled' | 'cancelled' | 'completed';

export interface Schedule {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  event_type: ScheduleEventType;
  start_at: string;
  end_at: string;
  join_url?: string | null;
  status: ScheduleStatus;
  created_by: string;
  created_at: string;
  updated_at?: string | null;
}

export interface ScheduleCreate {
  course_id: string;
  title: string;
  event_type: ScheduleEventType;
  start_at: string;
  end_at: string;
  join_url?: string | null;
  status?: ScheduleStatus;
}

export const schedulesApi = {
  list: async (params?: { course_id?: string; from?: string; to?: string; event_type?: ScheduleEventType }): Promise<Schedule[]> =>
    (await client.get<Schedule[]>('/schedules', { params })).data,
  create: async (body: ScheduleCreate): Promise<Schedule> =>
    (await client.post<Schedule>('/schedules', body)).data,
  update: async (id: string, body: Partial<ScheduleCreate>): Promise<Schedule> =>
    (await client.patch<Schedule>(`/schedules/${id}`, body)).data,
  delete: async (id: string): Promise<void> => {
    await client.delete(`/schedules/${id}`);
  },
};
