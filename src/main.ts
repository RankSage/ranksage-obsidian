/**
 * RankSage Daily Brief — Obsidian Plugin
 *
 * Injects your RankSage SEO/AEO/AI visibility daily brief into Obsidian Daily Notes.
 *
 * Architecture:
 *  - Auth: OAuth 2.0 PKCE flow via system browser + obsidian://ranksage-callback
 *  - Tokens: stored via plugin.saveData() (user-owned local vault storage)
 *  - Digest: fetched from GET /api/v1/digest using requestUrl() (CORS bypass)
 *  - Injection: fenced comment block in today's daily note (replace-on-rerun)
 */

import {
  App,
  Notice,
  Plugin,
  TFile,
  addIcon,
  moment,
  ObsidianProtocolData,
} from 'obsidian';
import { PluginSettings, PluginData, DEFAULT_SETTINGS, DEFAULT_DATA } from './types';
import { generatePKCEParams, buildAuthorizeUrl, exchangeCodeForTokens, refreshAccessToken } from './oauth';
import { fetchDigest, formatDigestBlock, injectDigestBlock } from './digest';
import { RankSageSettingsTab } from './settings';

// ── RankSage brand icon ───────────────────────────────────────────────────────
// Normalized from the official SVG (596.89 × 371.42) to Obsidian's 0-0-100-100
// viewBox space using transform="translate(0,18.9) scale(0.1675)".
// Brand blue #5562ff + gold #fbb040 are readable on both dark and light sidebars.
const RANKSAGE_ICON_SVG = `
<g transform="translate(0,18.9) scale(0.1675)">
  <path fill="#5562ff" d="M496.96,90.07L596.89,0h-94.94c-102.4,0-185.71,83.31-185.71,185.71h90.07c0-52.74,37.92-95.64,90.66-95.64Z"/>
  <path fill="#5562ff" d="M190.59,185.71h90.07C280.65,83.31,197.35,0,94.94,0H0l99.92,90.07c52.74,0,90.67,42.91,90.67,95.64Z"/>
  <path fill="#5562ff" d="M285.63,371.42v-90.07c-52.74,0-95.64-42.91-95.64-95.64h-90.07c0,102.4,83.31,185.71,185.71,185.71Z"/>
  <path fill="#5562ff" d="M496.55,185.71h-90.07c0,52.74-42.91,95.64-95.64,95.64v90.07c102.4,0,185.71-83.31,185.71-185.71Z"/>
  <polygon fill="#fbb040" points="298.61 200.02 269.17 233.27 298.61 266.52 328.04 233.27"/>
  <polyline fill="none" stroke="#5562ff" stroke-width="5.97" points="99.92 185.71 99.92 90.19 496.96 90.19 496.55 185.71"/>
  <path fill="#5562ff" d="M209.03,182.94c0,.18-.03.35-.03.53,0,14.64,11.87,26.51,26.51,26.51s26.51-11.87,26.51-26.51c0-.18-.02-.35-.03-.53h-52.97Z"/>
  <path fill="#5562ff" d="M335.21,182.94c0,.18-.03.35-.03.53,0,14.64,11.87,26.51,26.51,26.51s26.51-11.87,26.51-26.51c0-.18-.02-.35-.03-.53h-52.97Z"/>
</g>
`;


export default class RankSagePlugin extends Plugin {
  settings!: PluginSettings;
  pluginData!: PluginData;

  /**
   * Temporary PKCE state held in memory during the OAuth flow.
   * Cleared once the callback is received.
   */
  private pendingOAuth: { codeVerifier: string; state: string } | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.loadPluginData();

    // Register the RankSage brand mark as a custom Obsidian icon.
    // Must be called before addRibbonIcon so the icon is available.
    addIcon('ranksage-logo', RANKSAGE_ICON_SVG);

    // Register the obsidian://ranksage-callback protocol handler
    // WHY registerObsidianProtocolHandler: this is the only sanctioned Obsidian
    // API for receiving data from external URLs. The system browser redirects to
    // obsidian://ranksage-callback?code=...&state=... after consent.
    this.registerObsidianProtocolHandler('ranksage-callback', (params) =>
      this.handleOAuthCallback(params)
    );

    // Register a manual-refresh protocol handler so the "Last updated" link works
    this.registerObsidianProtocolHandler('ranksage-refresh', () =>
      this.runDigestInjection()
    );

    // Ribbon icon — uses the registered RankSage brand mark
    this.addRibbonIcon('ranksage-logo', 'Refresh RankSage Daily Brief', () =>
      this.runDigestInjection()
    );

    // Command palette entry — fetch real digest
    this.addCommand({
      id: 'refresh-ranksage-brief',
      name: 'Refresh RankSage Daily Brief',
      callback: () => this.runDigestInjection(),
    });

    // Settings tab
    this.addSettingTab(new RankSageSettingsTab(this.app, this));

    // Auto-inject on layout ready
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.autoInjectOnStartup && this.pluginData.refreshToken) {
        await this.runDigestInjection();
      }
    });
  }

  onunload(): void {
    this.pendingOAuth = null;
  }

  // ── Settings persistence ─────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as { settings?: PluginSettings; data?: PluginData } | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings);
  }

  async loadPluginData(): Promise<void> {
    const saved = (await this.loadData()) as { settings?: PluginSettings; data?: PluginData } | null;
    this.pluginData = Object.assign({}, DEFAULT_DATA, saved?.data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ settings: this.settings, data: this.pluginData });
  }

  async savePluginData(): Promise<void> {
    await this.saveData({ settings: this.settings, data: this.pluginData });
  }

  // ── OAuth PKCE flow ──────────────────────────────────────────────────────

  /**
   * Start the OAuth PKCE authorization flow.
   * Generates PKCE params, stores the code verifier in memory, then opens
   * the system browser to the RankSage consent page.
   */
  async startOAuthFlow(): Promise<void> {
    try {
      const pkce = await generatePKCEParams();
      this.pendingOAuth = { codeVerifier: pkce.codeVerifier, state: pkce.state };

      const authorizeUrl = buildAuthorizeUrl(pkce);

      // Open system browser — Obsidian's shell API
      window.open(authorizeUrl);

      new Notice('Opening RankSage in your browser. Complete the connection there.');
    } catch (error) {
      new Notice('Failed to start OAuth flow. Check your backend URL in settings.');
      console.error('[RankSage] startOAuthFlow error:', error);
    }
  }

  /**
   * Handle the obsidian://ranksage-callback?code=...&state=... redirect.
   * Called by Obsidian when the system browser redirects to the custom URL.
   *
   * @param params - Query parameters from the obsidian:// URL
   */
  private async handleOAuthCallback(params: ObsidianProtocolData): Promise<void> {
    try {
      const { code, state } = params;

      if (!code || typeof code !== 'string') {
        new Notice('RankSage: OAuth callback missing code. Please try connecting again.');
        return;
      }

      if (!this.pendingOAuth) {
        new Notice('RankSage: No pending OAuth session. Please try connecting again.');
        return;
      }

      // CSRF protection: verify state matches what we sent
      if (state !== this.pendingOAuth.state) {
        new Notice('RankSage: OAuth state mismatch. Possible CSRF attack — connection aborted.');
        this.pendingOAuth = null;
        return;
      }

      const { codeVerifier } = this.pendingOAuth;
      this.pendingOAuth = null;

      const tokens = await exchangeCodeForTokens(code, codeVerifier);
      await this.storeTokens(tokens);

      new Notice('✅ RankSage connected! Fetching your daily brief...');
      await this.runDigestInjection();
    } catch (error) {
      new Notice('RankSage: Connection failed. Please try again.');
      console.error('[RankSage] handleOAuthCallback error:', error);
    }
  }

  /**
   * Store new tokens returned from the backend.
   */
  private async storeTokens(tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }): Promise<void> {
    this.pluginData.accessToken = tokens.access_token;
    this.pluginData.refreshToken = tokens.refresh_token;
    // WHY 60s buffer: access tokens can't be refreshed the instant they expire
    // if there's a network round trip. Subtract 60s so we refresh proactively.
    this.pluginData.accessTokenExpiresAt = Date.now() + (tokens.expires_in - 60) * 1000;
    await this.savePluginData();
  }

  /**
   * Ensure the access token is valid, refreshing it silently if expired.
   *
   * @returns Valid access token, or null if no refresh token is available
   */
  private async ensureValidAccessToken(): Promise<string | null> {
    const { accessToken, refreshToken, accessTokenExpiresAt } = this.pluginData;

    if (!refreshToken) return null;

    const isExpired = !accessTokenExpiresAt || Date.now() >= accessTokenExpiresAt;

    if (!isExpired && accessToken) return accessToken;

    // Silent background refresh
    try {
      const tokens = await refreshAccessToken(refreshToken);
      await this.storeTokens(tokens);
      return tokens.access_token;
    } catch (error) {
      // Refresh token is expired or revoked — clear credentials
      this.pluginData.accessToken = null;
      this.pluginData.refreshToken = null;
      this.pluginData.accessTokenExpiresAt = null;
      await this.savePluginData();
      new Notice('RankSage: Session expired. Please reconnect in Settings.');
      return null;
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────────────

  /**
   * Disconnect the plugin — clears stored tokens locally.
   * Does not call the backend revocation endpoint (best-effort; tokens expire).
   */
  async disconnect(): Promise<void> {
    this.pluginData.accessToken = null;
    this.pluginData.refreshToken = null;
    this.pluginData.accessTokenExpiresAt = null;
    await this.savePluginData();
    new Notice('RankSage disconnected.');
  }

  // ── Digest injection ─────────────────────────────────────────────────────

  /**
   * Fetch the latest digest and inject it into today's daily note.
   * Gracefully degrades: if the API call fails, shows last cached digest with
   * a staleness warning and does not erase existing content.
   */
  async runDigestInjection(): Promise<void> {
    const accessToken = await this.ensureValidAccessToken();

    if (!accessToken) {
      // Show last cached digest with staleness warning if available
      if (this.pluginData.lastDigest && this.pluginData.lastFetchedAt) {
        await this.injectIntoTodaysNote(this.pluginData.lastDigest, this.pluginData.lastFetchedAt, { stale: true });
        new Notice('RankSage: Using cached digest (not connected). Reconnect in Settings.');
      } else {
        new Notice('RankSage: Not connected. Go to Settings to connect your account.');
      }
      return;
    }

    try {
      const digest = await fetchDigest(accessToken, this.settings.digestFrequency);
      const fetchedAt = new Date().toISOString();
      this.pluginData.lastDigest = digest;
      this.pluginData.lastFetchedAt = fetchedAt;
      await this.savePluginData();

      await this.injectIntoTodaysNote(digest, fetchedAt, { stale: false });
      new Notice('✅ RankSage daily brief updated!');
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        // Access token rejected — attempt refresh handled in ensureValidAccessToken
        new Notice('RankSage: Authentication error. Please reconnect in Settings.');
        return;
      }

      // Network or API error — show stale digest with warning
      if (this.pluginData.lastDigest && this.pluginData.lastFetchedAt) {
        await this.injectIntoTodaysNote(this.pluginData.lastDigest, this.pluginData.lastFetchedAt, { stale: true });
        new Notice('RankSage: API error — showing last cached digest.');
      } else {
        new Notice('RankSage: Failed to fetch digest. Will retry on next startup.');
      }

      console.error('[RankSage] runDigestInjection error:', error);
    }
  }

  /**
   * Inject the digest block into today's daily note.
   * Creates the note if it doesn't exist yet.
   *
   * @param digest - Digest payload to format and inject
   * @param fetchedAt - ISO timestamp for the "last updated" footer
   * @param options - Injection options
   */
  private async injectIntoTodaysNote(
    digest: import('./types').DigestPayload,
    fetchedAt: string,
    options: { stale: boolean }
  ): Promise<void> {
    const dailyNote = await this.getOrCreateTodaysDailyNote();

    if (!dailyNote) {
      new Notice('RankSage: Could not find or create today\'s daily note. Is the Daily Notes core plugin enabled?');
      return;
    }

    let digestBlock = formatDigestBlock(digest, fetchedAt, this.settings.digestFrequency);

    if (options.stale) {
      const staleSince = this.pluginData.lastFetchedAt
        ? new Date(this.pluginData.lastFetchedAt).toLocaleString()
        : 'unknown';
      digestBlock = digestBlock.replace(
        '<!-- ranksage-digest-start -->',
        `<!-- ranksage-digest-start -->\n> ⚠️ _Cached digest from ${staleSince} — API unavailable_\n`
      );
    }

    const currentContent = await this.app.vault.read(dailyNote);
    const updatedContent = injectDigestBlock(currentContent, digestBlock, this.settings.injectPosition);

    await this.app.vault.modify(dailyNote, updatedContent);
  }

  /**
   * Locate today's daily note, creating it (and any required folders) if absent.
   *
   * Folder resolution order:
   *   1. Daily Notes core plugin settings (app.internalPlugins)
   *   2. "Daily Notes folder" from plugin settings (user-configured fallback)
   *   3. Vault root (empty folder path)
   *
   * WHY recursive folder creation: vault.createFolder() only creates one level.
   * Paths like "Journal/Daily" require creating "Journal" before "Journal/Daily".
   *
   * @returns The TFile for today's daily note, or null on unrecoverable failure
   */
  private async getOrCreateTodaysDailyNote(): Promise<TFile | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailyNotesPlugin = (this.app as any).internalPlugins?.getEnabledPluginById('daily-notes');

    let folder = this.settings.dailyNotesFolder;
    let format = 'YYYY-MM-DD';

    if (dailyNotesPlugin?.instance?.options) {
      // Core Daily Notes plugin is enabled — its settings take precedence
      folder = dailyNotesPlugin.instance.options.folder ?? folder;
      format = dailyNotesPlugin.instance.options.format ?? format;
    }

    // moment is globally available in Obsidian's runtime
    const fileName = moment().format(format);
    const filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) return existing;

    try {
      if (folder) {
        await this.ensureFolderPath(folder);
      }
      return await this.app.vault.create(filePath, '');
    } catch {
      // Race condition: another process created the file between our check and create
      const retried = this.app.vault.getAbstractFileByPath(filePath);
      return retried instanceof TFile ? retried : null;
    }
  }

  /**
   * Recursively create all folders in a path.
   * vault.createFolder() only handles one level — this walks each segment.
   *
   * WHY: Daily Notes folder paths like "Journal/Daily/2026" require three
   * separate createFolder calls. Calling createFolder on the full path throws
   * "Folder already exists" for every segment except the last.
   *
   * @param folderPath - Path like "Journal/Daily" or "Daily Notes"
   */
  private async ensureFolderPath(folderPath: string): Promise<void> {
    const segments = folderPath.split('/').filter(Boolean);
    let current = '';

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const exists = this.app.vault.getAbstractFileByPath(current);
      if (!exists) {
        // createFolder throws if the folder already exists — safe to ignore
        await this.app.vault.createFolder(current).catch(() => {});
      }
    }
  }
}
