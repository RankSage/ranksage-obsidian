/**
 * Persisted plugin data — stored via plugin.saveData() / plugin.loadData().
 * Tokens are opaque strings; the access token is stored plainly because
 * Obsidian's vault storage is user-owned local files (acceptable risk).
 * The refresh token is the sensitive long-lived credential — treat it with care.
 */
export interface PluginData {
  accessToken: string | null;
  refreshToken: string | null;
  /** Unix ms timestamp of access token expiry */
  accessTokenExpiresAt: number | null;
  lastDigest: DigestPayload | null;
  /** ISO timestamp of the last successful digest fetch */
  lastFetchedAt: string | null;
}

export interface PluginSettings {
  /** RankSage backend URL */
  backendUrl: string;
  /** Inject position in daily note */
  injectPosition: 'top' | 'bottom' | 'after-h1';
  /** Whether to auto-inject on startup */
  autoInjectOnStartup: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  backendUrl: 'https://api.ranksage.io',
  injectPosition: 'top',
  autoInjectOnStartup: true,
};

export const DEFAULT_DATA: PluginData = {
  accessToken: null,
  refreshToken: null,
  accessTokenExpiresAt: null,
  lastDigest: null,
  lastFetchedAt: null,
};

// ── Digest API types ──────────────────────────────────────────────────────────

export interface DigestAlert {
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface DigestWebsite {
  id: string;
  domain: string;
  name: string;
  dashboardUrl: string;
  traffic: {
    visitors: number;
    visitorsDelta: number | null;
    trend: 'up' | 'down' | 'stable';
  };
  keywords: {
    tracked: number;
    improved: number;
    declined: number;
    topMover: { keyword: string; positionDelta: number } | null;
  };
  aiVisibility: {
    mentionScore: number;
    mentionDelta: number | null;
    aiModelsTracked: number;
  };
  seoScore: number | null;
  seoScoreDelta: number | null;
  alerts: DigestAlert[];
}

export interface DigestPayload {
  generatedAt: string;
  websites: DigestWebsite[];
}

// ── OAuth token response ──────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}
