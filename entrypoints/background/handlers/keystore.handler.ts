import { ok, err } from '@lib/messaging';
import type { MessageResponse, KeyPairData, OnboardingPrepareData, PreapprovalStatusData } from '@lib/messaging';
import { localStore, sessionStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';
import apiClient from '../api-client';
import { setCachedPrivateKey, getCachedPrivateKey } from './session.handler';

export async function handleCreateKeypair(): Promise<MessageResponse<KeyPairData>> {
  try {
    // Dynamic import to avoid bundling in popup
    const { createKeyPair } = await import('@canton-network/core-signing-lib');
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

    const { getPublicKeyFromPrivate } = await import(
      '@canton-network/core-signing-lib'
    );
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

    return ok({ privateKey, publicKey });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Invalid private key');
  }
}

export async function handlePrepareOnboarding(
  publicKey: string,
): Promise<MessageResponse<OnboardingPrepareData>> {
  try {
    const { data: res } = await apiClient.post(
      '/external-party/onboarding/prepare',
      { publicKey },
    );
    const preparedParty: OnboardingPrepareData = res.data;
    return ok(preparedParty);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Onboarding prepare failed');
  }
}

export async function handleCompleteOnboarding(payload: {
  password: string;
  privateKey: string;
  publicKey: string;
  preparedParty?: OnboardingPrepareData;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, privateKey, publicKey, preparedParty } = payload;
    const provider = await getEncryptionProvider();

    // Encrypt and store the key
    const bundle = await provider.encryptKey(privateKey, password);
    bundle.walletKey = publicKey;
    await localStore.set('keystore', bundle);

    // Import signing lib (needed for both onboarding and transfer preapproval)
    const { signTransactionHash, getPublicKeyFromPrivate } = await import(
      '@canton-network/core-signing-lib'
    );

    // Only run onboarding if the user is new (not already registered on the backend)
    const partyStatus = await sessionStore.get('partyStatus');
    if (partyStatus !== 'SUCCESSFULLY') {
      // Use pre-fetched prepare data, or call prepare now as fallback
      let prepared: OnboardingPrepareData;
      if (preparedParty) {
        prepared = preparedParty;
      } else {
        const { data: res } = await apiClient.post(
          '/external-party/onboarding/prepare',
          { publicKey },
        );
        prepared = res.data;
      }

      const signedHash = signTransactionHash(prepared.multiHash, privateKey);

      await apiClient.post('/external-party/onboarding/submit', {
        signedHash,
        preparedParty: prepared,
      });
    }

    // Re-fetch partyId from backend (it may have been assigned during onboarding submit)
    let partyId = await sessionStore.get('partyId');
    console.log('[Ginkgo] Transfer preapproval: partyId from session =', partyId);
    if (!partyId) {
      try {
        const { data: meData } = await apiClient.get('/auth/me');
        partyId = meData.data?.party?.partyId ?? null;
        console.log('[Ginkgo] Transfer preapproval: partyId from /auth/me =', partyId);
        if (partyId) await sessionStore.set('partyId', partyId);
      } catch (e) {
        console.warn('[Ginkgo] Transfer preapproval: failed to fetch partyId', e);
      }
    }

    // Set up transfer preapproval: prepare → sign → submit (both new and existing users)
    if (partyId) {
      try {
        console.log('[Ginkgo] Transfer preapproval: preparing for partyId =', partyId);
        const { data: prepareData } = await apiClient.post(
          '/transfer-preapproval/prepare',
          { partyId },
        );
        console.log('[Ginkgo] Transfer preapproval: prepare response =', prepareData);
        const sig = signTransactionHash(
          prepareData.data.preparedTransactionHash,
          privateKey,
        );
        const derivedPublicKey = getPublicKeyFromPrivate(privateKey);
        await apiClient.post('/transfer-preapproval/submit', {
          commandId: prepareData.data.commandId,
          publicKey: derivedPublicKey,
          signature: sig,
          preparedTransaction: prepareData.data.preparedTransaction,
          preparedTransactionHash: prepareData.data.preparedTransactionHash,
          partyId,
        });
        console.log('[Ginkgo] Transfer preapproval: submitted successfully');
      } catch (e) {
        console.warn('[Ginkgo] Transfer preapproval: failed', e);
      }
    } else {
      console.warn('[Ginkgo] Transfer preapproval: skipped — no partyId available');
    }

    // Cache the private key in memory so dashboard features (like preapproval) work without re-entering password
    setCachedPrivateKey(privateKey);

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

export async function handleRegisterTransferPreapproval(): Promise<
  MessageResponse<{ success: boolean }>
> {
  try {
    // Ensure we have a partyId — re-fetch from backend if not cached
    let partyId = await sessionStore.get('partyId');
    if (!partyId) {
      try {
        const { data: meData } = await apiClient.get('/auth/me');
        partyId = meData.data?.party?.partyId ?? null;
        if (partyId) await sessionStore.set('partyId', partyId);
      } catch {
        // ignore
      }
    }
    if (!partyId) return err('No party ID found. Please try again later.');

    // Use cached key if available
    const privateKey = getCachedPrivateKey();
    if (!privateKey) {
      return err('Wallet is locked. Please unlock first.');
    }

    const { signTransactionHash, getPublicKeyFromPrivate } = await import(
      '@canton-network/core-signing-lib'
    );

    const { data: prepareRes } = await apiClient.post(
      '/transfer-preapproval/prepare',
      { partyId },
    );
    const signature = signTransactionHash(
      prepareRes.data.preparedTransactionHash,
      privateKey,
    );
    const publicKey = getPublicKeyFromPrivate(privateKey);
    await apiClient.post('/transfer-preapproval/submit', {
      commandId: prepareRes.data.commandId,
      publicKey,
      signature,
      preparedTransaction: prepareRes.data.preparedTransaction,
      preparedTransactionHash: prepareRes.data.preparedTransactionHash,
      partyId,
    });

    return ok({ success: true });
  } catch (e: unknown) {
    return err(
      e instanceof Error ? e.message : 'Transfer pre-approval failed',
    );
  }
}

export async function handleGetPreapprovalStatus(): Promise<
  MessageResponse<PreapprovalStatusData>
> {
  try {
    const partyId = await sessionStore.get('partyId');
    if (!partyId) return ok({ hasPreapproval: false });

    const { data: res } = await apiClient.get(`/transfer-preapproval/status`, {
      params: { partyId },
    });
    const hasPreapproval = !!res.data?.exists;

    return ok({ hasPreapproval });
  } catch {
    // If 404 or similar, treat as no preapproval
    return ok({ hasPreapproval: false });
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
