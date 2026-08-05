/**
 * Persisted plugin data — stored via plugin.saveData() / plugin.loadData().
 *
 * ── SECURITY (SEC-013) — KNOWN LIMITATION, read before changing ─────────────
 * The refresh token below is written in PLAINTEXT to
 * `.obsidian/plugins/ranksage-obsidian/data.json` inside the user's vault.
 * Obsidian offers NO OS-keychain API to plugins, and any encryption key we
 * could derive would itself have to live in the same data.json — that would be
 * security theater, not security. The real mitigations are:
 *   1. MINIMIZATION — only the refresh token is persisted. Access tokens live
 *      exclusively in memory (see RankSagePlugin) and never touch disk.
 *   2. ROTATION — the backend rotates the refresh token on every use and
 *      atomically invalidates the previous one, so a copied data.json dies the
 *      next time the plugin refreshes.
 *   3. REVOCATION — Disconnect calls POST /api/v1/oauth/revoke (RFC 7009), so
 *      the on-disk token is killed server-side, not just deleted locally.
 *   4. SCOPE — the token can only ever mint digest:read access (1h TTL).
 * Anyone with read access to the vault (e.g. an unencrypted sync target) can
 * impersonate the plugin until the next rotation/revocation — advise users to
 * exclude data.json from shared syncs or use Disconnect on shared machines.
 */
export interface PluginData {
  refreshToken: string | null;
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
  refreshToken: null,
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
    /** Null when no AI platforms are tracked yet (unmeasured, not zero). */
    mentionScore: number | null;
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
