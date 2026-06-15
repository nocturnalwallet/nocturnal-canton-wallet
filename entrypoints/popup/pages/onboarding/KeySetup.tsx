import { useState } from 'react';
import { useCreateKeypair, useValidateImportKey } from '../../hooks/useWallet';
import { KeyRoundIcon, ImportIcon, ArrowLeftIcon, Loader2Icon, AlertTriangleIcon } from 'lucide-react';

interface Props {
  existingPublicKey?: string;
  partyStatus?: string;
  onNext: (data: { privateKey: string; publicKey: string; isImport: boolean }) => void;
  onBack: () => void;
}

export function KeySetup({ existingPublicKey, partyStatus, onNext, onBack }: Props) {
  const isExistingUser = !!existingPublicKey || partyStatus === 'SUCCESSFULLY';
  const [mode, setMode] = useState<'choose' | 'import'>(isExistingUser ? 'import' : 'choose');
  const [importKey, setImportKey] = useState('');
  const [error, setError] = useState('');

  const createKeypair = useCreateKeypair();
  const validateImport = useValidateImportKey();

  const handleCreate = async () => {
    setError('');
    try {
      const data = await createKeypair.mutateAsync();
      onNext({ ...data, isImport: false });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Key generation failed');
    }
  };

  const handleImport = async () => {
    setError('');
    if (!importKey.trim()) {
      setError('Please enter your private key');
      return;
    }
    try {
      const data = await validateImport.mutateAsync({
        privateKey: importKey.trim(),
        expectedPublicKey: existingPublicKey,
      });
      onNext({ ...data, isImport: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid private key');
    }
  };

  const isLoading = createKeypair.isPending || validateImport.isPending;

  if (mode === 'import') {
    return (
      <div className="bg-background flex h-full flex-col p-6">
        <button
          onClick={() => (isExistingUser ? onBack() : setMode('choose'))}
          className="text-muted-foreground mb-4 flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back
        </button>

        <h1 className="text-foreground mb-2 text-xl font-bold">Import Key</h1>

        {isExistingUser && (
          <div className="mb-4 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <p className="text-foreground mb-1 font-medium">
                This account is already onboarded
              </p>
              <p className="text-muted-foreground">
                You must import the private key that corresponds to your existing public key. Using a different key will result in failed transactions.
              </p>
              <p className="text-muted-foreground mt-2 font-mono text-xs break-all">
                Public key: {existingPublicKey}
              </p>
            </div>
          </div>
        )}

        <p className="text-muted-foreground mb-6 text-sm">
          Paste your existing Canton private key (Base64 or Hex).
        </p>

        <textarea
          value={importKey}
          onChange={(e) => setImportKey(e.target.value)}
          className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full flex-1 resize-none rounded-lg border p-4 font-mono text-sm outline-none focus:ring-1"
          placeholder="Paste private key here..."
        />

        {error && (
          <div className="mt-3 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={isLoading}
          className="bg-primary text-primary-foreground mt-4 w-full rounded-xl py-3 font-medium disabled:opacity-40"
        >
          {isLoading ? <Loader2Icon className="mx-auto h-5 w-5 animate-spin" /> : 'Import & Continue'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-background flex h-full flex-col p-6">
      <button onClick={onBack} className="text-muted-foreground mb-4 flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>

      <h1 className="text-foreground mb-2 text-xl font-bold">Key Setup</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Create a new key pair or import an existing one.
      </p>

      <div className="flex-1 space-y-4">
        <button
          onClick={handleCreate}
          disabled={isLoading}
          className="bg-secondary hover:bg-accent flex w-full items-center gap-4 rounded-xl p-4 text-left transition-colors"
        >
          <div className="bg-primary/20 rounded-lg p-3">
            <KeyRoundIcon className="text-primary h-6 w-6" />
          </div>
          <div>
            <p className="text-foreground font-medium">Create New Key</p>
            <p className="text-muted-foreground text-xs">Generate a fresh key pair</p>
          </div>
        </button>

        <button
          onClick={() => setMode('import')}
          className="bg-secondary hover:bg-accent flex w-full items-center gap-4 rounded-xl p-4 text-left transition-colors"
        >
          <div className="bg-primary/20 rounded-lg p-3">
            <ImportIcon className="text-primary h-6 w-6" />
          </div>
          <div>
            <p className="text-foreground font-medium">Import Existing Key</p>
            <p className="text-muted-foreground text-xs">Use your existing private key</p>
          </div>
        </button>
      </div>

      {error && (
        <div className="mt-3 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
