import { useState, useEffect, useCallback } from 'react';
import { sendMessage, MSG } from '@lib/messaging';
import type { KeyPairData } from '@lib/messaging';
import { useAuthState } from './hooks/useAuth';
import { useLockState } from './hooks/useLockState';
import { useNetwork } from './hooks/useNetwork';

import { Welcome } from './pages/onboarding/Welcome';
import { KeyMismatch } from './pages/onboarding/KeyMismatch';
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
  | 'key-mismatch'
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
}

const EMPTY_ONBOARDING: OnboardingState = {
  password: '',
  privateKey: '',
  publicKey: '',
  isImport: false,
  partyStatus: 'PENDING',
  existingPublicKey: '',
};

/** True when the app is running inside a full onboarding tab (not the extension popup). */
const IS_ONBOARDING_TAB = new URLSearchParams(window.location.search).has('tab');

// Apply tab-mode class to <html> so CSS can override fixed popup sizing
if (IS_ONBOARDING_TAB) {
  document.documentElement.classList.add('tab-mode');
}

const searchParams = new URLSearchParams(window.location.search);
const APPROVAL_REQUEST_ID = searchParams.get('action') === 'dapp-approve' ? searchParams.get('id') : null;

/** Wrap content in a centered card layout when running in a full browser tab. */
function TabLayout({ children }: { children: React.ReactNode }) {
  if (!IS_ONBOARDING_TAB) return <>{children}</>;
  return (
    <div className="bg-background flex min-h-screen w-full items-center justify-center p-4">
      {/* Fill the viewport height; width scales proportionally (2:3), so the
          expanded tab uses the screen instead of a tiny fixed card. */}
      <div className="border-border/40 aspect-[2/3] h-[calc(100dvh-2rem)] max-h-[960px] w-auto max-w-[95vw] overflow-y-auto rounded-2xl border shadow-2xl shadow-black/40">
        {children}
      </div>
    </div>
  );
}

/**
 * Root router. Conditionally short-circuits to <DappApproval /> when the popup
 * was opened as a dApp approval window (URL has ?action=dapp-approve). All
 * stateful logic lives in <MainApp /> below; doing this split keeps hooks out
 * of the conditional branch and satisfies react-hooks/rules-of-hooks.
 */
function App() {
  if (APPROVAL_REQUEST_ID) {
    return <DappApproval requestId={APPROVAL_REQUEST_ID} />;
  }
  return <MainApp />;
}

function MainApp() {
  const { data: authState, isLoading: authLoading } = useAuthState();
  const { data: lockState, isLoading: lockLoading } = useLockState();
  const { network } = useNetwork();
  const isLocalnet = network === 'localnet';
  const [screen, setScreen] = useState<Screen>('loading');
  const [onboarding, setOnboarding] = useState<OnboardingState>(EMPTY_ONBOARDING);
  const [keyMismatch, setKeyMismatch] = useState(false);
  const [keyMismatchPartyId, setKeyMismatchPartyId] = useState('');
  const [keyMismatchEmail, setKeyMismatchEmail] = useState('');
  // True between a successful wipe and the end of the re-import flow. Suppresses
  // the IS_ONBOARDING_TAB auto-close — useAuthState still holds the stale
  // onboardingComplete=true from sign-in time, which would otherwise close the
  // tab and force the user into a fresh popup with no `onboarding` state.
  const [postWipeRecovery, setPostWipeRecovery] = useState(false);

  // Wipe sensitive onboarding data when leaving the onboarding flow
  const clearOnboarding = useCallback(() => {
    setOnboarding(EMPTY_ONBOARDING);
    setPostWipeRecovery(false);
  }, []);

  // The screen state is derived from auth/lock/keyMismatch/onboarding state.
  // Computing it during render would be more idiomatic in modern React, but
  // would require flattening setScreen's many call sites elsewhere (CreatePassword
  // onNext, KeySetup, etc.). Tracked as a separate refactor in the
  // keystore-mismatch-recovery follow-ups doc; suppress the rule here for now.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (authLoading || lockLoading) {
      setScreen('loading');
      return;
    }

    if (!authState?.isAuthenticated) {
      setScreen('welcome');
      return;
    }

    // NEW: keystore mismatch detected at sign-in — force recovery flow
    if (keyMismatch) {
      setScreen('key-mismatch');
      return;
    }

    if (lockState?.unlocked) {
      setScreen('dashboard');
      return;
    }

    // Authenticated but locked — check if onboarding is done
    // (onboardingComplete comes from the background via namespaced localStore).
    // During post-wipe recovery, treat this as not-yet-onboarded so the user can
    // walk through CreatePassword → KeySetup (import) → Acknowledgment → TypedConfirm
    // in the same React instance (with onboarding.partyStatus already pre-staged
    // by Welcome.onSuccess).
    if (authState.onboardingComplete && !postWipeRecovery) {
      // Onboarding already complete — show the unlock screen. In tab mode we keep
      // the tab open (it previously auto-closed to push the user back to the
      // popup, but the expanded tab is now a primary surface for lock/sign-in).
      setScreen('unlock');
    } else {
      setScreen('create-password');
    }
  }, [authState, lockState, authLoading, lockLoading, keyMismatch, postWipeRecovery]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const renderScreen = () => {
    if (screen === 'loading') {
      return (
        <div className="bg-background flex h-full items-center justify-center">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      );
    }

    switch (screen) {
      case 'welcome':
        return (
          <Welcome
            onSuccess={(data) => {
              // ALWAYS sync keyMismatch to the latest auth response.
              // Prevents stale state from a prior sign-in leaking into a fresh one.
              setKeyMismatch(!!data.keyMismatch);

              // FIRST check: mismatch takes precedence over onboardingComplete.
              if (data.keyMismatch) {
                setKeyMismatchPartyId(data.partyId);
                setKeyMismatchEmail(data.user.email);
                setOnboarding((prev) => ({
                  ...prev,
                  partyStatus: data.partyStatus,
                  existingPublicKey: data.publicKey,
                }));
                setScreen('key-mismatch');
                return;
              }

              if (data.onboardingComplete) {
                // Existing wallet — go straight to unlock, keeping the tab open.
                setScreen('unlock');
              } else {
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

      case 'key-mismatch':
        return (
          <KeyMismatch
            email={keyMismatchEmail}
            partyId={keyMismatchPartyId}
            networkLabel={network === 'localnet' ? 'Localnet' : network === 'devnet' ? 'Devnet' : network === 'testnet' ? 'Testnet' : 'Mainnet'}
            isLocalnet={isLocalnet}
            onSignOut={async () => {
              await sendMessage({ action: MSG.LOGOUT });
              setKeyMismatch(false);              // defensive — onSuccess will re-sync on next sign-in anyway
              clearOnboarding();
              setScreen('welcome');
            }}
            onWipeSuccess={() => {
              // Wipe committed in the background. Lift the routing gate and continue
              // through the existing-user onboarding flow. onboarding.existingPublicKey
              // and partyStatus were set in Welcome.onSuccess (step 4 above).
              // postWipeRecovery suppresses the IS_ONBOARDING_TAB auto-close in the
              // routing useEffect until clearOnboarding fires (on dashboard/logout).
              setKeyMismatch(false);
              setPostWipeRecovery(true);
              setScreen('create-password');
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
  };

  return <TabLayout>{renderScreen()}</TabLayout>;
}

export default App;
