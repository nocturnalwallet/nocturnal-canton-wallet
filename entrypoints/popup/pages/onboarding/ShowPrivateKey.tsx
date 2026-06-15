import { useState, useMemo } from 'react';
import { ArrowLeftIcon, CopyIcon, CheckIcon, EyeIcon, EyeOffIcon, TriangleAlertIcon } from 'lucide-react';
import { onCopyText, convertBase64ToHex } from '@lib/utils';

type KeyFormat = 'base64' | 'hex';

interface Props {
  privateKey: string;
  onNext: () => void;
  onBack: () => void;
}

export function ShowPrivateKey({ privateKey, onNext, onBack }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<KeyFormat>('base64');

  const displayKey = useMemo(
    () => (format === 'hex' ? convertBase64ToHex(privateKey) : privateKey),
    [privateKey, format],
  );

  const handleCopy = async () => {
    await onCopyText(displayKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-background flex h-full flex-col p-6">
      <button onClick={onBack} className="text-muted-foreground mb-4 flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>

      <h1 className="text-foreground mb-2 text-xl font-bold">Your Private Key</h1>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
        <TriangleAlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <p className="text-sm font-medium text-amber-400">
          Save this key securely. You will need it to recover your wallet. Never share it with anyone.
        </p>
      </div>

      {/* Format toggle */}
      <div className="bg-secondary mb-4 flex rounded-lg p-1">
        <button
          onClick={() => setFormat('base64')}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            format === 'base64'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Base64
        </button>
        <button
          onClick={() => setFormat('hex')}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            format === 'hex'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Hex
        </button>
      </div>

      <div className="bg-secondary relative mb-4 rounded-xl p-4">
        <p className="text-foreground font-mono text-sm break-all">
          {revealed ? displayKey : '•'.repeat(Math.min(displayKey.length, 60))}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setRevealed(!revealed)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            {revealed ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
            {revealed ? 'Hide' : 'Reveal'}
          </button>
          <button
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            {copied ? <CheckIcon className="text-positive h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex-1" />

      <button
        onClick={onNext}
        className="bg-primary text-primary-foreground w-full rounded-xl py-3 font-medium"
      >
        I've Saved My Key
      </button>
    </div>
  );
}
