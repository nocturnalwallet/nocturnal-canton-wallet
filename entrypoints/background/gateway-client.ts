/**
 * Wallet Gateway JSON-RPC client for Ginkgo extension.
 *
 * Separate from api-client.ts (which talks to dapp-core) because the Gateway
 * exposes a JSON-RPC 2.0 API on different endpoints:
 * - dApp API: /api/v0/dapp
 * - User API: /api/v0/user
 *
 * The Gateway requires its own self-signed JWT (not the dapp-core auth token)
 * and an active session established via `addSession` before most User API calls.
 */
import axios from 'axios';
import type { GatewayAuthConfig } from '@lib/network';

let currentGatewayUrl = '';
let currentGatewayAuth: GatewayAuthConfig | undefined;
let cachedGatewayJwt: string | null = null;
let cachedJwtExpiry = 0;
let sessionEstablished = false;

export function setGatewayBaseUrl(url: string): void {
  currentGatewayUrl = url;
  gatewayClient.defaults.baseURL = url;
}

export function getGatewayBaseUrl(): string {
  return currentGatewayUrl;
}

export function setGatewayAuth(auth: GatewayAuthConfig | undefined): void {
  currentGatewayAuth = auth;
  // Reset JWT and session when auth config changes
  cachedGatewayJwt = null;
  cachedJwtExpiry = 0;
  sessionEstablished = false;
}

export function resetGatewaySession(): void {
  sessionEstablished = false;
}

const gatewayClient = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

// Attach self-signed Gateway JWT (NOT the dapp-core auth token)
gatewayClient.interceptors.request.use(async (config) => {
  if (currentGatewayAuth) {
    const jwt = await getOrCreateGatewayJwt(currentGatewayAuth);
    config.headers.Authorization = `Bearer ${jwt}`;
  }
  return config;
});

// ─── Self-signed JWT generation ───────────────────────────────────────────────

/**
 * Generate an HS256 JWT for the Gateway's self-signed IDP.
 * Uses Web Crypto API (available in service workers).
 */
async function generateSelfSignedJwt(
  auth: GatewayAuthConfig,
  sub: string,
): Promise<string> {
  // No `typ` in header — Canton's unsafe-jwt-hmac-256 rejects it.
  // `scope` is required by the Gateway's JWT middleware.
  const header = { alg: 'HS256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    aud: auth.audience,
    iss: auth.idpIssuer,
    scope: auth.scope,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncodeStr(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeStr(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(auth.clientSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );

  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

function base64UrlEncodeStr(str: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(str));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Get or create a cached Gateway JWT. Refreshes 5 minutes before expiry. */
async function getOrCreateGatewayJwt(auth: GatewayAuthConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGatewayJwt && cachedJwtExpiry > now + 300) {
    return cachedGatewayJwt;
  }

  // Must match Canton's registered user — the Gateway passes this token through
  // to the Canton ledger API, which only accepts registered users.
  const sub = auth.clientId;
  cachedGatewayJwt = await generateSelfSignedJwt(auth, sub);
  cachedJwtExpiry = now + 3600;
  return cachedGatewayJwt;
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Ensure a Gateway session is active by calling `addSession`.
 * Must be called before any session-protected User API methods.
 */
export async function ensureGatewaySession(): Promise<void> {
  if (sessionEstablished) return;
  if (!currentGatewayAuth) {
    throw new Error('Gateway auth not configured for this network');
  }

  console.log(`[Ginkgo Gateway] Establishing session for network: ${currentGatewayAuth.networkId}`);
  await gatewayUserRpcRaw('addSession', { networkId: currentGatewayAuth.networkId });
  sessionEstablished = true;
  console.log('[Ginkgo Gateway] Session established');
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

/**
 * Raw User API RPC call — does NOT auto-establish session.
 * Used internally by ensureGatewaySession to avoid infinite recursion.
 */
async function gatewayUserRpcRaw<T = unknown>(
  method: string,
  params: unknown,
  id?: string,
): Promise<T> {
  if (!currentGatewayUrl) {
    throw new Error('Gateway URL not configured for this network');
  }

  const rpcId = id || crypto.randomUUID();
  const { data } = await gatewayClient.post('/api/v0/user', {
    jsonrpc: '2.0',
    id: rpcId,
    method,
    params,
  });

  if (data.error) {
    const msg = data.error.message || data.error.error_description || 'Gateway User API error';
    throw new Error(msg);
  }

  return data.result as T;
}

/**
 * Call a JSON-RPC method on the Wallet Gateway dApp API.
 * Automatically ensures an active session before making the call.
 * Used for: prepareExecute, ledgerApi, etc.
 */
export async function gatewayDappRpc<T = unknown>(
  method: string,
  params: unknown,
  id?: string,
): Promise<T> {
  if (!currentGatewayUrl) {
    throw new Error('Gateway URL not configured for this network');
  }

  await ensureGatewaySession();

  const rpcId = id || crypto.randomUUID();
  const { data } = await gatewayClient.post('/api/v0/dapp', {
    jsonrpc: '2.0',
    id: rpcId,
    method,
    params,
  });

  if (data.error) {
    const msg = data.error.message || data.error.error_description || 'Gateway dApp API error';
    throw new Error(msg);
  }

  return data.result as T;
}

/**
 * Call a JSON-RPC method on the Wallet Gateway User API.
 * Automatically ensures an active session before making the call.
 * Used for: createWallet, sign, execute, getTransaction, etc.
 */
export async function gatewayUserRpc<T = unknown>(
  method: string,
  params: unknown,
  id?: string,
): Promise<T> {
  await ensureGatewaySession();
  return gatewayUserRpcRaw<T>(method, params, id);
}

export default gatewayClient;
