/**
 * CIP-0103 facade client for Ginkgo.
 *
 * Replaces the legacy direct-to-wallet-gateway path. POSTs JSON-RPC 2.0 to
 * `${apiBaseUrl}/api/v0/dapp` and `${apiBaseUrl}/api/v0/user`. Authentication
 * uses the existing backend Bearer token from `sessionStore.authToken` — no
 * in-extension JWT minting. See:
 *   docs/superpowers/specs/2026-06-09-ginkgo-cip-0103-facade-migration-design.md
 */

export class FacadeRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'FacadeRpcError';
  }
}

export class FacadeNotOnboardedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32001, message, data);
    this.name = 'FacadeNotOnboardedError';
  }
}

export class FacadeNotAuthorizedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32002, message, data);
    this.name = 'FacadeNotAuthorizedError';
  }
}

export class FacadeTemplateNotAllowedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32003, message, data);
    this.name = 'FacadeTemplateNotAllowedError';
  }
}

export class FacadeResourceNotAllowedError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32004, message, data);
    this.name = 'FacadeResourceNotAllowedError';
  }
}

export class FacadeMethodNotFoundError extends FacadeRpcError {
  constructor(message: string, data?: unknown) {
    super(-32601, message, data);
    this.name = 'FacadeMethodNotFoundError';
  }
}

export class FacadeAuthRequiredError extends Error {
  constructor(message = 'Facade authentication required') {
    super(message);
    this.name = 'FacadeAuthRequiredError';
  }
}

export class FacadeNetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FacadeNetworkError';
  }
}

let currentBaseUrl = '';

export function setGatewayFacadeBaseUrl(url: string): void {
  // Strip trailing slash so `${url}/api/v0/dapp` doesn't double-slash.
  currentBaseUrl = url.replace(/\/+$/, '');
}

export function getGatewayFacadeBaseUrl(): string {
  return currentBaseUrl;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export function gatewayFacadeDappRpc<T = unknown>(
  method: string,
  params: unknown,
): Promise<T> {
  return facadeRpc<T>('/api/v0/dapp', method, params);
}

export function gatewayFacadeUserRpc<T = unknown>(
  method: string,
  params: unknown,
): Promise<T> {
  return facadeRpc<T>('/api/v0/user', method, params);
}

async function facadeRpc<T>(path: string, method: string, params: unknown): Promise<T> {
  const envelope: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params,
  };
  const response = await fetch(`${currentBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  const data = (await response.json()) as JsonRpcResponse<T>;
  return data.result as T;
}
