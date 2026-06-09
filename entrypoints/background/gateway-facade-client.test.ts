import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FacadeRpcError,
  FacadeNotOnboardedError,
  FacadeNotAuthorizedError,
  FacadeTemplateNotAllowedError,
  FacadeResourceNotAllowedError,
  FacadeMethodNotFoundError,
  FacadeAuthRequiredError,
  FacadeNetworkError,
  gatewayFacadeDappRpc,
  gatewayFacadeUserRpc,
  setGatewayFacadeBaseUrl,
} from './gateway-facade-client';

// Mock sessionStore so Bearer reads return a stable token in these happy-path tests
vi.mock('@lib/storage', () => ({
  sessionStore: {
    get: vi.fn(async (key: string) => (key === 'authToken' ? 'test-token' : null)),
    set: vi.fn(),
    setMany: vi.fn(),
    clear: vi.fn(),
  },
  localStore: { get: vi.fn(), set: vi.fn() },
  networkStore: { get: vi.fn(), set: vi.fn() },
}));

describe('error classes', () => {
  it('FacadeRpcError carries code, message, and optional data', () => {
    const err = new FacadeRpcError(-32099, 'gateway said no', { detail: 1 });
    expect(err.code).toBe(-32099);
    expect(err.message).toBe('gateway said no');
    expect(err.data).toEqual({ detail: 1 });
    expect(err.name).toBe('FacadeRpcError');
  });

  it('FacadeNotOnboardedError has code -32001 and extends FacadeRpcError', () => {
    const err = new FacadeNotOnboardedError('Complete onboarding');
    expect(err).toBeInstanceOf(FacadeRpcError);
    expect(err.code).toBe(-32001);
    expect(err.name).toBe('FacadeNotOnboardedError');
  });

  it('FacadeNotAuthorizedError has code -32002', () => {
    const err = new FacadeNotAuthorizedError('NotAuthorized');
    expect(err.code).toBe(-32002);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeTemplateNotAllowedError has code -32003', () => {
    const err = new FacadeTemplateNotAllowedError('Template not allowed');
    expect(err.code).toBe(-32003);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeResourceNotAllowedError has code -32004', () => {
    const err = new FacadeResourceNotAllowedError('Resource not allowed');
    expect(err.code).toBe(-32004);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeMethodNotFoundError has code -32601', () => {
    const err = new FacadeMethodNotFoundError('Method not supported');
    expect(err.code).toBe(-32601);
    expect(err).toBeInstanceOf(FacadeRpcError);
  });

  it('FacadeAuthRequiredError is distinct from FacadeRpcError', () => {
    const err = new FacadeAuthRequiredError();
    expect(err).not.toBeInstanceOf(FacadeRpcError);
    expect(err.name).toBe('FacadeAuthRequiredError');
  });

  it('FacadeNetworkError preserves the original cause', () => {
    const cause = new TypeError('fetch failed');
    const err = new FacadeNetworkError('backend unreachable', cause);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('FacadeNetworkError');
  });
});

describe('successful dispatch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 'r1', result: { ok: true } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  afterEach(() => fetchSpy.mockRestore());

  it('POSTs to /api/v0/dapp for dappRpc', async () => {
    await gatewayFacadeDappRpc('connect', {});
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://backend.test/api/v0/dapp');
  });

  it('POSTs to /api/v0/user for userRpc', async () => {
    await gatewayFacadeUserRpc('listSessions', {});
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://backend.test/api/v0/user');
  });

  it('builds a JSON-RPC 2.0 envelope with method, params, and a unique id', async () => {
    await gatewayFacadeDappRpc('connect', { hi: 1 });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('connect');
    expect(body.params).toEqual({ hi: 1 });
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
  });

  it('returns result on success', async () => {
    const result = await gatewayFacadeDappRpc<{ ok: boolean }>('connect', {});
    expect(result).toEqual({ ok: true });
  });

  it('uses POST method with Content-Type application/json', async () => {
    await gatewayFacadeDappRpc('connect', {});
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('honors setGatewayFacadeBaseUrl()', async () => {
    setGatewayFacadeBaseUrl('https://other.test');
    await gatewayFacadeDappRpc('connect', {});
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://other.test/api/v0/dapp');
  });
});
