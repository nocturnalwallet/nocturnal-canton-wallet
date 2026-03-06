# Plan: Record Transfer History from On-Chain Update Data

## Context

The previous plan (ACS queries, withdraw, refresh, timestamps, expiry) is **complete and built**. This task changes how transfer history is recorded:

**Current approach**: Approve/reject/withdraw cache metadata at prepare time, write to DB at submit with fake UUID. Amulet transfers record nothing.

**New approach**: At submit time, use `executeAndWait` to get real `updateId`, query the update events, parse all metadata from the ledger, and record to DB. Include **amulet (pre-approval) transfers** too so no transactions are missed. **No client-sent metadata** — everything from on-chain data.

## Key API Discovery

- **`POST /v2/interactive-submission/executeAndWait`** — Same request as `execute`, returns `{ updateId: string, completionOffset: number }` (OpenAPI: `splice-wallet-kernel/api-specs/ledger-api/3.4.12/openapi.yaml:2002`)
- **`POST /v2/updates/update-by-id`** — Query full transaction by updateId → `Transaction` with `updateId`, `offset`, `effectiveAt`, `recordTime`, `events[]` (Reference: canton-exchange-backend `topology.service.ts:1958`)

### Event parsing per transfer type

**Amulet transfer (AmuletRules_Transfer)** — ExercisedEvent contains all data:

- `choiceArgument.transfer.sender` → sender
- `choiceArgument.transfer.outputs[0].receiver` → receiver
- `choiceArgument.transfer.outputs[0].amount` → amount
- tokenName: `'Amulet'` (hardcoded)
- Reference: canton-exchange-backend `transfer-history.service.ts:202-261`

**TransferInstruction Accept/Reject/Withdraw** — ExercisedEvent does NOT contain contract view:

- Must query ACS before execute for sender/receiver/amount (server-side, not client)
- Reference: canton-exchange-backend `transfer-history.service.ts:262-302`

### Security consideration

The extension does NOT send `receiverPartyId` or `amount` in the submit body. All transfer metadata is parsed server-side from on-chain events. This prevents any tampering with history records even if the HTTP request is intercepted — the actual transfer is protected by the signed `preparedTransaction`, and history data comes directly from the ledger.

## Changes

### 1. `transfer.service.ts` — Remove caching, parse from update

**File**: `Quickstart/dapp-core/src/modules/transfer/transfer.service.ts`

**Remove**:

- `PendingActionMeta`, `pendingActions`, `cleanStaleCacheEntries()`, `cacheContractMeta()`
- `cacheContractMeta()` calls from `prepareApprove`, `prepareReject`, `prepareWithdraw`
- `partyId` param from prepare functions
- `randomUUID` import

**Add** `queryUpdateById(updateId, partyId)` (exported for reuse by amulet-transfer):

- Call `gatewayService.ledgerApiPost('/v2/updates/update-by-id', { updateId, updateFormat: { includeTransactions: { transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS', eventFormat: { filtersForAnyParty: { cumulative: [{ identifierFilter: { WildcardFilter: {} } }] }, verbose: true } } } })`
- Return parsed `{ updateId, offset, effectiveAt, recordTime, events[] }`

**Modify** `submitSignedTransaction()`:

- Add `partyId` param
- For approve/reject/withdraw:
  1. **Before execute**: Query ACS for contract metadata (server-side, reuse `queryActiveTransferInstructions`)
  2. Switch to `executeAndWait` → `{ updateId, completionOffset }`
  3. Call `queryUpdateById(updateId, partyId)` → timestamps
  4. Write DB: ACS metadata + update info (real updateId, offset, timestamps)

### 2. `amulet-transfer.service.ts` — Gateway routing + parse from update

**File**: `Quickstart/dapp-core/src/modules/amulet-transfer/amulet-transfer.service.ts`

**`prepareAmuletTransfer()`**: Route through Gateway

- Replace `fetch(config.participantLedgerApiUrl + ...)` with `gatewayService.ledgerApiPost(...)`
- Remove `config.participantLedgerApiUrl` and direct `fetch` usage

**`submitAmuletTransfer()`**:

- Replace direct `fetch` with `gatewayService.ledgerApiPost('/v2/interactive-submission/executeAndWait', ...)`
- Get `{ updateId, completionOffset }` from response
- Call `queryUpdateById(updateId, senderPartyId)` to get full transaction
- Parse events: find ExercisedEvent where `choice` includes `Transfer`
  - `choiceArgument.transfer.sender` → sender
  - `choiceArgument.transfer.outputs[0].receiver` → receiver
  - `choiceArgument.transfer.outputs[0].amount` → amount
- Write transfer_history: status APPROVED, tokenName 'Amulet', all data from ledger
- **No client metadata needed** — everything parsed from on-chain events

### 3. `transfer.controller.ts` — Move partyId to submit

**File**: `Quickstart/dapp-core/src/modules/transfer/transfer.controller.ts`

- Remove `partyId` from prepare calls
- Add `partyId` to submit calls (`/approve/submit`, `/reject/submit`, `/withdraw/submit`)

### 4. `amulet-transfer.controller.ts` — No changes needed

No additional fields needed from the client. `senderPartyId` is already sent (used for partySignatures).

### 5. Extension — No changes needed

No changes to `signing.handler.ts`. The extension does NOT need to send `receiverPartyId` or `amount` — the backend parses everything from ledger events.

## Files Modified

| File | Change |
|------|--------|
| `Quickstart/dapp-core/src/modules/transfer/transfer.service.ts` | Remove caching, add exported `queryUpdateById`, `executeAndWait`, record history from ACS + update |
| `Quickstart/dapp-core/src/modules/transfer/transfer.controller.ts` | Move `partyId` from prepare to submit |
| `Quickstart/dapp-core/src/modules/amulet-transfer/amulet-transfer.service.ts` | Gateway routing, `executeAndWait`, parse events for history |

## Verification

1. `cd Quickstart/dapp-core && yarn build`
2. Restart dapp-core
3. **Amulet transfer**: Send CC via pre-approval → DB has real updateId, status APPROVED, tokenName 'Amulet', sender/receiver/amount all parsed from ledger
4. **Accept offer**: Accept incoming → DB has real updateId, status APPROVED
5. **Reject offer**: Reject incoming → DB has real updateId, status REJECTED
6. **Withdraw offer**: Withdraw outgoing → DB has real updateId, status CANCELLED
