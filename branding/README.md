# Brand packs

Each subdirectory under `branding/` is a self-contained wallet skin + identity pack.
The core extension (`entrypoints/`, `lib/`, shared `styles/`) stays brand-agnostic and
imports the **active** pack through the Vite/WXT alias `@brand` → `branding/<VITE_BRAND>/`.

## Selecting a brand

```bash
yarn dev                 # VITE_BRAND=ginkgo (default)
yarn dev:nocturnal       # VITE_BRAND=nocturnal
yarn build               # → build/ginkgo-chrome-mv3
yarn build:nocturnal     # → build/nocturnal-chrome-mv3
yarn build:prod          # Ginkgo Mainnet-only (--mode mainnet)
yarn build:prod:nocturnal
yarn build:all-brands    # all four Chrome variants
```

`VITE_BRAND` is independent of WXT `--mode`. Mode stays reserved for Mainnet-only
(`.env.mainnet` → `VITE_MAINNET_ONLY=true`).

## Pack layout

```
branding/<id>/
  brand.ts          # BrandConfig — name, provider IDs, manifest key, networks, partyHintDefault, …
  theme.css         # :root palette + fonts
  icon-logo.tsx     # in-app logo component
  public/           # toolbar icons, optional fonts/, bg/
  assets/           # PNGs imported by icon-logo (optional)
```

`partyHintDefault` is the only onboarding party-hint source (do **not** set `VITE_PARTY_HINT` in `.env` — it would contaminate every brand build).

Shared contract: [`types.ts`](types.ts). Resolver used by `wxt.config.ts` / vitest:
[`resolve.ts`](resolve.ts).

## Adding a brand (e.g. `fox`)

1. Copy `branding/ginkgo/` → `branding/fox/`.
2. Fill `brand.ts` (new `manifestKey` / Chrome extension ID + OAuth redirect).
3. Drop icons/fonts/theme; implement `icon-logo.tsx`.
4. Add `'fox'` to `BrandId` in `types.ts` and to `BRANDS` / `BRAND_IDS` in `resolve.ts`.
5. Add scripts: `dev:fox`, `build:fox`, `build:prod:fox`.
6. Register the OAuth redirect URI for the new extension ID.

## Future core-package split

This folder shape is intentionally the same as future packages:

```
packages/core/             # brand-agnostic extension
packages/brand-ginkgo/     # today's branding/ginkgo
packages/brand-nocturnal/
apps/extension/            # thin WXT app wiring brand + core
```

Prefer publishing core as a semver npm package over git submodules when/if brands
move to separate repos.
