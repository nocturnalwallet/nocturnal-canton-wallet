# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repo is the **Nocturnal Canton Network wallet browser extension** (Chrome MV3 / Firefox MV2) built with [WXT](https://wxt.dev), React 19, TypeScript, and Tailwind CSS 4. It implements the CIP-0103 dApp API and manages keys, balances, transfers, and offers.

The single brand pack (`nocturnal`) lives under [`branding/`](branding/README.md), selected at build time with `VITE_BRAND=nocturnal` (the default). Core code imports the active pack via the `@brand` alias — kept pluggable so a new brand pack could be added later.

## Commands

```bash
yarn install --ignore-engines   # --ignore-engines needed: a transitive dep declares node>=22
yarn dev                        # Nocturnal Chrome hot reload (opens browser, popup is 400x600)
yarn dev:firefox                # Nocturnal Firefox with hot reload
yarn build                      # Nocturnal Chrome → build/nocturnal-chrome-mv3
yarn build:prod                 # Nocturnal Mainnet-only → build/nocturnal-chrome-mv3-mainnet
yarn build:firefox              # Nocturnal Firefox
yarn build:all                  # Nocturnal Chrome + Firefox
yarn zip                        # Package the Chrome build
yarn lint                       # eslint .
yarn typecheck                  # tsc --noEmit
yarn test                       # vitest run (all tests)
yarn test:watch                 # vitest watch mode
yarn test path/to/file.test.ts  # run a single test file
yarn test -t "name substring"   # run tests matching a name
```

Tests run in a `node` environment (`globals: false`, so import `describe/it/expect/vi` from `vitest` explicitly). Tests live next to the code they cover (`*.test.ts`). After dependency changes, `postinstall` runs `wxt prepare` to regenerate `.wxt/` types. The `@brand` alias resolves to `branding/nocturnal`.

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
- JSON-RPC 2.0 facade (`gateway-facade-client.ts`, `fetch`-based) at `/api/v0/dapp` and `/api/v0/user`, **authenticated with the same backend Bearer token** from `sessionStore.authToken` — no in-extension JWT minting, no signing relay. On a 401 the facade refreshes the token once (`refreshAuthTokenOnce`) and retries.

This replaced an earlier dual-backend design (separate Wallet Gateway + Socket.io signing relay with self-signed JWTs). `tools/signing-relay/` and `lib/dapp-api/gateway-types.ts` are leftovers from that design — kept in-tree for reference but **not part of the extension build**.

### Signing pattern (all on-ledger operations)
**Password-on-demand.** Popup requests a `prepare` → background returns `{preparedTransaction, hash}` → popup sends the user's password → background decrypts the key **for that single signing operation via the shared `entrypoints/background/signing/sign-with-password.ts` helper, signs the hash, and drops the key reference** → submits `{preparedTransaction, signature}`. Keys are never returned to the popup and are never cached for general reuse. dApp signing (`signMessage`/`signTransaction`/`prepareExecute`) collects the password **in the CIP-0103 approval popup** (verify-on-approve via `MSG.VERIFY_PASSWORD`), which forwards it to the same helper. The one exception is **silent auto-register of transfer pre-approval**, the only flow with no user present to prompt: it uses a narrowly-scoped in-memory key (`_autoRegisterKey` in `session.handler.ts`) populated at unlock/onboarding **only when `shouldAutoRegisterPreapproval` is set**, and cleared on lock/logout/network-switch/auto-lock and once the pre-approval is confirmed.

### Lock / auto-lock
`unlocked` is a `chrome.storage.session` flag that survives service-worker restarts. Re-lock is **inactivity-timeout only**: the `chrome.alarms` auto-lock timer (`VITE_AUTO_LOCK_MINUTES`, default 15), plus explicit lock/logout/network-switch, are the only things that set `unlocked = false`. `handleGetLockState` is side-effect-free. (There is no longer a "cached key missing → force re-lock" reconciliation; because signing is password-on-demand, a restarted SW can still sign without a forced re-lock.)

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
