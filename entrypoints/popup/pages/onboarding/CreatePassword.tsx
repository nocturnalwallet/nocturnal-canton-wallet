import { useState } from 'react';
import { EyeIcon, EyeOffIcon, LogOutIcon, AlertTriangleIcon } from 'lucide-react';

interface Props {
  onNext: (password: string) => void;
  onReset: () => void;
  isLocalnet?: boolean;
}

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'A digit', test: (p: string) => /\d/.test(p) },
  { label: 'Special character', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export function CreatePassword({ onNext, onReset, isLocalnet }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const allRulesPassed = isLocalnet ? password.length > 0 : PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canProceed = allRulesPassed && passwordsMatch;

  return (
    <div className="bg-background flex h-full flex-col p-6">
      <h1 className="text-foreground mb-2 text-xl font-bold">Create Password</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        This password encrypts your private key locally.
      </p>

      <div className="flex-1 space-y-4">
        <div>
          <label htmlFor="cp-password" className="text-muted-foreground text-sm">Password</label>
          <div className="relative mt-1">
            <input
              id="cp-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full rounded-lg border px-4 py-3 pr-10 text-sm outline-none focus:ring-1"
              placeholder="Enter password"
            />
            <button
              type="button"
              className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="cp-confirm" className="text-muted-foreground text-sm">Confirm Password</label>
          <div className="relative mt-1">
            <input
              id="cp-confirm"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full rounded-lg border px-4 py-3 pr-10 text-sm outline-none focus:ring-1"
              placeholder="Confirm password"
            />
            <button
              type="button"
              className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
              onClick={() => setShowConfirm(!showConfirm)}
            >
              {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
          {confirm && !passwordsMatch && (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertTriangleIcon className="h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-400">Passwords do not match</p>
            </div>
          )}
        </div>

        <div className="space-y-1">
          {PASSWORD_RULES.map((rule) => (
            <div key={rule.label} className="flex items-center gap-2 text-xs">
              <div className={`h-1.5 w-1.5 rounded-full ${rule.test(password) ? 'bg-positive' : 'bg-muted-foreground'}`} />
              <span className={rule.test(password) ? 'text-positive' : 'text-muted-foreground'}>
                {rule.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => canProceed && onNext(password)}
        disabled={!canProceed}
        className="bg-primary text-primary-foreground w-full rounded-xl py-3 font-medium transition-opacity disabled:opacity-40"
      >
        Continue
      </button>

      <button
        onClick={onReset}
        className="text-muted-foreground hover:text-foreground mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-sm transition-colors"
      >
        <LogOutIcon className="h-3.5 w-3.5" />
        Sign out & reset
      </button>
    </div>
  );
}
