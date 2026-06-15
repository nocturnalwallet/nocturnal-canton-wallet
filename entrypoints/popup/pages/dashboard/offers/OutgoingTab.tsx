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
      <div className="flex h-32 items-center justify-center">
        <Loader2Icon className="text-primary h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2">
        <AlertCircleIcon className="text-destructive h-5 w-5" />
        <p className="text-destructive text-sm">Failed to load outgoing offers</p>
        <button onClick={() => refetch()} className="text-primary text-xs hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-muted-foreground py-8 text-center text-sm">No outgoing offers</div>;
  }

  return (
    <div className="space-y-3 p-3">
      {items.map((item) => (
        <div key={item.contractId} className="bg-secondary space-y-2 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <p className="text-foreground text-sm font-medium">
              {new BigNumber(item.amount).toFormat()} {item.tokenName}
            </p>
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <LockIcon className="h-3 w-3" /> Locked
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            To: {format.truncatePartyId(item.receiver, 5)}
          </p>
          {item.requestedAt && (
            <p className="text-muted-foreground text-xs">
              Requested: {format.date(new Date(item.requestedAt))}
            </p>
          )}
          {item.executeBefore && (
            <p className="text-muted-foreground text-xs">
              Expires: {format.date(new Date(item.executeBefore))}
            </p>
          )}

          {activeContract === item.contractId && preparedData ? (
            <div className="border-border space-y-2 border-t pt-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1"
                placeholder="Enter password to sign"
              />
              {withdrawError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <p className="text-sm text-red-400">{withdrawError}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setActiveContract(null); setPreparedData(null); setPassword(''); setWithdrawError(''); }}
                  disabled={signWithdraw.isPending}
                  className="border-muted-foreground/40 bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25 active:bg-muted-foreground/35 flex-1 rounded-lg border py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignWithdraw}
                  disabled={!password || signWithdraw.isPending}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/20 py-2 text-xs font-medium text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/30 active:bg-red-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {signWithdraw.isPending ? (
                    <Loader2Icon className="mx-auto h-4 w-4 animate-spin" />
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
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/20 py-2 text-xs font-medium text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/30 active:bg-red-500/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <XCircleIcon className="h-3.5 w-3.5" /> Withdraw
            </button>
          )}
        </div>
      ))}

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            disabled={!data.has_previous}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="bg-secondary text-foreground hover:bg-primary/10 active:bg-primary/20 disabled:hover:bg-secondary rounded px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-muted-foreground py-1 text-xs">
            {data.page} / {data.totalPages}
          </span>
          <button
            disabled={!data.has_next}
            onClick={() => setPage((p) => p + 1)}
            className="bg-secondary text-foreground hover:bg-primary/10 active:bg-primary/20 disabled:hover:bg-secondary rounded px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
