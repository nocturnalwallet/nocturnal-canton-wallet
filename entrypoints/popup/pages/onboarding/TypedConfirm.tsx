import { useState } from 'react';
import { ArrowLeftIcon, Loader2Icon, AlertTriangleIcon } from 'lucide-react';
import { TYPO_TEXT } from '@lib/constants';
import { useCompleteOnboarding } from '../../hooks/useWallet';

interface Props {
  password: string;
  privateKey: string;
  publicKey: string;
  onSuccess: () => void;
  onBack: () => void;
  isLocalnet?: boolean;
}

export function TypedConfirm({ password, privateKey, publicKey, onSuccess, onBack, isLocalnet }: Props) {
  const [typed, setTyped] = useState(isLocalnet ? TYPO_TEXT : '');
  const [error, setError] = useState('');
  const completeOnboarding = useCompleteOnboarding();

  const matches = typed.trim() === TYPO_TEXT;

  const handleSubmit = async () => {
    if (!matches) return;
    setError('');
    try {
      await completeOnboarding.mutateAsync({
        password,
        privateKey,
        publicKey,
      });
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onboarding failed');
    }
  };

  return (
    <div className="bg-background flex h-full flex-col p-6">
      <button onClick={onBack} className="text-muted-foreground mb-4 flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>

      <h1 className="text-foreground mb-2 text-xl font-bold">Confirm</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Type the following phrase exactly to confirm:
      </p>

      <div className="bg-secondary mb-4 rounded-xl p-4">
        <p className="text-foreground text-sm font-medium italic">"{TYPO_TEXT}"</p>
      </div>

      <textarea
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary h-24 w-full resize-none rounded-lg border p-4 text-sm outline-none focus:ring-1"
        placeholder="Type the phrase here..."
      />

      {error && (
        <div className="mt-2 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex-1" />

      <button
        onClick={handleSubmit}
        disabled={!matches || completeOnboarding.isPending}
        className="bg-primary text-primary-foreground w-full rounded-xl py-3 font-medium transition-opacity disabled:opacity-40"
      >
        {completeOnboarding.isPending ? (
          <Loader2Icon className="mx-auto h-5 w-5 animate-spin" />
        ) : (
          'Complete Setup'
        )}
      </button>
    </div>
  );
}
