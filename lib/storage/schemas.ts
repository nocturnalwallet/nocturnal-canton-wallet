import { z } from 'zod/v4';

export const keystoreSchema = z.object({
  cantonKey: z.string(),
  walletKey: z.string(),
  hashedKey: z.string(),
  backend: z.enum(['webcrypto', 'cryptojs']),
  version: z.number(),
});

export type KeystoreData = z.infer<typeof keystoreSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isActive: z.boolean(),
});

export type StoredUser = z.infer<typeof userSchema>;

export const settingsSchema = z.object({
  autoLockMinutes: z.number().default(15),
  explorerUrl: z.string().optional(),
  apiBaseUrl: z.string().optional(),
});

export type SettingsData = z.infer<typeof settingsSchema>;

export const sessionSchema = z.object({
  authToken: z.string().nullable(),
  refreshToken: z.string().nullable(),
  partyId: z.string().nullable(),
  unlocked: z.boolean(),
  lastActivity: z.number(),
});

export type SessionData = z.infer<typeof sessionSchema>;

export const elfaChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  at: z.number(),
});

export type ElfaChatMessage = z.infer<typeof elfaChatMessageSchema>;

export const elfaChatBlobSchema = z.object({
  sessionId: z.string().nullable(),
  messages: z.array(elfaChatMessageSchema),
});

export type ElfaChatBlob = z.infer<typeof elfaChatBlobSchema>;
