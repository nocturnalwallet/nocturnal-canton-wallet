import { useState, useEffect } from 'react';
import { useBalances } from '../../hooks/useBalances';
import { usePreapprovalStatus, useRegisterPreapproval } from '../../hooks/useWallet';
import { Loader2Icon, AlertCircleIcon, ShieldCheckIcon, CheckCircle2Icon, ChevronRightIcon, RefreshCwIcon } from 'lucide-react';
import { IconCanton } from '@assets/icons/icon-canton';
import { IconCBTCCoin } from '@assets/icons/icon-yield-coin';
import { IconUSDC } from '@assets/icons/icon-usdc';
import { IconDefaultToken } from '@assets/icons/icon-default-token';
import { TokenDetail } from './TokenDetail';
import BigNumber from 'bignumber.js';

const TOKEN_ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  Amulet: IconCanton,
  CBTC: IconCBTCCoin,
  USDCx: IconUSDC,
};

/** Fixed display order: Amulet first, then CBTC, then USDCx, then any unknown tokens. */
const TOKEN_ORDER: Record<string, number> = { Amulet: 0, CBTC: 1, USDCx: 2 };

export function Balances() {
  const { data, isLoading, error, refetch } = useBalances();
  const { data: preapprovalData, isLoading: preapprovalLoading } = usePreapprovalStatus();
  const registerPreapproval = useRegisterPreapproval();
  const [preapprovalError, setPreapprovalError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  const handleRegisterPreapproval = async () => {
    setPreapprovalError('');
    try {
      await registerPreapproval.mutateAsync();
      setShowSuccess(true);
    } catch (e: unknown) {
      setPreapprovalError(e instanceof Error ? e.message : 'Registration failed');
    }
  };

  // Auto-dismiss success message after 5 seconds
  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [showSuccess]);

  const balances = (() => {
    const fetched = [...(data?.balances ?? [])];
    // Always show Amulet so new users can access the faucet
    const hasAmulet = fetched.some((b) => b.instrumentId?.id === 'Amulet');
    if (!hasAmulet) {
      fetched.push({
        instrumentId: { id: 'Amulet', admin: '' },
        unlocked: '0',
        locked: '0',
        lockedDetails: [],
      });
    }
    return fetched.sort((a, b) => {
      const orderA = TOKEN_ORDER[a.instrumentId?.id ?? ''] ?? 99;
      const orderB = TOKEN_ORDER[b.instrumentId?.id ?? ''] ?? 99;
      return orderA - orderB;
    });
  })();
  const showPreapprovalBanner =
    !preapprovalLoading &&
    !showSuccess &&
    (!preapprovalData || !preapprovalData.hasPreapproval);

  const selectedToken = selectedTokenId
    ? balances.find((b) => (b.instrumentId?.id ?? 'Unknown') === selectedTokenId) ?? null
    : null;

  if (selectedToken) {
    return <TokenDetail balance={selectedToken} onBack={() => setSelectedTokenId(null)} />;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Transfer pre-approval banner — always visible when no active preapproval */}
      {showPreapprovalBanner && (
        <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheckIcon className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs font-medium text-amber-400">
              Transfer pre-approval not active
            </p>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Register transfer pre-approval to enable receiving Amulet transfers.
          </p>
          {preapprovalError && (
            <div className="flex gap-2 items-center rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 mb-2">
              <p className="text-sm text-red-400">{preapprovalError}</p>
            </div>
          )}
          <button
            onClick={handleRegisterPreapproval}
            disabled={registerPreapproval.isPending}
            className="w-full rounded-lg bg-primary text-primary-foreground py-1.5 text-xs font-medium disabled:opacity-50 transition-opacity"
          >
            {registerPreapproval.isPending ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin mx-auto" />
            ) : (
              'Register Transfer Pre-Approval'
            )}
          </button>
        </div>
      )}

      {/* Success message after registration */}
      {showSuccess && (
        <div className="rounded-xl bg-positive/10 border border-positive/30 p-3 flex items-center gap-2">
          <CheckCircle2Icon className="w-4 h-4 text-positive shrink-0" />
          <p className="text-xs font-medium text-positive">
            Transfer pre-approval registered successfully!
          </p>
        </div>
      )}

      {/* Section header with refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Tokens</p>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCwIcon className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Balance content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2Icon className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <AlertCircleIcon className="w-5 h-5 text-destructive" />
          <p className="text-sm text-destructive">Failed to load balances</p>
          <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
            Retry
          </button>
        </div>
      ) : (
        balances.map((b) => {
          const tokenId = b.instrumentId?.id ?? 'Unknown';
          const Icon = TOKEN_ICONS[tokenId] ?? IconDefaultToken;
          const total = new BigNumber(b.unlocked ?? '0').plus(b.locked ?? '0');

          return (
            <button
              key={tokenId}
              onClick={() => setSelectedTokenId(tokenId)}
              className="w-full rounded-xl bg-primary/5 border border-primary/10 p-4 flex items-center gap-3 hover:bg-primary/10 hover:border-primary/25 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-background">
                <Icon className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{tokenId}</p>
                <p className="text-xs text-muted-foreground">
                  Available: {new BigNumber(b.unlocked ?? '0').toFormat()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-foreground">{total.toFormat()}</p>
                {new BigNumber(b.locked ?? '0').gt(0) && (
                  <p className="text-xs text-amber-400">
                    Locked: {new BigNumber(b.locked ?? '0').toFormat()}
                  </p>
                )}
              </div>
              <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          );
        })
      )}
    </div>
  );
}
