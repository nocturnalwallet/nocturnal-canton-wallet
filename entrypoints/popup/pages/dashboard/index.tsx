import { useState, useRef, useEffect } from 'react';
import { WalletIcon, SendIcon, InboxIcon, HistoryIcon, TrendingUpIcon, SettingsIcon, Maximize2Icon, ChevronDownIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { IconLogo } from '@assets/icons/icon-logo';
import brand from '@brand/brand';
import { Balances } from './Balances';
import { Transfer } from './Transfer';
import { Offers } from './offers';
import { HistoryTab } from './offers/HistoryTab';
import { Settings } from './Settings';
import { MarketIntelligence } from './MarketIntelligence';
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

type Tab = 'balances' | 'transfer' | 'offers' | 'history' | 'market';

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
    { id: 'history', label: 'History', icon: HistoryIcon },
    { id: 'market', label: 'Insights', icon: TrendingUpIcon },
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
    <div className="bg-background flex h-full flex-col">
      {/* Header */}
      <div className="border-primary/15 bg-primary/5 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-1.5">
          <IconLogo className="h-5 w-5" />
          <h1 className="text-primary text-sm font-bold">{brand.displayName}</h1>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Network selector */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setNetworkDropdownOpen(!networkDropdownOpen)}
              disabled={isSwitching}
              className="text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <span className={`h-2 w-2 rounded-full ${network ? NETWORK_DOT_COLORS[network] : 'bg-gray-400'}`} />
              {network ? NETWORKS[network].label : '...'}
              <ChevronDownIcon className="h-3 w-3" />
            </button>

            {networkDropdownOpen && (
              <div className="border-primary/20 bg-card absolute top-full right-0 z-50 mt-1 w-36 rounded-lg border shadow-lg shadow-black/30">
                {NETWORK_IDS.map((id) => (
                  <button
                    key={id}
                    onClick={() => handleSwitchNetwork(id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors first:rounded-t-lg last:rounded-b-lg ${
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

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="hover:bg-secondary rounded-lg p-1.5 transition-colors"
          >
            <SettingsIcon className="text-muted-foreground h-4 w-4" />
          </button>

          {/* Expand to full tab */}
          <button
            onClick={() => {
              const url = chrome.runtime.getURL('/popup.html?tab');
              chrome.tabs.create({ url });
              window.close();
            }}
            className="hover:bg-secondary rounded-lg p-1.5 transition-colors"
          >
            <Maximize2Icon className="text-muted-foreground h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Account info */}
      {authState?.user && (
        <div className="border-border bg-secondary/50 flex items-center gap-2.5 border-b px-4 py-2">
          <WalletIcon className="text-primary h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-semibold">{authState.user.email}</p>
            {authState.partyId && (
              <div className="flex items-center gap-1">
                <p className="text-foreground flex-1 truncate font-mono text-sm font-semibold">
                  {formatPartyId(authState.partyId)}
                </p>
                <button
                  onClick={async () => {
                    await onCopyText(authState.partyId!);
                    setCopiedPartyId(true);
                    setTimeout(() => setCopiedPartyId(false), 2000);
                  }}
                  className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 transition-colors"
                >
                  {copiedPartyId ? (
                    <CheckIcon className="text-positive h-3 w-3" />
                  ) : (
                    <CopyIcon className="h-3 w-3" />
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
        {tab === 'history' && <HistoryTab />}
        {tab === 'market' && <MarketIntelligence />}
      </div>

      {/* Bottom nav */}
      <div className="border-border flex border-t">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              tab === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
