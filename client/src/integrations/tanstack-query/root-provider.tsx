import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // A 4xx (e.g. a deleted dataset) won't succeed on retry, so show the
        // error at once. Network and server errors get one more attempt.
        retry: (failureCount, error) =>
          !(
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) && failureCount < 1,
      },
    },
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
