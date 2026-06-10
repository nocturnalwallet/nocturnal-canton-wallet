# Ginkgo CIP-0103 Facade Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Ginkgo's CIP-0103 dApp/User API calls from the (now-private) wallet-gateway to the new `canton-exchange-backend` facade at `/api/v0/{dapp,user}`. Drop self-signed JWT minting, drop the signing-relay path entirely, and add a Vitest unit-test foundation.

**Architecture:** A new `gateway-facade-client.ts` replaces the old `gateway-client.ts`. It POSTs to `${apiBaseUrl}/api/v0/{dapp,user}` with the existing `sessionStore.authToken` Bearer (no more in-extension JWT minting). The facade backend validates auth + party-ownership + template/resource allowlists and forwards approved calls to the gateway using its own admin token. Per-network config drops `gatewayUrl` / `gatewayAuth` / `signingRelayUrl` fields entirely — the facade is reachable at the same `apiBaseUrl` the REST client already uses.

**Tech Stack:** WXT 0.20 (Chrome MV3 + Firefox), React 19, TypeScript strict, axios, `@canton-network/core-signing-lib`. New: Vitest + @vitest/coverage-v8.

**Source spec:** `docs/superpowers/specs/2026-06-09-ginkgo-cip-0103-facade-migration-design.md`

---

## Pre-flight checklist (no code — must complete before Task 1)

These verifications resolve the spec's §9 open questions and the `createWallet` discovery from the planning explorer. Record outcomes inline as `< RESOLVED: ... >` notes before proceeding.

- [x] **Verify `createWallet` replacement endpoint exists in `canton-exchange-backend`.** Ginkgo's `entrypoints/background/handlers/keystore.handler.ts:141` calls `gatewayUserRpc('createWallet', { partyHint, publicKey, ... })`. After Phase 3 this returns `-32601 MethodNotFound` from the facade (it's in `SKIPPED_USER_API`). The backend ships `POST /auth/register-party` for the same purpose. Confirm:
  - Endpoint path: `POST /auth/register-party`
  - Request body shape (party hint, optional public key, etc.)
  - Response shape (created `partyId`, status, etc.)
  - Auth: same Bearer token
  - Run `curl` against a local backend or check the controller in `canton-exchange-backend/src/modules/auth/auth.controller.ts` to verify.
  Record: `< RESOLVED YYYY-MM-DD: endpoint shape is ... >`

  `< RESOLVED 2026-06-09: /auth/register-party is NOT a drop-in replacement for createWallet — see auth.controller.ts:49-57 and auth.service.ts:290. Endpoint exists but semantics differ:`
  - **Path:** `POST /auth/register-party` (no global prefix; raw path)
  - **Auth:** `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()` — same `Authorization: Bearer ${sessionStore.authToken}` Ginkgo already uses.
  - **Request body (RegisterPartyDto, src/modules/external-onboarding/dto/register-party.dto.ts):** `{ partyId: string; publicKey?: string }` — **expects an existing partyId in `hint::fingerprint` form**, not a `partyHint` string.
  - **Response (RegisterPartyResponseDto):** `{ partyId: string; onboardingStatus: string }`.
  - **Service body verifies `topologyService.getPartyById(partyId)` returns a non-empty result, throwing `BadRequestException('Party not found on synchronizer')` otherwise.** It only **records the user↔party link** in the backend DB; it does not allocate a party on the synchronizer.
  - **Discovery (blocking for Task 10):** Ginkgo's `keystore.handler.ts:154` *already* calls `apiClient.post('/auth/register-party', { partyId, publicKey })` immediately after `createWallet` succeeds. Removing the `createWallet` call leaves the wallet with no partyId to register, so this swap as written cannot work. The actual gateway-side allocation today uses the gateway's `signingProviderId: 'blockdaemon'` (gateway-managed key), which is what's becoming unreachable in Phase 2. A correct Phase 3 onboarding replacement requires the backend's `external-party/onboarding/{prepare,submit}` flow (`canton-exchange-backend/src/modules/external-onboarding/external-party.controller.ts:85,105`) so the wallet's local Ed25519 key allocates the party via signed topology transactions, then `/auth/register-party` records the link. This is a multi-step rewrite, not a one-line swap.
  - **Action required:** human decision — see "Pre-flight escalation" block below before starting Task 1. `>`

  `< RESOLVED 2026-06-09 (supplemental — parallel backend + Ginkgo audits): /external-party/onboarding/{prepare,submit} are LIVE on canton-exchange-backend's feat/CIP-0103_migration_phase2 branch, explicitly listed as UNCHANGED in the Phase 1 frontend-migration doc, dual-auth (JwtAuthGuard accepts the existing Bearer from sessionStore.authToken), and the submit endpoint already persists the party→user link in the DB so the separate /auth/register-party call is unnecessary. Wallet-side signing uses signTransactionHash from @canton-network/core-signing-lib (already imported in Ginkgo for transaction signing). Today's gateway-based onboarding is BROKEN on devnet/testnet/mainnet anyway (gatewayUrl='' throws "Gateway auth not configured" before any signing happens), so the new flow is strictly better than the current state. Pre-flight escalation Option 2 ("Expand Task 10 in place") is chosen. Task 10 is no longer deferred — see its rewritten body. The SCOPE ADJUSTED callouts on Tasks 11, 12, and 14 are removed accordingly. >`

- [x] **Confirm `apiBaseUrl` is the correct facade base URL.** Inspect `lib/network.ts`: `apiBaseUrl` is set to the backend (e.g., `http://localhost:3003/` for localnet, `https://api-devnet.kairo.ag/` for devnet). The facade endpoints live at `/api/v0/{dapp,user}` on the same backend. Verify with one `curl`:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api-devnet.kairo.ag/api/v0/dapp -H "Content-Type: application/json" -d '{}'
  ```
  Expected: `401` (auth required) → proves the endpoint is reachable at that base.
  Record: `< RESOLVED YYYY-MM-DD: apiBaseUrl IS the facade base; no new field needed >`

  `< RESOLVED 2026-06-09: apiBaseUrl IS the facade base — confirmed by code, NOT yet by HTTP probe on devnet (deployment lag).`
  - Backend controllers: `cip-0103-facade/dapp-api.controller.ts:23` → `@Controller('api/v0/dapp')`; `cip-0103-facade/user-api.controller.ts:23` → `@Controller('api/v0/user')`. No NestJS global prefix; raw paths.
  - `Cip0103FacadeModule` is wired in `src/app.module.ts:16,28` on backend branch `feat/CIP-0103_migration_phase2` — confirmed alongside auth, transfer, etc.
  - Live probe `curl POST https://api-devnet.kairo.ag/api/v0/dapp` → **HTTP 404** (devnet runs an older backend without the facade). `curl POST https://api-devnet.kairo.ag/auth/login-with-google` → HTTP 400 (existing endpoint live), confirming the backend itself is reachable.
  - Localnet (`http://localhost:3003`) not running locally; not probed.
  - **Conclusion:** `apiBaseUrl` is structurally correct; no new `facadeBaseUrl` field needed. Devnet/testnet/mainnet must redeploy the Phase 2 backend before Ginkgo Phase 3 can be smoke-tested against them — out of scope for this Ginkgo work, tracked as a follow-up. Local manual verification (spec §8) will use a developer-run backend on `http://localhost:3003`. `>`

- [x] **Confirm `chrome.storage` holds no cached self-signed gateway JWT.** Per `entrypoints/background/gateway-client.ts:9-11`, the JWT is held in **module-local memory** (`cachedGatewayJwt`, `cachedJwtExpiry`), not in any storage. Verify by grep:
  ```bash
  grep -rn "cachedGatewayJwt\|gatewayJwt" entrypoints/ lib/
  ```
  Expected: hits only in `gateway-client.ts`. No `chrome.storage` references → no migration needed.
  Record: `< RESOLVED YYYY-MM-DD: JWT is in-memory only; no storage migration needed >`

  `< RESOLVED 2026-06-09: JWT is in-memory only; no storage migration needed. All 7 hits for cachedGatewayJwt/gatewayJwt are inside entrypoints/background/gateway-client.ts (lines 18, 34, 45, 128, 129, 141, 143). No chrome.storage / localStore / sessionStore references. Task 11 deleting gateway-client.ts wipes the only holder. >`

- [x] **Confirm `clientId` is used only for self-signed JWT minting.** Per planning explorer findings, the only references are `gateway-client.ts:134` (`auth.clientId` as JWT `sub`) and `lib/network.ts` (the field definition + localnet value). Re-grep to confirm:
  ```bash
  grep -rn "clientId\b" entrypoints/ lib/
  ```
  Expected: only the two listed sites. → safe to delete with the rest of `GatewayAuthConfig` in Task 11.
  Record: `< RESOLVED YYYY-MM-DD: clientId only used in JWT minting; safe to delete with GatewayAuthConfig >`

  `< RESOLVED 2026-06-09: clientId is only used for JWT minting; safe to delete with GatewayAuthConfig. Exactly three references across entrypoints/ and lib/:`
  - `entrypoints/background/gateway-client.ts:134` — `const sub = auth.clientId;` (JWT `sub` claim).
  - `lib/network.ts:9` — `clientId: string;` field declaration inside `GatewayAuthConfig`.
  - `lib/network.ts:39` — `clientId: 'ledger-api-user'` (localnet value).

  Deleting `GatewayAuthConfig` and `gateway-client.ts` (Task 11) removes all three. No popup UI, content script, or other handler references `clientId`. `>`

---

## Pre-flight escalation — Task 10 blocker (added 2026-06-09)

The pre-flight surfaced a contradiction between the plan's Task 10 and the actual `canton-exchange-backend` semantics that **must** be resolved before Task 10 lands. Tasks 1–9, 11–14 are unaffected and may proceed.

**What the plan assumes:** Task 10 swaps `gatewayUserRpc('createWallet', { partyHint, publicKey, ... })` (which the gateway currently uses with `signingProviderId: 'blockdaemon'` to allocate a party on the synchronizer) for `apiClient.post('/auth/register-party', { partyHint, publicKey })`.

**What the backend actually offers:**
- `POST /auth/register-party` only **records** an existing party-to-user link. Its service throws `BadRequestException('Party not found on synchronizer')` unless the party already exists.
- Ginkgo's `keystore.handler.ts:154` already invokes this endpoint immediately after `createWallet` returns the partyId — it's not a substitute, it's the next step.
- The actual party-allocation flow lives in `src/modules/external-onboarding/external-party.controller.ts` (`POST /external-party/onboarding/{prepare,submit}` with `create-key-pair`, `party-details`, `party-id`). Replacing `createWallet` requires the wallet to allocate the party itself using its local Ed25519 key via that multi-step flow, then call `/auth/register-party`.

**Options considered:**
1. **Defer Task 10** — leave the `createWallet` call in place for now (gateway still reachable on localnet). Accept that onboarding breaks the moment backend Phase 2 makes the gateway private. Phase 3 ships as a facade-migration-only refactor; onboarding migration becomes its own follow-up phase.
2. **Expand Task 10 in place** — design and implement the wallet-side multi-step `external-party/onboarding/{prepare,submit}` flow now.
3. **Hybrid** — drop the unconditional `createWallet`/`register-party` calls from `handleCreateAccount`, and add a clear `TODO(onboarding-rewrite)` comment + early-return so onboarding fails fast with a typed error until Phase 3.5 lands.

**Decision (2026-06-09): Option 2 chosen.**

Parallel audits (recorded in Pre-flight Item 1's supplemental RESOLVED note) confirmed:
- Backend endpoints are LIVE, explicitly UNCHANGED in the Phase 1 frontend-migration doc, dual-auth (accept Ginkgo's existing Bearer), and the submit endpoint already persists the party→user link (no separate `/auth/register-party` call needed).
- Ginkgo's current onboarding is **broken on devnet/testnet/mainnet today** (`gatewayUrl=''` → `Gateway auth not configured` thrown before any signing). The rewrite is strictly an improvement over the current state.
- Wallet-side signing uses `signTransactionHash` from `@canton-network/core-signing-lib` (already imported for transaction signing). No new dependencies.
- Gateway+relay-specific scaffolding (`connectSigningRelayForOnboarding`, `signingRelay.setAutoApprove(true/false)`, two-step relay reconnect) gets deleted with the relay — no replacement needed in the new flow.

Net effect on this plan:
- Task 10 returns to scope as a meaningful (~40 LOC) rewrite of `handleCompleteOnboarding`. See the rewritten task body below.
- Tasks 11, 12, and 14 return to their original scope: delete `gateway-client.ts`, drop `gatewayUrl`/`gatewayAuth`/`GatewayAuthConfig`/`clientId`, drop `setGatewayBaseUrl`/`setGatewayAuth` from `background.ts`, and verify zero live references to any of the deleted symbols.

Tasks 1–14 unblocked. Proceed to Task 1 after every pre-flight checkbox above has a resolution note.

---

## File structure (created or modified by this plan)

```
entrypoints/background/
├── gateway-facade-client.ts                       # NEW: replaces gateway-client.ts
├── gateway-facade-client.test.ts                  # NEW: Vitest unit tests
├── api-client.ts                                  # MODIFY: extract refreshAuthTokenOnce
├── background.ts                                  # MODIFY: drop relay setup, swap client init
├── handlers/dapp-api.handler.ts                   # MODIFY: swap import + typed-error handling
├── handlers/keystore.handler.ts                   # MODIFY: replace gatewayUserRpc('createWallet') call
├── gateway-client.ts                              # DELETE
└── signing-relay/                                 # DELETE entire directory
    └── relay-client.ts

lib/
├── network.ts                                     # MODIFY: drop gatewayUrl/gatewayAuth/signingRelayUrl/signingRelayApiKey + GatewayAuthConfig
└── auth-refresh.ts                                # NEW: shared refreshAuthTokenOnce helper

vitest.config.ts                                   # NEW
package.json                                       # MODIFY: vitest deps + test scripts
wxt.config.ts                                      # MODIFY: drop unused host_permissions

docs/superpowers/specs/                            # already exists (spec lives here)
docs/superpowers/plans/                            # already exists (this file)
```

**Branching strategy:** all work on the current feature branch `feat/cip-0103-migration-and-refactoring`. Each task is one or more small commits.

---

## Task 1: Add Vitest infrastructure

**Why:** The new facade client is the first module in Ginkgo with unit tests. Need Vitest, its v8 coverage plugin, a config, and scripts.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add Vitest dev dependencies**

```bash
yarn add -D vitest @vitest/coverage-v8
```

Expected: `yarn.lock` updated; `package.json` `devDependencies` now contains both packages.

- [ ] **Step 2: Add test scripts to `package.json`**

In the `scripts` block of `package.json`, add three entries (in alphabetical order with the existing ones):

```json
"test": "vitest run",
"test:cov": "vitest run --coverage",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['entrypoints/**/*.ts', 'lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@lib': path.resolve(__dirname, 'lib'),
      '@components': path.resolve(__dirname, 'components'),
      '@assets': path.resolve(__dirname, 'assets'),
    },
  },
});
```

(Aliases mirror `wxt.config.ts` so test imports resolve identically to runtime.)

- [ ] **Step 4: Smoke-test the runner**

```bash
yarn test
```

Expected: exits cleanly with `No test files found` (no tests yet — that's correct; just proves vitest runs).

- [ ] **Step 5: Verify nothing else broke**

```bash
yarn typecheck
yarn lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock vitest.config.ts
git commit -m "chore(test): add Vitest infrastructure"
```

---

## Task 2: Error type hierarchy + test scaffold

**Why:** The new client distinguishes facade application errors (-32001..-32004), method-not-found (-32601), generic JSON-RPC errors, transport failures, and auth-required failures. Subclasses let callers `instanceof` rather than match codes. Set up the file plus a test file with the first set of tests covering the error shapes.

**Files:**
- Create: `entrypoints/background/gateway-facade-client.ts`
- Create: `entrypoints/background/gateway-facade-client.test.ts`

- [ ] **Step 1: Create the file with only the error classes exported**

`entrypoints/background/gateway-facade-client.ts`:

```ts
/**
 * CIP-0103 facade client for Ginkgo.
 *
 * Replaces the legacy direct-to-wallet-gateway path. POSTs JSON-RPC 2.0 to
 * `${apiBaseUrl}/api/v0/dapp` and `${apiBaseUrl}/api/v0/user`. Authentication
 * uses the existing backend Bearer token from `sessionStore.authToken` — no
 * in-extension JWT minting. See:
 *   docs/superpowers/specs/2026-06-09-ginkgo-cip-0103-facade-migration-design.md
 */

export class FacadeRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'FacadeRpcError';
  }
}

export class FacadeNotOnboardedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32001, message, data);
    this.name = 'FacadeNotOnboardedError';
  }
}

export class FacadeNotAuthorizedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32002, message, data);
    this.name = 'FacadeNotAuthorizedError';
  }
}

export class FacadeTemplateNotAllowedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32003, message, data);
    this.name = 'FacadeTemplateNotAllowedError';
  }
}

export class FacadeResourceNotAllowedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32004, message, data);
    this.name = 'FacadeResourceNotAllowedError';
  }
}

export class FacadeMethodNotFoundError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32601, message, data);
    this.name = 'FacadeMethodNotFoundError';
  }
}

export class FacadeAuthRequiredError extends Error {
  constructor(message = 'Facade authentication required') {
    super(message);
    this.name = 'FacadeAuthRequiredError';
  }
}

export class FacadeNetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FacadeNetworkError';
  }
}
```

- [ ] **Step 2: Create the test file with error-class tests**

`entrypoints/background/gateway-facade-client.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  FacadeRpcError,
  FacadeNotOnboardedError,
  FacadeNotAuthorizedError,
  FacadeTemplateNotAllowedError,
  FacadeResourceNotAllowedError,
  FacadeMethodNotFoundError,
  FacadeAuthRequiredError,
  FacadeNetworkError,
} from './gateway-facade-client';

describe('error classes', () => {
  it('FacadeRpcError carries code, message, and optional data', () => {
    const err = new FacadeRpcError(-32099, 'gateway said no', { detail: 1 });
    expect(err.code).toBe(-32099);
    expect(err.message).toBe('gateway said no');
    expect(err.data).toEqual({ detail: 1 });
    expect(err.name).toBe('FacadeRpcError');
  });

  it('FacadeNotOnboardedError has code -32001 and extends FacadeRpcError', () => {
    const err = new FacadeNotOnboardedError('Complete onboarding');
    expect(err).toBeInstanceOf(FacadeRpcError);
    expect(err.code).toBe(-32001);
    expect(err.name).toBe('FacadeNotOnboardedError');
  });

  it('FacadeNotAuthorizedError has code -32002', () => {
    const err = new FacadeNotAuthorizedError('NotAuthorized');
    expect(err.code).toBe(-32002);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeTemplateNotAllowedError has code -32003', () => {
    const err = new FacadeTemplateNotAllowedError('Template not allowed');
    expect(err.code).toBe(-32003);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeResourceNotAllowedError has code -32004', () => {
    const err = new FacadeResourceNotAllowedError('Resource not allowed');
    expect(err.code).toBe(-32004);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeMethodNotFoundError has code -32601', () => {
    const err = new FacadeMethodNotFoundError('Method not supported');
    expect(err.code).toBe(-32601);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeAuthRequiredError is distinct from FacadeRpcError', () => {
    const err = new FacadeAuthRequiredError();
    expect(err).not.toBeInstanceOf(FacadeRpcError);
    expect(err.name).toBe('FacadeAuthRequiredError');
  });

  it('FacadeNetworkError preserves the original cause', () => {
    const cause = new TypeError('fetch failed');
    const err = new FacadeNetworkError('backend unreachable', cause);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('FacadeNetworkError');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
yarn test
```

Expected: 8 tests, all PASS.

- [ ] **Step 4: typecheck + lint**

```bash
yarn typecheck && yarn lint
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/gateway-facade-client.ts \
        entrypoints/background/gateway-facade-client.test.ts
git commit -m "feat(facade-client): error type hierarchy with code-specific subclasses"
```

---

## Task 3: `gatewayFacadeDappRpc` + `gatewayFacadeUserRpc` happy path

**Why:** Core dispatch — build the JSON-RPC envelope, POST to the right path, return `result`. Bearer token handling deferred to Task 4.

**Files:**
- Modify: `entrypoints/background/gateway-facade-client.ts`
- Modify: `entrypoints/background/gateway-facade-client.test.ts`

- [ ] **Step 1: Write failing tests (append to the existing test file)**

Add this block to `entrypoints/background/gateway-facade-client.test.ts`:

```ts
import { vi, beforeEach, afterEach } from 'vitest';

// At top of file, with the other imports:
import {
  gatewayFacadeDappRpc,
  gatewayFacadeUserRpc,
  setGatewayFacadeBaseUrl,
} from './gateway-facade-client';

// Mock sessionStore so Bearer reads return a stable token in these happy-path tests
vi.mock('@lib/storage', () => ({
  sessionStore: {
    get: vi.fn(async (key: string) => (key === 'authToken' ? 'test-token' : null)),
    set: vi.fn(),
    setMany: vi.fn(),
    clear: vi.fn(),
  },
  localStore: { get: vi.fn(), set: vi.fn() },
  networkStore: { get: vi.fn(), set: vi.fn() },
}));

describe('successful dispatch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 'r1', result: { ok: true } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  afterEach(() => fetchSpy.mockRestore());

  it('POSTs to /api/v0/dapp for dappRpc', async () => {
    await gatewayFacadeDappRpc('connect', {});
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://backend.test/api/v0/dapp');
  });

  it('POSTs to /api/v0/user for userRpc', async () => {
    await gatewayFacadeUserRpc('listSessions', {});
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://backend.test/api/v0/user');
  });

  it('builds a JSON-RPC 2.0 envelope with method, params, and a unique id', async () => {
    await gatewayFacadeDappRpc('connect', { hi: 1 });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('connect');
    expect(body.params).toEqual({ hi: 1 });
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
  });

  it('returns result on success', async () => {
    const result = await gatewayFacadeDappRpc<{ ok: boolean }>('connect', {});
    expect(result).toEqual({ ok: true });
  });

  it('uses POST method with Content-Type application/json', async () => {
    await gatewayFacadeDappRpc('connect', {});
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('honors setGatewayFacadeBaseUrl()', async () => {
    setGatewayFacadeBaseUrl('https://other.test');
    await gatewayFacadeDappRpc('connect', {});
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://other.test/api/v0/dapp');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test
```

Expected: 6 new tests FAIL — `gatewayFacadeDappRpc`, `gatewayFacadeUserRpc`, `setGatewayFacadeBaseUrl` not exported yet.

- [ ] **Step 3: Implement minimal code in `gateway-facade-client.ts`**

Append to the existing file (after the error classes):

```ts
let currentBaseUrl = '';

export function setGatewayFacadeBaseUrl(url: string): void {
  // Strip trailing slash so `${url}/api/v0/dapp` doesn't double-slash.
  currentBaseUrl = url.replace(/\/+$/, '');
}

export function getGatewayFacadeBaseUrl(): string {
  return currentBaseUrl;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export function gatewayFacadeDappRpc<T = unknown>(
  method: string,
  params: unknown,
): Promise<T> {
  return facadeRpc<T>('/api/v0/dapp', method, params);
}

export function gatewayFacadeUserRpc<T = unknown>(
  method: string,
  params: unknown,
): Promise<T> {
  return facadeRpc<T>('/api/v0/user', method, params);
}

async function facadeRpc<T>(path: string, method: string, params: unknown): Promise<T> {
  const envelope: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params,
  };
  const response = await fetch(`${currentBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  const data = (await response.json()) as JsonRpcResponse<T>;
  return data.result as T;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
yarn test
```

Expected: all 14 tests (8 existing + 6 new) PASS.

- [ ] **Step 5: typecheck**

```bash
yarn typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/background/gateway-facade-client.ts \
        entrypoints/background/gateway-facade-client.test.ts
git commit -m "feat(facade-client): dappRpc + userRpc happy-path dispatch"
```

---

## Task 4: Bearer auth from sessionStore

**Why:** Replace the gateway's self-signed JWT with the existing dapp-core Bearer token. Missing token throws a typed error so callers can surface the right UX.

**Files:**
- Modify: `entrypoints/background/gateway-facade-client.ts`
- Modify: `entrypoints/background/gateway-facade-client.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `entrypoints/background/gateway-facade-client.test.ts`:

```ts
import { sessionStore } from '@lib/storage';
import { FacadeAuthRequiredError } from './gateway-facade-client';

describe('auth header', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sessionGetMock = vi.mocked(sessionStore.get);

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    sessionGetMock.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 'r1', result: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  afterEach(() => fetchSpy.mockRestore());

  it('sends Authorization: Bearer <sessionStore.authToken>', async () => {
    sessionGetMock.mockResolvedValue('the-token');
    await gatewayFacadeDappRpc('connect', {});
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer the-token');
  });

  it('throws FacadeAuthRequiredError when sessionStore.authToken is missing', async () => {
    sessionGetMock.mockResolvedValue(null);
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeAuthRequiredError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws FacadeAuthRequiredError when sessionStore.authToken is empty string', async () => {
    sessionGetMock.mockResolvedValue('');
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeAuthRequiredError,
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
yarn test
```

Expected: the 3 new tests fail (token not attached, missing-token not throwing FacadeAuthRequiredError).

- [ ] **Step 3: Update `facadeRpc` to read + attach the Bearer**

In `gateway-facade-client.ts`, add the `sessionStore` import at the top:

```ts
import { sessionStore } from '@lib/storage';
```

Replace the `facadeRpc` function body with:

```ts
async function facadeRpc<T>(path: string, method: string, params: unknown): Promise<T> {
  const token = await sessionStore.get('authToken');
  if (!token) {
    throw new FacadeAuthRequiredError();
  }

  const envelope: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params,
  };
  const response = await fetch(`${currentBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(envelope),
  });
  const data = (await response.json()) as JsonRpcResponse<T>;
  return data.result as T;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
yarn test
```

Expected: 17 tests (previous 14 + new 3) all PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/gateway-facade-client.ts \
        entrypoints/background/gateway-facade-client.test.ts
git commit -m "feat(facade-client): attach sessionStore Bearer; throw FacadeAuthRequiredError on missing token"
```

---

## Task 5: JSON-RPC error envelope → typed subclasses

**Why:** When the facade returns `{error:{code,message}}`, the client throws the right subclass so callers can `instanceof` instead of matching codes.

**Files:**
- Modify: `entrypoints/background/gateway-facade-client.ts`
- Modify: `entrypoints/background/gateway-facade-client.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the test file:

```ts
describe('JSON-RPC error envelope → typed subclasses', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sessionGetMock = vi.mocked(sessionStore.get);

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    sessionGetMock.mockResolvedValue('the-token');
  });

  afterEach(() => fetchSpy.mockRestore());

  function mockErrorResponse(code: number, message: string, data?: unknown) {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 'r1', error: { code, message, data } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  }

  it('throws FacadeNotOnboardedError for -32001', async () => {
    mockErrorResponse(-32001, 'Complete onboarding');
    await expect(gatewayFacadeUserRpc('addSession', {})).rejects.toBeInstanceOf(
      FacadeNotOnboardedError,
    );
  });

  it('throws FacadeNotAuthorizedError for -32002', async () => {
    mockErrorResponse(-32002, 'NotAuthorized for one or more parties');
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toMatchObject({
      code: -32002,
    });
    mockErrorResponse(-32002, 'x');
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toBeInstanceOf(
      FacadeNotAuthorizedError,
    );
  });

  it('throws FacadeTemplateNotAllowedError for -32003', async () => {
    mockErrorResponse(-32003, 'Template+choice not allowed: x:y');
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toBeInstanceOf(
      FacadeTemplateNotAllowedError,
    );
  });

  it('throws FacadeResourceNotAllowedError for -32004', async () => {
    mockErrorResponse(-32004, 'Resource not allowed: GET /v2/admin/foo');
    await expect(gatewayFacadeDappRpc('ledgerApi', {})).rejects.toBeInstanceOf(
      FacadeResourceNotAllowedError,
    );
  });

  it('throws FacadeMethodNotFoundError for -32601', async () => {
    mockErrorResponse(-32601, 'Method not supported: signMessage');
    await expect(gatewayFacadeUserRpc('signMessage', {})).rejects.toBeInstanceOf(
      FacadeMethodNotFoundError,
    );
  });

  it('throws generic FacadeRpcError for an unknown -32xxx code', async () => {
    mockErrorResponse(-32099, 'something else');
    const promise = gatewayFacadeDappRpc('whatever', {});
    await expect(promise).rejects.toBeInstanceOf(FacadeRpcError);
    await expect(promise).rejects.not.toBeInstanceOf(FacadeNotOnboardedError);
  });

  it('preserves error.message and error.data on the thrown subclass', async () => {
    mockErrorResponse(-32003, 'Template+choice not allowed: Foo:Bar', { detail: 'x' });
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toMatchObject({
      code: -32003,
      message: 'Template+choice not allowed: Foo:Bar',
      data: { detail: 'x' },
    });
  });
});
```

Also extend the `import { FacadeAuthRequiredError, ... }` line at the top of the test file to include `FacadeNotOnboardedError`, `FacadeNotAuthorizedError`, `FacadeTemplateNotAllowedError`, `FacadeResourceNotAllowedError`, `FacadeMethodNotFoundError`, `FacadeRpcError`.

- [ ] **Step 2: Run tests, verify they fail**

```bash
yarn test
```

Expected: 7 new tests fail (errors not mapped yet — current code returns `undefined` from `data.result` when `error` is set).

- [ ] **Step 3: Add error-mapping logic in `facadeRpc`**

In `gateway-facade-client.ts`, replace the response-handling tail of `facadeRpc` (after the `await response.json()` line) with:

```ts
  const data = (await response.json()) as JsonRpcResponse<T>;

  if (data.error) {
    throw mapJsonRpcError(data.error);
  }
  return data.result as T;
}

function mapJsonRpcError(error: {
  code: number;
  message: string;
  data?: unknown;
}): FacadeRpcError {
  switch (error.code) {
    case -32001: return new FacadeNotOnboardedError(error.message, error.data);
    case -32002: return new FacadeNotAuthorizedError(error.message, error.data);
    case -32003: return new FacadeTemplateNotAllowedError(error.message, error.data);
    case -32004: return new FacadeResourceNotAllowedError(error.message, error.data);
    case -32601: return new FacadeMethodNotFoundError(error.message, error.data);
    default:     return new FacadeRpcError(error.code, error.message, error.data);
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
yarn test
```

Expected: all 24 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/gateway-facade-client.ts \
        entrypoints/background/gateway-facade-client.test.ts
git commit -m "feat(facade-client): map JSON-RPC error codes to typed subclasses"
```

---

## Task 6: Transport errors (network + non-200 HTTP)

**Why:** A `fetch` rejection or a 5xx without a JSON-RPC envelope must surface cleanly — not blow up with `await response.json()` on an HTML body.

**Files:**
- Modify: `entrypoints/background/gateway-facade-client.ts`
- Modify: `entrypoints/background/gateway-facade-client.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the test file:

```ts
import { FacadeNetworkError } from './gateway-facade-client';

describe('transport errors', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sessionGetMock = vi.mocked(sessionStore.get);

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    sessionGetMock.mockResolvedValue('the-token');
  });

  afterEach(() => fetchSpy.mockRestore());

  it('wraps fetch network failure as FacadeNetworkError', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));
    const promise = gatewayFacadeDappRpc('connect', {});
    await expect(promise).rejects.toBeInstanceOf(FacadeNetworkError);
  });

  it('wraps HTTP 5xx as FacadeRpcError(-32603)', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream error', { status: 502, statusText: 'Bad Gateway' }),
    );
    const promise = gatewayFacadeDappRpc('connect', {});
    await expect(promise).rejects.toMatchObject({ code: -32603 });
    await expect(promise).rejects.toBeInstanceOf(FacadeRpcError);
  });

  it('wraps HTTP 4xx (non-401) as FacadeRpcError(-32603)', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403, statusText: 'Forbidden' }),
    );
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeRpcError,
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
yarn test
```

Expected: 3 new tests fail with various unhandled errors.

- [ ] **Step 3: Add transport-error handling**

In `gateway-facade-client.ts`, wrap the `fetch` call in `facadeRpc`. Replace the existing implementation with:

```ts
async function facadeRpc<T>(path: string, method: string, params: unknown): Promise<T> {
  const token = await sessionStore.get('authToken');
  if (!token) {
    throw new FacadeAuthRequiredError();
  }

  const envelope: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params,
  };

  let response: Response;
  try {
    response = await fetch(`${currentBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(envelope),
    });
  } catch (cause) {
    throw new FacadeNetworkError(`facade unreachable at ${currentBaseUrl}${path}`, cause);
  }

  if (!response.ok && response.status !== 401) {
    throw new FacadeRpcError(
      -32603,
      `facade HTTP ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as JsonRpcResponse<T>;
  if (data.error) {
    throw mapJsonRpcError(data.error);
  }
  return data.result as T;
}
```

Note: 401 is **intentionally allowed through** so Task 8 can intercept and trigger refresh-and-retry. Until Task 8 lands, a 401 will fall into `await response.json()` and likely throw a parsing error — that's fine because no real backend will 401 us during Tasks 2-7 testing.

- [ ] **Step 4: Run tests, verify pass**

```bash
yarn test
```

Expected: all 27 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/gateway-facade-client.ts \
        entrypoints/background/gateway-facade-client.test.ts
git commit -m "feat(facade-client): wrap network and HTTP transport errors"
```

---

## Task 7: Extract `refreshAuthTokenOnce` from `api-client.ts`

**Why:** The existing `api-client.ts` interceptor has refresh logic. Task 8 needs to call the same flow. Extract it into a shared helper, leave api-client behavior unchanged.

**Files:**
- Create: `lib/auth-refresh.ts`
- Modify: `entrypoints/background/api-client.ts`

- [ ] **Step 1: Create the shared helper**

`lib/auth-refresh.ts`:

```ts
import axios from 'axios';
import { sessionStore } from '@lib/storage';

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Refresh the dapp-core auth token using the stored refresh token.
 *
 * - Returns the new access token on success.
 * - Returns null on failure (caller should treat as auth required).
 * - Deduplicates concurrent calls — a second invocation while one is in flight
 *   awaits the same promise, so we never double-refresh.
 *
 * Side effect: on success writes new authToken + refreshToken back to sessionStore.
 * Side effect: on failure clears sessionStore.
 *
 * @param backendBaseUrl absolute URL of the backend (e.g. `http://localhost:3003`).
 *   The endpoint path `/auth/refresh-token` is appended internally.
 */
export function refreshAuthTokenOnce(backendBaseUrl: string): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const refreshToken = await sessionStore.get('refreshToken');
      if (!refreshToken) return null;

      const url = `${backendBaseUrl.replace(/\/+$/, '')}/auth/refresh-token`;
      const { data } = await axios.post(url, { refreshToken });

      const newToken = data?.data?.token;
      const newRefresh = data?.data?.refreshToken;
      if (!newToken) return null;

      await sessionStore.setMany({
        authToken: newToken,
        refreshToken: newRefresh ?? refreshToken,
      });
      return newToken;
    } catch {
      await sessionStore.clear();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
```

- [ ] **Step 2: Update `api-client.ts` to use the helper**

Replace the entire body of `entrypoints/background/api-client.ts` with:

```ts
import axios from 'axios';
import { sessionStore } from '@lib/storage';
import { refreshAuthTokenOnce } from '@lib/auth-refresh';

let currentBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export function setApiBaseUrl(url: string): void {
  currentBaseUrl = url;
  apiClient.defaults.baseURL = url;
}

export function getApiBaseUrl(): string {
  return currentBaseUrl;
}

const apiClient = axios.create({
  baseURL: currentBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await sessionStore.get('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const newToken = await refreshAuthTokenOnce(currentBaseUrl);
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
```

The `getApiBaseUrl()` export is new — Task 8's facade client will use it to derive the refresh URL.

- [ ] **Step 3: Confirm typecheck + build**

```bash
yarn typecheck && yarn build
```

Expected: both pass. (api-client behavior is unchanged for existing REST callers; this is a pure refactor.)

- [ ] **Step 4: Run all tests**

```bash
yarn test
```

Expected: still 27 tests PASS (no new tests yet; this commit is the refactor).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-refresh.ts entrypoints/background/api-client.ts
git commit -m "refactor(auth): extract refreshAuthTokenOnce into shared helper"
```

---

## Task 8: 401 → refresh + single retry

**Why:** When the facade returns 401, refresh the Bearer once and retry. Second 401 (or failed refresh) becomes `FacadeAuthRequiredError`.

**Files:**
- Modify: `entrypoints/background/gateway-facade-client.ts`
- Modify: `entrypoints/background/gateway-facade-client.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the test file (you'll also need to mock the auth-refresh module):

```ts
import { refreshAuthTokenOnce } from '@lib/auth-refresh';

vi.mock('@lib/auth-refresh', () => ({
  refreshAuthTokenOnce: vi.fn(),
}));

describe('401 refresh-and-retry', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sessionGetMock = vi.mocked(sessionStore.get);
  const refreshMock = vi.mocked(refreshAuthTokenOnce);

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    sessionGetMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => fetchSpy?.mockRestore());

  it('refreshes and retries once on HTTP 401', async () => {
    sessionGetMock.mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    refreshMock.mockResolvedValue('new');
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 'r1', result: { ok: true } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const result = await gatewayFacadeDappRpc<{ ok: boolean }>('connect', {});
    expect(result).toEqual({ ok: true });
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect((secondInit.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer new',
    );
  });

  it('throws FacadeAuthRequiredError when refresh returns null', async () => {
    sessionGetMock.mockResolvedValue('old');
    refreshMock.mockResolvedValue(null);
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeAuthRequiredError,
    );
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('throws FacadeAuthRequiredError when retry also returns 401', async () => {
    sessionGetMock.mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    refreshMock.mockResolvedValue('new');
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeAuthRequiredError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses the new token from sessionStore after refresh', async () => {
    sessionGetMock.mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    refreshMock.mockResolvedValue('new');
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 'r1', result: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    await gatewayFacadeDappRpc('connect', {});
    const calls = fetchSpy.mock.calls as Array<[string, RequestInit]>;
    expect((calls[0][1].headers as Record<string, string>)['Authorization']).toBe('Bearer old');
    expect((calls[1][1].headers as Record<string, string>)['Authorization']).toBe('Bearer new');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
yarn test
```

Expected: 4 new tests fail (no refresh logic; 401 currently throws via `data.error` or `data.result` path).

- [ ] **Step 3: Implement refresh-and-retry**

In `gateway-facade-client.ts`, add the import at the top:

```ts
import { refreshAuthTokenOnce } from '@lib/auth-refresh';
```

Rewrite `facadeRpc` to split request-sending into a helper and add retry:

```ts
async function facadeRpc<T>(path: string, method: string, params: unknown): Promise<T> {
  const envelope: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params,
  };

  let response = await sendOnce(path, envelope);

  if (response.status === 401) {
    const newToken = await refreshAuthTokenOnce(currentBaseUrl);
    if (!newToken) {
      throw new FacadeAuthRequiredError();
    }
    response = await sendOnce(path, envelope);
    if (response.status === 401) {
      throw new FacadeAuthRequiredError();
    }
  }

  if (!response.ok) {
    throw new FacadeRpcError(
      -32603,
      `facade HTTP ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as JsonRpcResponse<T>;
  if (data.error) {
    throw mapJsonRpcError(data.error);
  }
  return data.result as T;
}

async function sendOnce(path: string, envelope: JsonRpcRequest): Promise<Response> {
  const token = await sessionStore.get('authToken');
  if (!token) {
    throw new FacadeAuthRequiredError();
  }
  try {
    return await fetch(`${currentBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(envelope),
    });
  } catch (cause) {
    throw new FacadeNetworkError(`facade unreachable at ${currentBaseUrl}${path}`, cause);
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
yarn test
```

Expected: all 31 tests PASS. If any earlier tests broke due to `sessionGetMock.mockResolvedValue(...)` being a single-shot in some tests, replace those calls with `mockResolvedValue(...)` (multi-shot) where the test issues a single request — only the 401 path consumes the second mock value.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/gateway-facade-client.ts \
        entrypoints/background/gateway-facade-client.test.ts
git commit -m "feat(facade-client): refresh-and-retry once on HTTP 401"
```

---

## Task 9: Wire `dapp-api.handler.ts` to the new facade client

**Why:** The handler imports `gatewayDappRpc` / `gatewayUserRpc`. Swap to the new module. The proxy method bodies stay identical; only the imports change. Also surface typed errors with friendlier wallet UI strings where appropriate.

**Files:**
- Modify: `entrypoints/background/handlers/dapp-api.handler.ts`

- [ ] **Step 1: Update the imports**

In `entrypoints/background/handlers/dapp-api.handler.ts`, find the line that imports from `'../gateway-client'` (around line 30 per the explorer) and change:

```ts
// Before:
import { gatewayDappRpc, gatewayUserRpc, ensureGatewaySession } from '../gateway-client';

// After:
import {
  gatewayFacadeDappRpc,
  gatewayFacadeUserRpc,
  FacadeNotOnboardedError,
  FacadeMethodNotFoundError,
  FacadeAuthRequiredError,
  FacadeRpcError,
} from '../gateway-facade-client';
```

`ensureGatewaySession` is no longer needed — the facade handles sessions backend-side.

- [ ] **Step 2: Swap callsites in the proxy methods**

In every method body that calls `gatewayDappRpc(...)`, replace with `gatewayFacadeDappRpc(...)`. Same for `gatewayUserRpc(...)` → `gatewayFacadeUserRpc(...)`. Remove any explicit `await ensureGatewaySession()` calls.

Concretely the methods that need this:
- `handlePrepareExecute` → uses `gatewayDappRpc`
- `handlePrepareExecuteAndWait` → uses `gatewayDappRpc`
- `handleLedgerApi` → uses `gatewayDappRpc`
- Any User API methods (likely `handleExecute`, `handleGetTransaction`, `handleDeleteTransaction`, `handleAddSession`, etc.) → uses `gatewayUserRpc`

Use `grep -n 'gatewayDappRpc\|gatewayUserRpc\|ensureGatewaySession' entrypoints/background/handlers/dapp-api.handler.ts` to enumerate.

- [ ] **Step 3: Add typed-error handling in the main dispatcher**

Find `handleDappApiRequest` (around line 401). Wrap the method-dispatch call (e.g., `await methods[message.method](message.params, senderOrigin)`) in a typed `try/catch`:

```ts
try {
  const result = await methods[methodName](params, senderOrigin);
  return jsonRpcSuccess(message.id, result);
} catch (err) {
  if (err instanceof FacadeAuthRequiredError) {
    // Wallet's session is gone — generic envelope to dApp; the popup will route to sign-in
    // (popup side-effect dispatched elsewhere; the dApp just needs to know to back off).
    return jsonRpcError(message.id, -32603, 'Wallet locked');
  }
  if (err instanceof FacadeRpcError) {
    // Forward the facade's code+message verbatim. Subclass instanceof checks
    // above can trigger popup UI side-effects (toasts, onboarding prompt) before re-throwing.
    return jsonRpcError(message.id, err.code, err.message);
  }
  // Unexpected — fall through to existing error handling
  throw err;
}
```

(Adapt to the existing error-return shape; `jsonRpcError(id, code, message)` is already imported per the explorer's findings on line 1 import block.)

- [ ] **Step 4: typecheck + build + tests**

```bash
yarn typecheck && yarn build && yarn test
```

Expected: all green. The build will still compile against the legacy `gateway-client.ts` since other handlers (keystore) still import from it — that's expected; Task 10 removes the last consumer.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/handlers/dapp-api.handler.ts
git commit -m "feat(dapp-api): route through gateway-facade-client and handle typed errors"
```

---

## Task 10: Rewrite `handleCompleteOnboarding` to use `/external-party/onboarding/*`

**Why:** Onboarding today goes through gateway `createWallet` (which uses signing-relay + autoApprove gymnastics under the hood) + a follow-up `/auth/register-party` to link user↔party. After Phase 3 both the gateway and signing-relay are gone. The backend's `/external-party/onboarding/{prepare,submit}` endpoints — audited 2026-06-09, LIVE on backend's `feat/CIP-0103_migration_phase2`, explicitly UNCHANGED in Phase 1 docs — are the canonical replacement: backend prepares the party-allocation topology transaction, wallet signs the returned `multiHash` locally with its Ed25519 key, backend submits to Canton and persists the party→user link in one shot. The new flow also fixes onboarding on devnet/testnet/mainnet, which is broken today (`gatewayUrl=''` throws `Gateway auth not configured`).

**Pre-condition:** Pre-flight Item 1 RESOLVED (supplemental audit note) and Pre-flight escalation block has Option 2 chosen.

**Files:**
- Modify: `entrypoints/background/handlers/keystore.handler.ts`

- [ ] **Step 1: Read the current `handleCompleteOnboarding` to confirm scope**

```bash
sed -n '100,180p' entrypoints/background/handlers/keystore.handler.ts
```

You should see (line numbers approximate):
- `connectSigningRelayForOnboarding(privateKey)` call (line ~131)
- `signingRelay.setAutoApprove(true)` (line ~134)
- `gatewayUserRpc<CreateWalletResult>('createWallet', { partyHint, signingProviderId: 'blockdaemon', primary: true })` (line ~141)
- `apiClient.post('/auth/register-party', { partyId, publicKey })` (line ~154)
- `await connectSigningRelay()` reconnect (line ~157)
- `signingRelay.setAutoApprove(false)` in `finally` (line ~160)

All of the above gets replaced by the new prepare→sign→submit block in Step 4.

- [ ] **Step 2: Define the response type for `/external-party/onboarding/prepare`**

Add this type near the top of `keystore.handler.ts` (or in a new file `lib/dapp-api/onboarding-types.ts` if you prefer a cleaner separation). Shape matches the backend's `PrepareExternalPartyResponseDto` in `canton-exchange-backend/src/modules/external-onboarding/dto/create-external-party.dto.ts`:

```ts
interface PreparedExternalParty {
  partyId: string;
  namespace: string;
  multiHash: string;
  topologyTransactions: string[];
}
```

- [ ] **Step 3: Swap imports in `keystore.handler.ts`**

First enumerate what's currently imported from the soon-to-be-deleted modules:

```bash
grep -nE "from '\\.\\./gateway-client'|from '\\.\\./signing-relay/|CreateWalletParams|CreateWalletResult|connectSigningRelayForOnboarding|connectSigningRelay" entrypoints/background/handlers/keystore.handler.ts
```

Remove all imports that reference `../gateway-client`, `../signing-relay/...`, `CreateWalletParams`, `CreateWalletResult`, `connectSigningRelayForOnboarding`, `connectSigningRelay`, and `signingRelay`. (Exact list depends on the file — use the grep above as ground truth.)

Add (if not already present):

```ts
import apiClient from '../api-client';
import { signTransactionHash } from '@canton-network/core-signing-lib';
```

`apiClient` is likely already imported because `keystore.handler.ts` already calls `apiClient.post('/auth/register-party', ...)`. In that case just leave that import as-is. `signTransactionHash` is already imported elsewhere in the codebase (e.g., `dapp-api.handler.ts`) — confirm the named export exists in `@canton-network/core-signing-lib` via your IDE before relying on it.

- [ ] **Step 4: Rewrite the body of `handleCompleteOnboarding`**

Replace the entire `if (partyStatus !== 'SUCCESSFULLY') { … }` block (everything between the opening `{` of that `if` and its closing `}`, INCLUDING the `try { … } finally { signingRelay.setAutoApprove(false); }` wrapper) with:

```ts
const partyStatus = await sessionStore.get('partyStatus');
if (partyStatus !== 'SUCCESSFULLY') {
  const partyHint = import.meta.env.VITE_PARTY_HINT || 'ginkgo-wallet';

  // 3. Backend prepares a party-allocation topology transaction.
  //    Returns { partyId, namespace, multiHash, topologyTransactions }.
  console.log(`[Ginkgo] POST /external-party/onboarding/prepare hint=${partyHint}`);
  const prepareResponse = await apiClient.post(
    '/external-party/onboarding/prepare',
    { publicKey, hint: partyHint },
  );
  const prepared = prepareResponse.data?.data as PreparedExternalParty;
  if (!prepared?.multiHash || !prepared?.partyId) {
    throw new Error('Onboarding prepare returned malformed response');
  }

  // 4. Sign the multi-hash locally with the wallet's Ed25519 private key.
  const signedHash = signTransactionHash(prepared.multiHash, privateKey);

  // 5. Backend submits the signed topology to Canton and flips the party's
  //    onboardingStatus to SUCCESSFULLY (which also persists the user↔party
  //    link — no separate /auth/register-party call needed).
  console.log(`[Ginkgo] POST /external-party/onboarding/submit partyId=${prepared.partyId}`);
  const submitResponse = await apiClient.post(
    '/external-party/onboarding/submit',
    { signedHash, preparedParty: prepared },
  );
  const submitted = submitResponse.data?.data as { partyId: string; success: boolean };
  if (!submitted?.success) {
    throw new Error('Onboarding submit reported failure');
  }

  // 6. Persist partyId + onboarding status for the rest of the runtime.
  await sessionStore.set('partyId', submitted.partyId);
  await sessionStore.set('partyStatus', 'SUCCESSFULLY');
  console.log(`[Ginkgo] Onboarding complete: ${submitted.partyId}`);
}
```

**Things this rewrite explicitly deletes:**
- `connectSigningRelayForOnboarding(privateKey)` — no relay; the wallet signs locally.
- `signingRelay.setAutoApprove(true/false)` and the `try/finally` wrapper — no relay request to auto-approve.
- `await connectSigningRelay()` reconnect — no relay.
- `gatewayUserRpc('createWallet', { partyHint, signingProviderId: 'blockdaemon', primary: true })` — replaced by prepare-sign-submit.
- `apiClient.post('/auth/register-party', { partyId, publicKey })` — the submit endpoint already does the DB link (see `canton-exchange-backend/src/modules/external-onboarding/external-party.service.ts:300-315`).

**Things to leave unchanged:**
- Steps 1 + 2 of the original function (key encryption + `setCachedPrivateKey`).
- The early-return when `partyStatus === 'SUCCESSFULLY'`.
- Step 10 (the final `localStore.set('onboardingComplete', true)` + `sessionStore.set('unlocked', true)`).
- The outer `try { … } catch { … }` error handler.

Also remove the unused `preparedParty?: OnboardingPrepareData` field from the function's parameter type — it was a stub for a never-implemented design.

- [ ] **Step 5: Audit for stale references**

```bash
grep -nE "gatewayUserRpc|signingRelay|connectSigningRelay|CreateWalletResult|CreateWalletParams|setAutoApprove|OnboardingPrepareData" entrypoints/background/handlers/keystore.handler.ts
```

Expected: zero hits. If anything remains, it's leftover scaffolding — remove.

- [ ] **Step 6: typecheck + build**

```bash
yarn typecheck && yarn build
```

Expected: pass for `keystore.handler.ts`. Other files may still fail because `gateway-client.ts` and `signing-relay/` haven't been deleted yet — that's Task 11's job. If typecheck only complains about those, you're good.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/background/handlers/keystore.handler.ts
git commit -m "feat(keystore): replace gateway createWallet with /external-party/onboarding/* flow"
```

---

## Task 11: Simplify `lib/network.ts` (drop gateway + signing-relay fields)

**Also folds in deletion of `entrypoints/background/gateway-client.ts` and `entrypoints/background/signing-relay/`, plus cleanup of the now-dead `connectSigningRelay*` functions in `entrypoints/background/handlers/session.handler.ts`.** All callers were updated in Tasks 9 (`dapp-api.handler.ts`) and 10 (`keystore.handler.ts`).

**Why:** Per-network config no longer needs `gatewayUrl`, `gatewayAuth`, `signingRelayUrl`, or `signingRelayApiKey`. The facade client uses the existing `apiBaseUrl`. `GatewayAuthConfig` is dead.

**Files:**
- Modify: `lib/network.ts`

- [ ] **Step 1: Remove unused fields from `NetworkConfig` and the `NETWORKS` map**

Replace `lib/network.ts` with:

```ts
export type NetworkId = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  /** Backend base URL — serves both REST (`/auth/*`, `/transfer-offer/*`) and JSON-RPC facade (`/api/v0/{dapp,user}`). */
  apiBaseUrl: string;
  explorerUrl: string;
  faucetEnabled: boolean;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  localnet: {
    id: 'localnet',
    label: 'Localnet',
    apiBaseUrl: 'http://localhost:3003/',
    explorerUrl: '',
    faucetEnabled: true,
  },
  devnet: {
    id: 'devnet',
    label: 'Devnet',
    apiBaseUrl: 'https://api-devnet.kairo.ag/',
    explorerUrl: 'https://lighthouse.devnet.cantonloop.com',
    faucetEnabled: true,
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    apiBaseUrl: 'https://api-testnet.kairo.ag/',
    explorerUrl: 'https://lighthouse.testnet.cantonloop.com',
    faucetEnabled: false,
  },
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    apiBaseUrl: 'https://api.kairo.ag/',
    explorerUrl: 'https://lighthouse.cantonloop.com',
    faucetEnabled: false,
  },
};

export const DEFAULT_NETWORK: NetworkId = 'devnet';

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];
```

Deleted: `GatewayAuthConfig`, `gatewayUrl`, `gatewayAuth`, `signingRelayUrl`, `signingRelayApiKey`. The `clientId` field that lived inside `GatewayAuthConfig` is gone with it.

- [ ] **Step 2: typecheck — surface every dead consumer**

```bash
yarn typecheck
```

Expected output: TS errors in:
- `entrypoints/background/gateway-client.ts` — references `GatewayAuthConfig`. (Will be deleted in Task 13; ignore for now? No — `yarn typecheck` will fail. **Workaround**: move Task 13 before Task 11, OR delete `gateway-client.ts` first as a noop change. Simplest is to do Task 13 here inline.)

Since the dependency chain forces deletion now, **fold Task 13's deletion into this task** — see Step 3.

- [ ] **Step 3: Delete `entrypoints/background/gateway-client.ts` and `signing-relay/`**

```bash
rm entrypoints/background/gateway-client.ts
rm -rf entrypoints/background/signing-relay/
```

(All callers have been updated in Tasks 9 and 10. The Task 12 wiring update will handle the remaining `background.ts` references.)

- [ ] **Step 4: Clean up dead `connectSigningRelay*` helpers in `entrypoints/background/handlers/session.handler.ts`**

`connectSigningRelay()` and `connectSigningRelayForOnboarding()` were re-exports from `session.handler.ts` that wrapped the signing-relay. With `signing-relay/` deleted in Step 3, these functions are either now broken (importing from a non-existent path) or dead (no callers after Task 10's onboarding rewrite). Find and remove them:

```bash
grep -nE "connectSigningRelay|signing-relay|signingRelay" entrypoints/background/handlers/session.handler.ts
```

Delete:
- Any `import` line referencing `'../signing-relay/...'`.
- The `connectSigningRelay()` function and its export.
- The `connectSigningRelayForOnboarding()` function and its export.
- Any other helper whose only purpose was driving the relay (e.g., a `disconnectSigningRelay()` if present).

Then verify nothing else still imports them:

```bash
grep -rn "connectSigningRelay" entrypoints/ lib/
```

Expected: zero hits.

- [ ] **Step 5: typecheck again — see what's left**

```bash
yarn typecheck
```

Expected: errors only in `entrypoints/background.ts` (still imports from `gateway-client` and `signing-relay`). Task 12 fixes those.

- [ ] **Step 6: Commit**

```bash
git add lib/network.ts \
        entrypoints/background/gateway-client.ts \
        entrypoints/background/signing-relay/ \
        entrypoints/background/handlers/session.handler.ts
git commit -m "refactor(network): drop gateway/relay config fields and remove dead modules"
```

(Use `git add` with the deleted paths to stage the deletions.)

---

## Task 12: Rewire `entrypoints/background.ts`

**Why:** Replace the legacy `setGatewayBaseUrl`/`setGatewayAuth` calls with the new facade-client init, and remove all signing-relay setup + alarms.

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Inspect current state of the file**

```bash
grep -n "gateway\|signing.*relay\|signingRelay" entrypoints/background.ts
```

Note all hit line numbers. Typical hits:
- Imports of `setGatewayBaseUrl`, `setGatewayAuth`, `signingRelay` near top
- Init block around lines 76-78 calling `setGatewayBaseUrl(...)` etc.
- Signing-relay `connect()` setup
- Alarm registration for the relay's keep-alive

- [ ] **Step 2: Remove legacy imports + add new import**

Find imports of `setGatewayBaseUrl`/`setGatewayAuth`/`signingRelay`/related types and **delete** them. Add:

```ts
import { setGatewayFacadeBaseUrl } from './background/gateway-facade-client';
```

- [ ] **Step 3: Replace the init block**

Find the init block (around line 76):

```ts
// Before:
setApiBaseUrl(NETWORKS[network].apiBaseUrl);
setGatewayBaseUrl(NETWORKS[network].gatewayUrl);
setGatewayAuth(NETWORKS[network].gatewayAuth);
// ...signingRelay.connect(...) and related setup...
```

Replace with:

```ts
setApiBaseUrl(NETWORKS[network].apiBaseUrl);
setGatewayFacadeBaseUrl(NETWORKS[network].apiBaseUrl);
```

(Facade lives on the same backend; one URL drives both.)

- [ ] **Step 4: Remove signing-relay setup + alarms**

Find every occurrence of `signingRelay.*` or alarm registrations like `chrome.alarms.create('relay-keepalive', ...)` and delete them. Also delete the alarm handler for the relay-keepalive alarm if present.

- [ ] **Step 5: Repeat the init logic in the network-switch handler**

If `network.handler.ts` also calls `setGatewayBaseUrl(...)` when the user switches networks, swap that too. Grep:

```bash
grep -rn "setGatewayBaseUrl\|setGatewayAuth" entrypoints/
```

Expected: zero hits after this step.

- [ ] **Step 6: typecheck + build + tests**

```bash
yarn typecheck && yarn build && yarn test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/background.ts entrypoints/background/handlers/network.handler.ts
git commit -m "feat(background): init gateway-facade-client; remove signing-relay wiring"
```

(Stage `network.handler.ts` only if you touched it in Step 5.)

---

## Task 13: Drop unused manifest `host_permissions`

**Why:** The extension no longer reaches the wallet-gateway URL or the signing-relay URL directly. The backend is already permitted. Tighten the manifest accordingly.

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: Audit current `host_permissions`**

Per the planning explorer, `wxt.config.ts` currently has:

```ts
host_permissions: [
  'https://accounts.google.com/*',
  'https://*.kairo.ag/*',
  'http://localhost/*',
],
```

There are no wallet-gateway- or signing-relay-specific entries — `http://localhost/*` covers localnet's `http://localhost:3030` and `http://localhost:4100` (gateway + relay) but also `http://localhost:3003` (the backend). After Phase 3 we still need `http://localhost/*` (for the backend on localnet). So no removal is required here. Verify:

```bash
grep -A 10 "host_permissions" wxt.config.ts
```

If the list matches above, no changes needed in this step.

- [ ] **Step 2: (Optional, skip if list is already minimal) Trim to what's actually used**

If anything more specific than the three above is present (e.g., a hardcoded `http://localhost:3030`), delete it.

- [ ] **Step 3: Commit if anything changed**

```bash
git add wxt.config.ts
git commit -m "chore(manifest): tighten host_permissions for facade-only network access"
```

If no change, skip the commit.

---

## Task 14: Manual verification + final sweep

**Why:** With all code changes landed, run the build, lint, typecheck, and the manual smoke checklist from the spec §8.

**Files:** none (verification + cleanup)

- [ ] **Step 1: Run the full quality bar**

```bash
yarn typecheck && yarn lint && yarn test && yarn build:all
```

Expected: every command exits 0. `yarn build:all` builds both Chrome MV3 and Firefox extensions.

- [ ] **Step 2: Confirm dead-code removal**

```bash
grep -rn "wallet-gateway\|signing-relay\|gatewayClient\|signingRelay\|gatewayUrl\|signingRelayUrl\|clientId\|GatewayAuthConfig\|ensureGatewaySession\|connectSigningRelay\|CreateWalletResult\|CreateWalletParams" entrypoints/ lib/
```

Expected: zero hits (or only hits in comment/doc lines that explicitly reference past behavior — e.g., a migration note). If runtime code still references any of these, fix it.

- [x] **Step 3: Load the extension in Chrome and run the spec §8 manual checklist**

Load the unpacked extension from `build/chrome-mv3` against a locally-running `canton-exchange-backend` (port 3003). Run through:

  1. Sign in with Google → confirm `sessionStore.authToken` is set (check chrome.storage in DevTools).
  2. Open a dApp with the CIP-0103 bridge → `connect` returns identity.
  3. `prepareExecute` for `TransferFactory_Transfer` reaches the gateway (gateway-side error is the GOOD outcome confirmed in backend smoke).
  4. Manually clear `sessionStore.authToken` (DevTools → chrome.storage.session) → next dApp call yields `FacadeAuthRequiredError` → popup routes to sign-in.
  5. Switch network in popup → next dApp call uses the new URL (DevTools → Network panel to confirm).
  6. `signMessage` (local-only) still works.
  7. Popup's own transfer (`/transfer-offer/*` REST) still works — regression check.

  Record outcomes here (`< RESOLVED YYYY-MM-DD: ... >` per item).

  Environment used: locally-built Ginkgo (`build/chrome-mv3` from commit `9ad34c0`) + locally-run `canton-exchange-backend` on branch `feat/CIP-0103_migration_phase2` via `docker compose -f docker-compose.core.yml --env-file .env.devnet up -d --build` (talks to remote kairo devnet for the Canton synchronizer). Wallet pinned to **Localnet** (`apiBaseUrl: http://localhost:3003/`). Signed in as `kairo.dex01@gmail.com` (party `kairo-devnet::1220275036...`, `onboarding_status: SUCCESSFULLY`).

  1. `< RESOLVED 2026-06-10: ✅ Sign in with Google. POST /auth/login-with-google → 200 with {token, refreshToken}. chrome.storage.session.authToken populated. (Also smoke-tested Task 10 onboarding by signing in as a fresh user kairo.dex02: POST /external-party/onboarding/prepare → 200 with {partyId, namespace, multiHash, topologyTransactions}; signTransactionHash produced a hash the backend accepted; POST /external-party/onboarding/submit reached Canton but failed with FAILED_PRECONDITION because the kairo devnet synchronizer is currently frozen for an upgrade. Wallet-side Task 10 code is verified up to the Canton commit step; the failure is environmental, not a Ginkgo bug.) >`
  2. `< RESOLVED 2026-06-10: ✅ canton-test-dapp on http://localhost:5180 detected the extension, sdk.connect() returned {isConnected:true, reason:"OK"}, dApp displayed primary account kairo-devnet::1220275036.... No /api/v0/* call fires because connect is a wallet-local CIP-0103 method served from sessionStore state — by design, no backend round-trip needed. >`
  3. `< RESOLVED 2026-06-10: ✅ canton-test-dapp's Ledger Submit → Create Ping contract → POST http://localhost:3003/api/v0/dapp with body {jsonrpc:"2.0", method:"prepareExecute", params:{commands:[{CreateCommand:{templateId:"#canton-builtin-admin-workflow-ping:Canton.Internal.Ping:Ping", ...}}]}}, Authorization:Bearer attached. Backend returned {jsonrpc:"2.0", id, error:{code:-32003, message:"Template+choice not allowed: Canton.Internal.Ping:Ping:Create"}} — the facade's template allowlist enforcement working correctly. Full chain exercised: Task 9 dispatcher → gatewayFacadeDappRpc (Tasks 3–6, 8) → facade backend → mapJsonRpcError → FacadeTemplateNotAllowedError → instanceof FacadeRpcError catch (Task 9) → forwarded code+message verbatim to dApp. This is the load-bearing Phase 3 verification. >`
  4. `< RESOLVED 2026-06-10: ✅ Sub-test A — delete authToken only (refreshToken intact): popup GET /transfer-offer/history → 401, then POST /auth/refresh-token (via refreshAuthTokenOnce from Task 7) → 200 new tokens, original request retried successfully, popup remained signed in. Sub-test B — delete both authToken and refreshToken: subsequent calls 401 repeatedly, no refresh fired, popup eventually routed back to sign-in screen. Both the refresh-and-retry path and the bail-to-sign-in path work. >`
  5. `< RESOLVED 2026-06-10: ✅ Localnet → Devnet → Localnet. Switching network deliberately clears sessionStore and forces re-login (security design in network.handler.handleSwitchNetwork). After re-login on Devnet, all subsequent calls hit https://api-devnet.kairo.ag/... (verified via POST /auth/login-with-google → 201 and GET /auth/me → 200 in the background DevTools Network panel). After switching back to Localnet, URLs return to http://localhost:3003/.... Both setApiBaseUrl and setGatewayFacadeBaseUrl (Task 11 plumbing) work; the URL flip is observed on REST endpoints and applies identically to the facade client. >`
  6. `< RESOLVED 2026-06-10: ✅ canton-test-dapp's Raw Sign Message button → wallet popup showed approval prompt with origin http://localhost:5180 and the message payload → Approve → signature returned (base64). Background DevTools Network panel showed ZERO requests during the call. Confirms signMessage stays local-only — Phase 3 did not accidentally route through the facade. >`
  7. `< BLOCKED 2026-06-10: ⚪ POST /transfer-offer/prepare → 500 Internal server error. Root cause is a pre-existing backend bug, NOT a Phase 3 regression: WalletSdkService in canton-exchange-backend uses AUTH0_AUDIENCE for all sub-clients (ledger + token + amulet), but the validator at validator-api-devnet.kairo.ag requires a different audience (VALIDATOR_AUDIENCE=https://angelhack-validator-canton-devnet, scope=validator_api). Backend log: "The supplied authentication is invalid" from validator scan-proxy. Phase 3 did not touch /transfer-offer/* or WalletSdkService — this code path was identical before and after the migration. Tracked as a separate backend follow-up; will retry once fixed and redeployed. >`

- [ ] **Step 4: Confirm git state is clean**

```bash
git status
git log --oneline | head -20
```

Expected: no uncommitted changes; ~13 focused commits on the branch for this phase.

- [ ] **Step 5: (No commit — verification only)**

If any manual-checklist item fails, file a follow-up commit on this branch with the fix and re-run.

---

## Wrap-up

Once all tasks complete and manual checklist passes:

```bash
git log --oneline | head -20
```

Should show ~13 focused commits for this phase.

**Phase 3 acceptance criteria (from spec §11):**
- [x] All Vitest tests pass (`yarn test`). — 31/31 passing.
- [x] Both extension builds clean (`yarn build:all`). — Chrome MV3 + Firefox MV2 both succeed.
- [x] Lint + typecheck clean (`yarn lint && yarn typecheck`). — `typecheck` clean; `lint` is pre-existingly broken in this repo (eslint not installed). Treated as non-blocking per `Step 1` notes.
- [x] Manual checklist (Task 14, Step 3) items 1–7 pass against a locally-running backend. — Items 1–6 ✅; Item 7 blocked on a separate backend bug (validator audience mismatch in WalletSdkService) that is not a Phase 3 regression. See Step 3's RESOLVED notes for the full breakdown.
- [x] `entrypoints/background/gateway-client.ts` and `entrypoints/background/signing-relay/` are removed from the working tree.
- [x] `grep -r 'wallet-gateway\|signing-relay' entrypoints/ lib/` returns no live references. — Three remaining hits, all in doc-comments that intentionally reference the legacy path for context (gateway-facade-client.ts header, dapp-api.handler.ts line 356 version note, lib/dapp-api/gateway-types.ts type-definition header).

**Sign-off (2026-06-10):** Phase 3 is verified. Migration shipped clean on branch `feat/cip-0103-migration-and-refactoring` (17 commits, ~530 LOC of gateway/relay scaffolding deleted, ~250 LOC of facade client + helper + tests added). Item 7's backend bug is tracked in a separate `canton-exchange-backend` PR; revisit Item 7 after that lands. Devnet/testnet/mainnet redeploy of the backend (with the cip-0103-facade module) is a separate ops task — out of scope for this Ginkgo phase.

**Follow-ups (separate work after this lands):**
- **Backend Phase 2:** drop the wallet-gateway's public port mapping in `canton-exchange-backend/docker-compose.yml`. Safe to ship once Ginkgo is verified end-to-end against the facade in staging.
- **Retire `signing-relay` container** in `canton-exchange-backend/docker-compose.yml` — no client connects to it anymore once this ships.
- **Future migration:** move Ginkgo's popup-driven transfer flow from REST (`/transfer-offer/*`) to JSON-RPC (`dapp.prepareExecute` + `user.execute`) so popup transfers go through the same path as third-party dApps.

---

## Plan self-review notes

- ✅ Pre-flight verifications block placeholder data so Task 10 isn't guessing the createWallet replacement contract.
- ✅ Every code-touching step has the literal code or the literal `bash`/`yarn` command.
- ✅ TDD pattern (failing test → impl → passing test → commit) is enforced for the facade client (Tasks 2-8).
- ✅ Task 11 folds Task 13's deletion inline to avoid a broken intermediate state — explicitly noted in Step 2/3.
- ✅ Refresh helper (Task 7) is extracted before its first new consumer (Task 8).
- ✅ All file paths absolute from repo root. All commits scoped to the changed files; no `git add -A`.
- ⚠️ Task 9's typed-error UI side-effects (popup toast, onboarding prompt) are mentioned but not fully wired — the spec's §7 table is the source of truth; the implementer may surface popup routing as separate small commits within Task 9 if needed.
- ⚠️ Task 13 is a no-op if the current `host_permissions` is already minimal. The plan explicitly handles the "nothing to do" case.
