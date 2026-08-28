import { describe, it, expect, beforeEach } from 'vitest';
import { setUserScope, hasUserScope } from './local';

describe('elfaChat user scope', () => {
  beforeEach(() => {
    setUserScope(null);
  });

  it('hasUserScope is false when user scope is unset', () => {
    expect(hasUserScope()).toBe(false);
  });

  it('hasUserScope is true when user scope is set', () => {
    setUserScope('user-123');
    expect(hasUserScope()).toBe(true);
  });
});
