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
    <div className="bg-background flex h-full flex-col">
      {/* Header */}
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <button onClick={onBack} className="hover:bg-secondary rounded-lg p-1">
          <ArrowLeftIcon className="text-muted-foreground h-4 w-4" />
        </button>
        <h1 className="text-foreground text-sm font-bold">Settings</h1>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {/* User info */}
        {authState?.user && (
          <div className="bg-secondary space-y-2 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <UserIcon className="text-muted-foreground h-4 w-4" />
              <p className="text-foreground text-sm font-medium">
                {authState.user.firstName} {authState.user.lastName}
              </p>
            </div>
            <p className="text-muted-foreground text-xs">{authState.user.email}</p>
          </div>
        )}

        {/* Party ID */}
        {partyId && (
          <div className="bg-secondary space-y-2 rounded-xl p-3">
            <p className="text-muted-foreground text-xs font-medium">Party ID</p>
            <div className="flex items-center gap-2">
              <p className="text-foreground flex-1 font-mono text-xs break-all">
                {format.truncatePartyId(partyId, 8)}
              </p>
              <button
                onClick={handleCopyPartyId}
                className="hover:bg-accent shrink-0 rounded-lg p-1.5"
              >
                {copiedParty ? (
                  <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <CopyIcon className="text-muted-foreground h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Show Private Key */}
        <div className="bg-secondary space-y-2 rounded-xl p-3">
          <button
            onClick={() => {
              setShowKeySection(!showKeySection);
              setPrivateKey('');
              setPassword('');
              setError('');
            }}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <KeyIcon className="text-muted-foreground h-4 w-4" />
              <p className="text-foreground text-sm font-medium">Show Private Key</p>
            </div>
            <span className="text-muted-foreground text-xs">{showKeySection ? 'Hide' : 'Show'}</span>
          </button>

          {showKeySection && (
            <div className="border-border space-y-2 border-t pt-2">
              {!privateKey ? (
                <>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleExportKey()}
                    className="bg-background text-foreground w-full rounded-lg px-3 py-2 text-sm outline-none"
                    placeholder="Enter password to decrypt"
                    // Inline password prompt — autofocus is the expected UX so
                    // users can type immediately. Modal-like flow inside a
                    // settings panel; keyboard nav still works.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                  {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}
                  <button
                    onClick={handleExportKey}
                    disabled={!password || exportKey.isPending}
                    className="bg-primary text-primary-foreground w-full rounded-lg py-2 text-xs font-medium disabled:opacity-40"
                  >
                    {exportKey.isPending ? (
                      <Loader2Icon className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Decrypt Key'
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* Format toggle */}
                  <div className="bg-background flex rounded-md p-0.5">
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
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-foreground font-mono text-xs break-all">
                      {revealed ? displayKey : '\u2022'.repeat(Math.min(displayKey.length, 40))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRevealed(!revealed)}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                    >
                      {revealed ? <EyeOffIcon className="h-3 w-3" /> : <EyeIcon className="h-3 w-3" />}
                      {revealed ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                      onClick={handleCopyKey}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                    >
                      {copiedKey ? <CheckIcon className="h-3 w-3 text-green-500" /> : <CopyIcon className="h-3 w-3" />}
                      {copiedKey ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-destructive text-xs">
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
          className="bg-secondary flex w-full items-center justify-between rounded-xl p-3"
        >
          <div className="flex items-center gap-2">
            <SettingsIcon className="text-muted-foreground h-4 w-4" />
            <p className="text-foreground text-sm font-medium">Advanced Settings</p>
          </div>
          <ExternalLinkIcon className="text-muted-foreground h-3.5 w-3.5" />
        </button>

        {/* Lock & Logout */}
        <div className="space-y-2 pt-2">
          <button
            onClick={onLock}
            className="bg-secondary flex w-full items-center gap-2 rounded-xl p-3"
          >
            <LockIcon className="text-muted-foreground h-4 w-4" />
            <p className="text-foreground text-sm font-medium">Lock Wallet</p>
          </button>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 transition-colors hover:bg-red-500/15"
          >
            <LogOutIcon className="h-4 w-4 text-red-400" />
            <p className="text-sm font-medium text-red-400">Sign Out</p>
          </button>
        </div>
      </div>
    </div>
  );
}
