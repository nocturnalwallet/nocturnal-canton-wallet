import type { FeeBlock } from '@lib/types';

function isDisplayableFee(fee: FeeBlock): boolean {
  const hasTotal = Boolean(fee.totalFee);
  const hasLines = (fee.fees ?? []).length > 0;
  return hasTotal || hasLines;
}

export function PreparedFeeSection({ fee }: { fee: FeeBlock }) {
  if (!isDisplayableFee(fee)) return null;

  return (
    <div className="bg-secondary space-y-2 rounded-xl p-4 text-sm">
      <p className="text-foreground font-medium">Estimated fee</p>
      <p className="text-muted-foreground text-xs">
        Estimate — may not be charged depending on network conditions.
      </p>
      {(fee.fees ?? []).map((line, index) => (
        <div key={`${line.description}-${index}`} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{line.description}</span>
          <span className="text-foreground shrink-0">
            {line.amount} {fee.currency}
          </span>
        </div>
      ))}
      {fee.totalFee ? (
        <div className="border-primary/10 flex justify-between gap-3 border-t pt-2 font-medium">
          <span className="text-muted-foreground">Total estimated fee</span>
          <span className="text-foreground shrink-0">
            {fee.totalFee} {fee.currency}
          </span>
        </div>
      ) : null}
    </div>
  );
}
