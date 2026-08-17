/**
 * OAuth 2.0 PKCE helpers for the Obsidian plugin.
 *
 * Implements the public client flow (RFC 6749 + RFC 7636):
 *   1. Generate code_verifier + code_challenge locally
 *   2. Open system browser → RankSage consent page
 *   3. Receive callback via obsidian://ranksage-callback?code=...
 *   4. Exchange code for access + refresh tokens via requestUrl()
 *
 * WHY requestUrl() instead of fetch(): Obsidian's built-in requestUrl bypasses
 * the browser's CORS policy, allowing the plugin to call our backend API
 * directly from the Electron main process without a proxy.
 */

import { requestUrl } from 'obsidian';
import { TokenResponse } from './types';
import { BACKEND_URL } from './constants';

const CLIENT_ID = 'ranksage-obsidian';
const REDIRECT_URI = 'obsidian://ranksage-callback';
const SCOPE = 'digest:read';

/** Generate a cryptographically random base64url string */
function randomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** SHA-256 hash → base64url string (PKCE S256 method) */
async function sha256Base64url(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

/**
 * Generate PKCE code verifier, challenge, and state.
 * Call this before opening the browser — store codeVerifier for later.
 */
export async function generatePKCEParams(): Promise<PKCEParams> {
  const codeVerifier = randomBase64url(64);
  const codeChallenge = await sha256Base64url(codeVerifier);
  const state = randomBase64url(16);
  return { codeVerifier, codeChallenge, state };
}

/**
 * Build the authorization URL to open in the system browser.
 *
 * @param pkce - PKCE params from generatePKCEParams()
 * @returns URL string to open in the browser
 */
export function buildAuthorizeUrl(pkce: PKCEParams): string {
  const url = new URL(`${BACKEND_URL}/oauth/authorize`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', pkce.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', pkce.state);
  return url.toString();
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Uses requestUrl() to bypass CORS from within the Obsidian Electron process.
 *
 * @param code - Auth code received in the obsidian:// callback
 * @param codeVerifier - PKCE code verifier generated before the flow started
 * @returns TokenResponse from the backend
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const response = await requestUrl({
    url: `${BACKEND_URL}/api/v1/oauth/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      redirect_uri: REDIRECT_URI,
    }),
    throw: false,
  });

  if (response.status !== 200) {
    const body = response.json as { message?: string } | undefined;
    throw new Error(`Token exchange failed: ${body?.message ?? response.status}`);
  }

  return response.json as TokenResponse;
}

/**
 * Refresh an expired access token using the stored refresh token.
 *
 * @param refreshToken - The stored refresh token
 * @returns New TokenResponse (access + refresh tokens)
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await requestUrl({
    url: `${BACKEND_URL}/api/v1/oauth/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
    throw: false,
  });

  if (response.status !== 200) {
    const body = response.json as { message?: string } | undefined;
    throw new Error(`Token refresh failed: ${body?.message ?? response.status}`);
  }

  return response.json as TokenResponse;
}

/**
 * WHAT: Revoke the refresh token server-side (RFC 7009) on Disconnect.
 * HOW:  POST /api/v1/oauth/revoke with the raw refresh token — possession of the
 *       token is the authentication, same as the refresh grant.
 * WHY:  SEC-013 — the refresh token sits in plaintext in data.json; deleting it
 *       locally is not enough. Revoking kills the grant in the backend DB so the
 *       on-disk copy (and any sync backups of it) becomes worthless.
 *
 * @param refreshToken - The stored refresh token to revoke
 * @throws Error on non-200 so the caller can decide how loudly to fail
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const response = await requestUrl({
    url: `${BACKEND_URL}/api/v1/oauth/revoke`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      token: refreshToken,
    }),
    throw: false,
  });

  if (response.status !== 200) {
    const body = response.json as { message?: string } | undefined;
    throw new Error(`Token revocation failed: ${body?.message ?? response.status}`);
  }
}
