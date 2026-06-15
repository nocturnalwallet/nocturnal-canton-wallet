import { useState } from 'react';
import { ArrowLeftIcon, CheckIcon } from 'lucide-react';

interface Props {
  onNext: () => void;
  onBack: () => void;
  isLocalnet?: boolean;
}

const CHECKS = [
  'I understand that I am fully responsible for keeping my private key safe.',
  'I understand that if I lose my private key, my funds cannot be recovered.',
  'I understand that anyone who has my private key can access my funds.',
];

export function Acknowledgment({ onNext, onBack, isLocalnet }: Props) {
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => isLocalnet ?? false));

  const allChecked = checked.every(Boolean);

  const toggle = (index: number) => {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  return (
    <div className="bg-background flex h-full flex-col p-6">
      <button onClick={onBack} className="text-muted-foreground mb-4 flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>

      <h1 className="text-foreground mb-2 text-xl font-bold">Security Acknowledgment</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Please confirm you understand the following.
      </p>

      <div className="flex-1 space-y-4">
        {CHECKS.map((text, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className="bg-secondary hover:bg-accent flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors"
          >
            <div
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                checked[i] ? 'bg-primary border-primary' : 'border-muted-foreground'
              }`}
            >
              {checked[i] && <CheckIcon className="text-primary-foreground h-3 w-3" />}
            </div>
            <span className="text-foreground text-sm">{text}</span>
          </button>
        ))}
      </div>

      <button
        onClick={onNext}
        disabled={!allChecked}
        className="bg-primary text-primary-foreground w-full rounded-xl py-3 font-medium transition-opacity disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}
