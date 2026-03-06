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
      <div className="flex flex-col h-full p-6 bg-background">
        <button
          onClick={() => (isExistingUser ? onBack() : setMode('choose'))}
          className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back
        </button>

        <h1 className="text-xl font-bold text-foreground mb-2">Import Key</h1>

        {isExistingUser && (
          <div className="flex gap-3 rounded-xl bg-amber-400/10 border border-amber-400/30 p-3 mb-4">
            <AlertTriangleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground mb-1">
                This account is already onboarded
              </p>
              <p className="text-muted-foreground">
                You must import the private key that corresponds to your existing public key. Using a different key will result in failed transactions.
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
                Public key: {existingPublicKey}
              </p>
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-6">
          Paste your existing Canton private key (Base64 or Hex).
        </p>

        <textarea
          value={importKey}
          onChange={(e) => setImportKey(e.target.value)}
          className="w-full flex-1 rounded-lg border border-primary/20 bg-primary/5 text-foreground p-4 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          placeholder="Paste private key here..."
        />

        {error && (
          <div className="flex gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-3 mt-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={isLoading}
          className="w-full mt-4 rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-40"
        >
          {isLoading ? <Loader2Icon className="w-5 h-5 animate-spin mx-auto" /> : 'Import & Continue'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 bg-background">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ArrowLeftIcon className="w-4 h-4" /> Back
      </button>

      <h1 className="text-xl font-bold text-foreground mb-2">Key Setup</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Create a new key pair or import an existing one.
      </p>

      <div className="space-y-4 flex-1">
        <button
          onClick={handleCreate}
          disabled={isLoading}
          className="w-full flex items-center gap-4 rounded-xl bg-secondary p-4 hover:bg-accent transition-colors text-left"
        >
          <div className="rounded-lg bg-primary/20 p-3">
            <KeyRoundIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Create New Key</p>
            <p className="text-xs text-muted-foreground">Generate a fresh key pair</p>
          </div>
        </button>

        <button
          onClick={() => setMode('import')}
          className="w-full flex items-center gap-4 rounded-xl bg-secondary p-4 hover:bg-accent transition-colors text-left"
        >
          <div className="rounded-lg bg-primary/20 p-3">
            <ImportIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Import Existing Key</p>
            <p className="text-xs text-muted-foreground">Use your existing private key</p>
          </div>
        </button>
      </div>

      {error && (
        <div className="flex gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-3 mt-3">
          <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
