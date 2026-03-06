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
    <div className="flex flex-col h-full p-6 bg-background">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ArrowLeftIcon className="w-4 h-4" /> Back
      </button>

      <h1 className="text-xl font-bold text-foreground mb-2">Your Private Key</h1>
      <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 mb-6">
        <TriangleAlertIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm font-medium text-amber-400">
          Save this key securely. You will need it to recover your wallet. Never share it with anyone.
        </p>
      </div>

      {/* Format toggle */}
      <div className="flex rounded-lg bg-secondary p-1 mb-4">
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

      <div className="relative rounded-xl bg-secondary p-4 mb-4">
        <p className="text-sm font-mono break-all text-foreground">
          {revealed ? displayKey : '•'.repeat(Math.min(displayKey.length, 60))}
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setRevealed(!revealed)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {revealed ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
            {revealed ? 'Hide' : 'Reveal'}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? <CheckIcon className="w-3.5 h-3.5 text-positive" /> : <CopyIcon className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex-1" />

      <button
        onClick={onNext}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium"
      >
        I've Saved My Key
      </button>
    </div>
  );
}
