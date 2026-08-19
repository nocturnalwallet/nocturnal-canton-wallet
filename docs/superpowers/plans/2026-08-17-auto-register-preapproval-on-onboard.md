# Auto-register TransferPreapproval on onboarding (consume backend rollout flag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the backend advertises `shouldAutoRegisterPreapproval: true` (a server-side rollout switch), the extension silently registers the user's `TransferPreapproval` right after they reach the dashboard — reusing the existing prepare→sign→submit flow and the in-memory cached key, with no password prompt — unless a preapproval already exists.

**Architecture:** The flag rides `GET /auth/me` (the extension already calls it during Google auth). `handleGoogleAuth` persists it into `sessionStore`. A new best-effort background handler `handleMaybeAutoRegisterPreapproval` reads the flag, verifies the in-memory key is cached and no preapproval exists, then calls the already-built `handleRegisterTransferPreapproval`. The popup fires this once on dashboard mount via a new hook + `useEffect` in `Balances.tsx`. Everything is default-off and best-effort: a missing flag ⇒ `false` ⇒ no behavior change; any failure is swallowed and never blocks onboarding or the dashboard.

**Tech Stack:** WXT (Chrome MV3 / Firefox MV2), React 19, TypeScript, TanStack Query, Vitest (node env). Message-passing between popup and background service worker (`MSG.*` actions + handlers + `routeMessage`).

**Spec (cross-repo):** `../kairo-wallet-provider-backend/docs/superpowers/specs/2026-08-17-onboarding-preapproval-fee-recoup-design.md` §1 (client-orchestrated auto-register). The essential design context is inlined below so you do not need to open the other repo.

## Design context (read once)

- The backend cannot sign a user's Canton party — signing is client/extension-driven (keys live in this extension). So "auto-register at onboarding" is realized **in this extension**: the backend only advertises a rollout switch; this extension performs the signed registration.
- The extension does **not** call `/auth/register-party`. It completes onboarding via `/external-party/onboarding/submit` and reads party state via `GET /auth/me`. Therefore the rollout flag is carried on **`/auth/me`** (decided with the maintainer).
- Silent signing is possible: `handleCompleteOnboarding` caches the decrypted private key in memory (`setCachedPrivateKey`, `keystore.handler.ts:129`) and `handleUnlock` does the same (`session.handler.ts:47`). By the time the dashboard mounts, `getCachedPrivateKey()` is populated, so `handleRegisterTransferPreapproval` (which uses only the cached key) needs no password.
- The whole feature already exists piecemeal: `handleRegisterTransferPreapproval` (silent prepare→sign→submit), `handleGetPreapprovalStatus` (idempotency check), and a manual "Register Transfer Pre-Approval" banner in `Balances.tsx`. This plan only adds the automatic trigger, gated by the flag.

## Prerequisite (companion backend change — NOT in this repo)

`GET /auth/me` in `kairo-wallet-provider-backend` must include `shouldAutoRegisterPreapproval: boolean` on its `party` payload (sourced from `AUTO_REGISTER_PREAPPROVAL_ON_ONBOARD`). This ginkgo plan is written to be **forward-compatible**: it reads `party?.shouldAutoRegisterPreapproval === true`, so if the field is absent the flag is `false` and nothing changes. The extension can therefore be merged before the backend serves the field; the feature stays inert until (a) the backend serves the field AND (b) ops sets the env flag to `true`.

## Global Constraints

- **Default-off / forward-compatible:** read `party?.shouldAutoRegisterPreapproval === true`; absent ⇒ `false` ⇒ no behavior change.
- **Silent only:** the auto path uses the in-memory cached key (`getCachedPrivateKey()`); it must **never** prompt for a password. If the key is not cached (locked), skip silently.
- **Idempotent:** before registering, call `handleGetPreapprovalStatus()`; if `hasPreapproval` is true, skip.
- **Best-effort:** the handler must **never throw** — it always resolves with `ok(...)`; any error becomes `{ attempted, registered: false, reason }`. Auto-register must never block onboarding, unlock, or dashboard render.
- **Reuse, do not reinvent:** call the existing `handleRegisterTransferPreapproval` (`keystore.handler.ts:202`). **Do NOT** touch or confuse it with the identically-themed but unrelated `MSG.PREPARE_TRANSFER_PREAPPROVAL` / `MSG.SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL` — those are an Amulet **token transfer** flow (`useTransfer.ts`) that prompts for a password. Wrong target.
- **Git:** no `Co-Authored-By` (or any co-author) trailer. Stage only the files each task names — never `git add -A`.
- **Tests:** Vitest, next to the code (`*.test.ts`), `node` environment, import `{ describe, it, expect, vi, beforeEach }` explicitly from `vitest`. Commands: `yarn test <file>`, `yarn typecheck`, `yarn lint`.

## File Structure

```
MODIFY lib/storage/session.ts                                  # + shouldAutoRegisterPreapproval field & default
MODIFY lib/messaging/constants.ts                              # + MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL
MODIFY lib/messaging/types.ts                                  # + request member, AutoRegisterPreapprovalData, GoogleAuthData field
MODIFY entrypoints/background/handlers/auth.handler.ts         # persist flag from /auth/me, return it
MODIFY entrypoints/background/handlers/auth.handler.test.ts    # assert flag persisted + returned
MODIFY entrypoints/background/handlers/keystore.handler.ts     # + handleMaybeAutoRegisterPreapproval
MODIFY entrypoints/background/handlers/keystore.handler.test.ts# unit tests for the new handler
MODIFY entrypoints/background.ts                               # + routeMessage case
MODIFY entrypoints/popup/hooks/useWallet.ts                    # + useMaybeAutoRegisterPreapproval
MODIFY entrypoints/popup/pages/dashboard/Balances.tsx         # fire on mount, suppress banner while pending
```

---

### Task 1: Carry the rollout flag from `/auth/me` into session + auth response

**Files:**
- Modify: `lib/storage/session.ts`
- Modify: `lib/messaging/types.ts` (`GoogleAuthData`)
- Modify: `entrypoints/background/handlers/auth.handler.ts` (`handleGoogleAuth`, ~lines 121-166)
- Test: `entrypoints/background/handlers/auth.handler.test.ts`

**Interfaces:**
- Consumes: `GET /auth/me` response `data.data.party.shouldAutoRegisterPreapproval?: boolean`.
- Produces: `sessionStore` key `shouldAutoRegisterPreapproval: boolean` (default `false`); `GoogleAuthData.shouldAutoRegisterPreapproval: boolean`.

- [ ] **Step 1: Add the session field.** In `lib/storage/session.ts`, add to `SessionStorageSchema` (after `partyStatus`) and to `DEFAULTS`:

```ts
// in SessionStorageSchema
  shouldAutoRegisterPreapproval: boolean;
```
```ts
// in DEFAULTS
  shouldAutoRegisterPreapproval: false,
```

- [ ] **Step 2: Add the response-type field.** In `lib/messaging/types.ts`, add to `GoogleAuthData` (after `keyMismatch`):

```ts
  shouldAutoRegisterPreapproval: boolean;
```

- [ ] **Step 3: Write the failing test.** In `auth.handler.test.ts`, extend the `mockAuthMe` helper to carry the optional flag, then add a test. (Follow the existing successful-auth test in this file for the OAuth/`fetch`/`launchWebAuthFlow` setup — mirror whatever a passing `handleGoogleAuth` test already does; only the `mockAuthMe` shape and the two assertions below are new.)

```ts
// widen the existing helper's param type:
function mockAuthMe(
  party:
    | { partyId: string; publicKey: string; onboardingStatus: string; shouldAutoRegisterPreapproval?: boolean }
    | null,
) {
  vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { party } } } as any);
}
```
```ts
it('persists and returns shouldAutoRegisterPreapproval from /auth/me', async () => {
  // ...mirror the existing successful-auth arrangement (OAuth + login-with-google mocks)...
  mockAuthMe({ partyId: 'p::1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY', shouldAutoRegisterPreapproval: true });

  const result = await handleGoogleAuth();

  expect(sessionStore.set).toHaveBeenCalledWith('shouldAutoRegisterPreapproval', true);
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.shouldAutoRegisterPreapproval).toBe(true);
});
```
Import `sessionStore` from `@lib/storage` at the top of the test if not already imported.

- [ ] **Step 4: Run — expect FAIL.** `yarn test entrypoints/background/handlers/auth.handler.test.ts`. Expected: the new test fails (`sessionStore.set` not called with the key / `data.shouldAutoRegisterPreapproval` undefined).

- [ ] **Step 5: Implement.** In `auth.handler.ts` `handleGoogleAuth`, right after the existing `const publicKey = party?.publicKey ?? '';` line:

```ts
    const shouldAutoRegisterPreapproval = party?.shouldAutoRegisterPreapproval === true;
```
Then after the existing `await sessionStore.set('partyStatus', partyStatus);`:

```ts
    await sessionStore.set('shouldAutoRegisterPreapproval', shouldAutoRegisterPreapproval);
```
And add to the `return ok({ ... })` object (after `keyMismatch,`):

```ts
      shouldAutoRegisterPreapproval,
```

- [ ] **Step 6: Run — expect PASS**, and re-run the whole file so existing auth tests stay green: `yarn test entrypoints/background/handlers/auth.handler.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/storage/session.ts lib/messaging/types.ts entrypoints/background/handlers/auth.handler.ts entrypoints/background/handlers/auth.handler.test.ts
git commit -m "feat(preapproval): carry auto-register rollout flag from /auth/me into session"
```

---

### Task 2: `handleMaybeAutoRegisterPreapproval` background handler + message wiring

**Files:**
- Modify: `lib/messaging/constants.ts`
- Modify: `lib/messaging/types.ts` (request union + `AutoRegisterPreapprovalData`)
- Modify: `entrypoints/background/handlers/keystore.handler.ts`
- Modify: `entrypoints/background.ts` (`routeMessage` + import)
- Test: `entrypoints/background/handlers/keystore.handler.test.ts`

**Interfaces:**
- Consumes: `sessionStore.get('shouldAutoRegisterPreapproval')`, `sessionStore.get('partyId')`, `getCachedPrivateKey()` (from `./session.handler`), and the existing same-module `handleGetPreapprovalStatus()` / `handleRegisterTransferPreapproval()`.
- Produces: `MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL`; handler `handleMaybeAutoRegisterPreapproval(): Promise<MessageResponse<AutoRegisterPreapprovalData>>`; `AutoRegisterPreapprovalData { attempted: boolean; registered: boolean; reason?: string }`.

- [ ] **Step 1: Add the MSG constant.** In `lib/messaging/constants.ts`, under the `// Transfer pre-approval` group (after `GET_PREAPPROVAL_STATUS`):

```ts
  MAYBE_AUTO_REGISTER_PREAPPROVAL: 'MAYBE_AUTO_REGISTER_PREAPPROVAL',
```

- [ ] **Step 2: Add request + response types.** In `lib/messaging/types.ts`, add to the `MessageRequest` union under the `// Transfer pre-approval` group:

```ts
  | { action: typeof MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL }
```
and add this interface near `PreapprovalStatusData`:

```ts
export interface AutoRegisterPreapprovalData {
  attempted: boolean;
  registered: boolean;
  reason?: string;
}
```

- [ ] **Step 3: Write the failing tests.** Add to `keystore.handler.test.ts`. The existing file mocks `@lib/storage`; this handler also needs `../api-client`, `./session.handler`, and the signing lib mocked. Add these mocks at the top of the file (merge into the existing `@lib/storage` mock — do not duplicate it) and import the new handler:

```ts
vi.mock('../api-client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./session.handler', () => ({ getCachedPrivateKey: vi.fn(), setCachedPrivateKey: vi.fn() }));
vi.mock('@canton-network/core-signing-lib', () => ({
  signTransactionHash: vi.fn(() => 'SIG'),
  getPublicKeyFromPrivate: vi.fn(() => 'PUB'),
  createKeyPair: vi.fn(),
}));

import { handleMaybeAutoRegisterPreapproval, clearPreapprovalCache } from './keystore.handler';
import apiClient from '../api-client';
import { getCachedPrivateKey } from './session.handler';
```

```ts
describe('handleMaybeAutoRegisterPreapproval', () => {
  beforeEach(() => {
    vi.mocked(sessionStore.get).mockReset();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(getCachedPrivateKey).mockReset();
    clearPreapprovalCache(); // reset the 30-min in-memory status cache between tests
  });

  it('does nothing when the rollout flag is off', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? false : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res).toEqual({ success: true, data: { attempted: false, registered: false, reason: 'disabled' } });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('skips (locked) when the private key is not cached', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue(null);

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data.reason).toBe('locked');
    expect(res.success && res.data.attempted).toBe(false);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('skips when a preapproval already exists (idempotent)', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { exists: true } } } as any); // status

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: false, registered: false, reason: 'already-registered' });
    expect(apiClient.post).not.toHaveBeenCalled(); // never prepared/submitted
  });

  it('registers when enabled, unlocked, and no preapproval yet', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { exists: false } } } as any); // status
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any) // prepare
      .mockResolvedValueOnce({ data: {} } as any); // submit

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: true, registered: true });
    expect(apiClient.post).toHaveBeenCalledWith('/wallet/transfer-preapproval/prepare', { partyId: 'p::1' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/wallet/transfer-preapproval/submit',
      expect.objectContaining({ partyId: 'p::1', signature: 'SIG', commandId: 'C' }),
    );
  });
});
```

- [ ] **Step 4: Run — expect FAIL.** `yarn test entrypoints/background/handlers/keystore.handler.test.ts` (import of `handleMaybeAutoRegisterPreapproval` fails / undefined).

- [ ] **Step 5: Implement the handler.** In `keystore.handler.ts`, import the response type and add the handler immediately after `handleGetPreapprovalStatus` (function declarations are hoisted, so referencing the two existing handlers is fine). Extend the existing `import type { ... } from '@lib/messaging'` line to include `AutoRegisterPreapprovalData`:

```ts
export async function handleMaybeAutoRegisterPreapproval(): Promise<
  MessageResponse<AutoRegisterPreapprovalData>
> {
  try {
    const shouldAuto = await sessionStore.get('shouldAutoRegisterPreapproval');
    if (!shouldAuto) {
      return ok({ attempted: false, registered: false, reason: 'disabled' });
    }

    // Silent path only: requires the in-memory key cached at unlock/onboarding.
    if (!getCachedPrivateKey()) {
      return ok({ attempted: false, registered: false, reason: 'locked' });
    }

    // Idempotent: never register if the party already has an active preapproval.
    const status = await handleGetPreapprovalStatus();
    if (status.success && status.data.hasPreapproval) {
      return ok({ attempted: false, registered: false, reason: 'already-registered' });
    }

    const res = await handleRegisterTransferPreapproval();
    if (res.success) return ok({ attempted: true, registered: true });
    return ok({ attempted: true, registered: false, reason: res.error });
  } catch (e: unknown) {
    // Best-effort: never throw out of the auto path.
    return ok({
      attempted: true,
      registered: false,
      reason: e instanceof Error ? e.message : 'auto-register failed',
    });
  }
}
```

- [ ] **Step 6: Wire the route.** In `entrypoints/background.ts`, add `handleMaybeAutoRegisterPreapproval` to the existing import from `./background/handlers/keystore.handler` (the import line that already brings in `handleRegisterTransferPreapproval`, `handleGetPreapprovalStatus`), and add the case under `// Transfer pre-approval` (after the `GET_PREAPPROVAL_STATUS` case):

```ts
    case MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL:
      return handleMaybeAutoRegisterPreapproval();
```

- [ ] **Step 7: Run — expect PASS**, plus typecheck: `yarn test entrypoints/background/handlers/keystore.handler.test.ts && yarn typecheck`.

- [ ] **Step 8: Commit**

```bash
git add lib/messaging/constants.ts lib/messaging/types.ts entrypoints/background/handlers/keystore.handler.ts entrypoints/background/handlers/keystore.handler.test.ts entrypoints/background.ts
git commit -m "feat(preapproval): best-effort auto-register handler gated by rollout flag"
```

---

### Task 3: Fire auto-register on dashboard mount (popup wiring)

**Files:**
- Modify: `entrypoints/popup/hooks/useWallet.ts`
- Modify: `entrypoints/popup/pages/dashboard/Balances.tsx`

**Interfaces:**
- Consumes: `MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL`, `AutoRegisterPreapprovalData` (Task 2).
- Produces: `useMaybeAutoRegisterPreapproval()` mutation hook.

> **Testing note:** this repo runs Vitest in a `node` environment with no React Testing Library / jsdom — popup hooks and components are shipped without unit tests here (the only component test uses `renderToStaticMarkup`). The tested logic lives in Task 2's handler. Task 3 is thin wiring, gated by `yarn typecheck` + `yarn lint` + a manual dev smoke test. Do not stand up a new RTL/jsdom harness for this task.

- [ ] **Step 1: Add the hook.** In `entrypoints/popup/hooks/useWallet.ts`, add `AutoRegisterPreapprovalData` to the `import type { ... } from '@lib/messaging'` line, then add:

```ts
export function useMaybeAutoRegisterPreapproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      sendMessage<AutoRegisterPreapprovalData>({
        action: MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL,
      }),
    onSuccess: (data) => {
      // Only refresh the banner state if we actually registered.
      if (data.registered) {
        queryClient.invalidateQueries({ queryKey: ['preapprovalStatus'] });
      }
    },
  });
}
```

- [ ] **Step 2: Fire once on dashboard mount.** In `entrypoints/popup/pages/dashboard/Balances.tsx`:
  - change the React import to include `useRef`: `import { useState, useEffect, useRef } from 'react';`
  - add `useMaybeAutoRegisterPreapproval` to the existing `useWallet` import.
  - inside `Balances()`, after the existing preapproval hooks, add:

```ts
  const autoRegister = useMaybeAutoRegisterPreapproval();
  const autoRegisterFired = useRef(false);
  useEffect(() => {
    if (autoRegisterFired.current) return;
    autoRegisterFired.current = true;
    autoRegister.mutate(); // best-effort; the handler decides (flag/locked/already/register)
  }, [autoRegister]);
```

- [ ] **Step 3: Suppress the banner flash while auto-register is in flight.** In the `showPreapprovalBanner` expression, add `!autoRegister.isPending &&`:

```ts
  const showPreapprovalBanner =
    !preapprovalLoading &&
    !showSuccess &&
    !autoRegister.isPending &&
    (!preapprovalData || !preapprovalData.hasPreapproval);
```

- [ ] **Step 4: Verify.** `yarn typecheck && yarn lint`. Both clean.

- [ ] **Step 5: Manual dev smoke test.** Document the result in the commit body or PR. With a backend that serves `shouldAutoRegisterPreapproval: true` on `/auth/me` (or temporarily hard-code it in `handleGoogleAuth` locally to test): `yarn dev`, complete onboarding (or unlock an unregistered account), open the dashboard — the pre-approval banner should NOT appear, and `GET /wallet/transfer-preapproval/status` should report the party as preapproved shortly after (no password prompt at any point). With the flag off/absent, behavior is unchanged (banner shows, manual button works).

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup/hooks/useWallet.ts entrypoints/popup/pages/dashboard/Balances.tsx
git commit -m "feat(preapproval): auto-register on dashboard mount when rollout flag is on"
```

---

## Self-Review

**Spec coverage (design context §1 — client-orchestrated auto-register):**
- Flag reaches the extension via `/auth/me` → Task 1. ✅
- Silent registration reusing the existing prepare→sign→submit → Task 2 (calls `handleRegisterTransferPreapproval`). ✅
- Idempotency (skip if preapproval exists) → Task 2 (via `handleGetPreapprovalStatus`). ✅
- Auto-*initiated*, not auto-*approved*, and best-effort/non-blocking → Task 2 (never throws; `locked` path skips silently) + Task 3 (fire-and-forget on mount). ✅
- Default-off / no behavior change until backend serves the field and ops enables it → `?? false` default in Task 1 + `disabled` short-circuit in Task 2. ✅
- Companion backend change (`/auth/me` carries the flag) → documented as Prerequisite (out of this repo). ✅

**Placeholder scan:** every code step has literal code; the only prose-only step is Task 3 Step 5 (manual smoke), which is justified by the repo's node-env test harness limitation and is explicitly not a code step. No "TODO"/"add error handling"/"similar to Task N" left in.

**Type consistency:** `shouldAutoRegisterPreapproval: boolean` is identical across `SessionStorageSchema`, `GoogleAuthData`, and the `/auth/me` read (Task 1). `AutoRegisterPreapprovalData { attempted; registered; reason? }` is defined in Task 2 and consumed unchanged in Task 3's hook. `MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL` is defined (Task 2 Step 1), added to the request union (Task 2 Step 2), routed (Task 2 Step 6), and used by the hook (Task 3 Step 1). The handler name `handleMaybeAutoRegisterPreapproval` is identical in the handler, the background import/case, and the tests.

**Reuse check:** the plan calls the existing `handleRegisterTransferPreapproval` / `handleGetPreapprovalStatus` and adds no duplicate prepare/sign/submit code; the Global Constraints explicitly warn against confusing them with the unrelated Amulet-transfer `PREPARE/SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL` flow.
