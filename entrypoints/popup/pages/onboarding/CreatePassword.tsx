import { useState } from 'react';
import { EyeIcon, EyeOffIcon, LogOutIcon } from 'lucide-react';

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
    <div className="flex flex-col h-full p-6 bg-background">
      <h1 className="text-xl font-bold text-foreground mb-2">Create Password</h1>
      <p className="text-sm text-muted-foreground mb-6">
        This password encrypts your private key locally.
      </p>

      <div className="space-y-4 flex-1">
        <div>
          <label className="text-sm text-muted-foreground">Password</label>
          <div className="relative mt-1">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-secondary text-foreground px-4 py-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Confirm Password</label>
          <div className="relative mt-1">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg bg-secondary text-foreground px-4 py-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="Confirm password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowConfirm(!showConfirm)}
            >
              {showConfirm ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          {confirm && !passwordsMatch && (
            <p className="text-xs text-destructive mt-1">Passwords do not match</p>
          )}
        </div>

        <div className="space-y-1">
          {PASSWORD_RULES.map((rule) => (
            <div key={rule.label} className="flex items-center gap-2 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${rule.test(password) ? 'bg-positive' : 'bg-muted-foreground'}`} />
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
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-40 transition-opacity"
      >
        Continue
      </button>

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-1.5 mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <LogOutIcon className="w-3.5 h-3.5" />
        Sign out & reset
      </button>
    </div>
  );
}
