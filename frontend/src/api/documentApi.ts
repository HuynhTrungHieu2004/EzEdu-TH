import client from './client';

export interface DocumentResponse {
  id: string;
  user_id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  cloudinary_url: string;
  cloudinary_public_id: string;
  cloudinary_resource_type?: string;
  media_kind?: 'document' | 'video';
  status: string;
  error_message?: string | null;
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
  cloudinary_resource_type?: string;
  media_kind?: 'document' | 'video';
  status: string;
  error_message?: string | null;
  checksum?: string | null;
  reuse_count?: number;
  reused?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentContentResponse {
  document_id: string;
  original_filename: string;
  filename: string;
  file_type: string;
  status: string;
  preview: string;
  extracted_text?: string | null;
  text_length: number;
}

export interface ChunkResponse {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  text_preview?: string;
  created_at?: string;
}

export interface SearchResultItem {
  id: string;
  text: string;
  metadata: {
    chunk_index: number;
    document_id: string;
    text_preview?: string;
    created_at?: string;
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

  getContent: async (id: string): Promise<DocumentContentResponse> => {
    const response = await client.get<DocumentContentResponse>(`/documents/${id}/content`, {
      params: { full_text: true },
    });
    return response.data;
  },

  extract: async (id: string): Promise<{ status: string; message: string; text_length?: number }> => {
    const response = await client.post<{ status: string; message: string; text_length?: number }>(`/documents/${id}/extract`);
    return response.data;
  },

  upload: async (file: File, onUploadProgress?: (percent: number) => void): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post<DocumentUploadResponse>('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 5 * 60 * 1000, // 5 minutes for large video files
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percent);
        }
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

  transcribe: async (id: string): Promise<{ status: string; message: string }> => {
    const response = await client.post<{ status: string; message: string }>(`/documents/${id}/transcribe`);
    return response.data;
  },

  getTranscript: async (id: string): Promise<DocumentContentResponse> => {
    const response = await client.get<DocumentContentResponse>(`/documents/${id}/transcript`);
    return response.data;
  },

  delete: async (id: string): Promise<{ status: string; message: string }> => {
    const response = await client.delete<{ status: string; message: string }>(`/documents/${id}`);
    return response.data;
  },

  getClusters: async (): Promise<{
    clusters: Array<{
      cluster_id: number;
      label: string;
      size: number;
      documents: Array<{ id: string; name: string }>;
    }>;
    total_documents: number;
    algorithm: string;
    message: string;
  }> => {
    const response = await client.get('/documents/analysis/clusters');
    return response.data;
  },

  getSimilar: async (id: string, topN: number = 5): Promise<{
    similar_documents: Array<{
      document_id: string;
      similarity: number;
      document_name?: string;
      file_type?: string;
    }>;
    algorithm: string;
    message: string;
  }> => {
    const response = await client.get(`/documents/${id}/similar`, { params: { top_n: topN } });
    return response.data;
  },
};
