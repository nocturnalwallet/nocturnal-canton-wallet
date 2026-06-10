# Keystore Mismatch Recovery — Design Spec

**Status:** Draft for review
**Date:** 2026-06-10
**Companion plan:** to be written via `superpowers:writing-plans` after spec approval
**Related work:** Phase 3 CIP-0103 facade migration (`docs/superpowers/specs/2026-06-09-ginkgo-cip-0103-facade-migration-design.md`) — shipped as 0.5.0

---

## 1. Goal

Detect at sign-in time when the wallet's local encrypted keystore holds a private key that does not match the on-synchronizer party's public key, and route the user through a recovery flow before they reach the dashboard. Eliminates the late-binding "Key fingerprint mismatch — your signing key does not match your party ID" error that today only surfaces at the moment of signing a transaction.

## 2. Motivation

During Phase 3 smoke testing, signing as `kairo.dex01@gmail.com` on a device whose local keystore did not match the backend's `party.publicKey` produced the fingerprint-mismatch error at transfer-confirm time (after the user had typed their password). The wallet had no detection of this state at sign-in: it trusted the local `onboardingComplete` flag and routed straight to unlock → dashboard. The user only discovered the mismatch by attempting a transaction, by which point they had a misleading sense of "I am signed in and my wallet works."

This is a real foot-gun in multi-device, reinstalled-extension, and post-reset scenarios:

- **Wrong Google account signed in** — user has key for account A on this device, but signed in with account B's Google identity. The local keystore is fine *for A*, but irrelevant to B.
- **Local keystore drift** — user reinstalled, imported the wrong key, or onboarding was redone on another device and the backend's party row was rotated by `auth.service.ts:registerParty` (which allows publicKey updates in 2 of 3 code paths).
- **Backend reset / migration** — rare, but if the backend party row is replaced, the device's keystore is now stale.

The first-time-on-this-device path is already handled (see `KeySetup.tsx:13` — `isExistingUser = !!existingPublicKey || partyStatus === 'SUCCESSFULLY'` forces the import flow with an amber warning). The missing piece is the **already-onboarded-but-wrong-key** path.

## 3. Scope

### In scope

- Detect at sign-in time (`handleGoogleAuth` after `/auth/me`) when `keystore.walletKey !== party.publicKey`. Return the result in the Google-auth response.
- New popup screen `pages/onboarding/KeyMismatch.tsx` presenting two clear recovery actions.
- Identity card on the mismatch screen showing signed-in email, party identity, and current network.
- "Sign out" recovery path (returns to Welcome; keystore untouched).
- "Wipe and re-import" recovery path with typed-confirmation modal; dispatches a **new narrow background handler** that wipes the user-scoped keystore + flips `onboardingComplete=false` (does **NOT** clear `sessionStore`, so the `partyStatus = 'SUCCESSFULLY'` signal survives the wipe and `handleCompleteOnboarding` continues to short-circuit the party-creation block).
- Persist `keyMismatch` as React state in `App.tsx` so the existing routing `useEffect` respects it across `authState` refetches.
- Reuse of the existing `KeySetup.tsx` existing-user mode + `handleCompleteOnboarding`'s short-circuit (Phase 3 Task 10 already skips party-creation when `partyStatus === 'SUCCESSFULLY'`).
- Unit tests for the new detection logic and the new background handler.

### Out of scope (deferred)

- Detection on popup-open or every unlock (sign-in-only per design decision).
- Expandable diagnostic-info panel showing full publicKey vs walletKey side-by-side (kept in `console.warn` only — sufficient for devtools debugging).
- Backend telemetry / event log of mismatch detections.
- "Can't find your private key?" help text or recovery resources page.
- Password rotation flow distinct from the standard `CreatePassword` step.

### Explicit non-goals

- The wallet does NOT auto-discover or auto-import the correct private key. The user must supply it. If they cannot, their on-synchronizer party is effectively unreachable from this wallet — that is a fundamental property of external-party custody, not something this feature attempts to soften.
- This feature does NOT add a "Re-import key" CTA on the dashboard. The mismatch screen is the only entry point; users in the broken state must sign out and back in to trigger detection.

## 4. Architecture

### Before

```
Google sign-in → handleGoogleAuth
  → /auth/login-with-google ✓
  → /auth/me ✓ (stores party.publicKey, partyStatus in sessionStore)
  → return { onboardingComplete, partyStatus, publicKey, ... }
                ↓
App.tsx state machine:
  if (onboardingComplete) → 'unlock'                        ← stale keystore proceeds undetected
  else                    → 'create-password' → KeySetup    ← existing-user mode handles new-device case
                ↓
Unlock → enter password → 'dashboard' → try to sign
                ↓
        ❌ "Key fingerprint mismatch — your signing key does not match your party ID"
```

### After

```
Google sign-in → handleGoogleAuth
  → /auth/login-with-google ✓
  → /auth/me ✓
  → existingKeystore = await localStore.get('keystore')   // user-scope set inside background
  → keyMismatch = partyStatus === 'SUCCESSFULLY'
                 && party?.publicKey
                 && existingKeystore?.walletKey
                 && existingKeystore.walletKey !== party.publicKey
  → if keyMismatch: console.warn('[Ginkgo] Keystore mismatch detected', {expected: …, actual: …})
  → return { ...existing fields, keyMismatch, partyId, publicKey, ... }
                ↓
Welcome.onSuccess(data) → App.tsx:
  1. If data.keyMismatch:
       setKeyMismatch(true)
       setKeyMismatchPartyId(data.partyId)
       setOnboarding({ partyStatus: data.partyStatus, existingPublicKey: data.publicKey })
       setScreen('key-mismatch')                          ← FIRST check (before onboardingComplete)
       return
  2. Else if data.onboardingComplete: setScreen('unlock')
  3. Else: setOnboarding(...); setScreen('create-password')
                ↓
App.tsx routing useEffect (re-runs on every authState refetch):
  if (loading)             → 'loading'
  if (!isAuthenticated)    → 'welcome'
  if (keyMismatch)         → 'key-mismatch'                ← NEW, checked BEFORE unlock to survive authState refetches
  if (unlocked)            → 'dashboard'
  if (onboardingComplete)  → 'unlock'
  else                     → 'create-password'
                ↓
KeyMismatch screen:
  ┌─ Identity card (email, partyId, network) ─┐
  │  Sign out                                  │ → handleLogout → setKeyMismatch(false) → 'welcome'
  │  Wipe local key and import the correct one │ → ConfirmDeleteModal (typed DELETE)
  └────────────────────────────────────────────┘
                ↓ (on wipe-confirm)
  Dispatch MSG.RESET_KEYSTORE_FOR_RECOVERY → background handleResetKeystoreForRecovery
    Inside the background (where setUserScope was already called for this user):
      await localStore.set('keystore', null)              ← user-scoped wipe
      await localStore.set('onboardingComplete', false)
      // sessionStore intentionally NOT touched — partyStatus stays 'SUCCESSFULLY'
  After the message resolves on the popup side:
    setKeyMismatch(false)                                 ← lifts the routing gate
    setScreen('create-password')                          ← onboarding.existingPublicKey already set
                ↓
CreatePassword → KeySetup (existing-user mode forces import + amber banner)
  → handleValidateImportKey({ privateKey, expectedPublicKey })  ← validates against backend's publicKey
  → Acknowledgment → TypedConfirm                          ← ShowPrivateKey skipped for imports (App.tsx:203)
  → handleCompleteOnboarding({ password, privateKey, publicKey })
      // partyStatus === 'SUCCESSFULLY' (sessionStore was never cleared) so party-creation block is skipped
      // Just: encryptKey → localStore.set('keystore', new bundle) → onboardingComplete: true
                ↓
Unlock → enter password → Dashboard → sign works ✓
```

### Load-bearing properties

1. **One detection point.** Mismatch is computed exactly once per Google sign-in, in `handleGoogleAuth`, after `/auth/me` returns. Not on popup open. Not on unlock. Not on every API call.
2. **`keyMismatch` is persistent React state, not a one-shot `setScreen`.** Stored at the `App.tsx` level so the routing `useEffect` can survive `authState` query refetches without bouncing the user away from the mismatch screen. Cleared explicitly on sign-out and on successful re-import completion.
3. **One new background handler.** `handleResetKeystoreForRecovery` exists ONLY for this narrow purpose: zero out the user-scoped keystore + `onboardingComplete` flag without touching `sessionStore`. We deliberately do **NOT** reuse `handleDeleteKeystore` (`MSG.DELETE_KEYSTORE`) because that one also calls `sessionStore.clear()`, which would erase `partyStatus = 'SUCCESSFULLY'` and cause the subsequent `handleCompleteOnboarding` to fall into the party-creation branch — re-running topology submission against the backend for an already-onboarded user.
4. **The wipe runs in the background context.** All `localStore` writes go through a message to the background handler, where `setUserScope` has already been called during `handleGoogleAuth`. Writing directly from the popup would target an unscoped key (`${network}:keystore` instead of `${network}:${userId}:keystore`) and leave the actual bad keystore intact.
5. **The wipe is committed before re-import.** Once the user types DELETE and confirms, the keystore is zeroed immediately. If the user backs out mid-import, the next sign-in finds no keystore → routes through the existing-user onboarding path (still safe; no mismatch screen since there's no keystore to mismatch).
6. **Per-user-scope.** Wiping affects only the currently-signed-in user's keystore. Other accounts' keystores on this device are untouched.

## 5. Components

### New

| Path | Role |
|---|---|
| `entrypoints/popup/pages/onboarding/KeyMismatch.tsx` | The new mismatch screen. Renders the identity card and two action buttons. Wires the typed-DELETE confirmation flow for the wipe-and-re-import path. Receives `email`, `partyId`, `networkLabel`, and `expectedPublicKey` as props from `App.tsx`. |
| `entrypoints/popup/pages/onboarding/ConfirmDeleteModal.tsx` (NEW — co-located with the page that uses it) | Typed-confirmation modal: requires the user to type a fixed string ("DELETE") to enable the destructive button. Mirrors `TypedConfirm.tsx`'s `isLocalnet` bypass (pre-fill the input on localnet for dev convenience). **Build new** — confirmed: `entrypoints/popup/components/` does not exist, no comparable modal pattern in the codebase. |
| `entrypoints/background/handlers/keystore.handler.ts` — new export `handleResetKeystoreForRecovery` | Narrow recovery wipe. Does exactly: `await localStore.set('keystore', null); await localStore.set('onboardingComplete', false); return ok(null);`. **Critically does NOT clear `sessionStore`** (unlike the existing `handleDeleteKeystore` at lines 285–294, which we explicitly avoid reusing — see §4 load-bearing property 3). |
| `lib/messaging/types.ts` — new `MSG.RESET_KEYSTORE_FOR_RECOVERY` constant + its `MessageRequest`/`MessageResponse` types | One-line per file. No payload needed. |

### Modified

| Path | Change |
|---|---|
| `entrypoints/background/handlers/auth.handler.ts` | After `/auth/me` in `handleGoogleAuth`, read `localStore.get('keystore')` and compute `keyMismatch` using the already-extracted `partyStatus` and `publicKey` variables (do NOT re-read `party.onboardingStatus` to keep the null-safety chain consistent). Return `keyMismatch` in the response payload. `console.warn('[Ginkgo] Keystore mismatch detected', {expected: publicKey.slice(0,12)+'…', actual: existingKeystore.walletKey.slice(0,12)+'…'})` when detected. |
| `lib/messaging/types.ts` | Extend the Google-auth response type (`GoogleAuthData`) with `keyMismatch?: boolean`. |
| `entrypoints/popup/App.tsx` | (1) Add `'key-mismatch'` to the screen union. (2) Add new top-level state `const [keyMismatch, setKeyMismatch] = useState(false)` and `const [keyMismatchPartyId, setKeyMismatchPartyId] = useState('')`. (3) In `Welcome.onSuccess`, check `data.keyMismatch` **FIRST**, before the existing `data.onboardingComplete` branch — set the new state and route to `'key-mismatch'`. (4) Add a routing check `if (keyMismatch) { setScreen('key-mismatch'); return; }` in the screen-selection `useEffect` BEFORE the `lockState.unlocked` and `onboardingComplete` checks, AFTER the auth-required check. Include `keyMismatch` in the effect's dependency array. (5) Wire `KeyMismatch.tsx` into the `renderScreen` switch. (6) Clear `keyMismatch` state on sign-out and after successful re-import (the latter happens implicitly when `setScreen('unlock')` is reached — but explicit `setKeyMismatch(false)` defensively in `TypedConfirm.onNext` or its caller is cleaner). |
| `entrypoints/popup/pages/onboarding/Welcome.tsx` | Forward `keyMismatch`, `partyId`, and (already present) `publicKey` from the auth response into the `onSuccess(data)` callback. The current callback already receives the full `GoogleAuthData` typed object, so this is a type-extension change in `lib/messaging/types.ts` plus a consumer update in `App.tsx`; no code change in `Welcome.tsx` itself if it already forwards `data` whole. |

### Deleted / removed

None. This is additive.

## 6. Data flow

### Flow 1 — Sign-in with mismatched keystore (Path A: Sign out)

```
1. User clicks "Sign in with Google" in Welcome
2. handleGoogleAuth (in background, user-scope is set inside):
   POST /auth/login-with-google {credential} → 200 {token, user}
   sessionStore.setMany({authToken, refreshToken})
   localStore.set('user', user)
   setUserScope(user.id)                                   // user-scope active in background
   GET /auth/me → 200 {data: {party: {publicKey: PK_backend, onboardingStatus: 'SUCCESSFULLY', ...}}}
   sessionStore.set('partyId', partyId)
   sessionStore.set('partyStatus', 'SUCCESSFULLY')
   existingKeystore = await localStore.get('keystore')     // returns {walletKey: PK_local, ...}
   keyMismatch = (partyStatus === 'SUCCESSFULLY') && PK_backend && existingKeystore?.walletKey
                  && existingKeystore.walletKey !== PK_backend
              → TRUE
   console.warn('[Ginkgo] Keystore mismatch detected', {expected: PK_backend.slice(0,12)+'…', actual: PK_local.slice(0,12)+'…'})
   return ok({ token, user, partyId, partyStatus, publicKey: PK_backend, onboardingComplete, keyMismatch: true })
3. Welcome.tsx → onSuccess(data) → App.tsx callback runs:
   FIRST check: if (data.keyMismatch) {
     setKeyMismatch(true)
     setKeyMismatchPartyId(data.partyId)
     setOnboarding({ partyStatus: data.partyStatus, existingPublicKey: data.publicKey })
     setScreen('key-mismatch')
     return
   }
4. KeyMismatch renders with email (data.user.email), partyId (keyMismatchPartyId), network (from useNetwork or NetworkSelector context)
5. authState query refetch fires (from useGoogleAuth's invalidation) → routing useEffect re-runs:
   isAuthenticated=true → keyMismatch=true → setScreen('key-mismatch')  // stays put
6. User clicks "Sign out"
7. dispatch LOGOUT message → handleLogout → clears sessionStore, clears user from localStore, sets unlocked=false
8. The popup's logout handler also calls setKeyMismatch(false) to drop the routing gate (defensive)
9. App.tsx authState effect → !isAuthenticated → setScreen('welcome')
10. User can now sign in with the correct account
```

### Flow 2 — Sign-in with mismatched keystore (Path B: Wipe and re-import)

```
1-5. Same as Flow 1 through KeyMismatch render
     (App.tsx now holds: keyMismatch=true, keyMismatchPartyId=PARTY_ID,
      onboarding.existingPublicKey=PK_backend, onboarding.partyStatus='SUCCESSFULLY')
6. User clicks "Wipe local key and import the correct one"
7. ConfirmDeleteModal opens with body text referencing keyMismatchPartyId (passed as a prop):
   "This will delete your local signing key for ${keyMismatchPartyId}.
    You'll need the correct private key to continue. Type DELETE to confirm."
   On localnet, the textarea is pre-filled with "DELETE" for dev convenience (mirrors TypedConfirm).
8. User types "DELETE" → confirm button enables → click
9. Sequence (popup → background):
   await sendMessage({ action: MSG.RESET_KEYSTORE_FOR_RECOVERY })
   → background:handleResetKeystoreForRecovery (user-scope already set by handleGoogleAuth):
       localStore.set('keystore', null)
       localStore.set('onboardingComplete', false)
       // sessionStore intentionally NOT cleared
   Returns ok(null)
10. Back in App.tsx (on the same wipe-confirm handler, after sendMessage resolves):
    setKeyMismatch(false)                  // lifts the routing gate
    invalidate authState query             // forces a refetch so onboardingComplete reflects the wipe
    setScreen('create-password')           // onboarding.existingPublicKey already holds PK_backend
11. User flows CreatePassword → KeySetup (isExistingUser=true → forced import mode + amber banner)
12. User pastes their correct private key SK_correct
13. handleValidateImportKey({ privateKey: SK_correct, expectedPublicKey: PK_backend }) — already implemented
    Derives PK from SK_correct; compares to PK_backend; compares fingerprint to partyId fingerprint. All must match.
    Returns ok({ privateKey, publicKey })  OR  err('The imported private key does not match …')
14. (Existing) Acknowledgment → TypedConfirm  (ShowPrivateKey skipped at App.tsx:203 because data.isImport=true)
15. TypedConfirm → handleCompleteOnboarding({ password, privateKey, publicKey })
    Inside:
    - encryptKey + localStore.set('keystore', new bundle) ← writes over the null
    - setCachedPrivateKey(privateKey)
    - if (partyStatus !== 'SUCCESSFULLY') { ...party-creation block... }
      // sessionStore.partyStatus is still 'SUCCESSFULLY' (we never cleared it) → block skipped
    - localStore.set('onboardingComplete', true)
    - sessionStore.set('unlocked', true)
    Returns ok({success: true})
16. App.tsx authState effect re-fires (onboardingComplete now true, unlocked now true,
    keyMismatch still false from step 10) → setScreen('dashboard')
17. User can now sign transactions; fingerprint check at signing time passes ✓
```

### Flow 3 — Sign-in with correct keystore (regression — must not break)

```
1-2. Same as Flow 1 up through /auth/me
3. existingKeystore.walletKey === party.publicKey → keyMismatch = FALSE
4. return ok({ ...existing fields, keyMismatch: false })
5. App.tsx sees keyMismatch=false, falls through to existing logic
6. onboardingComplete=true → setScreen('unlock')
7. Unchanged behavior from here
```

### Flow 4 — Sign-in with no local keystore (first-time-on-device — regression)

```
1-2. Same as Flow 1 up through /auth/me
3. existingKeystore = null → keyMismatch = FALSE (the && existingKeystore?.walletKey guard short-circuits)
4. return ok({ ...existing fields, keyMismatch: false, onboardingComplete: false })
5. App.tsx routes through the existing-user onboarding path (CreatePassword → KeySetup with existingPublicKey set)
6. Unchanged behavior from here
```

## 7. Error handling

### Detection-time errors

| Source | Handled how |
|---|---|
| `/auth/me` fails or returns malformed payload | Fall back to existing behavior: `partyStatus = 'PENDING'`, `publicKey = ''`. `keyMismatch` evaluates to `false`. User proceeds through the existing flow; if their keystore was actually broken, they'll discover it at signing time (same as today — degraded UX but not a regression). |
| `/auth/me` returns `party: null` | Same as malformed — `party?.publicKey` is `undefined`, `keyMismatch` short-circuits to `false`. User flows through new-user onboarding. |
| `localStore.get('keystore')` throws (storage corruption) | Catch and treat as "no keystore" → `keyMismatch = false`, `onboardingComplete = false`. User goes through onboarding flow. Acceptable. |
| `existingKeystore.walletKey` is `undefined` (type-level uncertainty) | `lib/storage/schemas.ts` types `walletKey` as `z.string()` (non-optional), but `localStore.get` does NOT validate against the schema — it returns the raw value, which can be `undefined` at runtime if a pre-`walletKey` keystore exists on disk. The `&&` chain in the detection block short-circuits to `false` for this case. User proceeds to unlock and signing fails with the existing fingerprint-mismatch error — same as today's behavior for that pre-`walletKey` cohort, no regression. Migration of those keystores is out of scope. |

### Critical: do not reuse `MSG.DELETE_KEYSTORE` for the wipe

`handleDeleteKeystore` exists at `entrypoints/background/handlers/keystore.handler.ts:285–294` and is the natural-looking choice — but it calls `sessionStore.clear()`, which wipes `authToken`, `refreshToken`, `partyId`, and `partyStatus`. After that, `handleCompleteOnboarding` reads `partyStatus` from `sessionStore` and falls back to its default `'PENDING'`, which causes the party-creation block (`/external-party/onboarding/{prepare,submit}`) to fire — generating a fresh topology transaction for an already-onboarded user. This would either: (a) be rejected by the backend's external-party service because the user already has a party, OR (b) attempt to allocate a NEW party with different keys (depending on backend behavior). Neither outcome is what we want. The new `handleResetKeystoreForRecovery` exists to avoid this trap.

### Recovery-flow errors

| Source | Handled how |
|---|---|
| User types wrong text in confirm modal | Confirm button stays disabled. No destructive action taken. |
| User backs out of import screen after wipe | Keystore is null, onboardingComplete is false. Next sign-in re-triggers the existing-user flow (not the mismatch screen, since there's no keystore to mismatch). They land on CreatePassword → KeySetup → can paste their key. Functionally equivalent. |
| User imports a key that still doesn't match | `handleValidateImportKey` rejects with "The imported private key does not match your account's public key." User stays on KeySetup, can try again. |
| `handleCompleteOnboarding` throws during encrypt/save | Returns `err(...)` to the popup; user sees the error and stays on TypedConfirm. They can retry. |

### Information disclosure

The mismatch screen shows the user their own party identity and email — already visible elsewhere in the popup. No new disclosure surface.

The `console.warn` breadcrumb truncates both keys to 12 characters to avoid bloating logs and to make the warning useful at a glance without exposing full key material.

## 8. Testing

### Unit (Vitest)

New tests in `entrypoints/background/handlers/auth.handler.test.ts` (file may not exist yet — create it). Mock `apiClient.get`, `apiClient.post`, `localStore.get/set`, `sessionStore.setMany/set`.

```
describe('handleGoogleAuth — keystore mismatch detection', () => {
  it('returns keyMismatch: true when keystore.walletKey !== party.publicKey AND party is SUCCESSFULLY')
  it('returns keyMismatch: false when keystore.walletKey === party.publicKey')
  it('returns keyMismatch: false when no keystore exists locally')
  it('returns keyMismatch: false when party.onboardingStatus is PENDING (even if walletKey differs)')
  it('returns keyMismatch: false when party.publicKey is empty string')
  it('returns keyMismatch: false when /auth/me returns party: null')
  it('returns keyMismatch: false when existingKeystore.walletKey is undefined (legacy shape)')
  it('emits console.warn with truncated keys when mismatch detected')
  it('does not throw when localStore.get throws — falls back to keyMismatch: false')
})
```

Plus new tests in `entrypoints/background/handlers/keystore.handler.test.ts` (file may not exist yet — create or extend):

```
describe('handleResetKeystoreForRecovery', () => {
  it('sets keystore to null and onboardingComplete to false')
  it('does NOT clear sessionStore (partyStatus, partyId, authToken untouched)')
  it('does NOT call setUserScope or change the active user-scope')
})
```

Target: ~12 cases, ~200 LOC.

### Manual (post-merge smoke)

1. **Mismatch detection (Path A — sign out):**
   - Sign in as `kairo.dex01@gmail.com` on a device where the local keystore is for a different account (or the wrong key).
   - Expect: KeyMismatch screen with `kairo.dex01@gmail.com`, party identity, network shown.
   - Click "Sign out" → returns to Welcome. `localStore.get('keystore')` still has the (bad) keystore — not wiped.

2. **Mismatch detection (Path B — wipe and re-import):**
   - Same setup as (1).
   - Click "Wipe local key and import the correct one".
   - ConfirmDeleteModal appears with the partyId in the body text. Try typing wrong text — confirm button stays disabled.
   - Type "DELETE" → confirm button enables → click.
   - Land on CreatePassword (existing-user mode). Set a new password.
   - Land on KeySetup (forced import + amber warning shown).
   - Paste the correct private key for `kairo.dex01`.
   - Complete the rest of the onboarding flow.
   - Land on unlock → enter the new password → dashboard.
   - Trigger a `prepareExecute` or transfer-offer signing → succeeds ✓

3. **No regression (correct keystore):**
   - On a device with the matching keystore, sign in.
   - Expect: straight to unlock. No KeyMismatch screen.

4. **No regression (first time on device):**
   - On a device with no keystore, sign in as a previously-onboarded user.
   - Expect: standard existing-user onboarding flow (CreatePassword → KeySetup with import forced). No KeyMismatch screen.

5. **No regression (new user):**
   - Sign in as a brand-new user (no party yet).
   - Expect: standard new-user onboarding flow. No KeyMismatch screen.

## 9. Open questions

1. ~~**Does `ShowPrivateKey.tsx` need to be skipped for imported keys?**~~ **Resolved (audit 2026-06-10):** Confirmed at `App.tsx:203` — `setScreen(data.isImport ? 'acknowledgment' : 'show-key')` — imported keys skip `ShowPrivateKey` unconditionally. No special handling needed in the recovery flow.
2. ~~**Does Ginkgo have an existing modal component to reuse for ConfirmDeleteModal?**~~ **Resolved (audit 2026-06-10):** Confirmed `entrypoints/popup/components/` does not exist. Build a new co-located `ConfirmDeleteModal.tsx` next to `KeyMismatch.tsx` in `entrypoints/popup/pages/onboarding/`.
3. **Is `console.warn` an acceptable telemetry breadcrumb, or should mismatch detection write to a structured log?** Default is plain `console.warn` for V1 — structured logging is a separate concern.
4. **`isLocalnet` pre-fill in the wipe modal.** `TypedConfirm.tsx` pre-fills its typed-confirmation input when running on localnet to ease developer iteration. The new `ConfirmDeleteModal` should mirror this behavior for consistency — included in §5's new-components row but worth flagging.

## 10. Constraints

- TypeScript strict mode; ESLint config unchanged (no new warnings introduced). ESLint is pre-existingly broken in this repo (eslint not installed), so the gate is typecheck only.
- WXT build for both Chrome MV3 and Firefox MV2 must succeed (`yarn build:all`).
- No new dependencies. (`ConfirmDeleteModal` is a small React component built from existing primitives.)
- New page must follow the existing visual style of other onboarding screens (Tailwind classes, `bg-background`, `text-foreground`, etc., per `KeySetup.tsx`).

## 11. Acceptance criteria

- New `KeyMismatch.tsx` page renders correctly with the identity card (email + truncated partyId + network).
- New `ConfirmDeleteModal.tsx` requires the user to type "DELETE" to enable the destructive button; pre-fills the input on localnet (mirrors `TypedConfirm.tsx`).
- `handleGoogleAuth` returns `keyMismatch: true` only when all four conditions hold (party SUCCESSFULLY + non-empty publicKey + local keystore + walletKey mismatch) and `false` in all other cases.
- New `handleResetKeystoreForRecovery` (background) wipes only `localStore.keystore` and `localStore.onboardingComplete`; does NOT clear `sessionStore`.
- `App.tsx` holds `keyMismatch` as React state and the routing `useEffect` checks it BEFORE the `lockState.unlocked` and `onboardingComplete` checks (so the mismatch screen survives `authState` refetches).
- "Sign out" path from the mismatch screen calls existing `handleLogout`, clears the local `keyMismatch` state, and returns to Welcome with the bad keystore intentionally intact in storage.
- "Wipe and re-import" path: ConfirmDeleteModal → `MSG.RESET_KEYSTORE_FOR_RECOVERY` background dispatch → keystore wiped + `onboardingComplete=false` → popup routes through `CreatePassword` → `KeySetup` (existing-user import mode) → `Acknowledgment` → `TypedConfirm` → `handleCompleteOnboarding` (party-creation block skipped because sessionStore.partyStatus is still SUCCESSFULLY) → unlock screen with the freshly-encrypted correct keystore.
- All existing Vitest tests still pass (31 currently); new tests added per §8.
- `yarn typecheck && yarn build:all` clean.
- Manual smoke items 1–5 from §8 all pass.

## 12. Follow-ups (separate work after this lands)

- **"Can't find your private key?" help section** on the mismatch screen — pointer to recovery docs or support contact. Deferred per V1 scope.
- **Expandable diagnostic panel** — show full publicKey / walletKey / partyId fingerprint side-by-side for advanced users or support tickets.
- **Backend mismatch telemetry** — when a mismatch is detected, send a lightweight event to the backend for observability. Currently `console.warn` only.
- **Detection on popup-open** — would catch the rare case where another device or admin rotates the party's publicKey while the user remains signed in on this device. Adds a `/auth/me` call per popup open; deferred until evidence shows this rare path matters.
