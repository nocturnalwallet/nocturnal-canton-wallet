/**
 * Signing relay Socket.io client for the Ginkgo extension service worker.
 *
 * Connects to the signing relay service and handles signing requests
 * from the Wallet Gateway (routed via the relay's Blockdaemon-compatible API).
 *
 * Lifecycle:
 * 1. On unlock: connect(relayUrl, partyId)
 * 2. After connect: registerKeys(publicKey)
 * 3. On 'sign-request': show approval popup, sign, sendSignResponse
 * 4. On lock/disconnect: disconnect()
 */
import { io, type Socket } from 'socket.io-client';
import { getCachedPrivateKey, resetAutoLockTimer } from '../handlers/session.handler';
import { requestApproval } from '../handlers/approval.handler';

interface SignRequest {
  txId: string;
  tx: string;
  txHash: string;
  keyIdentifier: { publicKey?: string; id?: string };
  internalTxId?: string;
}

interface SignResponse {
  txId: string;
  signature: string | null;
  publicKey: string | null;
  status: 'signed' | 'rejected' | 'failed';
}

interface RegisterKey {
  id: string;
  name: string;
  publicKey: string;
}

const KEEPALIVE_ALARM = 'signing-relay-keepalive';

class SigningRelayClient {
  private socket: Socket | null = null;
  private partyId = '';
  private _autoApprove = false;

  setAutoApprove(enabled: boolean): void {
    this._autoApprove = enabled;
    console.log(`[Ginkgo Relay] Auto-approve ${enabled ? 'enabled' : 'disabled'}`);
  }

  connect(relayUrl: string, partyId: string, options?: { authToken?: string; apiKey?: string }): void {
    if (!relayUrl || this.socket?.connected) return;

    this.partyId = partyId;
    this.socket = io(relayUrl, {
      auth: { partyId, token: options?.apiKey || options?.authToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.log('[Ginkgo Relay] Connected to signing relay');
      // Keep service worker alive while connected
      chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
    });

    this.socket.on('sign-request', async (request: SignRequest) => {
      await this.handleSignRequest(request);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Ginkgo Relay] Disconnected:', reason);
      chrome.alarms.clear(KEEPALIVE_ALARM);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Ginkgo Relay] Connection error:', err.message);
    });
  }

  registerKeys(keys: RegisterKey[]): void {
    if (!this.socket?.connected) return;
    this.socket.emit('register-keys', { keys });
    console.log(`[Ginkgo Relay] Registered ${keys.length} key(s)`);
  }

  private async handleSignRequest(request: SignRequest): Promise<void> {
    try {
      let approved: boolean;
      if (this._autoApprove) {
        console.log('[Ginkgo Relay] Auto-approved sign request (onboarding mode)');
        approved = true;
      } else {
        approved = await requestApproval(
          'signTransaction (Gateway)',
          'Wallet Gateway',
          { txHash: request.txHash, txId: request.txId },
        );
      }

      if (!approved) {
        this.sendSignResponse({
          txId: request.txId,
          status: 'rejected',
          signature: null,
          publicKey: null,
        });
        return;
      }

      const privateKey = getCachedPrivateKey();
      if (!privateKey) {
        this.sendSignResponse({
          txId: request.txId,
          status: 'failed',
          signature: null,
          publicKey: null,
        });
        return;
      }

      const { signTransactionHash, getPublicKeyFromPrivate } = await import(
        '@canton-network/core-signing-lib'
      );

      const signature = signTransactionHash(request.txHash, privateKey);
      const publicKey = getPublicKeyFromPrivate(privateKey);

      this.sendSignResponse({
        txId: request.txId,
        signature,
        publicKey,
        status: 'signed',
      });

      resetAutoLockTimer();
    } catch (error) {
      console.error('[Ginkgo Relay] Sign request failed:', error);
      this.sendSignResponse({
        txId: request.txId,
        status: 'failed',
        signature: null,
        publicKey: null,
      });
    }
  }

  private sendSignResponse(response: SignResponse): void {
    this.socket?.emit('sign-response', response);
  }

  disconnect(): void {
    chrome.alarms.clear(KEEPALIVE_ALARM);
    this.socket?.disconnect();
    this.socket = null;
    this.partyId = '';
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const signingRelay = new SigningRelayClient();
