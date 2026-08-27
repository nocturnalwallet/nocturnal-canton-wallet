import { useState } from 'react';
import { ArrowLeftIcon, LockIcon, UnlockIcon, ClockIcon, DropletsIcon } from 'lucide-react';
import { IconCanton } from '@assets/icons/icon-canton';
import { IconCBTCCoin } from '@assets/icons/icon-yield-coin';
import { IconUSDC } from '@assets/icons/icon-usdc';
import { IconDefaultToken } from '@assets/icons/icon-default-token';
import { SUPPORTED_TOKENS } from '@lib/constants';
import { format } from '@lib/format';
import type { TokenBalance } from '@lib/types';
import { useNetwork } from '../../hooks/useNetwork';
import { useFaucet } from '../../hooks/useFaucet';
import BigNumber from 'bignumber.js';

const TOKEN_ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  Amulet: IconCanton,
  CBTC: IconCBTCCoin,
  USDCx: IconUSDC,
};

interface Props {
  balance: TokenBalance;
  onBack: () => void;
}

export function TokenDetail({ balance, onBack }: Props) {
  const { config: networkConfig } = useNetwork();
  const { requestFaucet, loading: faucetLoading, error: faucetError } = useFaucet();
  const [faucetSuccess, setFaucetSuccess] = useState(false);
  const [faucetPassword, setFaucetPassword] = useState('');
  const [faucetAmount, setFaucetAmount] = useState('10');

  const tokenId = balance.instrumentId?.id ?? 'Unknown';
  const Icon = TOKEN_ICONS[tokenId] ?? IconDefaultToken;
  const tokenMeta = SUPPORTED_TOKENS.find((t) => t.id === tokenId);
  const tokenName = tokenMeta?.chainName ?? tokenId;
  const symbol = tokenMeta?.symbol ?? tokenId;

  const unlocked = new BigNumber(balance.unlocked ?? '0');
  const locked = new BigNumber(balance.locked ?? '0');
  const total = unlocked.plus(locked);
  const lockedDetails = balance.lockedDetails ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border flex items-center gap-3 border-b px-4 py-3">
        <button
          onClick={onBack}
          className="hover:bg-secondary rounded-lg p-1.5 transition-colors"
        >
          <ArrowLeftIcon className="text-muted-foreground h-4 w-4" />
        </button>
        <h2 className="text-foreground text-sm font-bold">Token Details</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Token header */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="bg-secondary flex h-16 w-16 items-center justify-center overflow-hidden rounded-full">
            <Icon className="h-12 w-12" />
          </div>
          <div className="text-center">
            <p className="text-foreground text-lg font-bold">{tokenName}</p>
            <p className="text-muted-foreground text-sm">${symbol}</p>
          </div>
          <p className="text-foreground text-2xl font-bold">{total.toFormat()}</p>
        </div>

        {/* Balance breakdown */}
        <div className="bg-secondary space-y-3 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UnlockIcon className="text-positive h-4 w-4" />
              <span className="text-muted-foreground text-sm">Available</span>
            </div>
            <span className="text-foreground text-sm font-medium">{unlocked.toFormat()}</span>
          </div>

          <div className="bg-border h-px" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LockIcon className="h-4 w-4 text-amber-400" />
              <span className="text-muted-foreground text-sm">Locked</span>
            </div>
            <span className="text-foreground text-sm font-medium">{locked.toFormat()}</span>
          </div>
        </div>

        {/* Token info */}
        <div className="bg-secondary space-y-3 rounded-xl p-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Token Info</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Decimals</span>
              <span className="text-foreground">{tokenMeta?.decimal ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Min Transfer</span>
              <span className="text-foreground">{tokenMeta?.minAmount ?? '—'}</span>
            </div>
            {balance.instrumentId?.admin && (
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Admin</span>
                <span className="text-foreground font-mono text-xs break-all">
                  {balance.instrumentId.admin}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Locked details */}
        {lockedDetails.length > 0 && (
          <div className="bg-secondary space-y-3 rounded-xl p-4">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Locked Holdings ({lockedDetails.length})
            </p>
            <div className="space-y-2">
              {lockedDetails.map((detail, i) => (
                <div
                  key={i}
                  className="bg-background flex items-center justify-between rounded-lg p-3"
                >
                  <div className="flex items-center gap-2">
                    <LockIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span className="text-foreground text-sm font-medium">
                      {new BigNumber(detail.amount).toFormat()}
                    </span>
                  </div>
                  {detail.etaUnlockAt && (
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <ClockIcon className="h-3 w-3" />
                      <span>{format.date(detail.etaUnlockAt)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Faucet — shown for Amulet on faucet-enabled networks */}
        {tokenId === 'Amulet' && networkConfig?.faucetEnabled && (
          <div className="bg-secondary space-y-3 rounded-xl p-4">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Faucet
            </p>
            <p className="text-muted-foreground text-xs">
              Request test {tokenName} tokens on {networkConfig.label} (max 10,000).
            </p>
            <input
              type="number"
              placeholder="Amount"
              min="0.00001"
              max="10000"
              step="any"
              value={faucetAmount}
              onChange={(e) => setFaucetAmount(e.target.value)}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Enter password to sign"
              value={faucetPassword}
              onChange={(e) => setFaucetPassword(e.target.value)}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            />
            <button
              onClick={async () => {
                setFaucetSuccess(false);
                const ok = await requestFaucet(faucetPassword, faucetAmount);
                if (ok) {
                  setFaucetSuccess(true);
                  setFaucetPassword('');
                }
              }}
              disabled={faucetLoading || !faucetPassword || !faucetAmount || Number(faucetAmount) <= 0 || Number(faucetAmount) > 10000}
              className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <DropletsIcon className="h-4 w-4" />
              {faucetLoading ? 'Requesting...' : `Request ${faucetAmount || '0'} ${symbol}`}
            </button>
            {faucetSuccess && (
              <p className="text-positive text-center text-xs">Faucet request sent!</p>
            )}
            {faucetError && (
              <p className="text-center text-xs text-red-400">{faucetError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
