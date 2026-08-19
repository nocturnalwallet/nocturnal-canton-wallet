import { describe, it, expect } from 'vitest';
import { extractApiErrorMessage, getErrorMessage } from './api-error';
import axios from 'axios';

describe('extractApiErrorMessage', () => {
  it('reads message from backend error body', () => {
    expect(
      extractApiErrorMessage({
        code: 'ERROR_00000',
        statusCode: 400,
        message:
          'Insufficient balance: the wallet does not hold enough Amulet to cover this transfer and its traffic fee.',
        path: '/transfer-offer/prepare',
      }),
    ).toBe(
      'Insufficient balance: the wallet does not hold enough Amulet to cover this transfer and its traffic fee.',
    );
  });

  it('joins array validation messages', () => {
    expect(extractApiErrorMessage({ message: ['a', 'b'] })).toBe('a, b');
  });

  it('returns undefined for empty or missing message', () => {
    expect(extractApiErrorMessage({})).toBeUndefined();
    expect(extractApiErrorMessage({ message: '  ' })).toBeUndefined();
    expect(extractApiErrorMessage(null)).toBeUndefined();
  });
});

describe('getErrorMessage', () => {
  it('prefers API body message over Axios status text', () => {
    const error = new axios.AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: {
          code: 'ERROR_00000',
          statusCode: 400,
          message:
            'Insufficient balance: the wallet does not hold enough Amulet to cover this transfer and its traffic fee.',
          path: '/transfer-offer/prepare',
        },
      },
    );
    expect(getErrorMessage(error, 'Prepare transfer failed')).toBe(
      'Insufficient balance: the wallet does not hold enough Amulet to cover this transfer and its traffic fee.',
    );
  });

  it('falls back when there is no API body message', () => {
    expect(getErrorMessage(new Error('network down'), 'fallback')).toBe('network down');
    expect(getErrorMessage({}, 'fallback')).toBe('fallback');
  });
});
