# Transfer Prepare Fee Display — Design Spec

**Status:** Draft for review  
**Date:** 2026-08-11  
**Companion plan:** to be written via superpowers:writing-plans after spec approval  
**Backend counterpart:** `kairo-wallet-provider-backend` `FeeLine` / `FeeBlock` in `src/modules/transfer/traffic-fee.types.ts`

---

## 1. Goal

Show the estimated transfer fee from an optional prepare-response `fee` block on the Transfer confirm step, so users see what they will pay before entering their password and signing.

## 2. Motivation

When traffic fee is enabled, `POST /transfer-offer/prepare` may return a `fee` object alongside `preparedTransaction` / hash fields. Today the Transfer confirm UI only shows token, amount, and recipient. Users cannot see wallet + network fee before signing.

## 3. Scope

### In scope
- Type the optional prepare `fee` payload in the extension (display-relevant subset of backend `FeeBlock`).
- Add a reusable presentational `PreparedFeeSection` component (total + line items).
- Mount it on the Transfer confirm step between the details card and “Password to sign”, only when `fee` is present.
- Light unit/render tests for the component.

### Out of scope (deferred — leave room for C)
- Offer approve / reject / withdraw confirm UIs.
- dApp CIP-0103 signing surfaces.
- Showing `costEstimation` breakdown (bytes, USD rates, etc.).
- Collection-path metadata (`collection`, `requestedCollection`, `collected`, `feeRefundable`).
- Changing prepare/submit handlers or fee collection behavior (display-only).

### Explicit non-goals
- No new backend calls; fee comes from the existing prepare response.
- No amount reformatting beyond displaying backend strings with `currency`.

---

## 4. Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Detail level | Total + line items (Approach B) | Matches prepare payload; clearer than total-only without costEstimation clutter |
| Rollout surface | Transfer confirm only (A), reusable for later C | Smallest useful change; shared component avoids rework |
| Architecture | Shared types + `PreparedFeeSection` | Drop-in for offers / other confirms later |
| Type fidelity | Mirror display fields from backend; omit collection fields | UI does not need collection-path metadata |

---

## 5. Data model

Frontend types align with backend display fields (names match `traffic-fee.types.ts` where kept):

```ts
export interface FeeLine {
  description: string;
  amount: string;
  receiverPartyId: string;
  type: string | null;
}

export interface FeeBlock {
  currency: string;
  fees: FeeLine[];
  totalFee: string;
  costEstimation?: {
    confirmationRequestBytes: number;
    confirmationResponseBytes: number;
    rateUsdPerMb: string;
    amuletPriceUsd: string;
    trafficBufferBps: string;
    networkFeeAmulet: string;
  };
}
```

Attach `fee?: FeeBlock` to:

- `PrepareTransferResponse`
- `PrepareTransferTokenStandardResponse`

**Omitted from frontend types:** `collection`, `requestedCollection`, `collected`, `feeRefundable`. Extra JSON keys from the API are ignored at runtime.

**Location:** `lib/types/transfer.ts` (or `lib/types/fee.ts` re-exported from `lib/types/index.ts`). Prefer co-locating with prepare response types unless the file grows awkwardly.

Background handlers already return `data.data` as `preparedData`; no handler changes required for typing/UI.

---

## 6. UI

### Component: `PreparedFeeSection`

- Path: `components/common/PreparedFeeSection.tsx`
- Props: `{ fee: FeeBlock }`
- Returns `null` when there is nothing to show (`!totalFee` and `fees.length === 0`), so callers can keep a simple `preparedData?.fee && …` gate.
- Visual style: same row pattern as the Transfer confirm details card (`text-muted-foreground` labels, `text-foreground` values, `bg-secondary` / `rounded-xl` container).
- Content:
  - Section title: “Estimated fee”
  - One row per `fee.fees[]`: `description` | `{amount} {currency}`
  - Total row (when `totalFee` present): “Total” | `{totalFee} {currency}` (slightly emphasized)
- Do not render `receiverPartyId`, `type`, or `costEstimation`.

### Placement in `Transfer.tsx` (confirm step)

```
[Confirm Transfer details card]
[PreparedFeeSection]   ← only if preparedData.fee is present and displayable
[Password to sign]
[Cancel | Sign & Send]
```

Parent gates rendering:

```tsx
{preparedData?.fee && <PreparedFeeSection fee={preparedData.fee} />}
```

---

## 7. Edge cases

| Case | Behavior |
|------|----------|
| `fee` absent (backend fee off) | Hide section; UI unchanged from today |
| `fees` empty and no usable `totalFee` | Hide section |
| Fee currency ≠ transfer token | Always label amounts with `fee.currency` |
| Prepare/submit errors | Unchanged; fee does not affect signing flow |

---

## 8. Testing

- Vitest render test for `PreparedFeeSection`:
  - Renders line items + total with currency
  - Parent/conditional path: section not shown when `fee` is undefined (covered by Transfer usage or a thin wrapper assertion)
- No Playwright E2E for this pass.

---

## 9. Files touched

1. `lib/types/transfer.ts` (and exports) — `FeeLine`, `FeeBlock`, optional `fee?` on prepare responses  
2. `components/common/PreparedFeeSection.tsx` (+ colocated `PreparedFeeSection.test.tsx`)  
3. `entrypoints/popup/pages/dashboard/Transfer.tsx` — mount between details and password  

---

## 10. Path to later C

Any prepare→sign confirm that already holds `preparedData` with optional `fee` can mount:

```tsx
{prepared?.fee && <PreparedFeeSection fee={prepared.fee} />}
```

No second fee component. Richer disclosure (`costEstimation`, refundable warnings) can extend the same component behind optional props without changing Transfer’s default.

---

## 11. Open questions

None — resolved during brainstorming (detail level B, surface A with reusable component, omit collection fields).
