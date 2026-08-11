# Transfer Prepare Fee Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show optional prepare-response transfer fees (total + line items) on the Transfer confirm step via a reusable `PreparedFeeSection`.

**Architecture:** Mirror backend display fields as `FeeLine` / `FeeBlock` on prepare response types. Present fees with a shared presentational component that returns `null` when there is nothing to show. Mount it only in `Transfer.tsx` confirm for now; other prepare→sign surfaces can reuse the same component later.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest 4 (`environment: 'node'`). Component tests use `react-dom/server` `renderToStaticMarkup` (no Testing Library / jsdom). No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-08-11-transfer-prepare-fee-display-design.md`

## Global Constraints

- Display Approach B only: line items + total; do not render `costEstimation`, `receiverPartyId`, or `type`.
- Omit collection-path fields from frontend types: `collection`, `requestedCollection`, `collected`, `feeRefundable`.
- Hide the fee section when `fee` is absent or not displayable (`!totalFee` and empty `fees`).
- Always suffix amounts with `fee.currency`.
- Transfer confirm only in this plan; leave `PreparedFeeSection` reusable for later C.
- No prepare/submit handler changes; fee already arrives on `preparedData` from the API.
- Vitest stays on `node`; do not add `@testing-library/react` or switch the global test environment for this work.

---

## File structure (created or modified by this plan)

```
lib/types/
└── transfer.ts                                    # MODIFY: FeeLine, FeeBlock, fee? on prepare responses

components/common/
├── PreparedFeeSection.tsx                         # NEW: presentational fee section
└── PreparedFeeSection.test.tsx                    # NEW: renderToStaticMarkup tests

entrypoints/popup/pages/dashboard/
└── Transfer.tsx                                   # MODIFY: mount fee section on confirm step
```

`lib/types/index.ts` already re-exports `./transfer` via `export type *` — no change needed once types live in `transfer.ts`.

---

### Task 1: Add `FeeLine` / `FeeBlock` prepare types

**Files:**
- Modify: `lib/types/transfer.ts`
- Test: `yarn typecheck` (no dedicated type unit test)

**Interfaces:**
- Consumes: existing `PrepareTransferResponse`, `PrepareTransferTokenStandardResponse`
- Produces:
  - `export interface FeeLine { description: string; amount: string; receiverPartyId: string; type: string | null }`
  - `export interface FeeBlock { currency: string; fees: FeeLine[]; totalFee: string; costEstimation?: { confirmationRequestBytes: number; confirmationResponseBytes: number; rateUsdPerMb: string; amuletPriceUsd: string; trafficBufferBps: string; networkFeeAmulet: string } }`
  - Both prepare response interfaces gain `fee?: FeeBlock`

- [ ] **Step 1: Extend `lib/types/transfer.ts`**

Replace the file contents with:

```ts
export interface PrepareTransferProps {
  receiverPartyId: string;
  amount: string | number;
  reason: string;
}

/** Display subset of backend FeeLine (kairo traffic-fee.types.ts). */
export interface FeeLine {
  description: string;
  amount: string;
  receiverPartyId: string;
  type: string | null;
}

/** Display subset of backend FeeBlock. Collection-path fields omitted. */
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

export interface PrepareTransferResponse {
  preparedTransaction: string;
  preparedTransactionHash: string;
  hashingSchemeVersion: string;
  fee?: FeeBlock;
}

export interface PrepareTransferTokenStandardProps {
  assetId: string;
  assetAmount: string;
  receiverPartyId: string;
  reason: string;
  maxTimeToExecute: number;
}

export interface PrepareTransferTokenStandardResponse {
  hashingSchemeVersion: string;
  preparedTransaction: string;
  preparedTransactionHash: string;
  fee?: FeeBlock;
}
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`  
Expected: PASS (no errors from the new optional fields)

- [ ] **Step 3: Commit**

```bash
git add lib/types/transfer.ts
git commit -m "$(cat <<'EOF'
feat(types): add optional FeeBlock on transfer prepare responses

Mirror backend display fee fields so the Transfer UI can type the
prepare payload without collection-path metadata.
EOF
)"
```

---

### Task 2: `PreparedFeeSection` (TDD)

**Files:**
- Create: `components/common/PreparedFeeSection.test.tsx`
- Create: `components/common/PreparedFeeSection.tsx`
- Test: `components/common/PreparedFeeSection.test.tsx`

**Interfaces:**
- Consumes: `FeeBlock` from `@lib/types`
- Produces: `export function PreparedFeeSection(props: { fee: FeeBlock }): ReactElement | null`

- [ ] **Step 1: Write the failing tests**

Create `components/common/PreparedFeeSection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { FeeBlock } from '@lib/types';
import { PreparedFeeSection } from './PreparedFeeSection';

const sampleFee: FeeBlock = {
  currency: 'Amulet',
  totalFee: '6.1291148501',
  fees: [
    {
      description: 'Wallet fee',
      amount: '0.5',
      receiverPartyId: 'party::abc',
      type: null,
    },
    {
      description: 'Network fee',
      amount: '5.6291148501',
      receiverPartyId: 'party::abc',
      type: 'network',
    },
  ],
};

describe('PreparedFeeSection', () => {
  it('renders line items and total with currency', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, { fee: sampleFee }),
    );
    expect(html).toContain('Estimated fee');
    expect(html).toContain('Wallet fee');
    expect(html).toContain('0.5 Amulet');
    expect(html).toContain('Network fee');
    expect(html).toContain('5.6291148501 Amulet');
    expect(html).toContain('Total');
    expect(html).toContain('6.1291148501 Amulet');
    expect(html).not.toContain('party::abc');
    expect(html).not.toContain('costEstimation');
  });

  it('returns null when fees are empty and totalFee is blank', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, {
        fee: { currency: 'Amulet', fees: [], totalFee: '' },
      }),
    );
    expect(html).toBe('');
  });

  it('still shows total when fees array is empty but totalFee is set', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, {
        fee: { currency: 'Amulet', fees: [], totalFee: '1.25' },
      }),
    );
    expect(html).toContain('Estimated fee');
    expect(html).toContain('1.25 Amulet');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test components/common/PreparedFeeSection.test.tsx`  
Expected: FAIL — cannot resolve `./PreparedFeeSection` (module not found)

- [ ] **Step 3: Implement `PreparedFeeSection`**

Create `components/common/PreparedFeeSection.tsx`:

```tsx
import type { FeeBlock } from '@lib/types';

function isDisplayableFee(fee: FeeBlock): boolean {
  const hasTotal = Boolean(fee.totalFee);
  const hasLines = fee.fees.length > 0;
  return hasTotal || hasLines;
}

export function PreparedFeeSection({ fee }: { fee: FeeBlock }) {
  if (!isDisplayableFee(fee)) return null;

  return (
    <div className="bg-secondary space-y-2 rounded-xl p-4 text-sm">
      <p className="text-foreground font-medium">Estimated fee</p>
      {fee.fees.map((line, index) => (
        <div key={`${line.description}-${index}`} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{line.description}</span>
          <span className="text-foreground shrink-0">
            {line.amount} {fee.currency}
          </span>
        </div>
      ))}
      {fee.totalFee ? (
        <div className="flex justify-between gap-3 border-t border-primary/10 pt-2 font-medium">
          <span className="text-muted-foreground">Total</span>
          <span className="text-foreground shrink-0">
            {fee.totalFee} {fee.currency}
          </span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test components/common/PreparedFeeSection.test.tsx`  
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/common/PreparedFeeSection.tsx components/common/PreparedFeeSection.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add PreparedFeeSection for prepare-response fees

Reusable confirm-step block showing fee line items and total,
hidden when the fee payload is empty.
EOF
)"
```

---

### Task 3: Mount fee section on Transfer confirm

**Files:**
- Modify: `entrypoints/popup/pages/dashboard/Transfer.tsx`
- Test: `yarn typecheck` + manual confirm-step check when backend returns `fee`

**Interfaces:**
- Consumes: `PreparedFeeSection` from `@components/common/PreparedFeeSection`; `preparedData.fee?: FeeBlock`
- Produces: confirm step renders fee between details card and password when `preparedData?.fee` is set

- [ ] **Step 1: Import and mount `PreparedFeeSection`**

In `entrypoints/popup/pages/dashboard/Transfer.tsx`:

1. Add import near the other component imports:

```ts
import { PreparedFeeSection } from '@components/common/PreparedFeeSection';
```

2. In the `step === 'confirm'` branch, insert the fee section **after** the details card (`</div>` that closes the Token/Amount/Recipient block) and **before** the password `<div>`:

```tsx
        {preparedData?.fee && <PreparedFeeSection fee={preparedData.fee} />}
```

The confirm branch should look like this (only the fee insertion is new; keep surrounding markup as-is):

```tsx
  if (step === 'confirm') {
    return (
      <div className="space-y-4 p-4">
        <h2 className="text-foreground text-lg font-bold">Confirm Transfer</h2>
        <div className="bg-secondary space-y-2 rounded-xl p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Token</span>
            <span className="text-foreground">{tokenId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="text-foreground">{amount}</span>
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-muted-foreground">Recipient</span>
            <span className="text-foreground bg-background rounded-lg px-2 py-1.5 font-mono text-xs break-all">{recipient}</span>
          </div>
        </div>

        {preparedData?.fee && <PreparedFeeSection fee={preparedData.fee} />}

        <div>
          <label htmlFor="transfer-password" className="text-muted-foreground text-sm">Password to sign</label>
          <input
            id="transfer-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary mt-1 w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-1"
            placeholder="Enter password"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertTriangleIcon className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setStep('form')}
            className="bg-secondary text-foreground flex-1 rounded-xl py-3 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!password || isSubmitting}
            className="bg-primary text-primary-foreground flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {isSubmitting ? <Loader2Icon className="mx-auto h-5 w-5 animate-spin" /> : 'Sign & Send'}
          </button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`  
Expected: PASS

- [ ] **Step 3: Run fee component tests again**

Run: `yarn test components/common/PreparedFeeSection.test.tsx`  
Expected: PASS (3 tests)

- [ ] **Step 4: Manual smoke check (when local backend has fees enabled)**

1. `yarn dev` (or brand-specific dev script).
2. Prepare an Amulet transfer that returns `fee` in the prepare response.
3. Confirm screen shows “Estimated fee” with Wallet fee / Network fee / Total between details and password.
4. With fees disabled (no `fee` on prepare), confirm screen looks unchanged (no fee block).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/pages/dashboard/Transfer.tsx
git commit -m "$(cat <<'EOF'
feat(transfer): show estimated fee on confirm step

Mount PreparedFeeSection between transfer details and password
when prepare returns an optional fee block.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `FeeLine` / `FeeBlock` display types; omit collection fields | Task 1 |
| `fee?: FeeBlock` on both prepare responses | Task 1 |
| `PreparedFeeSection` total + line items, currency labels | Task 2 |
| Returns `null` when empty / not displayable | Task 2 |
| Do not render receiver / type / costEstimation | Task 2 |
| Mount between details and password on Transfer confirm | Task 3 |
| Hide when `fee` absent | Task 3 + Task 2 |
| Light unit/render tests | Task 2 |
| Reusable for later C (no offer wiring yet) | Task 2 component location |
| No handler / submit changes | — (intentionally untouched) |
