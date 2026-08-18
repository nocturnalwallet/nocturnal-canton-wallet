import { ok, err } from '@lib/messaging';
import type { MessageResponse, AuthStateData, GoogleAuthData } from '@lib/messaging';
import { localStore, setUserScope } from '@lib/storage';
import { sessionStore } from '@lib/storage';
import brand from '@brand/brand';
import apiClient from '../api-client';
import { setCachedPrivateKey } from './session.handler';
import { clearPreapprovalCache } from './keystore.handler';

// --- PKCE helpers ---

/** Generate a random code_verifier (43–128 URL-safe chars). */
function generateCodeVerifier(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

/** SHA-256 hash the verifier, then base64-url-encode the result. */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- Auth handler ---

export async function handleGoogleAuth(): Promise<MessageResponse<GoogleAuthData>> {
  try {
    const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
    if (!GOOGLE_CLIENT_ID) return err('VITE_GOOGLE_CLIENT_ID is not configured');
    if (!GOOGLE_CLIENT_SECRET) return err('VITE_GOOGLE_CLIENT_SECRET is not configured');

    const redirectUri = chrome.identity.getRedirectURL();
    console.log(`${brand.logTag} OAuth redirect URI:`, redirectUri);

    // PKCE: generate verifier + challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // CSRF: generate random state parameter
    const state = crypto.randomUUID();

    // Step 1: Authorization code + PKCE via launchWebAuthFlow
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    if (!responseUrl) return err('Auth cancelled');

    // Extract authorization code and validate state from redirect URL
    const url = new URL(responseUrl);
    const returnedState = url.searchParams.get('state');
    if (returnedState !== state) return err('OAuth state mismatch — possible CSRF attack');
    const code = url.searchParams.get('code');
    if (!code) return err('No authorization code in response');

    // Step 2: Exchange code for tokens (client_secret required for "Web application" type)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error(`${brand.logTag} Token exchange failed:`, errBody);
      return err('Token exchange failed');
    }

    const tokenData = await tokenRes.json();
    const idToken: string | undefined = tokenData.id_token;
    if (!idToken) return err('No ID token from Google token exchange');

    // Step 3: Send Google ID Token to backend (same credential format as the web app)
    const { data: loginData } = await apiClient.post('/auth/login-with-google', {
      credential: idToken,
    });

    const { token, refreshToken, user } = loginData.data;

    // Set user scope BEFORE reading/writing user-scoped data (keystore, onboardingComplete)
    setUserScope(user.id);

    // Store auth tokens in session
    await sessionStore.setMany({
      authToken: token,
      refreshToken,
    });

    // Store user in local storage (network-scoped, not user-scoped)
    await localStore.set('user', user);

    // Fetch party info
    const { data: meData } = await apiClient.get('/auth/me');
    const { party } = meData.data;
    const partyId = party?.partyId ?? null;
    const partyStatus = party?.onboardingStatus ?? 'PENDING';
    const publicKey = party?.publicKey ?? '';
    const shouldAutoRegisterPreapproval = party?.shouldAutoRegisterPreapproval === true;

    if (partyId) {
      await sessionStore.set('partyId', partyId);
    }
    await sessionStore.set('partyStatus', partyStatus);
    await sessionStore.set('shouldAutoRegisterPreapproval', shouldAutoRegisterPreapproval);

    // Check if this user has already completed onboarding on this network
    const onboardingComplete = !!(await localStore.get('onboardingComplete'));

    // Detect keystore-vs-party-publicKey mismatch for already-onboarded users
    // who are signing in with a stale or wrong local keystore.
    // See: docs/superpowers/specs/2026-06-10-keystore-mismatch-recovery-design.md
    let keyMismatch = false;
    try {
      const existingKeystore = await localStore.get('keystore');
      if (
        partyStatus === 'SUCCESSFULLY' &&
        publicKey &&
        existingKeystore?.walletKey &&
        existingKeystore.walletKey !== publicKey
      ) {
        keyMismatch = true;
        console.warn(`${brand.logTag} Keystore mismatch detected`, {
          expected: publicKey.slice(0, 12) + '…',
          actual: existingKeystore.walletKey.slice(0, 12) + '…',
        });
      }
    } catch (e) {
      // Storage read failed — treat as no-mismatch (no regression vs. today's behavior)
      console.warn(`${brand.logTag} Could not read keystore for mismatch check:`, e);
    }

    return ok({
      token,
      user,
      partyId: partyId ?? '',
      partyStatus,
      publicKey,
      onboardingComplete,
      keyMismatch,
      shouldAutoRegisterPreapproval,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Google auth failed');
  }
}

export async function handleGetAuthState(): Promise<MessageResponse<AuthStateData>> {
  try {
    const token = await sessionStore.get('authToken');
    const user = await localStore.get('user'); // network-scoped
    const partyId = await sessionStore.get('partyId');

    // Set user scope so onboardingComplete reads the correct per-user key
    setUserScope(user?.id ?? null);
    const onboardingComplete = !!(await localStore.get('onboardingComplete'));

    return ok({
      isAuthenticated: !!token,
      user,
      partyId,
      onboardingComplete,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to get auth state');
  }
}

export async function handleRefreshToken(): Promise<MessageResponse<{ token: string }>> {
  try {
    const refreshToken = await sessionStore.get('refreshToken');
    if (!refreshToken) return err('No refresh token');

    const { data } = await apiClient.post('/auth/refresh-token', { refreshToken });
    const newToken = data?.data?.token;
    const newRefresh = data?.data?.refreshToken;

    await sessionStore.setMany({
      authToken: newToken,
      refreshToken: newRefresh ?? refreshToken,
    });

    return ok({ token: newToken });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Token refresh failed');
  }
}

export async function handleLogout(): Promise<MessageResponse<void>> {
  try {
    // Clear cached private key, preapproval cache, and auto-lock alarm
    setCachedPrivateKey(null);
    clearPreapprovalCache();
    chrome.alarms.clear('auto-lock');

    // Clear session and local storage
    await sessionStore.clear();
    await localStore.set('user', null);
    
    // Clear user scope
    setUserScope(null);
    return ok(undefined);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Logout failed');
  }
}
