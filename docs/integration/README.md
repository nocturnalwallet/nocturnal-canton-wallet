# Nocturnal Wallet — dApp Integration

Nocturnal is a [Canton Network](https://www.canton.network/) wallet browser extension that implements the [CIP-0103](https://github.com/canton-foundation/cips/blob/main/cip-0103/cip-0103.md) dApp API. This documentation is for developers building dApps that connect to Nocturnal for signing and submitting Canton transactions.

If you've ever integrated MetaMask via EIP-1193, Nocturnal's surface will feel familiar — the patterns (`window.postMessage` envelope, JSON-RPC method dispatch, EIP-6963-style provider discovery) are deliberately analogous.

## Where to start

- **[Quickstart](quickstart.md)** — connect, sign a message, verify it. 5 minutes.
- **[Concepts](concepts/overview.md)** — what's CIP-0103, what's the message flow, who's authenticated as whom.
- **[Method reference](reference/overview.md)** — all 12 methods with params, returns, errors, examples.
- **[Guides](guides/send-tokens.md)** — end-to-end Token Standard transfer, signature verification.
- **[Nocturnal-specific extensions](extensions/nocturnal-vs-cip-0103.md)** — where Nocturnal deviates from vanilla CIP-0103.

## Supported transports

Nocturnal speaks two transports interchangeably:

1. **`@canton-network/dapp-sdk`** (recommended) — typed RPC client, EIP-6963 discovery, automatic envelope handling. Same API surface as the official Splice wallet kernel reference.
2. **Raw `window.postMessage`** — useful for debugging, DevTools snippets, or when you can't add the SDK dependency. Documented alongside the SDK pattern in each reference section.

Both are equally supported. Examples in this doc default to the SDK; raw protocol examples appear where they're meaningfully different.

## Status of the spec match

As of the current release, Nocturnal's dApp API matches CIP-0103 v1 with these deliberate extensions:

- `signTransaction` method (no CIP-0103 equivalent — kept for compatibility with existing Canton dApps).
- `SPLICE_WALLET_EVENT` envelope variant for wallet→dApp push events (upstream extension SDK has no event delivery yet — see [extensions/nocturnal-vs-cip-0103.md](extensions/nocturnal-vs-cip-0103.md)).

Full deviation list and rationale: [extensions/nocturnal-vs-cip-0103.md](extensions/nocturnal-vs-cip-0103.md).

## Support

- **Issues:** report at [github.com/nocturnalwallet/nocturnal-canton-wallet](https://github.com/nocturnalwallet/nocturnal-canton-wallet/issues).
- **Source:** [github.com/nocturnalwallet/nocturnal-canton-wallet](https://github.com/nocturnalwallet/nocturnal-canton-wallet).
- **Spec:** [CIP-0103 text](https://github.com/canton-foundation/cips/blob/main/cip-0103/cip-0103.md), [splice-wallet-kernel](https://github.com/hyperledger-labs/splice-wallet-kernel).
