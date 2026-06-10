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

- Detect at sign-in time (`handleGoogleAuth` after `/auth/me`) when `keystore.walletKey !== party.publicKey`.
- New popup screen `pages/onboarding/KeyMismatch.tsx` presenting two clear recovery actions.
- Identity card on the mismatch screen showing signed-in email, party identity, and current network.
- "Sign out" recovery path (returns to Welcome; keystore untouched).
- "Wipe and re-import" recovery path with typed-confirmation modal; wipes local keystore + onboardingComplete, then funnels through the existing onboarding-for-existing-user flow.
- Reuse of the existing `KeySetup.tsx` existing-user mode + `handleCompleteOnboarding`'s short-circuit (Phase 3 Task 10 already skips party-creation when `partyStatus === 'SUCCESSFULLY'`).
- Unit tests for the new detection logic.

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
  → existingKeystore = await localStore.get('keystore')
  → keyMismatch = party.onboardingStatus === 'SUCCESSFULLY'
                 && party.publicKey
                 && existingKeystore?.walletKey
                 && existingKeystore.walletKey !== party.publicKey
  → return { ...existing fields, keyMismatch, partyId, publicKey, ... }
                ↓
App.tsx state machine:
  if (keyMismatch)         → 'key-mismatch'                  ← NEW branch
  else if (onboardingComplete) → 'unlock'
  else                     → 'create-password' → KeySetup
                ↓
KeyMismatch screen:
  ┌─ Identity card (email, partyId, network) ─┐
  │  Sign out                                  │ → handleLogout → 'welcome' (keystore untouched)
  │  Wipe local key and import the correct one │ → confirm modal (typed DELETE)
  └────────────────────────────────────────────┘
                ↓ (on wipe-confirm)
  localStore.set('keystore', null)
  localStore.set('onboardingComplete', false)
  setOnboarding({ partyStatus: 'SUCCESSFULLY', existingPublicKey })
  setScreen('create-password')
                ↓
CreatePassword → KeySetup (existing-user mode forces import + amber banner)
  → handleValidateImportKey({ privateKey, expectedPublicKey })  ← validates against backend's publicKey
  → ShowPrivateKey / Acknowledgment / TypedConfirm
  → handleCompleteOnboarding({ password, privateKey, publicKey })
      // partyStatus === 'SUCCESSFULLY' so the party-creation block is skipped
      // Just: encryptKey → localStore.set('keystore', ...) → onboardingComplete: true
                ↓
Unlock → enter password → Dashboard → sign works ✓
```

### Load-bearing properties

1. **One detection point.** Mismatch is computed exactly once per Google sign-in, in `handleGoogleAuth`, after `/auth/me` returns. Not on popup open. Not on unlock. Not on every API call.
2. **No new background handlers.** Detection is inlined into the existing `handleGoogleAuth`. The recovery flow reuses `handleLogout`, `handleValidateImportKey`, `handleCompleteOnboarding` unchanged.
3. **The wipe is committed before re-import.** Once the user types DELETE and confirms, `localStore.keystore` is set to `null` immediately. If the user backs out mid-import, they'll re-trigger the mismatch detection on the next sign-in. The keystore is never in a half-written state.
4. **Per-user-scope.** Wiping affects only the currently-signed-in user's keystore (via `setUserScope(user.id)` already done in `handleGoogleAuth`). Other accounts' keystores on this device are untouched.

## 5. Components

### New

| Path | Role |
|---|---|
| `entrypoints/popup/pages/onboarding/KeyMismatch.tsx` | The new mismatch screen. Renders the identity card and two action buttons. Wires the typed-DELETE confirmation flow for the wipe-and-re-import path. |
| `entrypoints/popup/components/ConfirmDeleteModal.tsx` (or inline equivalent) | Reusable typed-confirmation modal: requires the user to type a configurable string (here "DELETE") to enable the destructive button. Tiny, generic — useful for any future destructive action too. If a similar modal pattern exists in the codebase, prefer reuse over creation. |

### Modified

| Path | Change |
|---|---|
| `entrypoints/background/handlers/auth.handler.ts` | After `/auth/me` in `handleGoogleAuth`, read `localStore.get('keystore')` and compute `keyMismatch`. Return it in the response payload. `console.warn` the mismatch with truncated keys when detected (devtools breadcrumb). |
| `lib/messaging/types.ts` | Extend the Google-auth response type with `keyMismatch?: boolean`. |
| `entrypoints/popup/App.tsx` | Add `'key-mismatch'` to the screen union. Add the routing branch in the post-sign-in handler (highest priority — checked before `onboardingComplete`). Wire the new screen into the `renderScreen` switch. |
| `entrypoints/popup/pages/onboarding/Welcome.tsx` | Forward `keyMismatch` (and `user` if not already passed) from the auth response into `onSuccess` so App.tsx can branch on it. |

### Deleted / removed

None. This is additive.

## 6. Data flow

### Flow 1 — Sign-in with mismatched keystore (Path A: Sign out)

```
1. User clicks "Sign in with Google" in Welcome
2. handleGoogleAuth:
   POST /auth/login-with-google {credential} → 200 {token, user}
   sessionStore.setMany({authToken, refreshToken})
   localStore.set('user', user)
   setUserScope(user.id)
   GET /auth/me → 200 {data: {party: {publicKey: PK_backend, onboardingStatus: 'SUCCESSFULLY', ...}}}
   sessionStore.set('partyId', partyId)
   sessionStore.set('partyStatus', 'SUCCESSFULLY')
   existingKeystore = await localStore.get('keystore')   // returns {walletKey: PK_local, ...}
   keyMismatch = PK_local !== PK_backend → TRUE
   console.warn('[Ginkgo] Keystore mismatch detected', {expected: PK_backend.slice(0,12)+'…', actual: PK_local.slice(0,12)+'…'})
   return ok({ token, user, partyId, partyStatus, publicKey: PK_backend, onboardingComplete, keyMismatch: true })
3. Welcome.tsx onSuccess(data) → App.tsx routing
4. App.tsx sees data.keyMismatch === true → setScreen('key-mismatch')
5. KeyMismatch renders with email/partyId/network
6. User clicks "Sign out"
7. dispatch LOGOUT message → handleLogout → clears sessionStore, clears user from localStore, sets unlocked=false
8. App.tsx authState effect → !isAuthenticated → setScreen('welcome')
9. User can now sign in with the correct account
```

### Flow 2 — Sign-in with mismatched keystore (Path B: Wipe and re-import)

```
1-5. Same as Flow 1 through KeyMismatch render
6. User clicks "Wipe local key and import the correct one"
7. ConfirmDeleteModal opens with copy: "This will delete your local signing key for kairo-devnet::1220…30d. You'll need the correct private key to continue. Type DELETE to confirm."
8. User types "DELETE" → confirm button enables → click
9. Sequence:
   localStore.set('keystore', null)
   localStore.set('onboardingComplete', false)
   setOnboarding({partyStatus: 'SUCCESSFULLY', existingPublicKey: PK_backend})
   setScreen('create-password')
10. User flows CreatePassword → KeySetup (isExistingUser=true → forced import mode + amber banner)
11. User pastes their correct private key SK_correct
12. handleValidateImportKey({ privateKey: SK_correct, expectedPublicKey: PK_backend }) — already implemented
    Derives PK from SK_correct; compares to PK_backend; compares fingerprint to partyId fingerprint. All must match.
    Returns ok({ privateKey, publicKey })  OR  err('The imported private key does not match …')
13. (Existing) onboarding flow: ShowPrivateKey (may be skipped for imported keys) → Acknowledgment → TypedConfirm
14. TypedConfirm → handleCompleteOnboarding({ password, privateKey, publicKey })
    Inside:
    - encryptKey + localStore.set('keystore', bundle) ← overwrites previous null
    - setCachedPrivateKey(privateKey)
    - if (partyStatus !== 'SUCCESSFULLY') { ...party-creation block... }  ← skipped (already SUCCESSFULLY)
    - localStore.set('onboardingComplete', true)
    - sessionStore.set('unlocked', true)
    Returns ok({success: true})
15. App.tsx authState effect re-fires (onboardingComplete now true, unlocked now true) → setScreen('dashboard')
16. User can now sign transactions; fingerprint check at signing time passes ✓
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
| `localStore.get('keystore')` throws (storage corruption) | Catch and treat as "no keystore" → `keyMismatch = false`, `onboardingComplete = false`. User goes through onboarding flow. Acceptable. |
| `existingKeystore.walletKey` is undefined (legacy keystore shape) | The `&&` chain short-circuits to `false`. User proceeds to unlock; signing will fail with the existing mismatch error. This is a known-degraded path for legacy users; documenting only — no special handling. |

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
  it('does not throw when localStore.get throws — falls back to keyMismatch: false')
  it('does not throw when /auth/me returns an empty party — falls back to existing behavior')
})
```

Target: 7 cases, ~150 LOC.

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

1. **Does `ShowPrivateKey.tsx` need to be skipped for imported keys?** The existing flow may already handle this — verify during implementation. If `ShowPrivateKey` shows the imported key back to the user, that's redundant (they just pasted it) but not harmful. Confirm and adjust during the plan-writing step.
2. **Does Ginkgo have an existing modal component to reuse for ConfirmDeleteModal?** Check `entrypoints/popup/components/` during implementation. If yes, reuse; if no, build a tiny one. Either way, low-risk.
3. **Is `console.warn` an acceptable telemetry breadcrumb, or should mismatch detection write to a structured log?** Default is plain `console.warn` for V1 — structured logging is a separate concern.

## 10. Constraints

- TypeScript strict mode; ESLint config unchanged (no new warnings introduced). ESLint is pre-existingly broken in this repo (eslint not installed), so the gate is typecheck only.
- WXT build for both Chrome MV3 and Firefox MV2 must succeed (`yarn build:all`).
- No new dependencies. (`ConfirmDeleteModal` is a small React component built from existing primitives.)
- New page must follow the existing visual style of other onboarding screens (Tailwind classes, `bg-background`, `text-foreground`, etc., per `KeySetup.tsx`).

## 11. Acceptance criteria

- New `KeyMismatch.tsx` page renders correctly with the identity card (email + truncated partyId + network).
- `handleGoogleAuth` returns `keyMismatch: true` only when all four conditions hold (party SUCCESSFULLY + non-empty publicKey + local keystore + walletKey mismatch).
- "Sign out" path returns to Welcome with sessionStore cleared and keystore intact.
- "Wipe and re-import" path wipes keystore + onboardingComplete on confirm, routes through the existing onboarding-for-existing-user flow, lands the user on a working dashboard.
- All existing Vitest tests still pass (31 currently); new keystore-mismatch tests added.
- `yarn typecheck && yarn build:all` clean.
- Manual smoke items 1–5 from §8 all pass.

## 12. Follow-ups (separate work after this lands)

- **"Can't find your private key?" help section** on the mismatch screen — pointer to recovery docs or support contact. Deferred per V1 scope.
- **Expandable diagnostic panel** — show full publicKey / walletKey / partyId fingerprint side-by-side for advanced users or support tickets.
- **Backend mismatch telemetry** — when a mismatch is detected, send a lightweight event to the backend for observability. Currently `console.warn` only.
- **Detection on popup-open** — would catch the rare case where another device or admin rotates the party's publicKey while the user remains signed in on this device. Adds a `/auth/me` call per popup open; deferred until evidence shows this rare path matters.
