import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeftIcon,
  CopyIcon,
  CheckIcon,
  KeyIcon,
  UserIcon,
  ExternalLinkIcon,
  LockIcon,
  LogOutIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  SettingsIcon,
} from 'lucide-react';
import { useAuthState } from '../../hooks/useAuth';
import { useExportPrivateKey } from '../../hooks/useWallet';
import { onCopyText, convertBase64ToHex } from '@lib/utils';
import { format } from '@lib/format';

const KEY_DISPLAY_TIMEOUT_MS = 30_000; // Auto-clear after 30s

interface Props {
  onBack: () => void;
  onLock: () => void;
  onLogout: () => void;
}

export function Settings({ onBack, onLock, onLogout }: Props) {
  const { data: authState } = useAuthState();
  const exportKey = useExportPrivateKey();

  const [showKeySection, setShowKeySection] = useState(false);
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [keyFormat, setKeyFormat] = useState<'base64' | 'hex'>('base64');
  const [copiedParty, setCopiedParty] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [error, setError] = useState('');
  const keyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const partyId = authState?.partyId ?? '';

  // Auto-clear private key from memory after timeout
  useEffect(() => {
    if (privateKey) {
      keyTimerRef.current = setTimeout(() => {
        setPrivateKey('');
        setPassword('');
        setRevealed(false);
        setShowKeySection(false);
      }, KEY_DISPLAY_TIMEOUT_MS);
    }
    return () => {
      if (keyTimerRef.current) clearTimeout(keyTimerRef.current);
    };
  }, [privateKey]);

  // Clear sensitive data on unmount
  useEffect(() => {
    return () => {
      setPrivateKey('');
      setPassword('');
    };
  }, []);

  const handleCopyPartyId = async () => {
    await onCopyText(partyId);
    setCopiedParty(true);
    setTimeout(() => setCopiedParty(false), 2000);
  };

  const handleExportKey = async () => {
    if (!password) return;
    setError('');
    try {
      const result = await exportKey.mutateAsync(password);
      setPrivateKey(result.privateKey);
      setRevealed(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid password');
    }
  };

  const displayKey = privateKey
    ? keyFormat === 'hex'
      ? convertBase64ToHex(privateKey)
      : privateKey
    : '';

  const handleCopyKey = async () => {
    await onCopyText(displayKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="rounded-lg p-1 hover:bg-secondary">
          <ArrowLeftIcon className="w-4 h-4 text-muted-foreground" />
        </button>
        <h1 className="text-sm font-bold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* User info */}
        {authState?.user && (
          <div className="rounded-xl bg-secondary p-3 space-y-2">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {authState.user.firstName} {authState.user.lastName}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{authState.user.email}</p>
          </div>
        )}

        {/* Party ID */}
        {partyId && (
          <div className="rounded-xl bg-secondary p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Party ID</p>
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono text-foreground flex-1 break-all">
                {format.truncatePartyId(partyId, 8)}
              </p>
              <button
                onClick={handleCopyPartyId}
                className="shrink-0 rounded-lg p-1.5 hover:bg-accent"
              >
                {copiedParty ? (
                  <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <CopyIcon className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Show Private Key */}
        <div className="rounded-xl bg-secondary p-3 space-y-2">
          <button
            onClick={() => {
              setShowKeySection(!showKeySection);
              setPrivateKey('');
              setPassword('');
              setError('');
            }}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <KeyIcon className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Show Private Key</p>
            </div>
            <span className="text-xs text-muted-foreground">{showKeySection ? 'Hide' : 'Show'}</span>
          </button>

          {showKeySection && (
            <div className="space-y-2 pt-2 border-t border-border">
              {!privateKey ? (
                <>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleExportKey()}
                    className="w-full rounded-lg bg-background text-foreground px-3 py-2 text-sm outline-none"
                    placeholder="Enter password to decrypt"
                    autoFocus
                  />
                  {error && (
                    <div className="flex gap-2 items-center rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}
                  <button
                    onClick={handleExportKey}
                    disabled={!password || exportKey.isPending}
                    className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-xs font-medium disabled:opacity-40"
                  >
                    {exportKey.isPending ? (
                      <Loader2Icon className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      'Decrypt Key'
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* Format toggle */}
                  <div className="flex rounded-md bg-background p-0.5">
                    <button
                      onClick={() => setKeyFormat('base64')}
                      className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                        keyFormat === 'base64'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Base64
                    </button>
                    <button
                      onClick={() => setKeyFormat('hex')}
                      className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                        keyFormat === 'hex'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Hex
                    </button>
                  </div>
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-xs font-mono break-all text-foreground">
                      {revealed ? displayKey : '\u2022'.repeat(Math.min(displayKey.length, 40))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRevealed(!revealed)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {revealed ? <EyeOffIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
                      {revealed ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                      onClick={handleCopyKey}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {copiedKey ? <CheckIcon className="w-3 h-3 text-green-500" /> : <CopyIcon className="w-3 h-3" />}
                      {copiedKey ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-destructive">
                    Never share your private key. Anyone with access can steal your funds.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <button
          onClick={handleOpenOptions}
          className="w-full rounded-xl bg-secondary p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Advanced Settings</p>
          </div>
          <ExternalLinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        {/* Lock & Logout */}
        <div className="space-y-2 pt-2">
          <button
            onClick={onLock}
            className="w-full rounded-xl bg-secondary p-3 flex items-center gap-2"
          >
            <LockIcon className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Lock Wallet</p>
          </button>
          <button
            onClick={onLogout}
            className="w-full rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2 hover:bg-red-500/15 transition-colors"
          >
            <LogOutIcon className="w-4 h-4 text-red-400" />
            <p className="text-sm font-medium text-red-400">Sign Out</p>
          </button>
        </div>
      </div>
    </div>
  );
}
