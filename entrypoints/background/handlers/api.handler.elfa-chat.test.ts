import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@canton-network/core-signing-lib', () => ({
  signTransactionHash: vi.fn(),
}));

vi.mock('@lib/storage', () => ({
  localStore: { get: vi.fn(), set: vi.fn() },
  sessionStore: { get: vi.fn() },
  getStorageScope: vi.fn(),
  ensureUserScope: vi.fn(),
}));

vi.mock('../api-client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('./session.handler', () => ({
  getCachedPrivateKey: vi.fn(),
}));

import { ensureUserScope, getStorageScope, localStore } from '@lib/storage';
import apiClient from '../api-client';
import {
  handleClearElfaChat,
  handleElfaChat,
  handleGetElfaChat,
} from './api.handler';

const storedChat = {
  sessionId: 'session-1',
  messages: [
    { role: 'user' as const, text: 'Earlier question', at: 100 },
    { role: 'assistant' as const, text: 'Earlier answer', at: 100 },
  ],
};

describe('Elfa chat background handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureUserScope).mockResolvedValue(true);
    vi.mocked(getStorageScope).mockReturnValue({
      userId: 'user-1',
      network: 'devnet',
    });
    vi.mocked(localStore.get).mockResolvedValue(storedChat);
  });

  it.each([
    ['get', () => handleGetElfaChat()],
    ['send', () => handleElfaChat('What is trending?')],
    ['clear', () => handleClearElfaChat()],
  ])('rejects %s when no user scope is active', async (_operation, invoke) => {
    vi.mocked(ensureUserScope).mockResolvedValue(false);

    await expect(invoke()).resolves.toEqual({
      success: false,
      error: 'Not signed in',
    });
    expect(localStore.get).not.toHaveBeenCalled();
    expect(localStore.set).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('returns the parsed stored transcript', async () => {
    await expect(handleGetElfaChat()).resolves.toEqual({
      success: true,
      data: storedChat,
    });
    expect(localStore.get).toHaveBeenCalledWith('elfaChat');
  });

  it('returns an empty transcript when storage is empty or invalid', async () => {
    vi.mocked(localStore.get).mockResolvedValue(null);

    await expect(handleGetElfaChat()).resolves.toEqual({
      success: true,
      data: { sessionId: null, messages: [] },
    });
  });

  it('sends the stored session, appends the response, and persists the transcript', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(200);
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: {
          sessionId: 'session-1',
          message: 'AI and gaming tokens are trending.',
          creditsConsumed: 1,
        },
      },
    });

    const result = await handleElfaChat('What is trending?');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/elfa/chat',
      { message: 'What is trending?', sessionId: 'session-1' },
      { timeout: 65_000 },
    );
    const updated = {
      sessionId: 'session-1',
      messages: [
        ...storedChat.messages,
        { role: 'user', text: 'What is trending?', at: 200 },
        {
          role: 'assistant',
          text: 'AI and gaming tokens are trending.',
          at: 200,
        },
      ],
    };
    expect(localStore.set).toHaveBeenCalledWith('elfaChat', updated);
    expect(result).toEqual({ success: true, data: updated });
  });

  it('omits sessionId from the first chat request', async () => {
    vi.mocked(localStore.get).mockResolvedValue(null);
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: {
          sessionId: 'new-session',
          message: 'Hello!',
          creditsConsumed: 1,
        },
      },
    });

    await handleElfaChat('Hello');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/elfa/chat',
      { message: 'Hello' },
      { timeout: 65_000 },
    );
  });

  it('rejects a chat response with no message without changing storage', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: {
          sessionId: 'session-1',
          creditsConsumed: 1,
        },
      },
    });

    await expect(handleElfaChat('What is trending?')).resolves.toEqual({
      success: false,
      error: 'Chat returned an invalid response',
    });
    expect(localStore.set).not.toHaveBeenCalled();
  });

  it('does not restore an in-flight transcript after chat is cleared', async () => {
    let resolvePost!: (value: {
      data: {
        data: {
          sessionId: string;
          message: string;
          creditsConsumed: number;
        };
      };
    }) => void;
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const sendResult = handleElfaChat('What is trending?');
    await vi.waitFor(() => expect(apiClient.post).toHaveBeenCalledOnce());

    await handleClearElfaChat();
    resolvePost({
      data: {
        data: {
          sessionId: 'session-1',
          message: 'AI and gaming tokens are trending.',
          creditsConsumed: 1,
        },
      },
    });
    await expect(sendResult).resolves.toMatchObject({ success: true });

    expect(localStore.set).toHaveBeenCalledTimes(1);
    expect(localStore.set).toHaveBeenCalledWith('elfaChat', {
      sessionId: null,
      messages: [],
    });
  });

  it('returns the response without persisting after the storage scope changes', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(300);
    vi.mocked(apiClient.post).mockImplementation(async () => {
      vi.mocked(getStorageScope).mockReturnValue({
        userId: 'user-2',
        network: 'devnet',
      });
      return {
        data: {
          data: {
            sessionId: 'session-1',
            message: 'The scope changed while this answer was loading.',
            creditsConsumed: 1,
          },
        },
      };
    });

    const result = await handleElfaChat('What changed?');

    expect(localStore.set).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        messages: [
          ...storedChat.messages,
          { role: 'user', text: 'What changed?', at: 300 },
          {
            role: 'assistant',
            text: 'The scope changed while this answer was loading.',
            at: 300,
          },
        ],
      },
    });
  });

  it('returns 429 retry metadata without changing storage', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({
      response: {
        status: 429,
        data: { message: 'Chat limit reached', retryAfterSeconds: 45 },
        headers: {},
      },
    });

    await expect(handleElfaChat('Try again')).resolves.toEqual({
      success: false,
      error: 'Chat limit reached',
      status: 429,
      retryAfterSeconds: 45,
    });
    expect(localStore.set).not.toHaveBeenCalled();
  });

  it('parses Retry-After when the error body has no retry delay', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({
      response: {
        status: 429,
        data: { message: 'Rate limited' },
        headers: { 'retry-after': '60' },
      },
    });

    await expect(handleElfaChat('Try later')).resolves.toEqual({
      success: false,
      error: 'Rate limited',
      status: 429,
      retryAfterSeconds: 60,
    });
  });

  it('returns an upstream status without changing storage', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({
      response: {
        status: 502,
        data: { message: 'Upstream unavailable' },
        headers: {},
      },
    });

    await expect(handleElfaChat('Try now')).resolves.toEqual({
      success: false,
      error: 'Upstream unavailable',
      status: 502,
    });
    expect(localStore.set).not.toHaveBeenCalled();
  });

  it('clears the stored transcript', async () => {
    const result = await handleClearElfaChat();
    const empty = { sessionId: null, messages: [] };

    expect(localStore.set).toHaveBeenCalledWith('elfaChat', empty);
    expect(result).toEqual({ success: true, data: empty });
  });
});
