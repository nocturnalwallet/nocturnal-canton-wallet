import { useState } from 'react';
import { Loader2Icon, CheckIcon, XIcon } from 'lucide-react';
import { useIncomingOffers, usePrepareApprove, usePrepareReject, useSignAndSubmitApprove, useSignAndSubmitReject } from '../../../hooks/useOffers';
import { format } from '@lib/format';
import type { PrepareTransferTokenStandardResponse } from '@lib/types';
import BigNumber from 'bignumber.js';

function isExpired(executeBefore?: string): boolean {
  if (!executeBefore) return false;
  return new Date() > new Date(executeBefore);
}

export function IncomingTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useIncomingOffers({ page, limit: 5 });

  const prepareApprove = usePrepareApprove();
  const prepareReject = usePrepareReject();
  const signApprove = useSignAndSubmitApprove();
  const signReject = useSignAndSubmitReject();

  const [activeContract, setActiveContract] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null);
  const [preparedData, setPreparedData] = useState<PrepareTransferTokenStandardResponse | null>(null);
  const [error, setError] = useState('');

  const handlePrepare = async (contractId: string, tokenId: string, action: 'approve' | 'reject') => {
    setError('');
    setActiveContract(contractId);
    setPendingAction(action);
    try {
      const fn = action === 'approve' ? prepareApprove : prepareReject;
      const result = await fn.mutateAsync({ contractId, tokenId });
      setPreparedData(result.preparedData as PrepareTransferTokenStandardResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Prepare failed');
      setActiveContract(null);
      setPendingAction(null);
    }
  };

  const handleSign = async () => {
    if (!preparedData || !password) return;
    setError('');
    try {
      const fn = pendingAction === 'approve' ? signApprove : signReject;
      await fn.mutateAsync({ password, preparedData });
      setActiveContract(null);
      setPreparedData(null);
      setPassword('');
      setPendingAction(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2Icon className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-8">No incoming offers</div>;
  }

  return (
    <div className="p-3 space-y-3">
      {items.map((item) => {
        const expired = isExpired(item.executeBefore);

        return (
          <div key={item.contractId} className="rounded-xl bg-secondary p-3 space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium text-foreground">
                {new BigNumber(item.amount).toFormat()} {item.tokenName}
              </p>
              {expired ? (
                <span className="text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded">
                  Expired
                </span>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {item.createdAt ? format.date(new Date(item.createdAt)) : ''}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              From: {format.truncatePartyId(item.sender, 5)}
            </p>
            {item.requestedAt && (
              <p className="text-xs text-muted-foreground">
                Requested: {format.date(new Date(item.requestedAt))}
              </p>
            )}
            {item.executeBefore && (
              <p className={`text-xs ${expired ? 'text-red-400' : 'text-muted-foreground'}`}>
                Expires: {format.date(new Date(item.executeBefore))}
              </p>
            )}

            {!expired && (
              <>
                {activeContract === item.contractId && preparedData ? (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-primary/20 bg-primary/5 text-foreground px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="Enter password to sign"
                    />
                    {error && (
                      <div className="flex gap-2 items-center rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActiveContract(null); setPreparedData(null); setPassword(''); }}
                        disabled={signApprove.isPending || signReject.isPending}
                        className="flex-1 rounded-lg border border-muted-foreground/40 bg-muted-foreground/15 text-foreground py-2 text-xs font-medium transition-colors hover:bg-muted-foreground/25 active:bg-muted-foreground/35 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSign}
                        disabled={!password || signApprove.isPending || signReject.isPending}
                        className={`flex-1 flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          pendingAction === 'reject'
                            ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:border-red-500/50 active:bg-red-500/40'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80'
                        }`}
                      >
                        {(signApprove.isPending || signReject.isPending) ? (
                          <Loader2Icon className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                          `Confirm ${pendingAction === 'approve' ? 'Approve' : 'Reject'}`
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePrepare(item.contractId, item.instrumentId?.id ?? '', 'reject')}
                      disabled={prepareReject.isPending}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 py-2 text-xs font-medium transition-colors hover:bg-red-500/30 hover:border-red-500/50 active:bg-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <XIcon className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => handlePrepare(item.contractId, item.instrumentId?.id ?? '', 'approve')}
                      disabled={prepareApprove.isPending}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-medium transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckIcon className="w-3.5 h-3.5" /> Approve
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

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
