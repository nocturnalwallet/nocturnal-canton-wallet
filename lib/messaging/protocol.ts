import type { MessageRequest, MessageResponse } from './types';

/**
 * Structured error thrown when a background message fails.
 */
export class MessagingError extends Error {
  status?: number;
  retryAfterSeconds?: number;

  constructor(message: string, status?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'MessagingError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Send a typed message from popup to the background service worker.
 * Returns the typed response or throws on failure.
 */
export async function sendMessage<T>(
  request: MessageRequest,
): Promise<T> {
  const response: MessageResponse<T> =
    await chrome.runtime.sendMessage(request);

  if (!response) {
    throw new Error('No response from background');
  }

  if (!response.success) {
    throw new MessagingError(
      response.error,
      response.status,
      response.retryAfterSeconds,
    );
  }

  return response.data;
}

/**
 * Helper to create a success response in background handlers.
 */
export function ok<T>(data: T): MessageResponse<T> {
  return { success: true, data };
}

/**
 * Helper to create an error response in background handlers.
 */
export function err(
  error: string,
  extras?: { status?: number; retryAfterSeconds?: number },
): MessageResponse<never> {
  return {
    success: false,
    error,
    ...extras,
  };
}
