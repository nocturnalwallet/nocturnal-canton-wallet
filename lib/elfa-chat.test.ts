import { describe, it, expect } from 'vitest';
import { appendElfaTurn, parseElfaChat, emptyElfaChat, ELFA_CHAT_MAX_TURNS } from './elfa-chat';

describe('capElfaChat via appendElfaTurn', () => {
  it('keeps even length and drops the oldest pair after 10 turns', () => {
    let blob = emptyElfaChat();
    for (let i = 0; i < ELFA_CHAT_MAX_TURNS + 1; i++) {
      blob = appendElfaTurn(blob, `u${i}`, `a${i}`, 'sess');
    }
    expect(blob.messages.length).toBe(ELFA_CHAT_MAX_TURNS * 2);
    expect(blob.messages[0].text).toBe('u1');
    expect(blob.sessionId).toBe('sess');
  });

  it('truncates assistant text when a single turn exceeds 64KB', () => {
    const huge = 'x'.repeat(70_000);
    const blob = appendElfaTurn(emptyElfaChat(), 'q', huge, 's');
    expect(blob.messages.length).toBe(2);
    const bytes = new TextEncoder().encode(JSON.stringify(blob)).length;
    expect(bytes).toBeLessThanOrEqual(65536);
    expect(blob.messages[0].role).toBe('user');
    expect(blob.messages[1].role).toBe('assistant');
  });

  it('parseElfaChat returns empty on odd-length messages', () => {
    expect(parseElfaChat({ sessionId: 'x', messages: [{ role: 'user', text: 'a', at: 1 }] })).toEqual(
      emptyElfaChat(),
    );
  });
});
