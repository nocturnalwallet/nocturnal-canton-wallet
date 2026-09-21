import { useState, useEffect } from 'react';
import { Loader2Icon, ShieldCheckIcon, PenLineIcon, LinkIcon, XIcon } from 'lucide-react';
import { sendMessage, MSG } from '@lib/messaging';
import type { DappApprovalData } from '@lib/messaging/types';
import { IconLogo } from '@assets/icons/icon-logo';

interface Props {
  requestId: string;
}

const METHOD_LABELS: Record<string, { label: string; icon: typeof ShieldCheckIcon }> = {
  connect: { label: 'Connect', icon: LinkIcon },
  signMessage: { label: 'Sign Message', icon: PenLineIcon },
  signTransaction: { label: 'Sign Transaction', icon: PenLineIcon },
  prepareExecute: { label: 'Execute Transaction', icon: ShieldCheckIcon },
  prepareExecuteAndWait: { label: 'Execute Transaction', icon: ShieldCheckIcon },
  'signTransaction (Gateway)': { label: 'Sign for Gateway', icon: PenLineIcon },
};

const SIGNING_METHODS = new Set(['signMessage', 'signTransaction', 'prepareExecute', 'prepareExecuteAndWait']);

export function DappApproval({ requestId }: Props) {
  const [details, setDetails] = useState<DappApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    sendMessage<DappApprovalData>({
      action: MSG.GET_DAPP_APPROVAL,
      payload: { requestId },
    })
      .then((data) => {
        setDetails(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load approval details');
        setLoading(false);
      });
  }, [requestId]);

  const needsPassword = details ? SIGNING_METHODS.has(details.method) : false;

  const handleResult = async (approved: boolean) => {
    setSubmitting(true);
    try {
      if (approved && needsPassword) {
        const res = await sendMessage<{ valid: boolean }>({
          action: MSG.VERIFY_PASSWORD,
          payload: { password },
        });
        if (!res?.valid) {
          setPwError('Invalid password');
          setSubmitting(false);
          return; // keep window open
        }
      }
      await sendMessage({
        action: MSG.DAPP_APPROVAL_RESULT,
        payload: { requestId, approved, password: approved && needsPassword ? password : undefined },
      });
    } catch {
      // Background will handle cleanup
    }
    window.close();
  };

  if (loading) {
    return (
      <div className="bg-background flex h-full items-center justify-center">
        <Loader2Icon className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="bg-background flex h-full flex-col items-center justify-center gap-4 p-6">
        <XIcon className="text-destructive h-10 w-10" />
        <p className="text-muted-foreground text-center text-sm">
          {error || 'Approval request expired or not found.'}
        </p>
        <button
          onClick={() => window.close()}
          className="text-primary text-sm hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  const methodInfo = METHOD_LABELS[details.method] || {
    label: details.method,
    icon: ShieldCheckIcon,
  };
  const MethodIcon = methodInfo.icon;

  return (
    <div className="bg-background flex h-full flex-col">
      {/* Header */}
      <div className="border-border flex items-center justify-center gap-2 border-b p-4">
        <IconLogo className="h-10 w-10" />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-6">
        <div className="bg-primary/10 shrink-0 rounded-full p-3">
          <MethodIcon className="text-primary h-6 w-6" />
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-foreground text-lg font-bold">{methodInfo.label} Request</h1>
          <p className="text-muted-foreground text-sm">
            A dApp is requesting permission to <span className="text-foreground font-medium">{methodInfo.label.toLowerCase()}</span>
          </p>
        </div>

        {/* Origin */}
        <div className="bg-secondary w-full rounded-lg px-4 py-3">
          <p className="text-muted-foreground mb-1 text-xs">Origin</p>
          <p className="text-foreground truncate text-sm font-medium">{details.origin}</p>
        </div>

        {/* Parameters preview (for sign methods) */}
        {details.params != null && (() => {
          const paramsText =
            typeof details.params === 'string'
              ? details.params
              : JSON.stringify(details.params, null, 2);
          return (
            <div className="bg-secondary w-full rounded-lg px-4 py-3">
              <p className="text-muted-foreground mb-1 text-xs">Parameters</p>
              <pre className="text-foreground max-h-24 overflow-auto text-xs break-all whitespace-pre-wrap">
                {paramsText}
              </pre>
            </div>
          );
        })()}

        {/* Password (signing methods only) */}
        {needsPassword && (
          <div className="w-full">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPwError('');
              }}
              placeholder="Password to sign"
              className="bg-secondary text-foreground w-full rounded-lg px-4 py-3 text-sm"
            />
            {pwError && <p className="text-destructive mt-1 text-xs">{pwError}</p>}
          </div>
        )}
      </div>

      {/* Actions — always pinned to bottom */}
      <div className="border-border shrink-0 space-y-2 border-t px-4 pt-3 pb-5">
        <button
          onClick={() => handleResult(true)}
          disabled={submitting || (needsPassword && !password)}
          className="bg-primary text-primary-foreground w-full rounded-xl py-3 font-medium transition-opacity disabled:opacity-40"
        >
          {submitting ? (
            <Loader2Icon className="mx-auto h-5 w-5 animate-spin" />
          ) : (
            'Approve'
          )}
        </button>
        <button
          onClick={() => handleResult(false)}
          disabled={submitting}
          className="bg-secondary text-foreground hover:bg-secondary/80 w-full rounded-xl py-3 font-medium transition-opacity disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
