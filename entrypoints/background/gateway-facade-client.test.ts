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
import { sessionStore } from '@lib/storage';

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

describe('auth header', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sessionGetMock = vi.mocked(sessionStore.get);

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    sessionGetMock.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 'r1', result: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  afterEach(() => fetchSpy.mockRestore());

  it('sends Authorization: Bearer <sessionStore.authToken>', async () => {
    sessionGetMock.mockResolvedValue('the-token');
    await gatewayFacadeDappRpc('connect', {});
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer the-token');
  });

  it('throws FacadeAuthRequiredError when sessionStore.authToken is missing', async () => {
    sessionGetMock.mockResolvedValue(null);
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeAuthRequiredError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws FacadeAuthRequiredError when sessionStore.authToken is empty string', async () => {
    sessionGetMock.mockResolvedValue('');
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeAuthRequiredError,
    );
  });
});

describe('JSON-RPC error envelope → typed subclasses', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sessionGetMock = vi.mocked(sessionStore.get);

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    sessionGetMock.mockResolvedValue('the-token');
  });

  afterEach(() => fetchSpy.mockRestore());

  function mockErrorResponse(code: number, message: string, data?: unknown) {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 'r1', error: { code, message, data } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  }

  it('throws FacadeNotOnboardedError for -32001', async () => {
    mockErrorResponse(-32001, 'Complete onboarding');
    await expect(gatewayFacadeUserRpc('addSession', {})).rejects.toBeInstanceOf(
      FacadeNotOnboardedError,
    );
  });

  it('throws FacadeNotAuthorizedError for -32002', async () => {
    mockErrorResponse(-32002, 'NotAuthorized for one or more parties');
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toMatchObject({
      code: -32002,
    });
    mockErrorResponse(-32002, 'x');
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toBeInstanceOf(
      FacadeNotAuthorizedError,
    );
  });

  it('throws FacadeTemplateNotAllowedError for -32003', async () => {
    mockErrorResponse(-32003, 'Template+choice not allowed: x:y');
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toBeInstanceOf(
      FacadeTemplateNotAllowedError,
    );
  });

  it('throws FacadeResourceNotAllowedError for -32004', async () => {
    mockErrorResponse(-32004, 'Resource not allowed: GET /v2/admin/foo');
    await expect(gatewayFacadeDappRpc('ledgerApi', {})).rejects.toBeInstanceOf(
      FacadeResourceNotAllowedError,
    );
  });

  it('throws FacadeMethodNotFoundError for -32601', async () => {
    mockErrorResponse(-32601, 'Method not supported: signMessage');
    await expect(gatewayFacadeUserRpc('signMessage', {})).rejects.toBeInstanceOf(
      FacadeMethodNotFoundError,
    );
  });

  it('throws generic FacadeRpcError for an unknown -32xxx code', async () => {
    mockErrorResponse(-32099, 'something else');
    const promise = gatewayFacadeDappRpc('whatever', {});
    await expect(promise).rejects.toBeInstanceOf(FacadeRpcError);
    await expect(promise).rejects.not.toBeInstanceOf(FacadeNotOnboardedError);
  });

  it('preserves error.message and error.data on the thrown subclass', async () => {
    mockErrorResponse(-32003, 'Template+choice not allowed: Foo:Bar', { detail: 'x' });
    await expect(gatewayFacadeDappRpc('prepareExecute', {})).rejects.toMatchObject({
      code: -32003,
      message: 'Template+choice not allowed: Foo:Bar',
      data: { detail: 'x' },
    });
  });
});

describe('transport errors', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sessionGetMock = vi.mocked(sessionStore.get);

  beforeEach(() => {
    setGatewayFacadeBaseUrl('https://backend.test');
    sessionGetMock.mockResolvedValue('the-token');
  });

  afterEach(() => fetchSpy.mockRestore());

  it('wraps fetch network failure as FacadeNetworkError', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));
    const promise = gatewayFacadeDappRpc('connect', {});
    await expect(promise).rejects.toBeInstanceOf(FacadeNetworkError);
  });

  it('wraps HTTP 5xx as FacadeRpcError(-32603)', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream error', { status: 502, statusText: 'Bad Gateway' }),
    );
    const promise = gatewayFacadeDappRpc('connect', {});
    await expect(promise).rejects.toMatchObject({ code: -32603 });
    await expect(promise).rejects.toBeInstanceOf(FacadeRpcError);
  });

  it('wraps HTTP 4xx (non-401) as FacadeRpcError(-32603)', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403, statusText: 'Forbidden' }),
    );
    await expect(gatewayFacadeDappRpc('connect', {})).rejects.toBeInstanceOf(
      FacadeRpcError,
    );
  });
});
