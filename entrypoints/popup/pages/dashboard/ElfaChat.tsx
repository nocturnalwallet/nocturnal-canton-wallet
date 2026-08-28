import { useEffect, useRef, useState } from 'react';
import { SendIcon } from 'lucide-react';
import type { ElfaChatBlob } from '@lib/elfa-chat';
import { MSG, sendMessage } from '@lib/messaging';
import { MessagingError } from '@lib/messaging/protocol';

const MAX_MESSAGE_LENGTH = 2000;

function errorMessage(error: unknown): string {
  if (error instanceof MessagingError && error.retryAfterSeconds !== undefined) {
    const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
    return minutes === 1
      ? 'You’ve reached the chat limit. Try again in a minute.'
      : `You’ve reached the chat limit. Try again in ${minutes} minutes.`;
  }

  return error instanceof Error ? error.message : 'Chat isn’t available right now.';
}

export function ElfaChat() {
  const [chat, setChat] = useState<ElfaChatBlob>({
    sessionId: null,
    messages: [],
  });
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedSend, setHasAttemptedSend] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    const generation = loadGenerationRef.current;

    void sendMessage<ElfaChatBlob>({ action: MSG.GET_ELFA_CHAT })
      .then((blob) => {
        if (loadGenerationRef.current === generation) setChat(blob);
      })
      .catch((cause: unknown) => {
        if (loadGenerationRef.current === generation) setError(errorMessage(cause));
      });

    return () => {
      loadGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [chat.messages, draft, pending, error]);

  const message = draft.trim();
  const canSend =
    message.length > 0 && message.length <= MAX_MESSAGE_LENGTH && !pending;
  const showOptimisticUser = hasAttemptedSend;

  const send = async () => {
    if (!canSend) return;

    loadGenerationRef.current += 1;
    setHasAttemptedSend(true);
    setPending(true);
    setError(null);
    try {
      const blob = await sendMessage<ElfaChatBlob>({
        action: MSG.ELFA_CHAT,
        payload: { message },
      });
      setChat(blob);
      setDraft('');
      setHasAttemptedSend(false);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const clear = async () => {
    if (pending) return;

    loadGenerationRef.current += 1;
    setError(null);
    try {
      await sendMessage<ElfaChatBlob>({ action: MSG.CLEAR_ELFA_CHAT });
      setChat({ sessionId: null, messages: [] });
      setDraft('');
      setHasAttemptedSend(false);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-end px-3 py-2">
        <button
          type="button"
          onClick={() => void clear()}
          disabled={pending}
          className="bg-primary/10 text-primary hover:bg-primary/20 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          New chat
        </button>
      </div>

      <div
        ref={transcriptRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
        aria-live="polite"
      >
        {chat.messages.length === 0 && !showOptimisticUser ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="text-muted-foreground text-xs">Ask Elfa about the market.</p>
          </div>
        ) : (
          <>
            {chat.messages.map((item, index) => (
              <div
                key={`${item.at}-${index}`}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  item.role === 'user'
                    ? 'bg-primary text-primary-foreground self-end'
                    : 'bg-primary/5 border-primary/10 text-foreground self-start border'
                }`}
              >
                {item.text}
              </div>
            ))}
            {showOptimisticUser && (
              <div className="bg-primary text-primary-foreground max-w-[85%] self-end rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">
                {message}
              </div>
            )}
            {pending && (
              <div className="bg-primary/5 border-primary/10 text-muted-foreground self-start rounded-xl border px-3 py-2 text-xs">
                Thinking…
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-border border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            disabled={pending}
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH + 1}
            placeholder="Ask about the market…"
            aria-label="Message Elfa"
            className="border-primary/15 bg-background text-foreground focus:border-primary/40 min-h-16 flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            aria-label="Send message"
            className="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-opacity disabled:opacity-50"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
        {draft.length > MAX_MESSAGE_LENGTH && (
          <p className="text-destructive mt-1.5 text-[10px]">
            Messages can be up to {MAX_MESSAGE_LENGTH.toLocaleString()} characters.
          </p>
        )}
        {error && <p className="text-destructive mt-1.5 text-xs">{error}</p>}
      </div>
    </div>
  );
}
