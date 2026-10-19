import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from './api'
import type { ChatRequest } from './types'

export const datasetKeys = {
  all: ['datasets'] as const,
  detail: (id: string) => ['datasets', id] as const,
  schema: (id: string) => ['datasets', id, 'schema'] as const,
  preview: (id: string, page: number, pageSize: number) =>
    ['datasets', id, 'preview', page, pageSize] as const,
}

export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: api.health,
  staleTime: 60_000,
  retry: false,
})

export const usageQuery = queryOptions({
  queryKey: ['usage'],
  queryFn: api.usage,
  // Poll while the dialog is open so the per-minute window visibly drains.
  refetchInterval: 5_000,
})

export const datasetQuery = (id: string) =>
  queryOptions({
    queryKey: datasetKeys.detail(id),
    queryFn: () => api.getDataset(id),
    retry: false,
  })

export const schemaQuery = (id: string) =>
  queryOptions({
    queryKey: datasetKeys.schema(id),
    queryFn: () => api.getSchema(id),
    staleTime: Infinity,
  })

export const previewQuery = (id: string, page: number, pageSize: number) =>
  queryOptions({
    queryKey: datasetKeys.preview(id, page, pageSize),
    queryFn: () => api.getPreview(id, page, pageSize),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

export function useUploadDataset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, sheet }: { file: File; sheet?: string }) =>
      api.uploadDataset(file, sheet),
    onSuccess: (info) => {
      queryClient.setQueryData(datasetKeys.detail(info.id), info)
    },
  })
}

export function useDeleteDataset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteDataset(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: datasetKeys.detail(id) })
    },
  })
}

export function useChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ChatRequest) => api.chat(body),
    // Every answer (or failure) makes LLM calls, so the usage counts change.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['usage'] }),
  })
}
