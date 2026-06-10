# Ginkgo CIP-0103 Facade Migration — Design Spec

**Status:** Draft for review
**Date:** 2026-06-09
**Companion plan:** to be written via superpowers:writing-plans after spec approval
**Backend counterpart:** `canton-exchange-backend` repo, `docs/superpowers/specs/2026-06-05-backend-cip-0103-facade-design.md` (Phase 1, landed on `feat/CIP-0103_migration_phase2`)

---

## 1. Goal

Migrate the Ginkgo wallet browser extension so that every Canton Network operation routes through the new JSON-RPC facade in `canton-exchange-backend` (`POST /api/v0/dapp`, `POST /api/v0/user`) instead of talking to the wallet-gateway or the signing-relay directly. This unblocks Phase 2 of the larger initiative (making the wallet-gateway private) and consolidates the wallet's network surface to a single trusted backend.

## 2. Motivation

Today Ginkgo on branch `feat/cip-0103-migration-and-refactoring` ships a clean, isolated `gateway-client.ts` that POSTs to the wallet-gateway directly using a **self-signed HS256 JWT** the extension mints in-memory. It also runs a `signing-relay` Socket.io client to receive sign requests from third-party dApps that lack the CIP-0103 content-script bridge.

The backend's Phase 1 facade is now live: it accepts the wallet's existing Bearer token (`sessionStore.authToken`, issued by `/auth/login-with-google`), validates per-user authorization (party-ownership, template allowlist, resource allowlist, command-ownership), and forwards approved calls to the gateway using the backend's admin token. With this layer in place, Ginkgo no longer needs (a) the self-signed JWT, (b) direct gateway connectivity, or (c) the signing-relay path — third-party dApps will use the CIP-0103 content-script bridge exclusively.

## 3. Scope

### In scope
- Replace `entrypoints/background/gateway-client.ts` with a new `entrypoints/background/gateway-facade-client.ts` whose baseURL is the backend's `/api/v0/*` and whose auth is the existing Bearer token.
- Delete the self-signed HS256 JWT minting code path entirely.
- Delete the `entrypoints/background/signing-relay/` directory and remove its background-script wiring.
- Add Vitest + unit tests covering the new facade client.
- Update `lib/network.ts` (or equivalent) to remove `gatewayUrl`/`signingRelayUrl` per-network config and replace with `facadeBaseUrl`.
- Update `wxt.config.ts` to drop unused `host_permissions` entries (wallet-gateway URL, signing-relay URL).
- Extract a shared `refreshAuthTokenOnce()` helper from `api-client.ts` for reuse between REST and facade clients.

### Out of scope (deferred)
- Migrating Ginkgo's popup-driven transfer flow from REST (`POST /transfer-offer/{prepare,submit}`) to the JSON-RPC facade. The REST endpoints remain first-class per the backend's Phase 1 frontend-migration doc; we leave them in place and revisit later.
- Backfilling tests for `api-client.ts`, the popup UI, content-script bridge, or any handler beyond the new facade client.
- Playwright or any browser-shell E2E tests.
- Manifest version bump / extension store re-publish process.

### Explicit non-goals
- This refactor is mechanical and behavior-preserving for the CIP-0103 dApp/User API methods. No new wallet features, no UX changes in the popup beyond surfacing the new typed errors.

## 4. Architecture

### Before (current state on `feat/cip-0103-migration-and-refactoring`)

```
dApp page
   │  postMessage (CIP-0103)
   ▼
content.ts
   │  chrome.runtime.sendMessage
   ▼
background.ts
   │
   ├──► dapp-api.handler.ts ──► gateway-client.ts ──HTTP+HS256──► wallet-gateway:3030
   │                                (mints self-signed JWT)
   │
   ├──► signing-relay/relay-client.ts ──Socket.io──► signing-relay:3001
   │     (forwards third-party dApp sign requests)
   │
   ├──► auth.handler.ts ──► api-client.ts ──HTTP+Bearer──► canton-exchange-backend (/auth/*)
   │
   └──► signing.handler.ts ──► api-client.ts ──HTTP+Bearer──► canton-exchange-backend (/transfer-offer/*)
```

### After (this design)

```
dApp page
   │  postMessage (CIP-0103) — the only third-party dApp entry point
   ▼
content.ts
   │  chrome.runtime.sendMessage
   ▼
background.ts
   │
   ├──► dapp-api.handler.ts ──► gateway-facade-client.ts ──HTTP+Bearer──► canton-exchange-backend (/api/v0/{dapp,user})
   │                                                                             │
   │                                                                             ▼ (backend uses its own admin token)
   │                                                                       wallet-gateway:3030 (private — Phase 2)
   │
   ├──► auth.handler.ts ──► api-client.ts ──HTTP+Bearer──► canton-exchange-backend (/auth/*)         [unchanged]
   │
   └──► signing.handler.ts ──► api-client.ts ──HTTP+Bearer──► canton-exchange-backend (/transfer-offer/*) [unchanged]

   (signing-relay/ deleted entirely)
```

Three load-bearing properties:

1. **Single auth identity.** Every backend call (REST or JSON-RPC) carries the same Bearer token from `sessionStore.authToken`. No second credential, no key minting in the extension's process.
2. **Single network destination per backend op.** The extension now reaches one URL (the backend); the backend fans out to gateway/ledger using its own admin credentials.
3. **CIP-0103 bridge is the only inbound dApp path.** Third-party dApps that previously connected via signing-relay must adopt the content-script bridge. Ginkgo is not maintaining a fallback.

## 5. Components

### New

| Path | Role |
|---|---|
| `entrypoints/background/gateway-facade-client.ts` | One axios/fetch instance, baseURL = `${facadeBaseUrl}/api/v0`. Exports `gatewayFacadeDappRpc<T>(method, params)` and `gatewayFacadeUserRpc<T>(method, params)`. Auth header sourced **synchronously** from `sessionStore.authToken` per call. Defines `setGatewayFacadeBaseUrl(url)` for network switching. Builds JSON-RPC 2.0 envelopes, unwraps `result`, throws typed errors on `error` (see §7). No Web Crypto in this module — Web Crypto is still used elsewhere for transaction signing (`@canton-network/core-signing-lib`) and PKCE hashing (`auth.handler.ts`). |
| `entrypoints/background/gateway-facade-client.test.ts` | Vitest unit tests (~16 cases — see §8). |
| `vitest.config.ts` + `test/setup.ts` (if needed) | Minimal Vitest config: `environment: 'node'`, path aliases mirror `tsconfig.json`. Optional v8 coverage. |

### Modified

| Path | Change |
|---|---|
| `entrypoints/background/handlers/dapp-api.handler.ts` | Imports swap `gateway-client` → `gateway-facade-client`. Method bodies unchanged for the proxy methods. `instanceof` switches on the typed facade errors decide which trigger popup UI side-effects (sign-in screen, onboarding prompt). |
| `entrypoints/background.ts` | Drop signing-relay setup (`signingRelay.connect()` and the keep-alive alarm). Replace `setGatewayBaseUrl(networkConfig.gatewayUrl)` with `setGatewayFacadeBaseUrl(networkConfig.facadeBaseUrl)`. |
| `lib/network.ts` (or wherever per-network config lives — confirm during impl) | Replace `gatewayUrl` field with `facadeBaseUrl` per network. Remove `signingRelayUrl`. The `/api/v0` path is appended inside the client, not in config. |
| `wxt.config.ts` | Remove `host_permissions` entries for `wallet-gateway` and `signing-relay` URLs. Backend URL is already permitted. |
| `entrypoints/background/api-client.ts` | Extract its 401-refresh logic into a shared `refreshAuthTokenOnce()` helper. Behavior preserved for existing REST callers; the new facade client uses the same helper to avoid two refresh implementations. |
| `package.json` | Add `vitest`, `@vitest/coverage-v8`, and `test`/`test:watch`/`test:cov` scripts. |

### Deleted

- `entrypoints/background/gateway-client.ts`
- `entrypoints/background/signing-relay/` (entire directory, including `relay-client.ts` and any siblings)
- Any handler whose sole purpose was bridging signing-relay (audit during impl)
- Any unused config constants tied to the old paths (e.g., `clientId` if it was only used for JWT minting)

## 6. Data flow

### Flow 1 — Third-party dApp calls `prepareExecute`

```
dApp ──postMessage──► content.ts ──chrome.runtime──► background.ts
  ──► dapp-api.handler.handlePrepareExecute(params)
    ──► gatewayFacadeDappRpc('prepareExecute', params)
      ──► POST {facadeBaseUrl}/api/v0/dapp
           Authorization: Bearer {sessionStore.authToken}
           body: {jsonrpc:'2.0', id:UUID, method:'prepareExecute', params}
         ──► facade: JwtAuthGuard ✓ PartyOwnership ✓ TemplateAllowlist ✓
             ──► GatewayHttpClient(admin token) ──► wallet-gateway prepares tx
             ◄── prepared payload
             facade: ownership.recordIfAbsent(commandId, user.id)
         ◄── {jsonrpc:'2.0', id, result:{userUrl, commandId}}
      ◄── result unwrapped
    ◄── handler returns
  ◄── chrome.runtime response
◄── postMessage back to dApp
```

Invariants:
- One axios call per JSON-RPC method invocation; client is stateless beyond URL + token-source.
- Bearer is read **per request**, not cached; if auto-lock clears `sessionStore.authToken` mid-flight, the next call throws `FacadeAuthRequiredError`.
- The `userUrl` returned by the facade is forwarded verbatim.

### Flow 2 — `execute` after local signing

The local-signing step between Flow 1 and Flow 2 is **untouched** — `signMessage` / `signTransaction` in `dapp-api.handler.ts` use the cached private key directly, no facade call.

```
dApp ──postMessage──► content.ts ──► background.ts ──► dapp-api.handler.handleExecute(params)
  ──► gatewayFacadeUserRpc('execute', params)
    ──► POST {facadeBaseUrl}/api/v0/user
         body: {jsonrpc, method:'execute', params:{commandId, signature, signedBy, partyId}}
       ──► facade: partyOwnership ✓ ownership.recordIfAbsent ✓ gateway.execute
       ◄── {result:{ledger ack}}
    ◄── result
  ◄── handler returns
◄── postMessage back to dApp
```

### Flow 3 — HTTP 401 → refresh + retry once

```
gateway-facade-client.ts                facade                       api-client (existing refresh)
  POST /api/v0/dapp (token=T1)            ─►
                                          ─◄── HTTP 401
  refreshAuthTokenOnce()                                                ─►  POST /auth/refresh-token
                                                                        ─◄── new token T2
  sessionStore.authToken = T2
  POST /api/v0/dapp (token=T2)            ─►
                                          ─◄── 200, result
  return result

If the second attempt is also 401, OR if the refresh-token call itself returns 401:
  throw FacadeAuthRequiredError  → popup forces sign-in.
```

Single retry, no loop. Concurrent calls share a single in-flight refresh promise (`refreshAuthTokenOnce` deduplicates internally).

### Flows that do not change

- **Google OAuth login** — `auth.handler.ts` → `api-client.ts` → backend `/auth/login-with-google`.
- **Popup's own transfer flow** — `signing.handler.ts` → `api-client.ts` → backend `/transfer-offer/{prepare,submit}`.
- **`signMessage` / `signTransaction`** — local-only, cached private key.

## 7. Error handling

### Taxonomy

| Source | Wrapped as | UI side-effect | Returned to dApp |
|---|---|---|---|
| `sessionStore.authToken` missing or post-refresh 401 | `FacadeAuthRequiredError` | Force logout, route to sign-in | `{code:-32603, message:'Wallet locked'}` (generic — don't leak class) |
| `fetch` throws (network) | `FacadeNetworkError` | Toast "backend unreachable" | `{code:-32603, message:'Wallet unavailable'}` |
| HTTP 401 (first attempt) | (internal — triggers refresh) | — | — |
| HTTP 4xx/5xx other | `FacadeRpcError(-32603, 'Internal error')` | — | `{code:-32603}` |
| JSON-RPC `error.code = -32001` | `FacadeNotOnboardedError` | Open onboarding screen | `{code:-32001, message}` verbatim |
| JSON-RPC `error.code = -32002` | `FacadeNotAuthorizedError` | None (permission boundary user can't fix) | `{code:-32002, message}` verbatim |
| JSON-RPC `error.code = -32003` | `FacadeTemplateNotAllowedError` | Toast "operation not supported" | `{code:-32003, message}` verbatim |
| JSON-RPC `error.code = -32004` | `FacadeResourceNotAllowedError` | Toast "operation not supported" | `{code:-32004, message}` verbatim |
| JSON-RPC `error.code = -32601` | `FacadeMethodNotFoundError` | Toast "wallet doesn't support {method}" | `{code:-32601, message}` verbatim |
| Other JSON-RPC `error.code` (incl. forwarded gateway errors) | generic `FacadeRpcError` | None — let dApp render | `{code, message}` verbatim |

### Information disclosure parity

The backend already strips its gateway `data` payload before sending to wallets (backend commit `b252a04`). Ginkgo continues this hygiene at the wallet→dApp boundary: `FacadeAuthRequiredError` and `FacadeNetworkError` map to **generic** `-32603` envelopes for the dApp — internal classification stays in the wallet.

### Refresh-and-retry rules

- Triggers only on HTTP 401 from the facade (not on JSON-RPC application errors).
- Single retry. Second 401 → throw, no loop.
- Shared `refreshAuthTokenOnce()` deduplicates concurrent refreshes.

## 8. Testing

Vitest + unit tests for `gateway-facade-client.ts` only (~16 cases, ~250 LOC). No popup E2E, no other module backfill.

Mock strategy: `vi.spyOn(globalThis, 'fetch')` (or `vi.mock('axios')` per impl choice). `vi.mock('@/lib/storage/session')` for `sessionStore`. No `chrome.*` mocks — this module is pure logic.

```
describe('gateway-facade-client', () => {
  describe('successful dispatch', () => {
    it('POSTs to /api/v0/dapp for dappRpc');
    it('POSTs to /api/v0/user for userRpc');
    it('sends Authorization: Bearer <sessionStore.authToken>');
    it('builds a JSON-RPC 2.0 envelope with method, params, and a unique id');
    it('returns result on success');
    it('honors setGatewayFacadeBaseUrl()');
  });

  describe('auth', () => {
    it('throws FacadeAuthRequiredError when sessionStore.authToken is missing');
    it('refreshes and retries once on HTTP 401');
    it('throws FacadeAuthRequiredError when refresh itself returns 401');
    it('throws FacadeAuthRequiredError when second attempt after refresh also returns 401');
    it('deduplicates concurrent refresh attempts');
  });

  describe('JSON-RPC error envelope', () => {
    it('throws FacadeNotOnboardedError for -32001');
    it('throws FacadeNotAuthorizedError for -32002');
    it('throws FacadeTemplateNotAllowedError for -32003');
    it('throws FacadeResourceNotAllowedError for -32004');
    it('throws FacadeMethodNotFoundError for -32601');
    it('throws generic FacadeRpcError for unknown -32xxx');
  });

  describe('transport errors', () => {
    it('wraps fetch network failure as FacadeNetworkError');
    it('wraps HTTP 5xx as FacadeRpcError(-32603)');
  });
});
```

### Out of scope for unit tests (manual verification only)

1. Load Ginkgo in Chrome dev-mode against a locally-running `canton-exchange-backend`.
2. Sign in with Google → `sessionStore.authToken` set.
3. Open a CIP-0103 bridge dApp → `connect` returns identity.
4. `prepareExecute` for `TransferFactory_Transfer` reaches the gateway (gateway-side error is the GOOD outcome, confirmed in backend smoke).
5. Manually clear `sessionStore.authToken` → next call yields `FacadeAuthRequiredError` → popup routes to sign-in.
6. Switch network in popup → `setGatewayFacadeBaseUrl` invoked, next dApp call uses new URL.
7. `signMessage` (local only) still works.
8. Popup's own transfer (`/transfer-offer/*`) still works — regression check.

## 9. Open questions (deferred to implementation)

1. **`createWallet` callsite audit.** Does Ginkgo currently call gateway's `createWallet` during onboarding? The facade returns `-32601 MethodNotFound` for it (Phase 1 design: onboarding is REST `/auth/login-with-google`). If Ginkgo calls it, remove that call site; if not, no change needed.
2. **Cached self-signed JWT cleanup.** Is the old gateway HS256 JWT cached anywhere in `chrome.storage`? Explorer says no (in-memory only) — confirm during impl and add a storage migration if needed.
3. **`clientId` dead-code.** Likely only used for self-signed JWT minting (`sub` claim). Delete if confirmed unused.
4. **Exact location of per-network config.** Probably `lib/network.ts`; verify the file name when modifying.

## 10. Constraints

- TypeScript strict mode, ESLint, Prettier — no new warnings introduced.
- WXT build for both Chrome MV3 and Firefox must succeed (`yarn build:all`).
- No breaking changes to the existing CIP-0103 wire protocol exposed to dApps via the content-script bridge.
- Third-party dApps that relied on signing-relay will break after this phase ships — accepted per stakeholder decision.

## 11. Acceptance criteria

- All Vitest tests pass (`yarn test`).
- Both extension builds clean (`yarn build:all`).
- Lint + typecheck clean (`yarn lint && yarn typecheck`).
- Manual checklist §8 items 1–8 pass against a locally-running backend.
- `entrypoints/background/gateway-client.ts` and `entrypoints/background/signing-relay/` are removed from the working tree.
- `grep -r 'wallet-gateway\|signing-relay' entrypoints/ lib/` returns no live references (only references in docs / migration notes).

## 12. Follow-ups (separate work after this lands)

- **Phase 2 in the backend repo:** drop the wallet-gateway's public port mapping in `docker-compose.yml`. Coordinate timing — the backend can ship Phase 2 the moment this Ginkgo refactor is verified end-to-end in staging.
- **Retire `signing-relay` container** in `docker-compose.yml` — no client connects to it anymore once this ships.
- **Future migration:** move Ginkgo's popup-driven transfer flow from REST (`/transfer-offer/*`) to JSON-RPC (`dapp.prepareExecute` + `user.execute`) so popup transfers go through the same path as third-party dApps. Requires building the Token Standard `choiceArgument` shape in Ginkgo instead of relying on the typed REST DTO.
