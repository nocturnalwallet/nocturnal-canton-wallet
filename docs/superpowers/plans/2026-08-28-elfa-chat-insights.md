# Elfa Chat Insights Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Insights **Chat** sub-tab in Ginkgo that talks only to wallet-provider `POST /elfa/chat` and stores a capped transcript in background-owned `localStore`.

**Architecture:** Popup holds draft/pending/error React state. Background owns `{network}:{userId}:elfaChat`. Messages: `GET_ELFA_CHAT`, `ELFA_CHAT`, `CLEAR_ELFA_CHAT`. Popup never calls `localStore` for chat.

**Tech Stack:** WXT, React 19, Zod, vitest, axios.

**Spec:** [2026-08-28-elfa-chat-insights-design.md](mdc:docs/superpowers/specs/2026-08-28-elfa-chat-insights-design.md)

**Depends on:** backend plan `kairo-wallet-provider-backend/docs/superpowers/plans/2026-08-28-elfa-chat-proxy.md` (`POST /elfa/chat` deployed or reachable locally).

## Global Constraints

- Popup **must not** import `localStore` for `elfaChat`. All I/O is background handlers.
- If user scope is unset, refuse read/write (do not fall back to a network-only key).
- Cap: 10 turns (20 messages); drop oldest **pair**; then truncate assistant text to fit 64 KB (`TextEncoder` of `JSON.stringify`). Never odd-length `messages`.
- `ELFA_CHAT` axios timeout **65_000**. Background attaches stored `sessionId`; popup sends `{ message }` only.
- Extra Elfa modes / markdown renderer / SSE are out of scope.
- `MessageResponse` error may include `status?` and `retryAfterSeconds?`. Existing `err(string)` callers stay valid.
- New chat **disabled** while a reply is pending. Popup close does not abort Axios; success still persists.
- After each task: code review; fix Critical and Important before the next task.

---

### Task 1: Transcript cap helper, schema, scoped storage, structured errors

**Files:**
- Create: `lib/elfa-chat.ts`
- Create: `lib/elfa-chat.test.ts`
- Modify: `lib/storage/schemas.ts`
- Modify: `lib/storage/local.ts`
- Create: `lib/storage/local.elfa-chat.test.ts` (or extend an existing local-store test if present — otherwise this file)
- Modify: `lib/messaging/types.ts`
- Modify: `lib/messaging/protocol.ts`
- Create: `lib/messaging/protocol.test.ts` (only if none exists; otherwise extend)

**Interfaces:**
- Produces:
  - `ElfaChatMessage = { role: 'user' | 'assistant'; text: string; at: number }`
  - `ElfaChatBlob = { sessionId: string | null; messages: ElfaChatMessage[] }`
  - `emptyElfaChat(): ElfaChatBlob` → `{ sessionId: null, messages: [] }`
  - `parseElfaChat(raw: unknown): ElfaChatBlob` — Zod; odd length or invalid → empty
  - `capElfaChat(blob: ElfaChatBlob): ElfaChatBlob`
  - `appendElfaTurn(blob, userText, assistantText, sessionId, at = Date.now()): ElfaChatBlob`
  - `ELFA_CHAT_MAX_TURNS = 10`, `ELFA_CHAT_MAX_BYTES = 65536`
  - `hasUserScope(): boolean` on `lib/storage/local.ts`
  - `err(error: string, extras?: { status?: number; retryAfterSeconds?: number })`
  - `class MessagingError extends Error { status?: number; retryAfterSeconds?: number }`
  - `sendMessage` throws `MessagingError` on failure
  - `localStore` key `elfaChat: ElfaChatBlob | null` (default `null`), listed in `USER_SCOPED_KEYS` and `LOCAL_KEYS`

- [ ] **Step 1: Write failing cap-helper tests**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test lib/elfa-chat.test.ts`
Expected: FAIL — cannot find module `./elfa-chat`

- [ ] **Step 3: Implement helper, schema, localStore, protocol**

`parseElfaChat`: Zod object; `messages` array of `{ role: enum, text: string, at: number }`; if `messages.length % 2 !== 0` return empty.

`appendElfaTurn`: push user then assistant; call `capElfaChat`; set `sessionId`.

`capElfaChat`: while `messages.length > 20`, `splice(0, 2)`; while bytes > 65536 and `messages.length > 2`, `splice(0, 2)`; if still over, shrink `messages[1].text` (last assistant) with binary search / chop until it fits, minimum empty string.

`hasUserScope`: `return _userId != null`.

`sendMessage`: if `!response.success`, `throw new MessagingError(response.error, response.status, response.retryAfterSeconds)`.

- [ ] **Step 4: Run tests**

Run: `yarn test lib/elfa-chat.test.ts lib/messaging/protocol.test.ts lib/storage/local.elfa-chat.test.ts`
Expected: PASS

Add a local-store test that with `setUserScope(null)`, prefix for `elfaChat` would be unsafe — `hasUserScope()` is false. Handlers (Task 2) must check this; this task only exports `hasUserScope`.

- [ ] **Step 5: Commit**

```bash
git add lib/elfa-chat.ts lib/elfa-chat.test.ts lib/storage/schemas.ts lib/storage/local.ts lib/storage/local.elfa-chat.test.ts lib/messaging/types.ts lib/messaging/protocol.ts lib/messaging/protocol.test.ts
git commit -m "$(cat <<'EOF'
Add capped Elfa chat transcript helper and structured messaging errors.

EOF
)"
```

---

### Task 2: Background GET / send / clear handlers

**Files:**
- Modify: `lib/messaging/constants.ts`
- Modify: `lib/messaging/types.ts` (request union + `ElfaChatBlob` / `ElfaChatResult` types)
- Modify: `entrypoints/background/handlers/api.handler.ts`
- Create: `entrypoints/background/handlers/api.handler.elfa-chat.test.ts`
- Modify: `entrypoints/background.ts`

**Interfaces:**
- Consumes: `localStore`, `hasUserScope`, `parseElfaChat`, `appendElfaTurn`, `emptyElfaChat`, `apiClient`, `getErrorMessage` / axios error body
- Produces:
  - `MSG.GET_ELFA_CHAT` → `ElfaChatBlob`
  - `MSG.ELFA_CHAT` payload `{ message: string }` → `ElfaChatBlob` (updated)
  - `MSG.CLEAR_ELFA_CHAT` → `ElfaChatBlob` empty
  - `handleGetElfaChat()`, `handleElfaChat(message: string)`, `handleClearElfaChat()`

- [ ] **Step 1: Write failing handler tests** (mock `apiClient`, `localStore`, `hasUserScope`)

Cases:

1. `hasUserScope() === false` → `err('Not signed in')` for get/send/clear; `apiClient.post` not called.
2. GET returns `parseElfaChat` of stored value (or empty).
3. Send POSTs `/elfa/chat` with `{ message, sessionId }` (sessionId from store, omitted when null), `timeout: 65_000`. On 200 `{ data: { data: { sessionId, message } } }` (match existing Elfa unwrap of `data.data`), appends turn and `localStore.set('elfaChat', capped)`.
4. Send on axios 429 with `response.data.retryAfterSeconds: 45` → `err(..., { status: 429, retryAfterSeconds: 45 })`; store unchanged.
5. Send on 502 → `err` with status 502; store unchanged.
6. CLEAR sets empty blob.

Follow the existing `data.data` unwrap used by `handleFetchElfaTrendingTokens`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test entrypoints/background/handlers/api.handler.elfa-chat.test.ts`
Expected: FAIL — handlers not exported / MSG constants missing

- [ ] **Step 3: Implement MSG, types, handlers, `routeMessage` cases**

```typescript
GET_ELFA_CHAT: 'GET_ELFA_CHAT',
ELFA_CHAT: 'ELFA_CHAT',
CLEAR_ELFA_CHAT: 'CLEAR_ELFA_CHAT',
```

Request variants:

```typescript
| { action: typeof MSG.GET_ELFA_CHAT }
| { action: typeof MSG.ELFA_CHAT; payload: { message: string } }
| { action: typeof MSG.CLEAR_ELFA_CHAT }
```

Read `retryAfterSeconds` from `error.response.data.retryAfterSeconds` or parse `error.response.headers['retry-after']`.

- [ ] **Step 4: Run tests**

Run: `yarn test entrypoints/background/handlers/api.handler.elfa-chat.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/messaging/constants.ts lib/messaging/types.ts entrypoints/background/handlers/api.handler.ts entrypoints/background/handlers/api.handler.elfa-chat.test.ts entrypoints/background.ts
git commit -m "$(cat <<'EOF'
Proxy Elfa chat through background storage handlers.

EOF
)"
```

---

### Task 3: Chat sub-tab UI and docs

**Files:**
- Create: `entrypoints/popup/pages/dashboard/ElfaChat.tsx`
- Modify: `entrypoints/popup/pages/dashboard/MarketIntelligence.tsx`
- Modify: `docs/elfa-market-intelligence.md`

**Interfaces:**
- Consumes: `sendMessage` + `MSG.GET_ELFA_CHAT` / `ELFA_CHAT` / `CLEAR_ELFA_CHAT`, `MessagingError`
- Produces: fourth Insights segment `Chat`; `ElfaChat` states idle / pending / error / success per spec §5

- [ ] **Step 1: Mount Chat in `MarketIntelligence`**

```typescript
type View = 'tokens' | 'narratives' | 'search' | 'chat';
const VIEWS: { id: View; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'narratives', label: 'Narratives' },
  { id: 'search', label: 'Search' },
  { id: 'chat', label: 'Chat' },
];
```

Render `{view === 'chat' && <ElfaChat />}` with no window toggle.

- [ ] **Step 2: Implement `ElfaChat.tsx`**

On mount: `sendMessage<ElfaChatBlob>({ action: MSG.GET_ELFA_CHAT })`.

Layout: header “New chat” (`disabled={pending}`), scrolling transcript, composer above the existing “Powered by Elfa” footer (keep footer in parent).

- Empty: “Ask Elfa about the market.”
- User bubbles `self-end`, assistant `self-start`, `whitespace-pre-wrap`.
- Pending: persisted messages + user bubble + “Thinking…”; composer locked; New chat disabled.
- Error: `MessagingError` under composer. If `retryAfterSeconds`, round up to whole minutes (min 1): `You’ve reached the chat limit. Try again in a minute.` Send retries the **same** `draft` (do not append a second user bubble).
- Success: replace local transcript with returned blob; clear draft.
- Send: trim; reject empty or `> 2000`. Enter submits; Shift+Enter newline.
- New chat: `CLEAR_ELFA_CHAT` then reset React state.

Do not use `localStore` in this file.

- [ ] **Step 3: Typecheck**

Run: `yarn typecheck`
Expected: PASS

- [ ] **Step 4: Update `docs/elfa-market-intelligence.md`**

Document Chat sub-tab, background-owned transcript, 10-turn / 64 KB cap, `GET_ELFA_CHAT` / `ELFA_CHAT` / `CLEAR_ELFA_CHAT`. Move Chat out of Deferred. Note Grow+ on the backend key.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/pages/dashboard/ElfaChat.tsx entrypoints/popup/pages/dashboard/MarketIntelligence.tsx docs/elfa-market-intelligence.md
git commit -m "$(cat <<'EOF'
Add Elfa Chat sub-tab under Insights.

EOF
)"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Cap helper, even turns, USER_SCOPED_KEYS, MessagingError | Task 1 |
| Background-only I/O, axios 65s, 429 extras, refuse unset scope | Task 2 |
| UI states, New chat disabled while pending, docs | Task 3 |
| Redis / POST /elfa/chat | Backend plan |
