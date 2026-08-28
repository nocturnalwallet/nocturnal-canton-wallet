import {
  elfaChatBlobSchema,
  type ElfaChatBlob,
  type ElfaChatMessage,
} from './storage/schemas';

export type { ElfaChatBlob, ElfaChatMessage };

export const ELFA_CHAT_MAX_TURNS = 10;
export const ELFA_CHAT_MAX_BYTES = 65536;

const MAX_MESSAGES = ELFA_CHAT_MAX_TURNS * 2;

export function emptyElfaChat(): ElfaChatBlob {
  return { sessionId: null, messages: [] };
}

export function parseElfaChat(raw: unknown): ElfaChatBlob {
  const parsed = elfaChatBlobSchema.safeParse(raw);
  if (!parsed.success) {
    return emptyElfaChat();
  }
  if (parsed.data.messages.length % 2 !== 0) {
    return emptyElfaChat();
  }
  return parsed.data;
}

function blobByteLength(blob: ElfaChatBlob): number {
  return new TextEncoder().encode(JSON.stringify(blob)).length;
}

function shrinkLastAssistantText(blob: ElfaChatBlob): ElfaChatBlob {
  const lastIdx = blob.messages.length - 1;
  if (lastIdx < 1 || blob.messages[lastIdx].role !== 'assistant') {
    return blob;
  }

  const assistant = blob.messages[lastIdx];
  let lo = 0;
  let hi = assistant.text.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate: ElfaChatBlob = {
      ...blob,
      messages: blob.messages.map((m, i) =>
        i === lastIdx ? { ...m, text: assistant.text.slice(0, mid) } : m,
      ),
    };
    if (blobByteLength(candidate) <= ELFA_CHAT_MAX_BYTES) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return {
    ...blob,
    messages: blob.messages.map((m, i) =>
      i === lastIdx ? { ...m, text: assistant.text.slice(0, lo) } : m,
    ),
  };
}

export function capElfaChat(blob: ElfaChatBlob): ElfaChatBlob {
  let result: ElfaChatBlob = { ...blob, messages: [...blob.messages] };

  while (result.messages.length > MAX_MESSAGES) {
    result.messages.splice(0, 2);
  }

  while (blobByteLength(result) > ELFA_CHAT_MAX_BYTES && result.messages.length > 2) {
    result.messages.splice(0, 2);
  }

  if (blobByteLength(result) > ELFA_CHAT_MAX_BYTES) {
    result = shrinkLastAssistantText(result);
  }

  return result;
}

export function appendElfaTurn(
  blob: ElfaChatBlob,
  userText: string,
  assistantText: string,
  sessionId: string,
  at = Date.now(),
): ElfaChatBlob {
  const messages: ElfaChatMessage[] = [
    ...blob.messages,
    { role: 'user', text: userText, at },
    { role: 'assistant', text: assistantText, at },
  ];

  return capElfaChat({ sessionId, messages });
}
