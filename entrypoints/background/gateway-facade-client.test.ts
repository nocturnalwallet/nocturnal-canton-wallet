import { describe, it, expect } from 'vitest';
import {
  FacadeRpcError,
  FacadeNotOnboardedError,
  FacadeNotAuthorizedError,
  FacadeTemplateNotAllowedError,
  FacadeResourceNotAllowedError,
  FacadeMethodNotFoundError,
  FacadeAuthRequiredError,
  FacadeNetworkError,
} from './gateway-facade-client';

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
