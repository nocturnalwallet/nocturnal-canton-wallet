import { useState } from 'react';
import { Loader2Icon, CheckCircleIcon, XCircleIcon, LockIcon, AlertTriangleIcon, AlertCircleIcon, ShieldCheckIcon } from 'lucide-react';
import { useHistoryOffers } from '../../../hooks/useOffers';
import { format } from '@lib/format';
import BigNumber from 'bignumber.js';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  APPROVED: { label: 'APPROVED', color: 'text-positive', icon: CheckCircleIcon },
  AUTO_APPROVED: { label: 'AUTO APPROVED', color: 'text-positive', icon: ShieldCheckIcon },
  CANCELLED: { label: 'CANCELLED', color: 'text-red-500', icon: XCircleIcon },
  REJECTED: { label: 'REJECTED', color: 'text-red-500', icon: XCircleIcon },
  LOCKED: { label: 'LOCKED', color: 'text-amber-400', icon: LockIcon },
  EXPIRED: { label: 'EXPIRED', color: 'text-gray-400', icon: AlertTriangleIcon },
};

export function HistoryTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useHistoryOffers({ page, limit: 5 });

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
        <p className="text-destructive text-sm">Failed to load history</p>
        <button onClick={() => refetch()} className="text-primary text-xs hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-muted-foreground py-8 text-center text-sm">No history</div>;
  }

  return (
    <div className="space-y-3 p-3">
      {items.map((item, i) => {
        const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.APPROVED;
        const StatusIcon = cfg.icon;

        return (
          <div key={`${item.contractId}-${i}`} className="bg-secondary space-y-1 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-foreground text-sm font-medium">
                {new BigNumber(item.amount).toFormat()} {item.tokenName}
              </p>
              <div className={`flex items-center gap-1 text-xs ${cfg.color}`}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {item.updatedAt ? format.date(new Date(item.updatedAt)) : ''}
            </p>
            <p className="text-muted-foreground text-xs">
              {item.sender && format.truncatePartyId(item.sender, 5)} → {item.receiver && format.truncatePartyId(item.receiver, 5)}
            </p>
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
