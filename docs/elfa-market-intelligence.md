# Elfa Market Intelligence — Ginkgo Wallet (Phase 1)

A read-only **Market** tab in the wallet popup that surfaces Elfa's crypto market intelligence — trending tokens, news mentions, and trending narratives. Data is rendered **natively** (no iframe / third-party widget) and comes through the wallet-provider backend, so no Elfa credentials ever touch the extension.

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

The backend base URL comes from the active network (`branding/ginkgo/brand.ts` → `networkApiBaseUrls`). The `/elfa/*` routes are JWT-guarded, so the user must be logged in; an unauthenticated call surfaces as the tab's error state with a Retry.

## UI

`entrypoints/popup/pages/dashboard/MarketIntelligence.tsx` — a segmented view with a shared 24h/7d window toggle:

- **Tokens** — ranked by social mentions; each row shows mention count, mention-count growth vs the prior window (green/red %), and a **mindshare bar** (share of the top-N shown) with a % label. A header legend + info tooltip explain the metrics.
- **News** — recent mentions, each linking out to the post (no tweet text — Elfa's is a measurement endpoint).
- **Narratives** — narrative clusters; each card is **collapsible** to reveal all its source posts (`source_links`), labelled by `@handle`.

Every sub-tab has loading / error (with Retry) / empty states and a Refresh control, and a "Powered by Elfa" footer.

### Metric semantics (important)

These figures are a **trending-by-mentions signal** and intentionally **differ from Elfa Chat's** full-corpus numbers:

- The green **change %** is growth in raw mention *count* vs the prior window — not "mindshare change."
- The **bar** is each token's share of the *top-N shown*, not share of the whole market.
- Absolute counts here are much smaller than Elfa Chat's (different, curated corpus). They cannot be reconciled 1:1 without Elfa's Grow+ chat/synthesis endpoint. The tooltip and legend state this so the numbers aren't mistaken for Elfa Chat's.

## Credit conservation

Elfa's free tier is 1000 credits/month, so the tab is frugal:

- Only the **active** sub-tab fetches (`enabled` on each hook).
- Results are cached **5 minutes** (`staleTime`), `refetchOnWindowFocus: false`, `retry: false`.
- The 24h/7d window is part of each query key, so switching windows caches independently (one fresh fetch per window per sub-tab).

## Files

- `entrypoints/popup/pages/dashboard/MarketIntelligence.tsx` — the tab UI
- `entrypoints/popup/hooks/useElfa.ts` — `useElfaTrendingTokens` / `useElfaTokenNews` / `useElfaNarratives`
- `entrypoints/popup/pages/dashboard/index.tsx` — registers the `market` tab in the bottom nav
- `entrypoints/background/handlers/api.handler.ts` — `handleFetchElfa*` proxy handlers
- `entrypoints/background.ts` — routes the `FETCH_ELFA_*` actions
- `lib/messaging/constants.ts` — `FETCH_ELFA_TRENDING_TOKENS` / `_TOKEN_NEWS` / `_NARRATIVES`
- `lib/messaging/types.ts` — request variants + `ElfaTimeWindow`, `ElfaTrendingTokensData`, `ElfaTokenNewsData`, `ElfaNarrativesData`, `ElfaNarrative`
- `lib/constants.ts` — `queryKey.ELFA_*`

## Dependencies & config

- Requires the backend `/elfa/*` routes (backend branch `feat/elfa-market-data`) reachable at the active network's `apiBaseUrl`.
- No extension-side Elfa config or secrets — the key lives in the backend only.

## Testing

`npm run typecheck` (clean) and `npm run build` (production build ok). Full `vitest` suite verified green (82 passed) at Phase-1 completion.

## Deferred

- Hosted Apollo widget embed (needs a widget key + extension-origin allowlist).
- Elfa Chat / Auto / richer narratives (Grow+ tier).
- Canton-native execution (Phase 2).
