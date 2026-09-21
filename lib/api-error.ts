/**
 * Pull a human-readable message from a kairo-wallet-provider-backend error body
 * (`{ code, statusCode, message, path }`) or Nest validation shapes.
 */
export function extractApiErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const message = (data as { message?: unknown }).message;
  if (typeof message === 'string') {
    const trimmed = message.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(message) && message.length > 0 && message.every((m) => typeof m === 'string')) {
    return message.join(', ');
  }
  return undefined;
}

/** Prefer API body message over Axios's "Request failed with status code N". */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    const fromApi = extractApiErrorMessage(data);
    if (fromApi) return fromApi;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
