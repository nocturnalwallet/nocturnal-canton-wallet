import { useState } from 'react';
import { Loader2Icon, CheckCircleIcon } from 'lucide-react';
import { SUPPORTED_TOKENS } from '@lib/constants';
import {
  usePrepareTransferPreapproval,
  useSignAndSubmitTransferPreapproval,
  usePrepareTransferTokenStandard,
  useSignAndSubmitTransferTokenStandard,
} from '../../hooks/useTransfer';
import { useBalances } from '../../hooks/useBalances';
import { sendMessage, MSG } from '@lib/messaging';
import type { AuthStateData } from '@lib/messaging';
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
      const authState = await sendMessage<AuthStateData>({ action: MSG.GET_AUTH_STATE });
      const partyId = authState.partyId;
      if (!partyId) throw new Error('No party ID');

      let result;
      if (isAmulet) {
        result = await prepareAmulet.mutateAsync({
          senderPartyId: partyId,
          receiverPartyId: recipient,
          amount,
          reason: 'Transfer from Ginkgo',
        });
      } else {
        result = await prepareStandard.mutateAsync({
          assetId: tokenId,
          assetAmount: amount,
          receiverPartyId: recipient,
          reason: 'Transfer from Ginkgo',
          maxTimeToExecute: 24,
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
      <div className="flex flex-col items-center justify-center h-full p-6 gap-4">
        <CheckCircleIcon className="w-16 h-16 text-positive" />
        <h2 className="text-lg font-bold text-foreground">Transfer Sent</h2>
        <p className="text-sm text-muted-foreground text-center">
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
          className="rounded-xl bg-primary text-primary-foreground px-6 py-2 text-sm font-medium"
        >
          New Transfer
        </button>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-lg font-bold text-foreground">Confirm Transfer</h2>
        <div className="rounded-xl bg-secondary p-4 space-y-2 text-sm">
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
            <span className="text-foreground text-xs font-mono break-all bg-background rounded-lg px-2 py-1.5">{recipient}</span>
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Password to sign</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 rounded-lg bg-secondary text-foreground px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="Enter password"
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => setStep('form')}
            className="flex-1 rounded-xl bg-secondary text-foreground py-3 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!password || isSubmitting}
            className="flex-1 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium disabled:opacity-40"
          >
            {isSubmitting ? <Loader2Icon className="w-5 h-5 animate-spin mx-auto" /> : 'Sign & Send'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-foreground">Transfer</h2>

      <div>
        <label className="text-sm text-muted-foreground">Token</label>
        <select
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          className="w-full mt-1 rounded-lg bg-secondary text-foreground px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          {SUPPORTED_TOKENS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.symbol} — {t.chainName}
            </option>
          ))}
        </select>
        {selectedBalance && (
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span>Available: <span className="text-foreground font-medium">{availableBalance.toFormat()}</span></span>
            {lockedBalance.gt(0) && (
              <span>Locked: <span className="text-amber-400 font-medium">{lockedBalance.toFormat()}</span></span>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="text-sm text-muted-foreground">Recipient Party ID</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full mt-1 rounded-lg bg-secondary text-foreground px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          placeholder="Enter party ID"
        />
      </div>

      <div>
        <label className="text-sm text-muted-foreground">
          Amount {token && `(min: ${token.minAmount})`}
        </label>
        <div className="relative mt-1">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg bg-secondary text-foreground px-4 py-3 pr-16 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
          />
          {availableBalance.gt(0) && (
            <button
              type="button"
              onClick={() => setAmount(availableBalance.toFixed())}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary/15 text-primary px-2 py-0.5 text-xs font-semibold hover:bg-primary/25 transition-colors"
            >
              MAX
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        onClick={handlePrepare}
        disabled={!recipient || !amount || isPreparing}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-40"
      >
        {isPreparing ? <Loader2Icon className="w-5 h-5 animate-spin mx-auto" /> : 'Continue'}
      </button>
    </div>
  );
}
