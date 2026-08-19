import { useState, useEffect, useRef } from 'react';
import { useBalances } from '../../hooks/useBalances';
import {
  usePreapprovalStatus,
  useRegisterPreapproval,
  useMaybeAutoRegisterPreapproval,
} from '../../hooks/useWallet';
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

  const autoRegister = useMaybeAutoRegisterPreapproval();
  const autoRegisterFired = useRef(false);
  useEffect(() => {
    if (autoRegisterFired.current) return;
    autoRegisterFired.current = true;
    autoRegister.mutate(); // best-effort; the handler decides (flag/locked/already/register)
  }, [autoRegister]);

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
    !autoRegister.isPending &&
    (!preapprovalData || !preapprovalData.hasPreapproval);

  const selectedToken = selectedTokenId
    ? balances.find((b) => (b.instrumentId?.id ?? 'Unknown') === selectedTokenId) ?? null
    : null;

  if (selectedToken) {
    return <TokenDetail balance={selectedToken} onBack={() => setSelectedTokenId(null)} />;
  }

  return (
    <div className="space-y-3 p-4">
      {/* Transfer pre-approval banner — always visible when no active preapproval */}
      {showPreapprovalBanner && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheckIcon className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs font-medium text-amber-400">
              Transfer pre-approval not active
            </p>
          </div>
          <p className="text-muted-foreground mb-2 text-xs">
            Register transfer pre-approval to enable receiving Amulet transfers.
          </p>
          {preapprovalError && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-sm text-red-400">{preapprovalError}</p>
            </div>
          )}
          <button
            onClick={handleRegisterPreapproval}
            disabled={registerPreapproval.isPending}
            className="bg-primary text-primary-foreground w-full rounded-lg py-1.5 text-xs font-medium transition-opacity disabled:opacity-50"
          >
            {registerPreapproval.isPending ? (
              <Loader2Icon className="mx-auto h-3.5 w-3.5 animate-spin" />
            ) : (
              'Register Transfer Pre-Approval'
            )}
          </button>
        </div>
      )}

      {/* Success message after registration */}
      {showSuccess && (
        <div className="bg-positive/10 border-positive/30 flex items-center gap-2 rounded-xl border p-3">
          <CheckCircle2Icon className="text-positive h-4 w-4 shrink-0" />
          <p className="text-positive text-xs font-medium">
            Transfer pre-approval registered successfully!
          </p>
        </div>
      )}

      {/* Section header with refresh */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">Tokens</p>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCwIcon className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Balance content */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2Icon className="text-primary h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <AlertCircleIcon className="text-destructive h-5 w-5" />
          <p className="text-destructive text-sm">Failed to load balances</p>
          <button onClick={() => refetch()} className="text-primary text-xs hover:underline">
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
              className="bg-primary/5 border-primary/10 hover:bg-primary/10 hover:border-primary/25 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors"
            >
              <div className="bg-background flex h-10 w-10 items-center justify-center overflow-hidden rounded-full">
                <Icon className="h-8 w-8" />
              </div>
              <div className="flex-1">
                <p className="text-foreground font-medium">{tokenId}</p>
                <p className="text-muted-foreground text-xs">
                  Available: {new BigNumber(b.unlocked ?? '0').toFormat()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-foreground font-medium">{total.toFormat()}</p>
                {new BigNumber(b.locked ?? '0').gt(0) && (
                  <p className="text-xs text-amber-400">
                    Locked: {new BigNumber(b.locked ?? '0').toFormat()}
                  </p>
                )}
              </div>
              <ChevronRightIcon className="text-muted-foreground h-4 w-4 shrink-0" />
            </button>
          );
        })
      )}
    </div>
  );
}
