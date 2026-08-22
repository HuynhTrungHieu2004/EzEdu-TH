import client from './client';

export type FavoriteResourceType = 'document' | 'exam' | 'question_set' | 'course';

export interface Favorite {
  id: string;
  user_id: string;
  resource_type: FavoriteResourceType;
  resource_id: string;
  title: string;
  created_at: string;
}

export const favoritesApi = {
  list: async (): Promise<Favorite[]> => (await client.get<Favorite[]>('/favorites')).data,
  create: async (resource_type: FavoriteResourceType, resource_id: string): Promise<Favorite> =>
    (await client.post<Favorite>('/favorites', { resource_type, resource_id })).data,
  delete: async (id: string): Promise<void> => {
    await client.delete(`/favorites/${id}`);
  },
};
