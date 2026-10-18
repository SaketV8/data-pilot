import type {
  ChatRequest,
  ChatResponse,
  DatasetInfo,
  DatasetSchema,
  HealthResponse,
  PreviewPage,
} from './types'

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, init)
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0)
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  uploadDataset: (file: File, sheet?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (sheet) form.append('sheet', sheet)
    // No Content-Type header: the browser sets the multipart boundary.
    return request<DatasetInfo>('/datasets/upload', {
      method: 'POST',
      body: form,
    })
  },

  getDataset: (id: string) => request<DatasetInfo>(`/datasets/${id}`),

  getSchema: (id: string) => request<DatasetSchema>(`/datasets/${id}/schema`),

  getPreview: (id: string, page: number, pageSize: number) =>
    request<PreviewPage>(
      `/datasets/${id}/preview?page=${page}&pageSize=${pageSize}`,
    ),

  deleteDataset: (id: string) =>
    request<void>(`/datasets/${id}`, { method: 'DELETE' }),

  chat: (body: ChatRequest) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
