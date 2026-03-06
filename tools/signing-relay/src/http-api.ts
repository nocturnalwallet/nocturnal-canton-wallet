import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestSignature, getRegisteredKeys, getTransaction } from './socket-handler.js';
import type {
  SignTransactionRequest,
  GetTransactionRequest,
  GetTransactionsRequest,
  CreateKeyRequest,
  Key,
} from './types.js';

export const httpRouter = Router();

/**
 * POST /signTransaction
 *
 * Called by Wallet Gateway's Blockdaemon signing driver.
 * Forwards the signing request to the connected extension via Socket.io.
 */
httpRouter.post('/signTransaction', async (req: Request, res: Response) => {
  try {
    const body = req.body as SignTransactionRequest;

    if (!body.txHash) {
      res.status(400).json({ error: 'missing_param', error_description: 'txHash is required' });
      return;
    }

    console.log(`[Relay HTTP] /signTransaction: txHash=${body.txHash.slice(0, 16)}...`);

    const result = await requestSignature(body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Relay HTTP] /signTransaction error:', message);
    res.status(500).json({ error: 'internal_error', error_description: message });
  }
});

/**
 * POST /getTransaction
 *
 * Returns the signing status of a transaction.
 */
httpRouter.post('/getTransaction', (req: Request, res: Response) => {
  const body = req.body as GetTransactionRequest;

  if (!body.txId) {
    res.status(400).json({ error: 'missing_param', error_description: 'txId is required' });
    return;
  }

  const tx = getTransaction(body.txId);
  if (tx) {
    res.json(tx);
  } else {
    res.status(404).json({ error: 'not_found', error_description: `Transaction ${body.txId} not found` });
  }
});

/**
 * POST /getTransactions
 *
 * Returns signing statuses for multiple transactions.
 */
httpRouter.post('/getTransactions', (req: Request, res: Response) => {
  const body = req.body as GetTransactionsRequest;
  const transactions = [];

  if (body.txIds) {
    for (const txId of body.txIds) {
      const tx = getTransaction(txId);
      if (tx) transactions.push(tx);
    }
  }

  res.json({ transactions });
});

/**
 * POST /getKeys
 *
 * Returns all public keys registered by connected extensions.
 */
httpRouter.post('/getKeys', (_req: Request, res: Response) => {
  const keys = getRegisteredKeys();
  res.json({ keys });
});

/**
 * POST /createKey
 *
 * Extensions pre-register keys on connect via Socket.io.
 * This endpoint exists for Blockdaemon API compatibility.
 * Returns the key if it already exists, or creates a placeholder.
 */
httpRouter.post('/createKey', (req: Request, res: Response) => {
  const body = req.body as CreateKeyRequest;

  const existingKeys = getRegisteredKeys();
  const existing = existingKeys.find((k) => k.name === body.name);

  if (existing) {
    res.json(existing);
    return;
  }

  // Fallback: return the first registered key if any exist.
  // During onboarding, the extension registers its key before createWallet,
  // but the Gateway passes a partyHint as name that won't match.
  if (existingKeys.length > 0) {
    console.log(`[Relay HTTP] /createKey: no match for name=${body.name}, returning first registered key`);
    res.json(existingKeys[0]);
    return;
  }

  // No keys registered at all — return a placeholder
  const key: Key = {
    id: uuidv4(),
    name: body.name,
    publicKey: '',
  };
  res.json(key);
});
