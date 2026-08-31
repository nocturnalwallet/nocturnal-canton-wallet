import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureUserScope,
  hasUserScope,
  runStorageInit,
  setNetworkPrefix,
  setUserScope,
  whenStorageReady,
} from './local';

const memory: Record<string, unknown> = {};

function stubLocalStorage(): void {
  for (const key of Object.keys(memory)) delete memory[key];
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of list) {
            if (key in memory) result[key] = memory[key];
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(memory, items);
        },
        remove: async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete memory[key];
          }
        },
      },
    },
  };
}

describe('elfaChat user scope', () => {
  beforeEach(() => {
    stubLocalStorage();
    setNetworkPrefix('localnet');
    setUserScope(null);
  });

  it('hasUserScope is false when user scope is unset', () => {
    expect(hasUserScope()).toBe(false);
  });

  it('hasUserScope is true when user scope is set', () => {
    setUserScope('user-123');
    expect(hasUserScope()).toBe(true);
  });

  it('ensureUserScope restores from the stored user when in-memory scope was wiped', async () => {
    memory['localnet:user'] = {
      id: 'user-123',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
      isActive: true,
    };

    await expect(ensureUserScope()).resolves.toBe(true);
    expect(hasUserScope()).toBe(true);
  });

  it('ensureUserScope is false when no user is stored', async () => {
    await expect(ensureUserScope()).resolves.toBe(false);
    expect(hasUserScope()).toBe(false);
  });

  it('ensureUserScope ignores a user stored under a different network', async () => {
    memory['devnet:user'] = {
      id: 'user-dev',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
      isActive: true,
    };

    await expect(ensureUserScope()).resolves.toBe(false);
    expect(hasUserScope()).toBe(false);
  });

  it('whenStorageReady waits until runStorageInit finishes', async () => {
    let finished = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    void runStorageInit(async () => {
      await gate;
      finished = true;
    });

    const ready = whenStorageReady();
    await Promise.resolve();
    expect(finished).toBe(false);

    release();
    await ready;
    expect(finished).toBe(true);
  });
});
