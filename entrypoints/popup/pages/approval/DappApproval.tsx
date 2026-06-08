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

export function DappApproval({ requestId }: Props) {
  const [details, setDetails] = useState<DappApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const handleResult = async (approved: boolean) => {
    setSubmitting(true);
    try {
      await sendMessage({
        action: MSG.DAPP_APPROVAL_RESULT,
        payload: { requestId, approved },
      });
    } catch {
      // Background will handle cleanup
    }
    window.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2Icon className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background p-6 gap-4">
        <XIcon className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground text-center">
          {error || 'Approval request expired or not found.'}
        </p>
        <button
          onClick={() => window.close()}
          className="text-sm text-primary hover:underline"
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
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-center gap-2 p-4 border-b border-border">
        <IconLogo className="w-10 h-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center gap-4 p-6 overflow-y-auto">
        <div className="rounded-full bg-primary/10 p-3 shrink-0">
          <MethodIcon className="w-6 h-6 text-primary" />
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold text-foreground">{methodInfo.label} Request</h1>
          <p className="text-sm text-muted-foreground">
            A dApp is requesting permission to <span className="font-medium text-foreground">{methodInfo.label.toLowerCase()}</span>
          </p>
        </div>

        {/* Origin */}
        <div className="w-full rounded-lg bg-secondary px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Origin</p>
          <p className="text-sm font-medium text-foreground truncate">{details.origin}</p>
        </div>

        {/* Parameters preview (for sign methods) */}
        {details.params != null && (() => {
          const paramsText =
            typeof details.params === 'string'
              ? details.params
              : JSON.stringify(details.params, null, 2);
          return (
            <div className="w-full rounded-lg bg-secondary px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Parameters</p>
              <pre className="text-xs text-foreground overflow-auto max-h-24 whitespace-pre-wrap break-all">
                {paramsText}
              </pre>
            </div>
          );
        })()}
      </div>

      {/* Actions — always pinned to bottom */}
      <div className="shrink-0 px-4 pt-3 pb-5 space-y-2 border-t border-border">
        <button
          onClick={() => handleResult(true)}
          disabled={submitting}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-40 transition-opacity"
        >
          {submitting ? (
            <Loader2Icon className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            'Approve'
          )}
        </button>
        <button
          onClick={() => handleResult(false)}
          disabled={submitting}
          className="w-full rounded-xl bg-secondary text-foreground py-3 font-medium disabled:opacity-40 transition-opacity hover:bg-secondary/80"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
