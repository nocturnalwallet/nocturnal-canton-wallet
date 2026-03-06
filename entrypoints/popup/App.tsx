import { useState, useEffect, useCallback } from 'react';
import { sendMessage, MSG } from '@lib/messaging';
import type { KeyPairData, OnboardingPrepareData } from '@lib/messaging';
import { useAuthState } from './hooks/useAuth';
import { useLockState } from './hooks/useLockState';
import { useNetwork } from './hooks/useNetwork';

import { Welcome } from './pages/onboarding/Welcome';
import { CreatePassword } from './pages/onboarding/CreatePassword';
import { KeySetup } from './pages/onboarding/KeySetup';
import { ShowPrivateKey } from './pages/onboarding/ShowPrivateKey';
import { Acknowledgment } from './pages/onboarding/Acknowledgment';
import { TypedConfirm } from './pages/onboarding/TypedConfirm';
import { Unlock } from './pages/Unlock';
import { Dashboard } from './pages/dashboard';
import { DappApproval } from './pages/approval/DappApproval';

type Screen =
  | 'loading'
  | 'welcome'
  | 'create-password'
  | 'key-setup'
  | 'show-key'
  | 'acknowledgment'
  | 'typed-confirm'
  | 'unlock'
  | 'dashboard';

interface OnboardingState {
  password: string;
  privateKey: string;
  publicKey: string;
  isImport: boolean;
  partyStatus: string;
  existingPublicKey: string;
  preparedParty: OnboardingPrepareData | null;
}

const EMPTY_ONBOARDING: OnboardingState = {
  password: '',
  privateKey: '',
  publicKey: '',
  isImport: false,
  partyStatus: 'PENDING',
  existingPublicKey: '',
  preparedParty: null,
};

/** True when the app is running inside a persistent auth window (not the popup). */
const IS_STANDALONE_WINDOW = new URLSearchParams(window.location.search).has('window');

const searchParams = new URLSearchParams(window.location.search);
const APPROVAL_REQUEST_ID = searchParams.get('action') === 'dapp-approve' ? searchParams.get('id') : null;

function App() {
  // If opened as a dApp approval popup, render only the approval UI
  if (APPROVAL_REQUEST_ID) {
    return <DappApproval requestId={APPROVAL_REQUEST_ID} />;
  }

  const { data: authState, isLoading: authLoading } = useAuthState();
  const { data: lockState, isLoading: lockLoading } = useLockState();
  const { network } = useNetwork();
  const isLocalnet = network === 'localnet';
  const [screen, setScreen] = useState<Screen>('loading');
  const [onboarding, setOnboarding] = useState<OnboardingState>(EMPTY_ONBOARDING);

  // Wipe sensitive onboarding data when leaving the onboarding flow
  const clearOnboarding = useCallback(() => {
    setOnboarding(EMPTY_ONBOARDING);
  }, []);

  useEffect(() => {
    if (authLoading || lockLoading) {
      setScreen('loading');
      return;
    }

    if (!authState?.isAuthenticated) {
      setScreen('welcome');
      return;
    }

    if (lockState?.unlocked) {
      setScreen('dashboard');
      return;
    }

    // Authenticated but locked — check if onboarding is done
    // (onboardingComplete comes from the background via namespaced localStore)
    if (authState.onboardingComplete) {
      // Onboarding already complete — if we're in the persistent auth window,
      // close it and let the user continue via the extension popup.
      if (IS_STANDALONE_WINDOW) {
        window.close();
        return;
      }
      setScreen('unlock');
    } else {
      setScreen('create-password');
    }
  }, [authState, lockState, authLoading, lockLoading]);

  if (screen === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  switch (screen) {
    case 'welcome':
      return (
        <Welcome
          onSuccess={(data) => {
            if (data.onboardingComplete) {
              // User already has a keystore on this network — go straight to unlock.
              // If in persistent window, close it (popup will show unlock via useEffect).
              if (IS_STANDALONE_WINDOW) {
                window.close();
                return;
              }
              setScreen('unlock');
            } else {
              // Store party info for the onboarding flow
              setOnboarding((prev) => ({
                ...prev,
                partyStatus: data.partyStatus,
                existingPublicKey: data.publicKey,
              }));
              setScreen('create-password');
            }
          }}
        />
      );

    case 'create-password':
      return (
        <CreatePassword
          isLocalnet={isLocalnet}
          onReset={async () => {
            await sendMessage({ action: MSG.LOGOUT });
            clearOnboarding();
            setScreen('welcome');
          }}
          onNext={async (password) => {
            if (onboarding.partyStatus === 'SUCCESSFULLY' || onboarding.existingPublicKey) {
              // User already has a key pair on the backend (fully onboarded or onboarding underway) — import existing key
              setOnboarding((prev) => ({ ...prev, password }));
              setScreen('key-setup');
            } else {
              // Truly new user (no public key yet) — auto-generate keypair, skip to show-key
              try {
                const data = await sendMessage<KeyPairData>({ action: MSG.CREATE_KEYPAIR });
                setOnboarding((prev) => ({
                  ...prev,
                  password,
                  privateKey: data.privateKey,
                  publicKey: data.publicKey,
                  isImport: false,
                }));
                setScreen('show-key');
              } catch {
                // Fallback to key-setup if generation fails
                setOnboarding((prev) => ({ ...prev, password }));
                setScreen('key-setup');
              }
            }
          }}
        />
      );

    case 'key-setup':
      return (
        <KeySetup
          existingPublicKey={onboarding.existingPublicKey}
          partyStatus={onboarding.partyStatus}
          onNext={(data) => {
            setOnboarding((prev) => ({
              ...prev,
              privateKey: data.privateKey,
              publicKey: data.publicKey,
              isImport: data.isImport,
            }));
            // Imported keys don't need the "save your key" screen
            setScreen(data.isImport ? 'acknowledgment' : 'show-key');
          }}
          onBack={() => setScreen('create-password')}
        />
      );

    case 'show-key':
      return (
        <ShowPrivateKey
          privateKey={onboarding.privateKey}
          onNext={() => setScreen('acknowledgment')}
          onBack={() => setScreen('create-password')}
        />
      );

    case 'acknowledgment':
      return (
        <Acknowledgment
          isLocalnet={isLocalnet}
          onNext={() => setScreen('typed-confirm')}
          onBack={() => setScreen(onboarding.isImport ? 'key-setup' : 'show-key')}
        />
      );

    case 'typed-confirm':
      return (
        <TypedConfirm
          isLocalnet={isLocalnet}
          password={onboarding.password}
          privateKey={onboarding.privateKey}
          publicKey={onboarding.publicKey}
          preparedParty={onboarding.preparedParty}
          onSuccess={() => {
            clearOnboarding();
            setScreen('dashboard');
          }}
          onBack={() => setScreen('acknowledgment')}
        />
      );

    case 'unlock':
      return (
        <Unlock
          onSuccess={() => setScreen('dashboard')}
          onLogout={() => {
            clearOnboarding();
            setScreen('welcome');
          }}
        />
      );

    case 'dashboard':
      return (
        <Dashboard
          onLock={() => {
            clearOnboarding();
            setScreen('unlock');
          }}
          onLogout={() => {
            clearOnboarding();
            setScreen('welcome');
          }}
        />
      );

    default:
      return null;
  }
}

export default App;
