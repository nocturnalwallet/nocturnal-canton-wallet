import { useState } from 'react';
import { Loader2Icon, LockIcon, AlertCircleIcon, XCircleIcon } from 'lucide-react';
import { useOutgoingOffers, usePrepareWithdraw, useSignAndSubmitWithdraw } from '../../../hooks/useOffers';
import { format } from '@lib/format';
import type { PrepareTransferTokenStandardResponse } from '@lib/types';
import BigNumber from 'bignumber.js';

export function OutgoingTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useOutgoingOffers({ page, limit: 5 });

  const prepareWithdraw = usePrepareWithdraw();
  const signWithdraw = useSignAndSubmitWithdraw();

  const [activeContract, setActiveContract] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [preparedData, setPreparedData] = useState<PrepareTransferTokenStandardResponse | null>(null);
  const [withdrawError, setWithdrawError] = useState('');

  const handlePrepareWithdraw = async (contractId: string, tokenId: string) => {
    setWithdrawError('');
    setActiveContract(contractId);
    try {
      const result = await prepareWithdraw.mutateAsync({ contractId, tokenId });
      setPreparedData(result.preparedData as PrepareTransferTokenStandardResponse);
    } catch (e: unknown) {
      setWithdrawError(e instanceof Error ? e.message : 'Prepare withdraw failed');
      setActiveContract(null);
    }
  };

  const handleSignWithdraw = async () => {
    if (!preparedData || !password) return;
    setWithdrawError('');
    try {
      await signWithdraw.mutateAsync({ password, preparedData });
      setActiveContract(null);
      setPreparedData(null);
      setPassword('');
    } catch (e: unknown) {
      setWithdrawError(e instanceof Error ? e.message : 'Withdraw failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2Icon className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <AlertCircleIcon className="w-5 h-5 text-destructive" />
        <p className="text-sm text-destructive">Failed to load outgoing offers</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-8">No outgoing offers</div>;
  }

  return (
    <div className="p-3 space-y-3">
      {items.map((item) => (
        <div key={item.contractId} className="rounded-xl bg-secondary p-3 space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-foreground">
              {new BigNumber(item.amount).toFormat()} {item.tokenName}
            </p>
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <LockIcon className="w-3 h-3" /> Locked
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            To: {format.truncatePartyId(item.receiver, 5)}
          </p>
          {item.requestedAt && (
            <p className="text-xs text-muted-foreground">
              Requested: {format.date(new Date(item.requestedAt))}
            </p>
          )}
          {item.executeBefore && (
            <p className="text-xs text-muted-foreground">
              Expires: {format.date(new Date(item.executeBefore))}
            </p>
          )}

          {activeContract === item.contractId && preparedData ? (
            <div className="space-y-2 pt-2 border-t border-border">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-primary/20 bg-primary/5 text-foreground px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Enter password to sign"
              />
              {withdrawError && (
                <div className="flex gap-2 items-center rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                  <p className="text-sm text-red-400">{withdrawError}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setActiveContract(null); setPreparedData(null); setPassword(''); setWithdrawError(''); }}
                  disabled={signWithdraw.isPending}
                  className="flex-1 rounded-lg border border-muted-foreground/40 bg-muted-foreground/15 text-foreground py-2 text-xs font-medium transition-colors hover:bg-muted-foreground/25 active:bg-muted-foreground/35 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignWithdraw}
                  disabled={!password || signWithdraw.isPending}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 py-2 text-xs font-medium transition-colors hover:bg-red-500/30 hover:border-red-500/50 active:bg-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {signWithdraw.isPending ? (
                    <Loader2Icon className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    'Confirm Withdraw'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handlePrepareWithdraw(item.contractId, item.instrumentId?.id ?? '')}
              disabled={prepareWithdraw.isPending && activeContract === item.contractId}
              className="w-full flex items-center justify-center gap-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 py-2 text-xs font-medium transition-colors hover:bg-red-500/30 hover:border-red-500/50 active:bg-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <XCircleIcon className="w-3.5 h-3.5" /> Withdraw
            </button>
          )}
        </div>
      ))}

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            disabled={!data.has_previous}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded text-xs bg-secondary text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary"
          >
            Prev
          </button>
          <span className="text-xs text-muted-foreground py-1">
            {data.page} / {data.totalPages}
          </span>
          <button
            disabled={!data.has_next}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded text-xs bg-secondary text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
