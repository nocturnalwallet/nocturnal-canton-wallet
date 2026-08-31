# Elfa Chat under Insights — Design

> **Status:** reviewed (review findings incorporated 2026-08-28)
> **Created:** 2026-08-28
> **Canonical copy:** `kairo-wallet-provider-backend/docs/superpowers/specs/2026-08-28-elfa-chat-insights-design.md`
> **Home repos:**
> - Proxy + rate limits: `kairo-wallet-provider-backend`
> - Insights UI + local transcript: `ginkgo` (this file)
> **Related:**
> - Elfa Chat: https://docs.elfa.ai/market-intelligence/chat
> - Phase 1 Insights: [elfa-market-intelligence.md](mdc:docs/elfa-market-intelligence.md)

This document matches the backend spec. Wallet-side file paths below use in-repo links.

---

## 1. Goal

Add a temporary **Chat** sub-tab under the wallet Insights tab. The user types a free-text question, the wallet-provider proxies it to Elfa `POST /v2/chat`, and the popup shows the full JSON answer. The Elfa API key never leaves the server. Shared-key spend is capped with Redis (global RPM + per-user hourly). The transcript lives in extension `chrome.storage.local` with a hard size cap so the popup does not grow without bound.

## 2. Decisions (locked)

| Topic | Choice |
|---|---|
| Product | Free-text only (`analysisType: "chat"`). No macro/summary/token/account modes in v1. |
| Elfa surface | Complete JSON `POST /v2/chat` (Grow+ / PAYG). No SSE. |
| Placement | Fourth Insights segment: Tokens / Narratives / Search / **Chat**. |
| Transcript | Persist complete Q+A turns + Elfa `sessionId` in `localStore`, user- and network-scoped. **Background-owned** — popup never reads/writes `elfaChat`. |
| Storage cap | Newest **10 turns** (20 messages), drop oldest **pair** until JSON ≤ **64 KB**. Truncate an oversized assistant reply rather than drop the current turn. **New chat** wipes thread. |
| Rate limit | One atomic Redis script: **30 RPM global** + **10 messages / user / hour**. Only eligible requests consume global capacity. Any Redis failure → `503`. |
| Speed / extra body fields | Server forces `speed: "fast"`. Extra DTO fields (`speed`, `analysisType`, …) are **rejected** (`400`) by `forbidNonWhitelisted`. |
| History store | Extension only. No Postgres chat tables. |
| Popup close | Does **not** cancel the in-flight Axios call. Credits/quota may still be consumed. On success the background persists the turn; reopen shows it. |

**Prerequisite:** the deployed `ELFA_API_KEY` must be Grow+ or PAYG. Free-tier keys get Elfa 401/403, which we map to `502`.

## 3. Scope

**In scope**

| Repo | Work |
|---|---|
| `kairo-wallet-provider-backend` | `POST /elfa/chat`, Elfa POST helper, atomic Redis limiter, DTO, `Retry-After` on 429, tests, env knobs |
| `ginkgo` | Chat sub-tab, background transcript I/O, structured chat errors, composer UI |

**Out of scope**

- `POST /v2/chat/stream` (PAYG/Enterprise; Chrome messaging is request/response).
- Other Elfa `analysisType`s (`macro`, `summary`, `tokenIntro`, `tokenAnalysis`, `accountAnalysis`).
- Backend-owned chat history / multi-device sync.
- Markdown renderer (v1 is `whitespace-pre-wrap` plain text).
- NestJS throttler on the existing GET `/elfa/*` data routes.
- Elfa Auto / pending trades (separate spec).
- Cancelling the background Axios request when the popup closes.

## 4. Architecture

```
Insights → Chat (popup)  — React state only (draft / pending / error)
  → sendMessage GET_ELFA_CHAT          → background reads localStore
  → sendMessage ELFA_CHAT { message }  → background:
        POST /elfa/chat (Bearer JWT, timeout 65s)
          → JwtAuthGuard + @CurrentUser().id
          → validate body (whitelist)
          → Redis Lua limiter
          → ElfaService.postChat (x-elfa-api-key, timeout 60s)
            → POST https://api.elfa.ai/v2/chat
          ← { sessionId, message, creditsConsumed }
        on success: append capped turn to localStore
  → sendMessage CLEAR_ELFA_CHAT        → background wipes localStore
```

The extension never calls `api.elfa.ai`. Existing GET `/elfa/*` routes stay unchanged. `localStore` prefix (`_networkPrefix`, `_userId`) is process-local and is set only in the background worker — therefore **all `elfaChat` I/O happens in background handlers**. Chat handlers call `ensureUserScope()` (wait for storage init, restore from `{network}:user` if the in-memory flag was wiped). If there is still no user, refuse to read/write (do not fall back to a network-only key).

### 4.1 Backend units

In `kairo-wallet-provider-backend`:

- `src/modules/elfa/elfa.controller.ts` — `POST /elfa/chat` behind `JwtAuthGuard`. `@CurrentUser()` supplies `user.id`.
- `src/modules/elfa/elfa.service.ts` — `postChat`. Private `post()` / `get()` both go through `sendWithRetry` (3 attempts, 200ms then 400ms) for network errors and HTTP 502/503/504. Axios chat timeout **60s** is **not** retried.
- `ElfaChatLimiter` — Redis Lua via new `RedisService.eval`.
- DTO `{ message, sessionId? }` only. Extra properties → `400`.
- `http-exception.filter.ts` — forward `retryAfterSeconds` into JSON and the `Retry-After` header.

Forced Elfa body: `{ analysisType: "chat", speed: "fast", message, sessionId? }`.

Client data: `{ sessionId, message, creditsConsumed }`. Assistant text truncated at 32_000 chars. `sessionId` max 128 chars.

### 4.2 Redis limiter (UTC, atomic)

| Key | TTL | Cap (env) | Default |
|---|---|---|---|
| `elfa:chat:rpm:{yyyyMMddHHmm}` | remainder of that UTC minute | `ELFA_CHAT_RPM` | 30 |
| `elfa:chat:user:{userId}:{yyyyMMddHH}` | remainder of that UTC hour | `ELFA_CHAT_USER_PER_HOUR` | 10 |

One Lua script: deny user-over-cap **without** incrementing global; deny global-over-cap without incrementing user; otherwise INCR both and set PEXPIRE on first hit. Redis not ready or eval throw → `503`. Elfa failures still count.

### 4.3 Wallet units

- [MarketIntelligence.tsx](mdc:entrypoints/popup/pages/dashboard/MarketIntelligence.tsx) — `{ id: 'chat', label: 'Chat' }`. No 24h/7d toggle on Chat.
- New [ElfaChat.tsx](mdc:entrypoints/popup/pages/dashboard/ElfaChat.tsx) — React only. Loads via `GET_ELFA_CHAT`. Sends via `ELFA_CHAT` `{ message }`. Clears via `CLEAR_ELFA_CHAT`.
- Add `elfaChat` to `USER_SCOPED_KEYS` and `LocalStorageSchema` in [local.ts](mdc:lib/storage/local.ts). Prefix `{network}:{userId}:elfaChat`.
- Messaging: `MSG.ELFA_CHAT`, `MSG.GET_ELFA_CHAT`, `MSG.CLEAR_ELFA_CHAT` in [constants.ts](mdc:lib/messaging/constants.ts) / [types.ts](mdc:lib/messaging/types.ts); handlers in [api.handler.ts](mdc:entrypoints/background/handlers/api.handler.ts); cases in [background.ts](mdc:entrypoints/background.ts). Chat POST axios `timeout: 65_000`. Handlers call `ensureUserScope()` (wait for `whenStorageReady()`, then restore `_userId` from `{network}:user` if the in-memory flag was wiped). The message router also awaits `whenStorageReady()` so `GET_AUTH_STATE` cannot look up `devnet:user` while the wallet is on `localnet`.
- Structured errors (see §6).

Schema (Zod), stored as **turns**:

```ts
{
  sessionId: string | null,
  messages: Array<{ role: 'user' | 'assistant', text: string, at: number }>
}
```

Invariant: `messages.length` is even. Malformed or odd-length storage → empty thread.

Cap helper `capElfaChat(blob)`:

1. Append the new user+assistant pair.
2. While there are more than 10 pairs, drop the oldest pair.
3. While `TextEncoder` byte length of `JSON.stringify(blob) > 65536` and there is more than one pair, drop the oldest pair.
4. If a **single** remaining pair still exceeds 64 KB, truncate `assistant.text` until it fits (keep the user text). Never persist a lone assistant message.

**New chat** is disabled while a reply is in flight. Opening Chat does **not** call Elfa.

## 5. UI

Top to bottom in the Chat pane:

1. **Header** — “New chat” on the right, **disabled while pending**. No Refresh.
2. **Transcript** — only scrolling region. User bubbles right, Elfa left. Empty copy: “Ask Elfa about the market.”
3. **Composer** — pinned above the footer. Text field + Send. Send disabled when empty, `> 2000` chars, or pending. Enter sends; Shift+Enter newline.

States:

| State | Transcript | Composer | New chat |
|---|---|---|---|
| idle | persisted messages | editable | enabled |
| pending | persisted + user bubble + “Thinking…” | locked, keeps draft | **disabled** |
| error | persisted + user bubble | editable (same draft) | enabled |
| success | reload from `GET_ELFA_CHAT` | cleared | enabled |

Retry from error: same draft + Send (not a second user bubble). Elfa answers: `whitespace-pre-wrap` plain text.

## 6. Error handling

Failed sends **do not** write `localStore`. Background persist runs only after a 2xx Elfa proxy response.

| Case | Status | Body | Header |
|---|---|---|---|
| Extra properties / empty / >2000 / bad sessionId | `400` | validation | — |
| Redis not ready or eval error | `503` | Chat is temporarily unavailable | — |
| Limiter deny | `429` | You’ve reached the chat limit. Try again in a minute. + `retryAfterSeconds` | `Retry-After: <seconds>` |
| No `ELFA_API_KEY` | `503` | Elfa market intelligence is not configured | — |
| Elfa 401/403 | `502` | Chat isn’t available right now | — |
| Elfa 429 | `429` | same limit copy; `retryAfterSeconds` from Elfa `Retry-After` if parseable, else 60 | `Retry-After` |
| Transient Elfa network / 502 / 503 / 504 | (internal) | Backend retries up to 3 attempts (200ms, 400ms). Redis limiter is not re-consumed. | — |
| Exhausted retries, other Elfa 4xx/5xx, timeout, malformed | `502` | Elfa returned an error / Failed to reach Elfa | — |
| JWT missing/expired | `401` | Existing session handling | — |

`MessageResponse` error branch:

```ts
{ success: false, error: string, status?: number, retryAfterSeconds?: number }
```

`sendMessage` throws an error that carries `status` and `retryAfterSeconds`. UI rounds `retryAfterSeconds` up to whole minutes, minimum 1, in the under-composer copy.

Server logs: Elfa HTTP status, path, and a short error **code** if Elfa returns one. **Never** log the user prompt, assistant text, `sessionId`, or raw Elfa body.

## 7. Configuration

Backend `elfaConfig` (wallet-provider):

| Key | Env | Default |
|---|---|---|
| `elfa.apiUrl` | `ELFA_API_URL` | `https://api.elfa.ai` (existing) |
| `elfa.apiKey` | `ELFA_API_KEY` | `''` (existing) |
| `elfa.chatRpm` | `ELFA_CHAT_RPM` | `30` |
| `elfa.chatUserPerHour` | `ELFA_CHAT_USER_PER_HOUR` | `10` |

No new extension env. The extension already sends the session Bearer token.

## 8. Testing

No live Elfa calls in CI.

**Backend** (`npx jest src/modules/elfa` plus limiter + filter cases): mock axios + Redis.

- Forces `analysisType: "chat"` and `speed: "fast"`; extra body fields → `400`.
- Elfa 429 → `429` with `retryAfterSeconds`; other Elfa non-2xx → `502`.
- Shared GET/POST retries: network / 502 / 503 / 504 succeed on a later attempt; 401 / 403 / 429 / `ECONNABORTED` are not retried.
- Lua: user at cap does not increment global; Redis eval throw → `503`.

**Wallet** (vitest next to new files):

- Cap helper: 11th turn drops oldest **pair**; never odd length; truncate oversized assistant.
- Background refuses `elfaChat` I/O when `ensureUserScope()` is false (after waiting for storage init and restoring `_userId` from the stored user if the in-memory flag was wiped).
- `handleElfaChat` POSTs `/elfa/chat`; maps 429 with `retryAfterSeconds`.

**Manual:** Grow+ key; two-message thread; hourly cap under composer; close while Thinking then reopen — completed turn present if Elfa returned; New chat disabled during pending.

## 9. Docs to update at implementation time

- [elfa-market-intelligence.md](mdc:docs/elfa-market-intelligence.md) — Chat sub-tab, background transcript, storage caps, `ELFA_CHAT` / `GET_ELFA_CHAT` / `CLEAR_ELFA_CHAT`; move Chat out of Deferred.
- `kairo-wallet-provider-backend/docs/integrations/elfa-market-intelligence.md` — add `POST /elfa/chat`.
