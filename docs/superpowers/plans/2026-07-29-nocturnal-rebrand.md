# Nocturnal Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the Ginkgo Canton Network wallet extension into **Nocturnal** (name, logo, coral "night" theme, brand fonts, provider IDs) with all functionality byte-for-byte intact.

**Architecture:** Pure skin over the existing extension. No logic/API/storage/messaging changes. Work happens on the long-lived `nocturnal` branch (already created off `universal-wallet`). Theme is driven entirely by CSS variables in `styles/globals.css` + `styles/options.css`, so component code needs no palette edits. The shared `IconLogo` component is repointed once so all four logo sites update together.

**Tech Stack:** WXT (Chrome MV3 / Firefox MV2), React 19, TypeScript, Tailwind CSS 4 (`@theme inline`), Vitest, `sips`/`openssl` for asset + key generation.

## Global Constraints

- Branch: `nocturnal` (do NOT commit to `universal-wallet`). Pre-existing uncommitted files (`lib/network.ts`, `scripts/`, `.specstory/`, `docs/draft-fix-preapproval-password.md`) are NOT part of this work — never `git add` them; stage only the files each step names.
- No `Co-Authored-By` / co-author trailer in any commit message (per CLAUDE.md).
- Brand accent (primary): coral `#F86858`.
- Brand name string: `Nocturnal`. Package name: `nocturnal-wallet`.
- Brand assets source dir (referred to below as `$BRAND`): `~/Working/FETCH/Angelhack/Canton/_MISC/Nocturnal Branding/Nocturnal Brand Assets`
- Provider-ID rename (`ginkgo`→`nocturnal`) is verified safe against the backend (see spec Risks) — these values are never sent to the gateway.
- Every task ends green on `yarn typecheck` and `yarn lint`. `yarn test` must stay green.
- Tests run in a `node` env with `globals: false` — import `describe/it/expect/vi` from `vitest`.
- Install command uses `yarn install --ignore-engines`.

**Spec:** `docs/superpowers/specs/2026-07-28-nocturnal-rebrand-design.md`

---

### Task 1: Rebrand all "Ginkgo" strings → "Nocturnal"

Pure string swap across identity, user-facing text, provider IDs, log tags, and comments. Does NOT touch the manifest `key` (Task 2) or the palette (Task 3).

**Files:**
- Modify: `package.json:2-3`
- Modify: `wxt.config.ts:8-9,22` (name, description, icon comment — NOT `key`)
- Modify: `lib/dapp-api/types.ts:2,17,21,23,43`
- Modify: `entrypoints/background/handlers/dapp-api.handler.ts:2,11,53,109,195,265,510`
- Modify: `entrypoints/background/handlers/keystore.handler.ts:133,137,153,166`
- Modify: `entrypoints/background/handlers/auth.handler.ts:41,92,147,154`
- Modify: `entrypoints/background.ts:70`
- Modify: `entrypoints/content.ts:5,88`
- Modify: `entrypoints/background/gateway-facade-client.ts:2` (keep the spec path on line 8 unchanged — it is a real filename)
- Modify: `entrypoints/background/handlers/dapp-api.handler.test.ts:211`
- Modify: `entrypoints/options/App.tsx:23,319`
- Modify: `entrypoints/options/index.html:6`
- Modify: `entrypoints/popup/index.html:6`
- Modify: `entrypoints/popup/pages/dashboard/index.tsx:107`
- Modify: `entrypoints/popup/pages/onboarding/Welcome.tsx:100`
- Modify: `entrypoints/popup/pages/dashboard/Transfer.tsx:54,61`
- Modify: `.env`, `.env.example` (VITE_PARTY_HINT)
- Modify: `README.md:1,114,137,225,311,323,593`, `CLAUDE.md:7`

**Interfaces:**
- Produces: `PROVIDER_NAME = 'Nocturnal'` (consumed by the dApp announce path); dApp-API values `signingProviderId: 'nocturnal'` and `provider.id: 'nocturnal'`; default party hint `'nocturnal-wallet'`. No signatures change.

- [ ] **Step 1: Swap identity + provider-ID values (exact replacements)**

Apply these exact string replacements (each is unique in its file):

`package.json`:
```
"name": "ginkgo-wallet",   →  "name": "nocturnal-wallet",
"description": "Ginkgo — Canton Network wallet browser extension with CIP-0103 dApp API support",
  →  "description": "Nocturnal — Canton Network wallet browser extension with CIP-0103 dApp API support",
```

`wxt.config.ts`:
```
name: 'Ginkgo',   →  name: 'Nocturnal',
description: 'Ginkgo — Canton Network wallet browser extension with CIP-0103 dApp API support',
  →  description: 'Nocturnal — Canton Network wallet browser extension with CIP-0103 dApp API support',
// can render Ginkgo's icon from the canton:announceProvider event's
  →  // can render Nocturnal's icon from the canton:announceProvider event's
```

`lib/dapp-api/types.ts`:
```
export const PROVIDER_NAME = 'Ginkgo';   →  export const PROVIDER_NAME = 'Nocturnal';
```
Then swap the word `Ginkgo` → `Nocturnal` in the comments on lines 2, 17, 21, 23.

`entrypoints/background/handlers/dapp-api.handler.ts`:
```
signingProviderId: 'ginkgo',   →  signingProviderId: 'nocturnal',
      id: 'ginkgo',            →        id: 'nocturnal',
```
Then swap `Ginkgo` → `Nocturnal` in the comments on lines 2, 11, 53, 265, 510.

`entrypoints/background/handlers/keystore.handler.ts`:
```
const partyHint = import.meta.env.VITE_PARTY_HINT || 'ginkgo-wallet';
  →  const partyHint = import.meta.env.VITE_PARTY_HINT || 'nocturnal-wallet';
```

`.env` and `.env.example`:
```
VITE_PARTY_HINT=ginkgo-wallet   →  VITE_PARTY_HINT=nocturnal-wallet
```

- [ ] **Step 2: Swap all `[Ginkgo]` log tags → `[Nocturnal]`**

In `entrypoints/background/handlers/keystore.handler.ts` (lines 137,153,166), `auth.handler.ts` (41,92,147,154), `background.ts` (70), `content.ts` (88), replace every `[Ginkgo]` with `[Nocturnal]`, and swap `Ginkgo` → `Nocturnal` in the file-header comments of `content.ts:5` and `gateway-facade-client.ts:2`. Leave `gateway-facade-client.ts:8` (the `docs/.../2026-06-09-ginkgo-...` path) UNCHANGED — it is a real filename.

- [ ] **Step 3: Swap user-facing UI strings + titles**

```
entrypoints/options/App.tsx:23   "Ginkgo Settings"   → "Nocturnal Settings"
entrypoints/options/App.tsx:319  "About Ginkgo"      → "About Nocturnal"
entrypoints/options/index.html:6 <title>Ginkgo — Settings</title>  → <title>Nocturnal — Settings</title>
entrypoints/popup/index.html:6   <title>Ginkgo</title>             → <title>Nocturnal</title>
entrypoints/popup/pages/dashboard/index.tsx:107  >Ginkgo<   → >Nocturnal<
entrypoints/popup/pages/onboarding/Welcome.tsx:100 >Ginkgo<  → >Nocturnal<
entrypoints/popup/pages/dashboard/Transfer.tsx:54,61  'Transfer from Ginkgo' → 'Transfer from Nocturnal'
entrypoints/background/handlers/dapp-api.handler.test.ts:211  comment "Ginkgo" → "Nocturnal"
```

- [ ] **Step 4: Update README.md + CLAUDE.md brand references**

`README.md`: line 1 `# Ginkgo Wallet` → `# Nocturnal Wallet`; line 137 ASCII box `GINKGO EXTENSION` → `NOCTURNAL EXTENSION`; lines 114, 225, 593 `Ginkgo` → `Nocturnal`; line 311 default `ginkgo-wallet` → `nocturnal-wallet`; line 323 `ginkgo/` (repo dir label) → `nocturnal/`.
`CLAUDE.md` line 7: change `Ginkgo is a **Canton Network wallet browser extension**` → `Nocturnal is a **Canton Network wallet browser extension** (a rebranded fork of Ginkgo)`.

- [ ] **Step 5: Verify no stray user-facing "Ginkgo" remains + suite is green**

```bash
cd ~/Working/FETCH/Angelhack/Canton/ginkgo
grep -rniI "ginkgo" entrypoints lib styles README.md CLAUDE.md .env .env.example \
  | grep -v "2026-06-09-ginkgo"   # the historical spec filename is allowed
yarn typecheck && yarn lint && yarn test
```
Expected: the grep prints ONLY the allowed `gateway-facade-client.ts:8` spec-path line (or nothing else). typecheck/lint/test all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json wxt.config.ts lib/dapp-api/types.ts \
  entrypoints/background.ts entrypoints/content.ts \
  entrypoints/background/gateway-facade-client.ts \
  entrypoints/background/handlers/dapp-api.handler.ts \
  entrypoints/background/handlers/dapp-api.handler.test.ts \
  entrypoints/background/handlers/keystore.handler.ts \
  entrypoints/background/handlers/auth.handler.ts \
  entrypoints/options/App.tsx entrypoints/options/index.html \
  entrypoints/popup/index.html \
  entrypoints/popup/pages/dashboard/index.tsx \
  entrypoints/popup/pages/dashboard/Transfer.tsx \
  entrypoints/popup/pages/onboarding/Welcome.tsx \
  .env.example README.md CLAUDE.md
git commit -m "refactor(brand): rename Ginkgo -> Nocturnal across strings, IDs, and docs"
```
(Note: `.env` is typically gitignored — only `.env.example` is committed. Do not force-add `.env`.)

---

### Task 2: New extension key + OAuth redirect walkthrough

Give Nocturnal a distinct extension ID so it can coexist with Ginkgo, and produce the exact OAuth redirect URI to register.

**Files:**
- Modify: `wxt.config.ts` (the `key:` value + its surrounding comment)
- Create (OUTSIDE repo): `~/nocturnal-ext-key.pem` (private key — never commit)
- Create: `docs/nocturnal-oauth-setup.md` (walkthrough deliverable)

**Interfaces:**
- Produces: new manifest `key` (base64 SPKI DER) and the derived extension ID `<ID>` + redirect URI `https://<ID>.chromiumapp.org/`.

- [ ] **Step 1: Generate the keypair and derive ID + redirect URI**

```bash
# Private key stored OUTSIDE the repo — never commit it.
openssl genrsa 2048 > ~/nocturnal-ext-key.pem

echo "=== manifest key (base64 DER public key, paste as-is) ==="
openssl rsa -in ~/nocturnal-ext-key.pem -pubout -outform DER 2>/dev/null | openssl base64 -A; echo

echo "=== extension ID ==="
openssl rsa -in ~/nocturnal-ext-key.pem -pubout -outform DER 2>/dev/null \
  | openssl dgst -sha256 -binary | head -c16 | xxd -p -c 32 | tr '0-9a-f' 'a-p'; echo
```
Record the base64 string as `<KEY>` and the 32-char ID as `<ID>`. Redirect URI = `https://<ID>.chromiumapp.org/`.

- [ ] **Step 2: Set the new key in the manifest**

In `wxt.config.ts`, replace the existing `key: 'MIIBIjAN...kkgksQIDAQAB',` value with `key: '<KEY>',` and update the comment above it to read `// Stable key pins the Nocturnal extension ID so the OAuth redirect URI stays consistent.`

- [ ] **Step 3: Confirm the built manifest carries the new key + ID**

```bash
yarn build
node -e "const m=require('./build/chrome-mv3/manifest.json'); console.log('name:',m.name); console.log('key set:', m.key.slice(0,16)+'...')"
```
Expected: `name: Nocturnal` and the key prefix matches `<KEY>`. Load `build/chrome-mv3` unpacked in `chrome://extensions` and confirm the shown ID equals `<ID>`.

- [ ] **Step 4: Write the OAuth setup walkthrough**

Create `docs/nocturnal-oauth-setup.md` with the concrete steps (substitute the real `<ID>`):
```markdown
# Nocturnal — Google OAuth redirect setup

Nocturnal uses a new extension ID, so the OAuth redirect URI must be registered
before Google sign-in works.

- Extension ID: `<ID>`
- Redirect URI to add: `https://<ID>.chromiumapp.org/`  (include the trailing slash)

Steps:
1. Open https://console.cloud.google.com and select the project that owns the
   OAuth client in `VITE_GOOGLE_CLIENT_ID`.
2. APIs & Services → Credentials.
3. Under "OAuth 2.0 Client IDs", open the client used by the extension.
4. In "Authorized redirect URIs", click "+ Add URI" and paste the redirect URI above.
5. Click Save. Allow a few minutes to propagate.
6. Reload the unpacked extension and test Google sign-in from onboarding.

Until this URI is registered, sign-in will fail with redirect_uri_mismatch;
all non-OAuth flows work normally.
```

- [ ] **Step 5: Commit (manifest + walkthrough only; never the .pem)**

```bash
git add wxt.config.ts docs/nocturnal-oauth-setup.md
git commit -m "feat(brand): distinct Nocturnal extension key + OAuth redirect walkthrough"
```

---

### Task 3: Color palette — "Nocturnal Night"

Replace the "Sovereign Gold" CSS variables in both stylesheets. Token *names* are unchanged, so no component edits.

**Files:**
- Modify: `styles/globals.css` (the `:root {…}` block, lines ~34-64)
- Modify: `styles/options.css` (the duplicate `:root {…}` block)

**Interfaces:**
- Produces: coral `--primary`/`--ring`, warm near-black backgrounds, and a `--destructive` visibly distinct from the coral primary. All existing `--color-*` `@theme inline` mappings keep working unchanged.

- [ ] **Step 1: Replace the `:root` palette in `styles/globals.css`**

Replace the entire `/* Sovereign Gold — Dark theme */ :root { … }` block with:
```css
/* Nocturnal Night — Dark theme */
:root {
  --background: oklch(0.15 0.01 35);            /* #14100E warm near-black */
  --foreground: oklch(0.92 0 0);                /* #E8E8E8 silver */
  --card: oklch(0.19 0.012 35);                 /* #211A17 panel */
  --card-foreground: oklch(0.92 0 0);
  --popover: oklch(0.19 0.012 35);              /* #211A17 */
  --popover-foreground: oklch(0.92 0 0);
  --primary: oklch(0.70 0.175 27);              /* #F86858 Nocturnal coral */
  --primary-foreground: oklch(0.16 0.02 30);    /* dark text on coral */
  --secondary: oklch(0.19 0.012 35);            /* #211A17 */
  --secondary-foreground: oklch(0.92 0 0);
  --muted: oklch(0.19 0.012 35);                /* #211A17 */
  --muted-foreground: oklch(0.65 0.01 40);      /* #9A9088 stone */
  --accent: oklch(0.19 0.012 35);               /* #211A17 */
  --accent-foreground: oklch(0.92 0 0);
  --destructive: oklch(0.52 0.20 20);           /* #B7362C deep red (distinct from coral) */
  --destructive-foreground: oklch(0.92 0 0);
  --border: oklch(0.26 0.015 35);               /* #322824 warm-dark border */
  --input: oklch(0.26 0.015 35);
  --ring: oklch(0.70 0.175 27);                 /* coral focus ring */
  --positive: oklch(0.76 0.17 155);             /* #2ECC71 mint — unchanged */
  --positive-foreground: oklch(0.15 0.01 35);
  --radius: 0.625rem;
}
```

- [ ] **Step 2: Apply the identical `:root` block to `styles/options.css`**

Replace the `:root {…}` block in `styles/options.css` with the exact same variable values as Step 1 (leave the `@import 'tailwindcss';` line and the `@theme inline` mappings in that file untouched).

- [ ] **Step 3: Build and eyeball the theme**

```bash
yarn build
```
Load `build/chrome-mv3` unpacked. Expected: dark warm-black backgrounds; primary buttons/accents are coral `#F86858`; error/destructive text is a deeper red clearly distinct from the coral; mint "positive" amounts unchanged; text legible everywhere.

- [ ] **Step 4: Commit**

```bash
git add styles/globals.css styles/options.css
git commit -m "style(brand): Nocturnal Night palette (coral primary, warm near-black)"
```

---

### Task 4: Typography — bundle Post Grotesk, Futura display stack

**Files:**
- Create: `public/fonts/PostGrotesk-Book.otf`, `PostGrotesk-Medium.otf`, `PostGrotesk-Bold.otf` (copied from `$BRAND`)
- Modify: `styles/globals.css` (add `@font-face` + body/heading font-family)
- Modify: `styles/options.css` (add the same `@font-face` + body font-family)

**Interfaces:**
- Produces: `Post Grotesk` as the UI body font; `--font-display` (Futura-first stack) applied to `h1,h2,h3`.

- [ ] **Step 1: Copy the Post Grotesk font files into `public/fonts/`**

```bash
cd ~/Working/FETCH/Angelhack/Canton/ginkgo
mkdir -p public/fonts
BRAND=~/Working/FETCH/Angelhack/Canton/_MISC/"Nocturnal Branding"/"Nocturnal Brand Assets"
cp "$BRAND/Nocturnal Fonts/Post Grotesk/PostGrotesk-Book.otf"   public/fonts/
cp "$BRAND/Nocturnal Fonts/Post Grotesk/PostGrotesk-Medium.otf" public/fonts/
cp "$BRAND/Nocturnal Fonts/Post Grotesk/PostGrotesk-Bold.otf"   public/fonts/
ls public/fonts
```
(Extension pages load these same-origin from `chrome-extension://<id>/fonts/…`; `web_accessible_resources` is not required for the popup/options pages themselves.)

- [ ] **Step 2: Add `@font-face` + font-family to `styles/globals.css`**

Directly after the `@import 'tailwindcss';` line, add:
```css
@font-face {
  font-family: 'Post Grotesk';
  src: url('/fonts/PostGrotesk-Book.otf') format('opentype');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Post Grotesk';
  src: url('/fonts/PostGrotesk-Medium.otf') format('opentype');
  font-weight: 500; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Post Grotesk';
  src: url('/fonts/PostGrotesk-Bold.otf') format('opentype');
  font-weight: 700; font-style: normal; font-display: swap;
}
```
In the `:root` block (Task 3) add one line:
```css
  --font-display: 'Futura', 'Century Gothic', 'Post Grotesk', system-ui, sans-serif;
```
In the `@layer base` block, change the `body` font-family to Post Grotesk and add a heading rule:
```css
  body {
    @apply bg-background text-foreground;
    font-family: 'Post Grotesk', system-ui, -apple-system, sans-serif;
  }
  h1, h2, h3 {
    font-family: var(--font-display);
  }
```

- [ ] **Step 3: Mirror the `@font-face` + body font-family into `styles/options.css`**

Add the same three `@font-face` blocks after its `@import 'tailwindcss';`, add the `--font-display` line to its `:root`, and set its `body`/heading font-family the same way (add an `@layer base` block if one isn't present).

- [ ] **Step 4: Build and verify fonts load**

```bash
yarn build
ls build/chrome-mv3/fonts
```
Expected: the three `.otf` files are copied into the build. Load unpacked; the UI renders in Post Grotesk (rounded geometric grotesque, visibly different from system default). On macOS, headings render in Futura. Confirm no console 404s for `/fonts/*.otf`.
> Note: Futura is intentionally NOT bundled (it ships only as a `.ttc` collection that loads unreliably via `@font-face`). The display stack falls back to Century Gothic / Post Grotesk where Futura is absent — this is expected and must not block the build.

- [ ] **Step 5: Commit**

```bash
git add public/fonts styles/globals.css styles/options.css
git commit -m "style(brand): bundle Post Grotesk, add Futura display stack"
```

---

### Task 5: Logo & extension icons

Repoint the shared `IconLogo` to the Nocturnal comet brandmark and regenerate toolbar icons. All four `IconLogo` sites (dashboard, Unlock, DappApproval, Welcome) update from the single component change.

**Files:**
- Create: `assets/brand/brandmark.png` (from `$BRAND` brandmark), `assets/brand/wordmark.png` (from `$BRAND` wordmark)
- Modify: `assets/icons/icon-logo.tsx` (render the brandmark `<img>` instead of the gold SVG)
- Modify: `public/icon/16.png`, `32.png`, `48.png`, `96.png`, `128.png` (regenerated)

**Interfaces:**
- Consumes: `IconLogo` is imported by `dashboard/index.tsx:3`, `Unlock.tsx:5`, `DappApproval.tsx:5`, `Welcome.tsx:6` and rendered with a `className` sizing prop (`h-5 w-5` … `h-20 w-20`).
- Produces: `IconLogo(props: React.SVGProps<SVGSVGElement> & { className?: string })` — same call signature; now renders an `<img>` whose `className` (sizing) still applies. Keeping the signature means no caller changes.

- [ ] **Step 1: Copy brand PNGs into `assets/brand/`**

```bash
cd ~/Working/FETCH/Angelhack/Canton/ginkgo
mkdir -p assets/brand
BRAND=~/Working/FETCH/Angelhack/Canton/_MISC/"Nocturnal Branding"/"Nocturnal Brand Assets"
cp "$BRAND/Nocturnal Logo Beta/Nocturnal Brandmark/brandmark_orange.png" assets/brand/brandmark.png
cp "$BRAND/Nocturnal Logo Beta/Nocturnal Wordmark/wordmark_orange.png"   assets/brand/wordmark.png
ls -la assets/brand
```

- [ ] **Step 2: Regenerate toolbar icons from the brandmark**

```bash
BRAND=~/Working/FETCH/Angelhack/Canton/_MISC/"Nocturnal Branding"/"Nocturnal Brand Assets"
SRC="$BRAND/Nocturnal Logo Beta/Nocturnal Brandmark/brandmark_orange.png"
for s in 16 32 48 96 128; do
  sips -s format png -z $s $s "$SRC" --out public/icon/$s.png >/dev/null
done
sips -g pixelWidth -g pixelHeight public/icon/16.png public/icon/128.png
```
Expected: each file reports the intended square size. Open `public/icon/16.png` and confirm the comet mark is still recognizable at 16px; if it looks muddy, re-run using a tighter-cropped source (`brandmark_white.png` on the dark toolbar reads better at small sizes — try it and keep whichever is clearer).

- [ ] **Step 3: Repoint `IconLogo` to render the brandmark**

Replace the entire body of `assets/icons/icon-logo.tsx` with:
```tsx
import brandmark from '@assets/brand/brandmark.png';

export const IconLogo = (props: React.SVGProps<SVGSVGElement> & { className?: string }) => {
  const { className, ...rest } = props;
  return (
    <img
      src={brandmark}
      alt="Nocturnal"
      className={className}
      {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
};
```
This preserves the import path (`@assets/icons/icon-logo`) and the `className` sizing contract, so `dashboard/index.tsx`, `Unlock.tsx`, `DappApproval.tsx`, and `Welcome.tsx` need no changes.

- [ ] **Step 4: Typecheck, build, verify all logo sites + toolbar icon**

```bash
yarn typecheck && yarn build
```
Load unpacked. Expected: toolbar icon is the Nocturnal comet; dashboard header, Unlock, dApp approval, and Welcome all show the comet brandmark at their respective sizes; no broken-image placeholders; no TS errors about the `png` import (WXT/Vite provides an image module declaration — if typecheck complains, add `assets/images.d.ts` with `declare module '*.png';`).

- [ ] **Step 5: Commit**

```bash
git add assets/brand assets/icons/icon-logo.tsx public/icon
# include assets/images.d.ts if you created it
git commit -m "feat(brand): Nocturnal comet logomark + regenerated toolbar icons"
```

---

### Task 6: Onboarding background art

Add the Nocturnal night-skyline backdrop to the Welcome screen with a scrim so text stays legible.

**Files:**
- Create: `public/bg/skyline.png` (from `$BRAND/Nocturnal BG Images/buildings.png`)
- Modify: `entrypoints/popup/pages/onboarding/Welcome.tsx` (root container, line ~97)

**Interfaces:**
- Consumes: the Welcome root `<div className="bg-background flex h-full flex-col items-center justify-between p-6">`.
- Produces: same layout with a background image + dark scrim; children unchanged.

- [ ] **Step 1: Copy the skyline image**

```bash
cd ~/Working/FETCH/Angelhack/Canton/ginkgo
mkdir -p public/bg
BRAND=~/Working/FETCH/Angelhack/Canton/_MISC/"Nocturnal Branding"/"Nocturnal Brand Assets"
cp "$BRAND/Nocturnal BG Images/buildings.png" public/bg/skyline.png
ls -la public/bg
```

- [ ] **Step 2: Apply the background + scrim to the Welcome root**

In `entrypoints/popup/pages/onboarding/Welcome.tsx`, change the root container opening tag from:
```tsx
    <div className="bg-background flex h-full flex-col items-center justify-between p-6">
```
to:
```tsx
    <div
      className="bg-background relative flex h-full flex-col items-center justify-between bg-cover bg-center p-6"
      style={{ backgroundImage: "linear-gradient(to bottom, rgba(20,16,14,0.72), rgba(20,16,14,0.92)), url('/bg/skyline.png')" }}
    >
```
The `linear-gradient` scrim (matching `--background` `#14100E`) keeps the white logo/heading/body text readable over the skyline. No child elements change.

- [ ] **Step 3: Build and verify readability**

```bash
yarn build
```
Load unpacked, open onboarding (Welcome). Expected: dark skyline with coral horizon glow behind the content; the comet logo, "Nocturnal" heading, tagline, network selector, and sign-in button all remain clearly readable. If any text is hard to read, darken the scrim (raise the gradient alphas toward `0.85 → 0.95`).

- [ ] **Step 4: Commit**

```bash
git add public/bg entrypoints/popup/pages/onboarding/Welcome.tsx
git commit -m "feat(brand): Nocturnal skyline backdrop on onboarding"
```

---

### Task 7: Full verification & smoke test

Confirm the whole rebrand builds clean on both targets and behaves identically to Ginkgo apart from branding.

**Files:** none (verification only)

- [ ] **Step 1: Static checks + tests**

```bash
cd ~/Working/FETCH/Angelhack/Canton/ginkgo
yarn typecheck && yarn lint && yarn test
```
Expected: all green.

- [ ] **Step 2: Build both browser targets**

```bash
yarn build:all
node -e "const m=require('./build/chrome-mv3/manifest.json'); console.log(m.name, m.version); console.log('key prefix', m.key.slice(0,12))"
```
Expected: Chrome + Firefox builds succeed; manifest name is `Nocturnal`.

- [ ] **Step 3: Residual-brand grep**

```bash
grep -rniI "ginkgo" entrypoints lib styles README.md CLAUDE.md public assets \
  | grep -v "2026-06-09-ginkgo"
```
Expected: no output beyond the allowed historical spec-path reference.

- [ ] **Step 4: Load-unpacked smoke test**

Load `build/chrome-mv3` unpacked and verify, without touching wallet logic:
- Toolbar icon = Nocturnal comet; hover title/name = "Nocturnal".
- Popup opens on the coral Night theme; header/Welcome show the comet + "Nocturnal".
- Onboarding → Unlock/Welcome navigation works; network selector switches networks.
- Options page (`chrome://extensions` → Details → Extension options) shows "Nocturnal Settings" / "About Nocturnal".
- Google sign-in: the flow *launches*; it will fail with `redirect_uri_mismatch` until the redirect URI from `docs/nocturnal-oauth-setup.md` is registered. Record this as the single known blocker.

- [ ] **Step 5: Final state**

No code changes expected here. If Steps 1-4 surfaced fixes, they were committed in their own task's scope. Confirm `git log --oneline universal-wallet..nocturnal` shows the rebrand commits and the tree is clean (aside from the pre-existing untracked files listed in Global Constraints).

---

## Self-Review

**Spec coverage:**
- Fork setup / branch → Global Constraints + Task 7 Step 5. ✓
- Manifest & package identity → Task 1 (name/desc) + Task 2 (key). ✓
- New extension key + OAuth walkthrough → Task 2. ✓
- Palette "Nocturnal Night" (coral primary, distinct destructive, kept positive) → Task 3. ✓
- Typography (Post Grotesk bundled, Futura display stack w/ fallback) → Task 4. ✓
- Logo & icons from provided PNGs (all IconLogo sites + toolbar) → Task 5. ✓
- Brand background art on onboarding → Task 6. ✓
- Text/string rebrand incl. provider IDs, party hint, log tags, README/CLAUDE → Task 1. ✓
- Verification (typecheck/lint/build/smoke, residual grep, OAuth-blocker note) → Task 7. ✓
- Out-of-scope (no logic changes, historical docs untouched, single OAuth client) → respected; historical spec-path explicitly excluded from grep/edits. ✓

**Placeholder scan:** No TBD/TODO; every edit gives exact before/after strings or full code blocks; commands are concrete. ✓

**Type consistency:** `IconLogo` signature preserved across Task 5 (callers unchanged); CSS token *names* unchanged in Task 3 so `@theme inline` mappings and all components stay valid; `--font-display` defined in Task 3's `:root` extension and consumed in Task 4. ✓
