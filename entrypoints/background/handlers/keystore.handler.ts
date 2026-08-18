import { createKeyPair, getPublicKeyFromPrivate, signTransactionHash } from '@canton-network/core-signing-lib';
import brand from '@brand/brand';
import { ok, err } from '@lib/messaging';
import type {
  MessageResponse,
  KeyPairData,
  OnboardingPrepareData,
  PreapprovalStatusData,
  AutoRegisterPreapprovalData,
} from '@lib/messaging';
import { localStore, sessionStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';
import apiClient from '../api-client';
import { setCachedPrivateKey, getCachedPrivateKey } from './session.handler';

interface PreparedExternalParty {
  partyId: string;
  namespace: string;
  multiHash: string;
  topologyTransactions: string[];
}

export async function handleCreateKeypair(): Promise<MessageResponse<KeyPairData>> {
  try {
    const keypair = createKeyPair();

    return ok({
      privateKey: keypair.privateKey,
      publicKey: keypair.publicKey,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Key generation failed');
  }
}

export async function handleValidateImportKey(
  rawKey: string,
  expectedPublicKey?: string,
): Promise<MessageResponse<KeyPairData>> {
  try {
    // Accept both hex and base64 — normalize to base64 for the signing lib
    const privateKey = isHex(rawKey) ? hexToBase64(rawKey) : rawKey;

    const publicKey = getPublicKeyFromPrivate(privateKey);

    // If an expected public key is provided, verify the imported key matches.
    // The backend may return the key in base64 or hex, so check both formats.
    if (expectedPublicKey) {
      const derivedHex = base64ToHex(publicKey);
      const matches =
        publicKey === expectedPublicKey || derivedHex === expectedPublicKey;
      if (!matches) {
        return err(
          'The imported private key does not match your account\'s public key. Please use the correct key.',
        );
      }
    }

    // Verify the key's fingerprint matches the partyId (hint::fingerprint).
    // This catches mismatches even when the backend doesn't store the public key.
    const partyId = await sessionStore.get('partyId');
    if (partyId) {
      const expectedFingerprint = partyId.split('::')[1];
      if (expectedFingerprint) {
        const fingerprint = await computeFingerprint(publicKey);
        if (fingerprint !== expectedFingerprint) {
          return err(
            'The imported private key does not match your party ID. ' +
            'Please use the key that was originally created for this account.',
          );
        }
      }
    }

    return ok({ privateKey, publicKey });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Invalid private key');
  }
}

/**
 * Compute Canton fingerprint from a base64 public key.
 * Fingerprint = hex(0x1220 || SHA256(int32_be(12) || raw_pubkey_bytes))
 */
async function computeFingerprint(publicKeyBase64: string): Promise<string> {
  const raw = atob(publicKeyBase64);
  const pubKeyBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    pubKeyBytes[i] = raw.charCodeAt(i);
  }

  // Prepend int32_be(12) = [0x00, 0x00, 0x00, 0x0c]
  const prefixed = new Uint8Array(4 + pubKeyBytes.length);
  prefixed[0] = 0x00;
  prefixed[1] = 0x00;
  prefixed[2] = 0x00;
  prefixed[3] = 0x0c;
  prefixed.set(pubKeyBytes, 4);

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', prefixed));

  return (
    '1220' +
    Array.from(digest)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Stub — no longer needed since Gateway handles topology internally.
 * Kept for backward compatibility with the popup message handler.
 */
export async function handlePrepareOnboarding(
  _publicKey: string,
): Promise<MessageResponse<OnboardingPrepareData>> {
  return ok({} as OnboardingPrepareData);
}

export async function handleCompleteOnboarding(payload: {
  password: string;
  privateKey: string;
  publicKey: string;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, privateKey, publicKey } = payload;
    const provider = await getEncryptionProvider();

    // 1. Encrypt and store the key
    const bundle = await provider.encryptKey(privateKey, password);
    bundle.walletKey = publicKey;
    await localStore.set('keystore', bundle);

    // 2. Cache private key in memory (needed for transaction signing)
    setCachedPrivateKey(privateKey);

    // Only run onboarding if the user is new (not already registered on the backend)
    const partyStatus = await sessionStore.get('partyStatus');
    if (partyStatus !== 'SUCCESSFULLY') {
      // Party hint is brand-owned (branding/<id>/brand.ts). Do not read
      // VITE_PARTY_HINT — a shared .env would contaminate every VITE_BRAND build.
      const partyHint = brand.partyHintDefault;

      // 3. Backend prepares a party-allocation topology transaction.
      //    Returns { partyId, namespace, multiHash, topologyTransactions }.
      console.log(`${brand.logTag} POST /external-party/onboarding/prepare hint=${partyHint}`);
      const prepareResponse = await apiClient.post(
        '/external-party/onboarding/prepare',
        { publicKey, hint: partyHint },
      );
      const prepared = prepareResponse.data?.data as PreparedExternalParty;
      if (!prepared?.multiHash || !prepared?.partyId) {
        throw new Error('Onboarding prepare returned malformed response');
      }

      // 4. Sign the multi-hash locally with the wallet's Ed25519 private key.
      const signedHash = signTransactionHash(prepared.multiHash, privateKey);

      // 5. Backend submits the signed topology to Canton and flips the party's
      //    onboardingStatus to SUCCESSFULLY (which also persists the user↔party
      //    link — no separate /auth/register-party call needed).
      console.log(`${brand.logTag} POST /external-party/onboarding/submit partyId=${prepared.partyId}`);
      const submitResponse = await apiClient.post(
        '/external-party/onboarding/submit',
        { signedHash, preparedParty: prepared },
      );
      const submitted = submitResponse.data?.data as { partyId: string; success: boolean };
      if (!submitted?.success) {
        throw new Error('Onboarding submit reported failure');
      }

      // 6. Persist partyId + onboarding status for the rest of the runtime.
      await sessionStore.set('partyId', submitted.partyId);
      await sessionStore.set('partyStatus', 'SUCCESSFULLY');
      console.log(`${brand.logTag} Onboarding complete: ${submitted.partyId}`);
    }

    // 7. Mark onboarding complete
    await localStore.set('onboardingComplete', true);
    await sessionStore.set('unlocked', true);

    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Onboarding failed');
  }
}

export async function handleExportPrivateKey(
  password: string,
): Promise<MessageResponse<{ privateKey: string }>> {
  try {
    const keystore = await localStore.get('keystore');
    if (!keystore) return err('No keystore found');

    const provider = await getEncryptionProvider();
    const privateKey = await provider.decryptKey(keystore, password);

    return ok({ privateKey });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to export key');
  }
}

/**
 * Register transfer preapproval via dapp-core.
 * Flow: prepare → sign locally → submit (same pattern as faucet).
 */
export async function handleRegisterTransferPreapproval(): Promise<
  MessageResponse<{ success: boolean }>
> {
  try {
    const partyId = await sessionStore.get('partyId');
    if (!partyId) return err('No party ID');

    // Use cached private key (preferred) or fail — user must be unlocked
    const privateKey = getCachedPrivateKey();
    if (!privateKey) return err('Private key not available — please unlock the wallet');

    // Step 1: Prepare via dapp-core
    const { data: prepareRes } = await apiClient.post(
      '/wallet/transfer-preapproval/prepare',
      { partyId },
    );
    const prepared = prepareRes.data;
    if (!prepared?.preparedTransactionHash) {
      return err('Transfer preapproval prepare returned no transaction hash');
    }

    // Step 2: Sign locally
    const signature = signTransactionHash(prepared.preparedTransactionHash, privateKey);

    // Step 3: Submit signed transaction to dapp-core
    await apiClient.post('/wallet/transfer-preapproval/submit', {
      partyId,
      preparedTransaction: prepared.preparedTransaction,
      preparedTransactionHash: prepared.preparedTransactionHash,
      signature,
      commandId: prepared.commandId,
    });

    markPreapprovalRegistered();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Transfer preapproval registration failed');
  }
}

// In-memory cache with TTL for preapproval registration status.
// Prevents the banner from flickering while Canton's ACS catches up,
// but expires after 30 minutes so on-chain expiry is eventually detected.
const PREAPPROVAL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let preapprovalCachedAt: number | null = null;

export function markPreapprovalRegistered(): void {
  preapprovalCachedAt = Date.now();
}

export function clearPreapprovalCache(): void {
  preapprovalCachedAt = null;
}

function isPreapprovalCacheValid(): boolean {
  return preapprovalCachedAt !== null && (Date.now() - preapprovalCachedAt) < PREAPPROVAL_CACHE_TTL_MS;
}

/**
 * Check transfer preapproval status via dapp-core.
 */
export async function handleGetPreapprovalStatus(): Promise<
  MessageResponse<PreapprovalStatusData>
> {
  try {
    if (isPreapprovalCacheValid()) {
      return ok({ hasPreapproval: true });
    }

    const partyId = await sessionStore.get('partyId');
    if (!partyId) return ok({ hasPreapproval: false });

    const { data: statusRes } = await apiClient.get(
      '/wallet/transfer-preapproval/status',
      { params: { partyId } },
    );
    const result = statusRes.data;
    const exists = result?.exists === true;
    if (exists) markPreapprovalRegistered();
    return ok({ hasPreapproval: exists });
  } catch {
    // Non-critical — return false on any error
    return ok({ hasPreapproval: false });
  }
}

export async function handleMaybeAutoRegisterPreapproval(): Promise<
  MessageResponse<AutoRegisterPreapprovalData>
> {
  try {
    const shouldAuto = await sessionStore.get('shouldAutoRegisterPreapproval');
    if (!shouldAuto) {
      return ok({ attempted: false, registered: false, reason: 'disabled' });
    }

    // Silent path only: requires the in-memory key cached at unlock/onboarding.
    if (!getCachedPrivateKey()) {
      return ok({ attempted: false, registered: false, reason: 'locked' });
    }

    // Idempotent: never register if the party already has an active preapproval.
    const status = await handleGetPreapprovalStatus();
    if (status.success && status.data.hasPreapproval) {
      return ok({ attempted: false, registered: false, reason: 'already-registered' });
    }

    const res = await handleRegisterTransferPreapproval();
    if (res.success) return ok({ attempted: true, registered: true });
    return ok({ attempted: true, registered: false, reason: res.error });
  } catch (e: unknown) {
    // Best-effort: never throw out of the auto path.
    return ok({
      attempted: true,
      registered: false,
      reason: e instanceof Error ? e.message : 'auto-register failed',
    });
  }
}

export async function handleDeleteKeystore(): Promise<MessageResponse<void>> {
  try {
    await localStore.remove('keystore');
    await localStore.set('onboardingComplete', false);
    await sessionStore.clear();
    return ok(undefined);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to delete keystore');
  }
}

/**
 * Narrow recovery wipe for the keystore-mismatch-recovery flow.
 *
 * Unlike handleDeleteKeystore, this does NOT clear sessionStore — preserving
 * sessionStore.partyStatus='SUCCESSFULLY' so that the subsequent
 * handleCompleteOnboarding call skips the party-creation block (it would
 * otherwise re-run /external-party/onboarding/* for an already-onboarded user).
 *
 * See: docs/superpowers/specs/2026-06-10-keystore-mismatch-recovery-design.md §4 property 3.
 */
export async function handleResetKeystoreForRecovery(): Promise<MessageResponse<null>> {
  try {
    await localStore.set('keystore', null);
    await localStore.set('onboardingComplete', false);
    return ok(null);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to reset keystore for recovery');
  }
}

function base64ToHex(b64: string): string {
  const raw = atob(b64);
  let hex = '';
  for (let i = 0; i < raw.length; i++) {
    hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

function isHex(s: string): boolean {
  return s.length > 0 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s);
}

function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
