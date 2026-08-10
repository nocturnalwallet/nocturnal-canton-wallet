import fs from 'node:fs';
import path from 'node:path';

const OAUTH_KEYS = [
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_GOOGLE_CLIENT_SECRET',
] as const;

export type BrandOauthEnv = {
  VITE_GOOGLE_CLIENT_ID: string;
  VITE_GOOGLE_CLIENT_SECRET: string;
};

/**
 * Parse a dotenv-style file (KEY=VALUE, # comments, blank lines).
 * Minimal — only what brand OAuth env needs; no variable expansion.
 */
function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load Google OAuth credentials from `branding/<id>/.env`.
 * Missing file or keys → empty strings (so root `.env` cannot leak into
 * another brand via Vite's default env loading).
 */
export function loadBrandOauthEnv(brandRoot: string): BrandOauthEnv {
  const envPath = path.join(brandRoot, '.env');
  let parsed: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    parsed = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  }
  return {
    VITE_GOOGLE_CLIENT_ID: parsed.VITE_GOOGLE_CLIENT_ID ?? '',
    VITE_GOOGLE_CLIENT_SECRET: parsed.VITE_GOOGLE_CLIENT_SECRET ?? '',
  };
}

export { OAUTH_KEYS };
