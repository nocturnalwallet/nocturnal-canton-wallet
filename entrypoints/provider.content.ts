/**
 * MAIN world content script — CIP-0103 extension detection handshake.
 *
 * This script runs in the page's MAIN world so that EXT_ACK messages are posted
 * from the page's own JS context. This is necessary because the SDK's discovery
 * popup (blob: URL) adds its ACK listener via `window.opener.addEventListener()`,
 * and Chrome only reliably delivers messages to cross-window listeners when the
 * message originates from the MAIN world — not from an ISOLATED content script.
 *
 * NOTE: We intentionally do NOT set `window.canton` here. The older SDK's
 * `injectSpliceProvider()` checks `if (window.canton !== void 0) return window.canton`
 * and would return our marker instead of injecting a real SpliceProviderWindow,
 * breaking the connect flow.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    // Respond to EXT_READY with EXT_ACK so the SDK's discovery popup detects us.
    // This must run in MAIN world for cross-window message delivery to work.
    window.addEventListener('message', (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'SPLICE_WALLET_EXT_READY'
      ) {
        window.postMessage({ type: 'SPLICE_WALLET_EXT_ACK' }, '*');
      }
    });
  },
});
