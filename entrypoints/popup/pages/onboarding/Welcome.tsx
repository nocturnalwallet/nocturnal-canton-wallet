import { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { useGoogleAuth } from '../../hooks/useAuth';
import { useNetwork } from '../../hooks/useNetwork';
import { IconGoogle } from '@assets/icons/icon-google';
import { IconLogo } from '@assets/icons/icon-logo';
import { NETWORK_IDS, NETWORKS, type NetworkId } from '@lib/network';
import type { GoogleAuthData } from '@lib/messaging';

const NETWORK_DOT_COLORS: Record<NetworkId, string> = {
  localnet: 'bg-purple-400',
  devnet: 'bg-blue-400',
  testnet: 'bg-yellow-400',
  mainnet: 'bg-green-400',
};

interface Props {
  onSuccess: (data: GoogleAuthData) => void;
}

/** Check if we're running inside a full onboarding tab (not the extension popup). */
function isOnboardingTab(): boolean {
  return new URLSearchParams(window.location.search).has('tab');
}

export function Welcome({ onSuccess }: Props) {
  const googleAuth = useGoogleAuth();
  const { network, switchNetwork, isSwitching } = useNetwork();
  const [error, setError] = useState('');
  const [networkOpen, setNetworkOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const authTriggered = useRef(false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNetworkOpen(false);
      }
    }
    if (networkOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [networkOpen]);

  const handleSwitchNetwork = async (id: NetworkId) => {
    setNetworkOpen(false);
    if (id === network) return;
    await switchNetwork(id);
  };

  const doAuth = async () => {
    setError('');
    try {
      const data = await googleAuth.mutateAsync();
      onSuccess(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    }
  };

  // Auto-trigger auth when opened in an onboarding tab with ?action=sign-in
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'sign-in' && !authTriggered.current) {
      authTriggered.current = true;
      // Clean up action param but keep tab param
      params.delete('action');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      doAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-time trigger
  }, []);

  const handleGoogleSignIn = async () => {
    if (isOnboardingTab()) {
      // Already in a full onboarding tab — do auth directly
      doAuth();
      return;
    }

    // Open a full browser tab for onboarding (like MetaMask).
    // The extension popup auto-closes when it loses focus, but a tab stays open.
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('popup.html?tab=1&action=sign-in'),
      });
      // Close the extension popup so only the onboarding tab remains
      window.close();
    } catch {
      // Fallback: try auth directly
      doAuth();
    }
  };

  return (
    <div
      className="bg-background relative flex h-full flex-col items-center justify-between bg-cover bg-center p-6"
      style={{ backgroundImage: "linear-gradient(to bottom, rgba(20,16,14,0.72), rgba(20,16,14,0.92)), url('/bg/skyline.png')" }}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <IconLogo className="h-20 w-20" />
        <h1 className="text-foreground text-2xl font-bold">Nocturnal</h1>
        <p className="text-muted-foreground text-center text-sm">
          Securely manage your Canton Network tokens
        </p>
      </div>

      <div className="w-full space-y-3">
        {error && (
          <p className="text-destructive text-center text-sm">{error}</p>
        )}

        {/* Network selector */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setNetworkOpen(!networkOpen)}
            disabled={isSwitching}
            className="border-primary/30 bg-primary/5 text-foreground/70 hover:bg-primary/10 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <span className={`h-2 w-2 rounded-full ${network ? NETWORK_DOT_COLORS[network] : 'bg-gray-400'}`} />
            {network ? NETWORKS[network].label : '...'}
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>

          {networkOpen && (
            <div className="border-primary/20 bg-card absolute right-0 bottom-full left-0 z-50 mb-1 rounded-lg border shadow-lg shadow-black/30">
              {NETWORK_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => handleSwitchNetwork(id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    id === network
                      ? 'bg-primary/10 text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${NETWORK_DOT_COLORS[id]}`} />
                  {NETWORKS[id].label}
                  {id === network && <span className="text-primary ml-auto">&#10003;</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={googleAuth.isPending || isSwitching}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-medium text-black transition-colors hover:bg-gray-100 disabled:opacity-50"
        >
          {googleAuth.isPending ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          ) : (
            <IconGoogle className="h-5 w-5" />
          )}
          {googleAuth.isPending ? 'Signing in…' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}
