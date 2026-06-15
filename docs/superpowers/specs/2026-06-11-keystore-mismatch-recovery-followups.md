# Keystore Mismatch Recovery — Follow-ups

Captured during implementation, code review, and final audit of the `feat/keystore-mismatch-recovery` branch (merged from `feat/keystore-mismatch-recovery` into `universal-wallet`, commit tip `c4d7d0c`). None of these block the feature as shipped — they're deferred work for future PRs.

**Related artifacts:**
- Design spec: `docs/superpowers/specs/2026-06-10-keystore-mismatch-recovery-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-10-keystore-mismatch-recovery.md`

---

## A. Spec §12 deferrals (explicitly scoped out of the original PR)

| # | Item | Notes | Effort |
|---|------|-------|--------|
| A1 | "Can't find your private key?" help text on the mismatch screen | Needs UX copy and a doc-link target. Wait until support docs exist. | XS |
| A2 | Expandable diagnostic panel — full `publicKey` vs `walletKey` side-by-side | Useful for support debugging. Truncated keys in console suffice for now. | S |
| A3 | Backend mismatch telemetry | Requires a backend endpoint and privacy review — party identifiers are sensitive. | M |
| A4 | Detection on popup-open (not just sign-in) | Catches tampering introduced after sign-in. Needs `/auth/me` in `handleGetAuthState`, adds a network round-trip per popup open. | M |
| A5 | Password rotation flow distinct from `CreatePassword` | Currently reuses `CreatePassword` — fine but not semantically accurate ("change password" ≠ "create password"). | S |
| A6 | Dashboard "Re-import key" CTA | Lets users trigger the wipe-and-import flow voluntarily, not just on detected mismatch. | S |

---

## B. Code-review findings deferred during implementation

| # | Item | Source | Effort |
|---|------|--------|--------|
| B1 | Wrap `onSignOut` LOGOUT dispatch in try/catch (`entrypoints/popup/App.tsx:196-201`) | Task 7 review. Pre-existing pattern also at `App.tsx:158-162` (`CreatePassword.onReset`). Fix both together. | XS |
| B2 | Move `localStore.get('keystore')` inside the cheap-guard `if` in `handleGoogleAuth` (`entrypoints/background/handlers/auth.handler.ts:137-155`) | Task 4 review. Saves one storage read per non-mismatch sign-in. Negligible cost but cleaner intent. | XS |
| B3 | Add `DEACTIVATED` party-status test case to `auth.handler.test.ts` | Task 4 review. The guard `=== 'SUCCESSFULLY'` correctly handles it; just no pinned test. | XS |
| B4 | Extract `detectKeystoreMismatch(partyStatus, publicKey)` helper from `handleGoogleAuth` | Task 4 review. `handleGoogleAuth` is now ~130 lines. Helper would let mismatch logic be unit-tested without mocking the full OAuth flow. | S |
| B5 | Lock console.warn truncation regex to `/^.{12}…$/` in `auth.handler.test.ts` test #8 (currently `/^.{1,16}…$/`) | Task 4 review. Tighter assertion catches future drift in the truncation length. | XS |
| B6 | Consolidate the three `keyMismatch*` `useState` calls into `useState<{partyId, email} \| null>(null)` (`App.tsx:84-86`) | Task 7 review. Removes dual source of truth between the boolean flag and the data strings. | S |
| B7 | Use a `Record<NetworkId, string>` lookup for `networkLabel` instead of the four-deep ternary (`App.tsx:184`) | Task 7 review. Readability only. | XS |
| B8 | Add `aria-hidden="true"` to decorative Lucide icons in `KeyMismatch.tsx` identity card | Task 6 review. Pre-existing pattern gap across the codebase. Worth a project-wide pass. | S |
| B9 | Add the tautological "does NOT call setUserScope" test for `handleResetKeystoreForRecovery` | Spec audit. Low value (handler doesn't import `setUserScope`) but pins the invariant. | XS |
| B10 | Popup integration tests for the `key-mismatch` screen routing | Task 7 review. The routing `useEffect` + `onWipeSuccess` + `onSignOut` callbacks have zero automated coverage. Pre-existing gap for all popup screens. | M |

---

## C. Tangentially surfaced — broader concerns

| # | Item | Where it came up | Effort |
|---|------|------------------|--------|
| C1 | **ESLint broken in the repo** — `yarn lint` fails because eslint isn't installed in `node_modules`. Brief explicitly said to skip it across all 8 tasks. | All tasks. | S |
| C2 | **PBKDF2 iterations on the low end** — 100 000 SHA-256 iterations (`entrypoints/background/encryption/webcrypto.ts:3`). OWASP-2023 recommends 600 000 for SHA-256 or Argon2id. Worth raising before production launch. Migration requires re-encrypting existing keystores on next unlock. | Surfaced during the security Q&A about the keystore JSON shape. | M |
| C3 | **Inconsistent keystore-wipe APIs** — `handleDeleteKeystore` uses `localStore.remove('keystore')`, new `handleResetKeystoreForRecovery` uses `localStore.set('keystore', null)`. Semantically equivalent for current consumers (all use `if (!keystore)` checks) but inconsistent. Pick one convention. | Task 2 review. | XS |
| C4 | **No tests for popup `useEffect` routing logic** — fragile to refactor. A thin test harness for `App.tsx` would pay off as the screen graph grows. Overlaps with B10 but broader scope. | Task 7 review. | M |

---

## D. UX issues surfaced during smoke testing

Issues observed when smoke-testing subsequent work against the merged feature. Pre-existing — not introduced by `feat/keystore-mismatch-recovery` — but documenting here because the recovery flow shares the same code paths.

| # | Item | Where it came up | Effort |
|---|------|------------------|--------|
| D1 | **Onboarding tab closes after OAuth for already-onboarded users** — when a user with a complete keystore signs in via Google in the full onboarding tab, the tab calls `window.close()` (`entrypoints/popup/App.tsx:144`, branch `IS_ONBOARDING_TAB && onboardingComplete && !postWipeRecovery`). The user must then click the extension icon to open the smaller popup and enter their password. UX is jarring — they just authed in a full tab, then have to chase the popup to unlock. Options: (a) keep the tab open and render `<Unlock>` inline; (b) auto-open the popup programmatically after closing the tab; (c) only close the tab on first-time setup, not on re-auth. | Smoke test of `chore/eslint-setup` against the unlock + dashboard flow (2026-06-10). | S–M |

---

## E. Suggested grouping if filing tickets

1. **Mismatch recovery polish** — A1, A2, A6 (UX additions, small).
2. **Mismatch detection on popup open** — A4 (needs design: refetch cadence, debouncing, idle handling).
3. **App.tsx state-machine hardening** — B1, B6, B7, B10, D1 (cohesive cleanup of the popup root component — D1 also lives in `App.tsx`).
4. **Crypto hardening** — C2, C3 (needs careful migration plan).
5. **Repo hygiene** — C1, B8 (low effort, broad benefit).
6. **Test coverage gaps** — B3, B4, B5, B9, C4.

---

## F. Out of scope for this list

Things that came up but aren't worth tracking:

- **`success` vs `ok` discriminator mismatch in plan snippets** — already adapted at implementation time. The plan's stale convention is a documentation issue in the plan itself, not the codebase.
- **`postWipeRecovery` flag in `App.tsx`** — already merged as a coherent fix (commit `c4d7d0c`). Not a follow-up.
- **Direct `chrome.runtime.sendMessage` in `KeyMismatch.tsx`** — intentional, mirrors `useFaucet.ts`. The `sendMessage` wrapper's throw-based contract makes it incompatible with response-shape inspection. Not worth changing.
