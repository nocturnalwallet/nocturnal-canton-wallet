# Elfa Market Intelligence — Ginkgo Wallet (Phase 1)

A native **Insights** tab in the wallet popup that surfaces Elfa's crypto market intelligence — trending tokens, trending narratives, social search, and Chat. Data comes through the wallet-provider backend, so no Elfa credentials ever touch the extension.

> The tab is labelled **Insights**. The News panel was intentionally removed per the 2026-08-25 Nocturnal &lt;&gt; Elfa check-in; its backend route and hook remain available but are not surfaced. Chat was added as a fourth sub-tab.

## Why native (not the Elfa widget)

Elfa's hosted "Apollo" widget embeds via a remote `<script src="…embed-apollo.js">`, which MV3 extension pages block (remote scripts are disallowed in extension CSP). It also requires a separate widget key we don't yet have. Rendering Elfa's data natively sidesteps both, keeps the wallet's look-and-feel, and matches the product goal of being Canton-native rather than a generic embed.

## Architecture / data flow

Follows the repo's standard popup → background → backend pattern:

```
MarketIntelligence.tsx (React Query hooks in hooks/useElfa.ts)
  -> sendMessage({ action: FETCH_ELFA_*, payload: { window } })
    -> background.ts routeMessage()
      -> api.handler.ts handleFetchElfa* ()
        -> apiClient.get('/elfa/*', { params })   // Bearer auth injected
          -> wallet-provider-backend /elfa/*  ->  api.elfa.ai
```

Chat follows the same boundary but uses background messages directly:

```text
ElfaChat.tsx
  -> GET_ELFA_CHAT / ELFA_CHAT / CLEAR_ELFA_CHAT
    -> background.ts routeMessage()
      -> api.handler.ts
        -> user-scoped transcript storage and wallet-provider-backend /elfa/chat
```

The backend base URL comes from the active network (`branding/ginkgo/brand.ts` → `networkApiBaseUrls`). The `/elfa/*` routes are JWT-guarded, so the user must be logged in; an unauthenticated call surfaces as the tab's error state with a Retry.

## UI

`entrypoints/popup/pages/dashboard/MarketIntelligence.tsx` — a segmented view with a shared 24h/7d window toggle:

- **Tokens** — ranked by social mentions; each row shows mention count, mention-count growth vs the prior window (green/red %), and a **mindshare bar** (share of the top-N shown) with a % label. A header legend + info tooltip explain the metrics. **Tap a token** to drill down into its top mentions (`ElfaTokenDetail` → `top-mentions`). A pinned **Canton Coin (CC)** card shows its on-ledger USD price — Elfa doesn't track CC, so the backend injects it (`canton` field on the trending-tokens response, sourced from the mining-round `amuletPrice`).
- **Narratives** — narrative clusters; each card is **collapsible** to reveal all its source posts (`source_links`), labelled by `@handle`.
- **Search** — a search box (Canton-first quick chips: `Canton, CC, cBTC, cETH, SPCX`) over social mentions (`keyword-mentions`); explicit submit to conserve credits.
- **Chat** — a persistent conversation with Elfa. Enter sends and Shift+Enter inserts a newline. The pane has no 24h/7d toggle or Refresh control; **New chat** clears the current thread and is disabled while Elfa is replying.

**Shared `ElfaMentionRow`** (News / drill-down / Search): shows `@handle` + time + views, links to the post, and has an on-tap **credibility** expander that lazily loads the author's Elfa `smart-stats` (smart followers, avg reach, followers, engagement). The `useElfaSmartStats` hook caches 30 min so repeat taps on the same handle cost no credits.

The shared parent keeps a "Powered by Elfa" footer beneath every sub-tab. Chat shows its errors under the composer, including the retry delay when the hourly limit is reached.

### Chat transcript ownership

The background service worker exclusively reads and writes the user-scoped transcript; the popup never imports or accesses `localStore`. `GET_ELFA_CHAT` loads the persisted thread, `ELFA_CHAT` sends one prompt and persists the completed user/assistant pair, and `CLEAR_ELFA_CHAT` starts a new thread.

Chat handlers call `ensureUserScope()` instead of the raw in-memory `hasUserScope()` flag. MV3 service-worker restart can leave `_userId` unset (or `GET_AUTH_STATE` can wipe it by reading `devnet:user` before the localnet prefix is applied). `ensureUserScope` waits for `whenStorageReady()`, then restores `{network}:user`. If no stored user exists, the handler still returns `Not signed in` and does **not** write a network-only `elfaChat` key.

The message router also awaits `whenStorageReady()` so every popup message, including `GET_AUTH_STATE`, sees the correct network prefix.

Storage retains the newest **10 turns** (20 messages) and is capped at **64 KB**. Oldest complete pairs are removed first, so storage never contains an unpaired message. A single oversized assistant response is truncated to keep the current turn.

### Metric semantics (important)

These figures are a **trending-by-mentions signal** and intentionally **differ from Elfa Chat's** full-corpus numbers:

- The green **change %** is growth in raw mention *count* vs the prior window — not "mindshare change."
- The **bar** is each token's share of the *top-N shown*, not share of the whole market.
- Absolute counts here are much smaller than Elfa Chat's (different, curated corpus). They cannot be reconciled 1:1 without Elfa's Grow+ chat/synthesis endpoint. The tooltip and legend state this so the numbers aren't mistaken for Elfa Chat's.

## Credit conservation

Elfa's free tier is 1000 credits/month, so the tab is frugal:

- Only the **active** sub-tab fetches (`enabled` on each hook).
- Results are cached **5 minutes** (`staleTime`), `refetchOnWindowFocus: false`, `retry: false` in React Query. Transient Elfa network / 502 / 503 / 504 failures are retried **in the backend** (3 attempts, 200ms then 400ms) before the wallet sees `502 Failed to reach Elfa`. The popup does not retry Elfa calls itself.
- The 24h/7d window is part of each query key, so switching windows caches independently (one fresh fetch per window per sub-tab).

## Files

- [MarketIntelligence.tsx](mdc:entrypoints/popup/pages/dashboard/MarketIntelligence.tsx) — the tab container (segmented Tokens/Narratives/Search/Chat + drill-down state)
- [ElfaChat.tsx](mdc:entrypoints/popup/pages/dashboard/ElfaChat.tsx) — Chat transcript, composer, optimistic pending state, and rate-limit copy
- `entrypoints/popup/pages/dashboard/elfa-shared.tsx` — `StateWrap`, `handleFromUrl`, `compactNumber`
- `entrypoints/popup/pages/dashboard/ElfaMentionRow.tsx` — shared mention row + credibility expander
- `entrypoints/popup/pages/dashboard/ElfaTokenDetail.tsx` — token drill-down (top mentions)
- `entrypoints/popup/pages/dashboard/ElfaSearch.tsx` — keyword search sub-tab
- `entrypoints/popup/hooks/useElfa.ts` — `useElfaTrendingTokens` / `useElfaTokenNews` / `useElfaNarratives` / `useElfaTopMentions` / `useElfaKeywordMentions` / `useElfaSmartStats`
- `entrypoints/popup/pages/dashboard/index.tsx` — registers the `market` tab in the bottom nav
- [api.handler.ts](mdc:entrypoints/background/handlers/api.handler.ts) — `handleFetchElfa*` proxies plus background-owned Chat persistence (`ensureUserScope`)
- [background.ts](mdc:entrypoints/background.ts) — routes the Elfa fetch and Chat actions; awaits `whenStorageReady()`
- [local.ts](mdc:lib/storage/local.ts) — `runStorageInit` / `whenStorageReady` / `ensureUserScope`
- [constants.ts](mdc:lib/messaging/constants.ts) — fetch actions plus `GET_ELFA_CHAT` / `ELFA_CHAT` / `CLEAR_ELFA_CHAT`
- `lib/messaging/types.ts` — request variants + `ElfaTimeWindow`, `ElfaTrendingTokensData`, `ElfaTokenNewsData`, `ElfaNarrativesData`, `ElfaNarrative`, `ElfaMention`, `ElfaTopMentionsData`, `ElfaKeywordMentionsData`, `ElfaSmartStats`
- `lib/constants.ts` — `queryKey.ELFA_*`

## Dependencies & config

- Requires the backend `/elfa/*` routes reachable at the active network's `apiBaseUrl`.
- No extension-side Elfa config or secrets — the **Grow+** Elfa key required for Chat lives in the backend only.

## Testing

`npm run typecheck` (clean) and `npm run build` (production build ok). Full `vitest` suite verified green (82 passed) at Phase-1 completion.

## Deferred

- Hosted Apollo widget embed (needs a widget key + extension-origin allowlist).
- Elfa Auto and richer narratives.
- Canton-native execution (Phase 2).
