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
  /** Inject position in daily note */
  injectPosition: 'top' | 'bottom' | 'after-h1';
  /** Whether to auto-inject on startup */
  autoInjectOnStartup: boolean;
  /**
   * Fallback folder for daily notes when the Daily Notes core plugin is disabled
   * or has no folder configured. Leave blank to create notes at vault root.
   * Supports nested paths like "Journal/Daily" — all intermediate folders are created.
   */
  dailyNotesFolder: string;
  /** Time window for the digest: data from the past 1 day, 7 days, or 30 days */
  digestFrequency: 'daily' | 'weekly' | 'monthly';
}

export const DEFAULT_SETTINGS: PluginSettings = {
  injectPosition: 'top',
  autoInjectOnStartup: true,
  dailyNotesFolder: '',
  digestFrequency: 'daily',
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
    /** AIO-adjusted reachable visitors (P1.5 Traffic Reality). Negative delta = AIO is eating clicks. */
    aioAdjustedVisitors?: number | null;
    /** % difference between AIO-adjusted and traditional expected clicks (efficiency ratio − 1). */
    aioTrafficImpactPct?: number | null;
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
    /** Discovery Vulnerability Index (0–100): non-branded traffic at risk from AIO. */
    discoveryVulnerabilityIndex?: number | null;
    /** Platform display names where brand was cited in the most recent run. e.g. ['ChatGPT', 'Perplexity'] */
    citedIn?: string[];
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
