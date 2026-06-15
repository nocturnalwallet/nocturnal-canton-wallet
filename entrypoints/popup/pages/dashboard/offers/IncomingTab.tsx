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
      <div className="flex h-32 items-center justify-center">
        <Loader2Icon className="text-primary h-5 w-5 animate-spin" />
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-muted-foreground py-8 text-center text-sm">No incoming offers</div>;
  }

  return (
    <div className="space-y-3 p-3">
      {items.map((item) => {
        const expired = isExpired(item.executeBefore);

        return (
          <div key={item.contractId} className="bg-secondary space-y-2 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-foreground text-sm font-medium">
                {new BigNumber(item.amount).toFormat()} {item.tokenName}
              </p>
              {expired ? (
                <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-500">
                  Expired
                </span>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {item.createdAt ? format.date(new Date(item.createdAt)) : ''}
                </p>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              From: {format.truncatePartyId(item.sender, 5)}
            </p>
            {item.requestedAt && (
              <p className="text-muted-foreground text-xs">
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
                  <div className="border-border space-y-2 border-t pt-2">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1"
                      placeholder="Enter password to sign"
                    />
                    {error && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActiveContract(null); setPreparedData(null); setPassword(''); }}
                        disabled={signApprove.isPending || signReject.isPending}
                        className="border-muted-foreground/40 bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25 active:bg-muted-foreground/35 flex-1 rounded-lg border py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSign}
                        disabled={!password || signApprove.isPending || signReject.isPending}
                        className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          pendingAction === 'reject'
                            ? 'border border-red-500/30 bg-red-500/20 text-red-400 hover:border-red-500/50 hover:bg-red-500/30 active:bg-red-500/40'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80'
                        }`}
                      >
                        {(signApprove.isPending || signReject.isPending) ? (
                          <Loader2Icon className="mx-auto h-4 w-4 animate-spin" />
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
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/20 py-2 text-xs font-medium text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/30 active:bg-red-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <XIcon className="h-3.5 w-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => handlePrepare(item.contractId, item.instrumentId?.id ?? '', 'approve')}
                      disabled={prepareApprove.isPending}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckIcon className="h-3.5 w-3.5" /> Approve
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
