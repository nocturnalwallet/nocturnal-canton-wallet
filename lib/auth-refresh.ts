import axios from 'axios';
import { sessionStore } from '@lib/storage';

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Refresh the dapp-core auth token using the stored refresh token.
 *
 * - Returns the new access token on success.
 * - Returns null on failure (caller should treat as auth required).
 * - Deduplicates concurrent calls — a second invocation while one is in flight
 *   awaits the same promise, so we never double-refresh.
 *
 * Side effect: on success writes new authToken + refreshToken back to sessionStore.
 * Side effect: on failure clears sessionStore.
 *
 * @param backendBaseUrl absolute URL of the backend (e.g. `http://localhost:3003`).
 *   The endpoint path `/auth/refresh-token` is appended internally.
 */
export function refreshAuthTokenOnce(backendBaseUrl: string): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const refreshToken = await sessionStore.get('refreshToken');
      if (!refreshToken) return null;

      const url = `${backendBaseUrl.replace(/\/+$/, '')}/auth/refresh-token`;
      const { data } = await axios.post(url, { refreshToken });

      const newToken = data?.data?.token;
      const newRefresh = data?.data?.refreshToken;
      if (!newToken) return null;

      await sessionStore.setMany({
        authToken: newToken,
        refreshToken: newRefresh ?? refreshToken,
      });
      return newToken;
    } catch {
      await sessionStore.clear();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
