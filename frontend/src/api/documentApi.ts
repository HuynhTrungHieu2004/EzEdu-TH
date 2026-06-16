import client from './client';

export interface DocumentResponse {
  id: string;
  user_id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  cloudinary_url: string;
  cloudinary_public_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentUploadResponse {
  document_id: string;
  user_id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  cloudinary_url: string;
  cloudinary_public_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ChunkResponse {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
}

export interface SearchResultItem {
  id: string;
  text: string;
  metadata: {
    chunk_index: number;
    document_id: string;
  };
  distance: number;
}

export const documentApi = {
  list: async (): Promise<DocumentResponse[]> => {
    const response = await client.get<DocumentResponse[]>('/documents');
    return response.data;
  },

  get: async (id: string): Promise<DocumentResponse> => {
    const response = await client.get<DocumentResponse>(`/documents/${id}`);
    return response.data;
  },

  getContent: async (id: string): Promise<{ document_id: string; filename: string; extracted_text: string }> => {
    const response = await client.get<{ document_id: string; filename: string; extracted_text: string }>(`/documents/${id}/content`);
    return response.data;
  },

  upload: async (file: File): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post<DocumentUploadResponse>('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  index: async (id: string): Promise<{ status: string; message: string; chunk_count: number }> => {
    const response = await client.post<{ status: string; message: string; chunk_count: number }>(`/documents/${id}/index`);
    return response.data;
  },

  getChunks: async (id: string): Promise<ChunkResponse[]> => {
    const response = await client.get<ChunkResponse[]>(`/documents/${id}/chunks`);
    return response.data;
  },

  search: async (id: string, query: string, nResults: number = 5): Promise<SearchResultItem[]> => {
    const response = await client.post<SearchResultItem[]>(`/documents/${id}/search`, {
      query,
      n_results: nResults,
    });
    return response.data;
  },
};
