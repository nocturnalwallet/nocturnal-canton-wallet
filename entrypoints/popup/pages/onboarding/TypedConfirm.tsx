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
    <div className="flex flex-col h-full p-6 bg-background">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ArrowLeftIcon className="w-4 h-4" /> Back
      </button>

      <h1 className="text-xl font-bold text-foreground mb-2">Confirm</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Type the following phrase exactly to confirm:
      </p>

      <div className="rounded-xl bg-secondary p-4 mb-4">
        <p className="text-sm font-medium text-foreground italic">"{TYPO_TEXT}"</p>
      </div>

      <textarea
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="w-full rounded-lg border border-primary/20 bg-primary/5 text-foreground p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none h-24"
        placeholder="Type the phrase here..."
      />

      {error && (
        <div className="flex gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-3 mt-2">
          <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex-1" />

      <button
        onClick={handleSubmit}
        disabled={!matches || completeOnboarding.isPending}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-40 transition-opacity"
      >
        {completeOnboarding.isPending ? (
          <Loader2Icon className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          'Complete Setup'
        )}
      </button>
    </div>
  );
}
