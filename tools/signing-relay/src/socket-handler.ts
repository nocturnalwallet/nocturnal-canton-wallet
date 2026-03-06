import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type {
  Key,
  RegisterKeysPayload,
  SignRequestPayload,
  SignResponsePayload,
  Transaction,
  PendingRequest,
  SignTransactionRequest,
} from './types.js';

const SIGN_TIMEOUT_MS = 60_000;
const COMPLETED_TX_TTL_MS = 5 * 60_000; // Keep completed transactions for 5 minutes

/** Maps publicKey → connected Socket */
const connections = new Map<string, Socket>();

/** Maps txId → pending HTTP request awaiting a signature */
const pendingRequests = new Map<string, PendingRequest>();

/** Maps txId → completed Transaction (kept for getTransaction lookups) */
const completedTransactions = new Map<string, Transaction>();

/** All registered keys from connected extensions */
const registeredKeys = new Map<string, Key>();

export function getRegisteredKeys(): Key[] {
  return Array.from(registeredKeys.values());
}

export function getTransaction(txId: string): Transaction | undefined {
  // Check completed transactions first (signed/rejected/failed)
  const completed = completedTransactions.get(txId);
  if (completed) {
    return completed;
  }

  // Check pending transactions
  const pending = pendingRequests.get(txId);
  if (pending) {
    return { txId, status: 'pending' };
  }

  return undefined;
}

/**
 * Request a signature from a connected extension.
 * Returns a Promise that resolves when the extension responds or times out.
 */
export function requestSignature(req: SignTransactionRequest): Promise<Transaction> {
  const publicKey = req.publicKey || req.keyIdentifier?.publicKey;
  if (!publicKey) {
    return Promise.resolve({
      txId: '',
      status: 'failed',
      metadata: { error: 'No publicKey in keyIdentifier' },
    });
  }

  const socket = connections.get(publicKey);
  if (!socket) {
    return Promise.resolve({
      txId: '',
      status: 'failed',
      metadata: { error: `No extension connected for publicKey ${publicKey.slice(0, 12)}...` },
    });
  }

  const txId = uuidv4();

  return new Promise<Transaction>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(txId);
      resolve({ txId, status: 'failed', metadata: { error: 'Signing timeout' } });
    }, SIGN_TIMEOUT_MS);

    pendingRequests.set(txId, { resolve, reject, timeout });

    const payload: SignRequestPayload = {
      txId,
      tx: req.tx,
      txHash: req.txHash,
      keyIdentifier: req.keyIdentifier,
      internalTxId: req.internalTxId,
    };

    socket.emit('sign-request', payload);
    console.log(`[Relay] sign-request emitted to extension for txId=${txId}`);
  });
}

export function setupSocketHandler(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Auth priority: Socket.io auth payload (SDK clients) > query params > headers (Postman)
    const auth = socket.handshake.auth as { partyId?: string; token?: string };
    const query = socket.handshake.query as { partyId?: string; token?: string };
    const headers = socket.handshake.headers as Record<string, string | undefined>;
    const partyId = auth.partyId || query.partyId || headers['x-party-id'] || 'unknown';
    console.log(`[Relay] Extension connected: partyId=${partyId}, socketId=${socket.id}`);

    // Handle key registration
    socket.on('register-keys', (payload: RegisterKeysPayload) => {
      if (!payload.keys || !Array.isArray(payload.keys)) return;

      for (const key of payload.keys) {
        connections.set(key.publicKey, socket);
        registeredKeys.set(key.publicKey, key);
        console.log(`[Relay] Key registered: id=${key.id}, publicKey=${key.publicKey.slice(0, 12)}...`);
      }
    });

    // Handle signature responses
    socket.on('sign-response', (payload: SignResponsePayload) => {
      const pending = pendingRequests.get(payload.txId);
      if (!pending) {
        console.warn(`[Relay] sign-response for unknown txId=${payload.txId}`);
        return;
      }

      clearTimeout(pending.timeout);
      pendingRequests.delete(payload.txId);

      const tx: Transaction = {
        txId: payload.txId,
        status: payload.status,
        signature: payload.signature ?? undefined,
        publicKey: payload.publicKey ?? undefined,
      };

      // Store completed transaction so getTransaction can return it later.
      // The Gateway's Blockdaemon driver calls getTransaction after signTransaction
      // to retrieve the signature separately.
      completedTransactions.set(payload.txId, tx);
      setTimeout(() => completedTransactions.delete(payload.txId), COMPLETED_TX_TTL_MS);

      console.log(`[Relay] sign-response received: txId=${payload.txId}, status=${payload.status}`);
      pending.resolve(tx);
    });

    // Clean up on disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[Relay] Extension disconnected: partyId=${partyId}, reason=${reason}`);

      // Remove all keys registered by this socket
      for (const [publicKey, sock] of connections.entries()) {
        if (sock.id === socket.id) {
          connections.delete(publicKey);
          registeredKeys.delete(publicKey);
        }
      }
    });
  });
}
