import { useState } from 'react';
import { EyeIcon, EyeOffIcon, Loader2Icon, LockIcon, LogOutIcon } from 'lucide-react';
import { useUnlock } from '../hooks/useLockState';
import { useAuthState, useLogout } from '../hooks/useAuth';
import { IconLogo } from '@assets/icons/icon-logo';

interface Props {
  onSuccess: () => void;
  onLogout: () => void;
}

export function Unlock({ onSuccess, onLogout }: Props) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const unlock = useUnlock();
  const logout = useLogout();
  const { data: authState } = useAuthState();

  const handleUnlock = async () => {
    if (!password) return;
    setError('');
    try {
      await unlock.mutateAsync(password);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid password');
    }
  };

  return (
    <div className="bg-background flex h-full flex-col items-center justify-between p-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <IconLogo className="h-16 w-16" />
        <div className="bg-secondary rounded-full p-4">
          <LockIcon className="text-primary h-8 w-8" />
        </div>
        <h1 className="text-foreground text-xl font-bold">Wallet Locked</h1>
        <p className="text-muted-foreground text-center text-sm">
          Enter your password to unlock
        </p>
        {authState?.user?.email && (
          <div className="bg-secondary mt-1 flex items-center gap-2 rounded-lg px-3 py-1.5">
            <div className="bg-primary/20 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              {authState.user.email[0].toUpperCase()}
            </div>
            <p className="text-foreground truncate text-sm font-medium">
              {authState.user.email}
            </p>
          </div>
        )}
      </div>

      <div className="w-full space-y-3">
        {error && <p className="text-destructive text-center text-sm">{error}</p>}

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full rounded-lg border px-4 py-3 pr-10 text-sm outline-none focus:ring-1"
            placeholder="Enter password"
            // The unlock screen is the only thing on screen; autofocusing the
            // password input lets users type immediately. Keyboard users still
            // tab through; screen readers announce the focused input on load.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button
            type="button"
            className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>

        <button
          onClick={handleUnlock}
          disabled={!password || unlock.isPending}
          className="bg-primary text-primary-foreground w-full rounded-xl py-3 font-medium transition-opacity disabled:opacity-40"
        >
          {unlock.isPending ? (
            <Loader2Icon className="mx-auto h-5 w-5 animate-spin" />
          ) : (
            'Unlock'
          )}
        </button>

        <button
          onClick={async () => {
            await logout.mutateAsync();
            onLogout();
          }}
          disabled={logout.isPending}
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-2 py-2 text-sm transition-colors disabled:opacity-40"
        >
          <LogOutIcon className="h-4 w-4" />
          Sign in with a different account
        </button>
      </div>
    </div>
  );
}
