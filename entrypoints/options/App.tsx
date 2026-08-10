import { useState, useEffect, useRef } from 'react';
import { KeyIcon, ShieldIcon, InfoIcon, EyeIcon, EyeOffIcon, CopyIcon, CheckIcon, Loader2Icon } from 'lucide-react';
import { sendMessage, MSG } from '@lib/messaging';
import type { NetworkData } from '@lib/messaging';
import { onCopyText, convertBase64ToHex } from '@lib/utils';
import brand from '@brand/brand';

const KEY_DISPLAY_TIMEOUT_MS = 30_000; // Auto-clear after 30s

type Section = 'export-key' | 'encryption' | 'about';

function App() {
  const [section, setSection] = useState<Section>('export-key');

  const nav: { id: Section; label: string; icon: typeof KeyIcon }[] = [
    { id: 'export-key', label: 'Export Private Key', icon: KeyIcon },
    { id: 'encryption', label: 'Encryption Info', icon: ShieldIcon },
    { id: 'about', label: 'About', icon: InfoIcon },
  ];

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-foreground mb-8 text-2xl font-bold">{brand.displayName} Settings</h1>

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-52 shrink-0 space-y-1">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  section === id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1">
            {section === 'export-key' && <ExportKeySection />}
            {section === 'encryption' && <EncryptionSection />}
            {section === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportKeySection() {
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [keyFormat, setKeyFormat] = useState<'base64' | 'hex'>('base64');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const keyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Auto-clear private key from memory after timeout
  useEffect(() => {
    if (privateKey) {
      keyTimerRef.current = setTimeout(() => {
        setPrivateKey('');
        setPassword('');
        setRevealed(false);
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

  const handleExport = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const result = await sendMessage<{ privateKey: string }>({
        action: MSG.EXPORT_PRIVATE_KEY,
        payload: { password },
      });
      setPrivateKey(result.privateKey);
      setRevealed(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid password');
    } finally {
      setLoading(false);
    }
  };

  const displayKey = privateKey
    ? keyFormat === 'hex'
      ? convertBase64ToHex(privateKey)
      : privateKey
    : '';

  const handleCopy = async () => {
    await onCopyText(displayKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground mb-1 text-lg font-semibold">Export Private Key</h2>
        <p className="text-muted-foreground text-sm">
          Enter your wallet password to decrypt and view your private key. Never share your private key with anyone.
        </p>
      </div>

      <div className="bg-secondary space-y-4 rounded-xl p-4">
        <div className="space-y-2">
          <label htmlFor="export-password" className="text-foreground text-sm font-medium">Wallet Password</label>
          <div className="flex gap-2">
            <input
              id="export-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExport()}
              className="bg-background text-foreground border-border focus:border-primary flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              placeholder="Enter your password"
            />
            <button
              onClick={handleExport}
              disabled={!password || loading}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              {loading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : 'Decrypt'}
            </button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        {privateKey && (
          <div className="border-border space-y-3 border-t pt-3">
            {/* Format toggle */}
            <div className="bg-background flex w-48 rounded-md p-0.5">
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
            <div className="bg-background rounded-lg p-3">
              <p className="text-foreground font-mono text-sm break-all">
                {revealed ? displayKey : '\u2022'.repeat(Math.min(displayKey.length, 60))}
              </p>
            </div>
            <div className="flex gap-3">
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
            <p className="text-destructive text-xs">
              Warning: Anyone with access to this key can steal your funds. Store it in a secure, offline location.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function EncryptionSection() {
  const backend = import.meta.env.VITE_ENCRYPTION_BACKEND || 'webcrypto';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground mb-1 text-lg font-semibold">Encryption Info</h2>
        <p className="text-muted-foreground text-sm">
          Details about how your private key is encrypted and stored.
        </p>
      </div>

      <div className="bg-secondary space-y-4 rounded-xl p-4">
        <div>
          <p className="text-muted-foreground mb-1 text-xs">Active Backend</p>
          <p className="text-foreground text-sm font-medium uppercase">{backend}</p>
        </div>

        {backend === 'webcrypto' ? (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Key Derivation</span>
                <span className="text-foreground">PBKDF2 (SHA-256)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Iterations</span>
                <span className="text-foreground">100,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encryption</span>
                <span className="text-foreground">AES-256-GCM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Authentication</span>
                <span className="text-foreground">GCM auth tag (built-in)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salt</span>
                <span className="text-foreground">Random 16 bytes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IV</span>
                <span className="text-foreground">Random 12 bytes</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Password Hashing</span>
                <span className="text-foreground">bcrypt</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salt Rounds</span>
                <span className="text-foreground">{import.meta.env.VITE_SALT_ROUNDS || '10'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encryption</span>
                <span className="text-foreground">CryptoJS AES</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Compatibility</span>
                <span className="text-foreground">Web App compatible</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-secondary space-y-2 rounded-xl p-4">
        <p className="text-foreground text-sm font-medium">Storage</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Encrypted Key</span>
            <span className="text-foreground">chrome.storage.local</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Auth Tokens</span>
            <span className="text-foreground">chrome.storage.session (memory-only)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Key Isolation</span>
            <span className="text-foreground">Background service worker only</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutSection() {
  const version = chrome.runtime.getManifest().version;
  const [networkLabel, setNetworkLabel] = useState('...');
  const [apiUrl, setApiUrl] = useState('...');

  useEffect(() => {
    sendMessage<NetworkData>({ action: MSG.GET_NETWORK })
      .then((data) => {
        setNetworkLabel(`Canton — ${data.config.label}`);
        setApiUrl(data.config.apiBaseUrl);
      })
      .catch(() => {
        setNetworkLabel('Canton');
        setApiUrl('Unknown');
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground mb-1 text-lg font-semibold">About {brand.displayName}</h2>
        <p className="text-muted-foreground text-sm">
          A secure browser extension wallet for the Canton Network.
        </p>
      </div>

      <div className="bg-secondary space-y-2 rounded-xl p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Version</span>
          <span className="text-foreground">{version}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Network</span>
          <span className="text-foreground">{networkLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">API</span>
          <span className="text-foreground max-w-[280px] truncate">
            {apiUrl}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Supported Tokens</span>
          <span className="text-foreground">CC, CBTC, USDCx</span>
        </div>
      </div>
    </div>
  );
}

export default App;
