import { useState, useRef, useEffect } from 'react';
import { WalletIcon, SendIcon, InboxIcon, HistoryIcon, SettingsIcon, ChevronDownIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { IconLogo } from '@assets/icons/icon-logo';
import { Balances } from './Balances';
import { Transfer } from './Transfer';
import { Offers } from './offers';
import { Activity } from './Activity';
import { Settings } from './Settings';
import { useLock } from '../../hooks/useLockState';
import { useAuthState, useLogout } from '../../hooks/useAuth';
import { useNetwork } from '../../hooks/useNetwork';
import { NETWORK_IDS, NETWORKS, type NetworkId } from '@lib/network';
import { onCopyText } from '@lib/utils';

const NETWORK_DOT_COLORS: Record<NetworkId, string> = {
  localnet: 'bg-purple-400',
  devnet: 'bg-blue-400',
  testnet: 'bg-yellow-400',
  mainnet: 'bg-green-400',
};

/** Format a party ID as `hint::first10…last10` */
function formatPartyId(partyId: string): string {
  const sepIdx = partyId.indexOf('::');
  if (sepIdx === -1) return partyId;
  const hint = partyId.slice(0, sepIdx);
  const sig = partyId.slice(sepIdx + 2);
  if (sig.length <= 20) return partyId;
  return `${hint}::${sig.slice(0, 10)}…${sig.slice(-10)}`;
}

type Tab = 'balances' | 'transfer' | 'offers' | 'activity';

interface Props {
  onLock: () => void;
  onLogout: () => void;
}

export function Dashboard({ onLock, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('balances');
  const [showSettings, setShowSettings] = useState(false);
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copiedPartyId, setCopiedPartyId] = useState(false);
  const lock = useLock();
  const logout = useLogout();
  const { data: authState } = useAuthState();
  const { network, switchNetwork, isSwitching } = useNetwork();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNetworkDropdownOpen(false);
      }
    }
    if (networkDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [networkDropdownOpen]);

  const handleLock = async () => {
    await lock.mutateAsync();
    onLock();
  };

  const handleLogout = async () => {
    await logout.mutateAsync();
    onLogout();
  };

  const handleSwitchNetwork = async (id: NetworkId) => {
    if (id === network) {
      setNetworkDropdownOpen(false);
      return;
    }
    setNetworkDropdownOpen(false);
    await switchNetwork(id);
    // Reset to welcome/unlock since session was cleared
    onLogout();
  };

  const tabs: { id: Tab; label: string; icon: typeof WalletIcon }[] = [
    { id: 'balances', label: 'Wallet', icon: WalletIcon },
    { id: 'transfer', label: 'Send', icon: SendIcon },
    { id: 'offers', label: 'Offers', icon: InboxIcon },
    { id: 'activity', label: 'Activity', icon: HistoryIcon },
  ];

  if (showSettings) {
    return (
      <Settings
        onBack={() => setShowSettings(false)}
        onLock={handleLock}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary/15 bg-primary/5">
        <div className="flex items-center gap-1.5">
          <IconLogo className="w-5 h-5" />
          <h1 className="text-sm font-bold text-primary">Ginkgo</h1>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Network selector */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setNetworkDropdownOpen(!networkDropdownOpen)}
              disabled={isSwitching}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
            >
              <span className={`w-2 h-2 rounded-full ${network ? NETWORK_DOT_COLORS[network] : 'bg-gray-400'}`} />
              {network ? NETWORKS[network].label : '...'}
              <ChevronDownIcon className="w-3 h-3" />
            </button>

            {networkDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-36 rounded-lg border border-primary/20 bg-card shadow-lg shadow-black/30">
                {NETWORK_IDS.map((id) => (
                  <button
                    key={id}
                    onClick={() => handleSwitchNetwork(id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      id === network
                        ? 'bg-primary/10 text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${NETWORK_DOT_COLORS[id]}`} />
                    {NETWORKS[id].label}
                    {id === network && <span className="ml-auto text-primary">&#10003;</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
          >
            <SettingsIcon className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Account info */}
      {authState?.user && (
        <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border bg-secondary/50">
          <WalletIcon className="w-7 h-7 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{authState.user.email}</p>
            {authState.partyId && (
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-foreground font-mono truncate flex-1">
                  {formatPartyId(authState.partyId)}
                </p>
                <button
                  onClick={async () => {
                    await onCopyText(authState.partyId!);
                    setCopiedPartyId(true);
                    setTimeout(() => setCopiedPartyId(false), 2000);
                  }}
                  className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedPartyId ? (
                    <CheckIcon className="w-3 h-3 text-positive" />
                  ) : (
                    <CopyIcon className="w-3 h-3" />
                  )}
                </button>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'balances' && <Balances />}
        {tab === 'transfer' && <Transfer />}
        {tab === 'offers' && <Offers />}
        {tab === 'activity' && <Activity />}
      </div>

      {/* Bottom nav */}
      <div className="flex border-t border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              tab === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
