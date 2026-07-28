# Nocturnal Rebrand — Design

**Date:** 2026-07-28
**Branch:** `nocturnal` (forked from `universal-wallet`, same repo)
**Status:** Approved design, pending implementation plan

## Goal

Rebrand the Ginkgo Canton Network wallet extension into **Nocturnal**, adopting the
Nocturnal visual identity (coral accent, night theme, comet logomark, brand fonts)
while keeping **all functionality byte-for-byte intact**. This is a skin, not a
refactor: no changes to messaging, signing, dApp-API behavior, storage, or networks.

The fork is maintained as a long-lived branch `nocturnal` off `universal-wallet` so
upstream fixes can be merged in later.

## Brand reference

Source assets: `~/Working/FETCH/Angelhack/Canton/_MISC/Nocturnal Branding/Nocturnal Brand Assets`

- **Accent color:** coral `#F86858` (extracted from `wordmark_orange.png`).
- **Aesthetic:** "nocturnal" / night — dark near-black backgrounds, warm coral glow.
- **Logomark:** comet / shooting-star mark (`Nocturnal Brandmark/brandmark_orange.png`,
  `brandmark_orange-glow.png`).
- **Wordmark:** pixel-matrix lowercase "nocturnal" + vertical "BETA"
  (`Nocturnal Wordmark/wordmark_*.png`).
- **Logo lockup:** brandmark + wordmark (`Nocturnal Logo/logo lockup_*.png`).
- **Fonts:** Post Grotesk (body/UI), Futura (display/headings) — `Nocturnal Fonts/`.
- **Background art:** `Nocturnal BG Images/` (buildings, moon, night scenes).

## Decisions (confirmed with user)

1. **Fork strategy:** long-lived branch `nocturnal` in this repo.
2. **Depth:** full visual identity (name, logo, palette, night theme, fonts, brand art).
3. **Extension identity:** **new** manifest `key` → distinct extension ID (Nocturnal can
   coexist with Ginkgo). Requires OAuth redirect re-registration (see below).
4. **Logo integration:** use the provided PNGs directly (generate required icon sizes).
5. **Provider IDs:** rename dApp-API `signingProviderId`/`id` from `ginkgo` → `nocturnal`,
   and the onboarding party hint default `ginkgo-wallet` → `nocturnal-wallet`.
6. **OAuth:** register the new redirect URI; the implementation will output the exact
   extension ID + redirect URI and a step-by-step Google Cloud Console walkthrough.

## Scope of changes

### 1. Manifest & package identity
- `wxt.config.ts`: `name` `Ginkgo`→`Nocturnal`; `description` updated; regenerate `key`
  (new RSA-2048 public key); update the icon-fetch comment. `web_accessible_resources`
  icon exposure kept (now serves Nocturnal icons to dApp wallet pickers).
- `package.json`: `name` `ginkgo-wallet`→`nocturnal-wallet`; `description` updated.

### 2. New extension key + OAuth
- Generate a fresh RSA-2048 keypair; the base64 SPKI DER public key becomes the manifest
  `key`. Derive the extension ID (sha256 of the DER public key, first 32 hex nibbles
  mapped `0-9a-f`→`a-p`).
- Redirect URI = `https://<extension-id>.chromiumapp.org/`.
- **Deliverable:** print the extension ID + redirect URI, plus a Google Cloud Console
  walkthrough: APIs & Services → Credentials → the OAuth 2.0 Client → Authorized redirect
  URIs → add the new URI → Save. Also update any `VITE_GOOGLE_CLIENT_ID` note if the fork
  should use its own client (kept as-is unless user requests a separate client).
- Until registered, Google login fails under the new ID; all non-OAuth flows work.

### 3. Color palette — "Nocturnal Night" (`styles/globals.css`, `styles/options.css`)
Replace the "Sovereign Gold" `:root` variables:
- `--primary`: gold → coral `#F86858` (oklch equivalent). `--ring` follows `--primary`.
- `--primary-foreground`: dark text tuned for legibility on coral.
- `--background`, `--card`, `--popover`, `--secondary`, `--muted`, `--accent`: shift from
  navy toward a truer night near-black with a faint warm tint; keep enough separation
  between background and card for depth.
- `--border`, `--input`: subtle warm-dark borders that read on the new background.
- `--destructive`: shift to a **distinct deep red** so error states are visually separate
  from the reddish coral primary. `--destructive-foreground` kept light.
- `--muted-foreground`: neutral stone kept (verify contrast on new background).
- `--positive` mint green: kept.
All theme token *names* stay identical, so no component code needs palette edits.

### 4. Typography (`styles/globals.css`)
- Add `@font-face` for **Post Grotesk** (Book/Medium/Bold, + italics as available) from
  bundled `.otf` files placed under `assets/fonts/` (imported so Vite fingerprints them).
- Body/UI `font-family` → Post Grotesk, fallback `system-ui, -apple-system, sans-serif`.
- **Futura** for display/headings: add a `--font-display` and apply to the main
  wordmark/heading spots. Futura ships as a `.ttc` collection; if the `.ttc` does not load
  reliably via `@font-face`, fall back to a geometric-sans stack
  (`'Futura', 'Century Gothic', system-ui`) — headings still render, just less exact.
  This fallback is acceptable and must not block the build.

### 5. Logo & icons (use provided PNGs)
- Extension toolbar icons `public/icon/{16,32,48,96,128}.png`: regenerate from
  `brandmark_orange.png` (colored mark reads on both light and dark toolbars). Use `sips`
  to resize; verify each size renders (comet mark stays legible at 16px — if not, use a
  simplified/cropped source at small sizes).
- In-app logo: copy the wordmark + logo-lockup PNGs into `assets/` and replace the gold
  ginkgo SVG (`assets/icons/icon-logo.tsx`) usages:
  - `entrypoints/popup/pages/dashboard/index.tsx` header (`Ginkgo` h1 + logo).
  - `entrypoints/popup/pages/onboarding/Welcome.tsx` (`Ginkgo` h1 + logo).
  - `entrypoints/options/App.tsx` ("Ginkgo Settings", "About Ginkgo").
  `icon-logo.tsx` is either repointed to render the Nocturnal PNG or left unused; no
  dangling imports.

### 6. Text / string rebrand
Swap "Ginkgo" → "Nocturnal" across user-facing and log strings:
- `lib/dapp-api/types.ts`: `PROVIDER_NAME = 'Nocturnal'`; comments.
- `entrypoints/background/handlers/dapp-api.handler.ts`: `signingProviderId: 'nocturnal'`,
  `id: 'nocturnal'`, `[Ginkgo]`→`[Nocturnal]` log tags, comments.
- `entrypoints/background/handlers/keystore.handler.ts`: default party hint
  `ginkgo-wallet`→`nocturnal-wallet`; log tags.
- `entrypoints/background.ts`, `entrypoints/content.ts`,
  `entrypoints/background/handlers/auth.handler.ts`,
  `entrypoints/background/gateway-facade-client.ts`: `[Ginkgo]` log tags + comments.
- `entrypoints/popup/index.html`, `entrypoints/options/index.html`: `<title>`.
- `entrypoints/popup/pages/dashboard/Transfer.tsx`: transfer `reason` strings.
- `README.md`: project name/description. `CLAUDE.md`: project name line (keep the
  architecture docs otherwise unchanged; a one-line note that Nocturnal is a Ginkgo fork
  is optional).

### 7. Brand background art (nice-to-have, within full identity)
- Apply a Nocturnal night BG image to the Welcome/onboarding screen for atmosphere, sized
  to not hurt readability (overlay/scrim as needed). Skip anywhere it reduces legibility.

## Out of scope
- Any logic, API, storage, network, or messaging behavior change.
- Historical design docs under `docs/` that mention Ginkgo (left as historical record).
- A separate Google OAuth **client** (reuse existing client; only the redirect URI is
  added) unless the user later requests one.

## Verification
1. `yarn typecheck` — clean.
2. `yarn lint` — clean.
3. `yarn build` — succeeds; inspect `build/chrome-mv3/manifest.json` for new name/key.
4. Load-unpacked smoke test: toolbar icon is the Nocturnal comet; popup renders coral
   night theme with Nocturnal wordmark; Welcome/onboarding and Unlock screens reachable;
   options page shows Nocturnal. Google login is expected to fail until the redirect URI
   is registered — verify the flow *starts* and note the OAuth step as the only blocker.
5. Confirm no remaining user-facing "Ginkgo" strings (`grep -ri ginkgo` over `entrypoints/`,
   `lib/`, `styles/`, excluding historical `docs/`).

## Risks
- **OAuth downtime** under the new key until the redirect URI is registered — mitigated by
  the walkthrough deliverable.
- **Provider-ID rename** (`ginkgo`→`nocturnal`) could break gateway calls if the backend
  validates the value. Mitigation: exercise a connect/sign flow against the backend during
  verification; if it rejects `nocturnal`, revert those two identifiers to `ginkgo`
  (visual rebrand still stands).
- **Futura `.ttc`** may not load via `@font-face` — fallback geometric-sans stack, must not
  block build.
- **16px icon legibility** for the detailed comet mark — use a simplified source at small
  sizes if needed.
