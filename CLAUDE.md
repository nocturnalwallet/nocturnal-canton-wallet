# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repo is a **multi-brand Canton Network wallet browser extension** (Chrome MV3 / Firefox MV2) built with [WXT](https://wxt.dev), React 19, TypeScript, and Tailwind CSS 4. It implements the CIP-0103 dApp API and manages keys, balances, transfers, and offers.

Brands (`ginkgo`, `nocturnal`, …) live under [`branding/`](branding/README.md) and are selected at build time with `VITE_BRAND`. Core code imports the active pack via the `@brand` alias.

## Commands

```bash
yarn install --ignore-engines   # --ignore-engines needed: a transitive dep declares node>=22
yarn dev                        # Ginkgo Chrome hot reload (opens browser, popup is 400x600)
yarn dev:nocturnal              # Nocturnal Chrome hot reload
yarn dev:firefox                # Firefox with hot reload (Ginkgo)
yarn build                      # Ginkgo Chrome → build/ginkgo-chrome-mv3
yarn build:nocturnal            # Nocturnal Chrome → build/nocturnal-chrome-mv3
yarn build:prod                 # Ginkgo Mainnet-only
yarn build:prod:nocturnal       # Nocturnal Mainnet-only
yarn build:all-brands           # All four Chrome brand × mainnet variants
yarn build:all                  # Ginkgo Chrome + Firefox
yarn lint                       # eslint .
yarn typecheck                  # tsc --noEmit
yarn test                       # vitest run (all tests)
yarn test:watch                 # vitest watch mode
yarn test path/to/file.test.ts  # run a single test file
yarn test -t "name substring"   # run tests matching a name
```

Tests run in a `node` environment (`globals: false`, so import `describe/it/expect/vi` from `vitest` explicitly). Tests live next to the code they cover (`*.test.ts`). After dependency changes, `postinstall` runs `wxt prepare` to regenerate `.wxt/` types. Default vitest brand is `ginkgo` (`@brand` → `branding/ginkgo`).

## Architecture

The extension has three runtime contexts that communicate by message passing — **private keys live only in the background service worker** and never enter the popup.

### Contexts
- **Background service worker** (`entrypoints/background.ts`) — the security boundary and single message router. Holds the encrypted keystore, decrypts/signs, makes all backend API calls, manages auth tokens and auto-lock.
- **Popup UI** (`entrypoints/popup/`) — React app (`App.tsx` is a state-machine navigator over onboarding → unlock → dashboard). Hooks in `popup/hooks/` wrap `sendMessage` calls; it never sees private keys.
- **Content scripts** — `content.ts` (ISOLATED world) bridges web-page `window.postMessage` (CIP-0103) to the background and announces the provider; `provider.content.ts` (MAIN world) replies to `SPLICE_WALLET_EXT_READY` with `SPLICE_WALLET_EXT_ACK` for the SDK detection handshake. Note: it deliberately does **not** set `window.canton` (that would short-circuit the older SDK's `injectSpliceProvider()`).

### Two messaging surfaces (both arrive at `background.ts`'s `onMessage` listeners)
1. **Internal popup ↔ background** — `MessageRequest`/`MessageResponse` discriminated unions keyed on `action` (string constants in `lib/messaging/constants.ts` as `MSG`). The router is the `switch` in `routeMessage()`. Use `sendMessage<T>()` (popup) and `ok()`/`err()` (handlers) from `lib/messaging/protocol.ts`. **To add a feature:** add a `MSG.*` constant + request/response union member in `lib/messaging/`, write a handler in `entrypoints/background/handlers/`, and wire a `case` in `routeMessage()`.
2. **CIP-0103 dApp API** — `SpliceMessage` objects from web pages, detected by `isSpliceMessage()` and dispatched in `dapp-api.handler.ts`. This listener is registered **first** so it intercepts dApp messages before the internal router.

### Backend (CIP-0103 facade — single backend per network)

A single dapp-core backend at `NETWORKS[network].apiBaseUrl` serves both surfaces:

- REST endpoints (`api-client.ts`, Axios) for balances/transfers/offers/auth/onboarding/faucet.
- JSON-RPC 2.0 facade (`gateway-facade-client.ts`, `fetch`-based) at `/api/v0/dapp` and `/api/v0/user`, **authenticated with the same backend Bearer token** from `sessionStore.authToken` — no in-extension JWT minting, no signing relay. On a 401 the facade refreshes the token once (`refreshAuthTokenOnce`) and retries. See `docs/superpowers/specs/2026-06-09-ginkgo-cip-0103-facade-migration-design.md`.

This replaced an earlier dual-backend design (separate Wallet Gateway + Socket.io signing relay with self-signed JWTs). `tools/signing-relay/` and `lib/dapp-api/gateway-types.ts` are leftovers from that design — kept in-tree for reference but **not part of the extension build**.

### Signing pattern (all on-ledger operations)
Popup requests a `prepare` → background returns `{preparedTransaction, hash}` → popup sends the user's password → background decrypts the key (or uses the in-memory cached key while unlocked), signs the hash, and submits `{preparedTransaction, signature}`. Keys are never returned to the popup.

### Storage (`lib/storage/`)
- `localStore` — `chrome.storage.local`, **namespaced by `{network}:{userId}:`** so switching network/account never leaks data. Migrations (`migrateUnprefixedData`, `migrateToUserScoped`) run on background startup. Call `setNetworkPrefix()` / `setUserScope()` to change scope.
- `networkStore` — global, non-namespaced selected-network id.
- `sessionStore` — `chrome.storage.session` (memory only): auth tokens, party id, lock state.

### Networks
`NETWORKS` in `lib/network.ts` (Localnet/Devnet/Testnet/Mainnet). Switching network clears the session, resets clients, and returns the user to Unlock/Welcome. URLs are runtime-selected by network; `.env` only seeds dev defaults.

### Encryption
`entrypoints/background/encryption/` is a facade selected at build time by `VITE_ENCRYPTION_BACKEND`: `webcrypto` (PBKDF2 + AES-256-GCM, default) or `cryptojs` (web-app compatible). Both implement the `EncryptionProvider` interface.

## Conventions
- Path aliases (in `wxt.config.ts` and `vitest.config.ts`): `@` (root), `@lib`, `@components`, `@assets`.
- Auth: Google OAuth via `chrome.identity.launchWebAuthFlow()` with PKCE. The manifest `key` pins the extension ID so the OAuth redirect URI stays stable — **don't change `key`** without re-registering the redirect URI in Google Cloud Console.
- Validation with Zod (`lib/storage/schemas.ts`); state with Zustand; server state with TanStack Query.
- The manifest is defined in `wxt.config.ts`, not a static `manifest.json`.

## Git

- **Do not add a `Co-Authored-By` (or any co-author) line to commit messages.** Commit messages should contain no co-author trailer.
