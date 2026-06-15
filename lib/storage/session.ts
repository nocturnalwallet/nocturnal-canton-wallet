export interface SessionStorageSchema {
  authToken: string | null;
  refreshToken: string | null;
  partyId: string | null;
  partyStatus: string;
  unlocked: boolean;
  lastActivity: number;
}

const DEFAULTS: SessionStorageSchema = {
  authToken: null,
  refreshToken: null,
  partyId: null,
  partyStatus: 'PENDING',
  unlocked: false,
  lastActivity: 0,
};

export const sessionStore = {
  async get<K extends keyof SessionStorageSchema>(
    key: K,
  ): Promise<SessionStorageSchema[K]> {
    const result = await chrome.storage.session.get(key);
    return (result[key] as SessionStorageSchema[K]) ?? DEFAULTS[key];
  },

  async set<K extends keyof SessionStorageSchema>(
    key: K,
    value: SessionStorageSchema[K],
  ): Promise<void> {
    await chrome.storage.session.set({ [key]: value });
  },

  async getAll(): Promise<SessionStorageSchema> {
    const result = await chrome.storage.session.get(null);
    return { ...DEFAULTS, ...result } as SessionStorageSchema;
  },

  async setMany(data: Partial<SessionStorageSchema>): Promise<void> {
    await chrome.storage.session.set(data);
  },

  async clear(): Promise<void> {
    await chrome.storage.session.clear();
  },

  async touchActivity(): Promise<void> {
    await chrome.storage.session.set({ lastActivity: Date.now() });
  },
};
