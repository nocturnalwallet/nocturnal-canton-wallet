import { useState } from 'react';
import { Loader2Icon, CheckCircleIcon, AlertTriangleIcon } from 'lucide-react';
import { SUPPORTED_TOKENS } from '@lib/constants';
import {
  usePrepareTransferPreapproval,
  useSignAndSubmitTransferPreapproval,
  usePrepareTransferTokenStandard,
  useSignAndSubmitTransferTokenStandard,
} from '../../hooks/useTransfer';
import { useBalances } from '../../hooks/useBalances';
import type {
  PrepareTransferResponse,
  PrepareTransferTokenStandardResponse,
} from '@lib/types';
import BigNumber from 'bignumber.js';

export function Transfer() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenId, setTokenId] = useState('Amulet');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form');
  const [error, setError] = useState('');
  const [preparedData, setPreparedData] = useState<
    PrepareTransferResponse | PrepareTransferTokenStandardResponse | null
  >(null);

  const prepareAmulet = usePrepareTransferPreapproval();
  const submitAmulet = useSignAndSubmitTransferPreapproval();
  const prepareStandard = usePrepareTransferTokenStandard();
  const submitStandard = useSignAndSubmitTransferTokenStandard();

  const { data: balancesData } = useBalances();

  const isAmulet = tokenId === 'Amulet';
  const isPreparing = prepareAmulet.isPending || prepareStandard.isPending;
  const isSubmitting = submitAmulet.isPending || submitStandard.isPending;
  const token = SUPPORTED_TOKENS.find((t) => t.id === tokenId);

  const selectedBalance = balancesData?.balances?.find(
    (b) => b.instrumentId?.id === tokenId,
  );
  const availableBalance = new BigNumber(selectedBalance?.unlocked ?? '0');
  const lockedBalance = new BigNumber(selectedBalance?.locked ?? '0');

  const handlePrepare = async () => {
    setError('');
    try {
      let result;
      if (isAmulet) {
        result = await prepareAmulet.mutateAsync({
          receiverPartyId: recipient,
          amount,
          reason: 'Transfer from Nocturnal',
        });
      } else {
        result = await prepareStandard.mutateAsync({
          assetId: tokenId,
          assetAmount: amount,
          receiverPartyId: recipient,
          reason: 'Transfer from Nocturnal',
          // milliseconds — backend computes executeBefore = now + maxTimeToExecute
          maxTimeToExecute: 24 * 60 * 60 * 1000,
        });
      }

      setPreparedData(result.preparedData as PrepareTransferResponse | PrepareTransferTokenStandardResponse);
      setStep('confirm');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Prepare failed');
    }
  };

  const handleSubmit = async () => {
    if (!preparedData || !password) return;
    setError('');
    try {
      if (isAmulet) {
        await submitAmulet.mutateAsync({
          password,
          preparedData: preparedData as PrepareTransferResponse,
        });
      } else {
        await submitStandard.mutateAsync({
          password,
          preparedData: preparedData as PrepareTransferTokenStandardResponse,
        });
      }
      setStep('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transfer failed');
    }
  };

  if (step === 'success') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <CheckCircleIcon className="text-positive h-16 w-16" />
        <h2 className="text-foreground text-lg font-bold">Transfer Sent</h2>
        <p className="text-muted-foreground text-center text-sm">
          {amount} {tokenId} sent to recipient
        </p>
        <button
          onClick={() => {
            setStep('form');
            setRecipient('');
            setAmount('');
            setPassword('');
            setPreparedData(null);
          }}
          className="bg-primary text-primary-foreground rounded-xl px-6 py-2 text-sm font-medium"
        >
          New Transfer
        </button>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-4 p-4">
        <h2 className="text-foreground text-lg font-bold">Confirm Transfer</h2>
        <div className="bg-secondary space-y-2 rounded-xl p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Token</span>
            <span className="text-foreground">{tokenId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="text-foreground">{amount}</span>
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-muted-foreground">Recipient</span>
            <span className="text-foreground bg-background rounded-lg px-2 py-1.5 font-mono text-xs break-all">{recipient}</span>
          </div>
        </div>

        <div>
          <label htmlFor="transfer-password" className="text-muted-foreground text-sm">Password to sign</label>
          <input
            id="transfer-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary mt-1 w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-1"
            placeholder="Enter password"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertTriangleIcon className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setStep('form')}
            className="bg-secondary text-foreground flex-1 rounded-xl py-3 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!password || isSubmitting}
            className="bg-primary text-primary-foreground flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {isSubmitting ? <Loader2Icon className="mx-auto h-5 w-5 animate-spin" /> : 'Sign & Send'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-foreground text-lg font-bold">Transfer</h2>

      <div>
        <label htmlFor="transfer-token" className="text-muted-foreground text-sm">Token</label>
        <select
          id="transfer-token"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary mt-1 w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-1"
        >
          {SUPPORTED_TOKENS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.symbol} — {t.chainName}
            </option>
          ))}
        </select>
        {selectedBalance && (
          <div className="text-muted-foreground mt-1.5 flex items-center gap-3 text-xs">
            <span>Available: <span className="text-foreground font-medium">{availableBalance.toFormat()}</span></span>
            {lockedBalance.gt(0) && (
              <span>Locked: <span className="font-medium text-amber-400">{lockedBalance.toFormat()}</span></span>
            )}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="transfer-recipient" className="text-muted-foreground text-sm">Recipient Party ID</label>
        <input
          id="transfer-recipient"
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary mt-1 w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-1"
          placeholder="Enter party ID"
        />
      </div>

      <div>
        <label className="text-muted-foreground text-sm">
          Amount {token && `(min: ${token.minAmount})`}
        </label>
        <div className="relative mt-1">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full rounded-lg border px-4 py-3 pr-16 text-sm outline-none focus:ring-1"
            placeholder="0.00"
          />
          {availableBalance.gt(0) && (
            <button
              type="button"
              onClick={() => setAmount(availableBalance.toFixed())}
              className="bg-primary/15 text-primary hover:bg-primary/25 absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors"
            >
              MAX
            </button>
          )}
        </div>
      </div>

      {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertTriangleIcon className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

      <button
        onClick={handlePrepare}
        disabled={!recipient || !amount || isPreparing}
        className="bg-primary text-primary-foreground w-full rounded-xl py-3 font-medium disabled:opacity-40"
      >
        {isPreparing ? <Loader2Icon className="mx-auto h-5 w-5 animate-spin" /> : 'Continue'}
      </button>
    </div>
  );
}
