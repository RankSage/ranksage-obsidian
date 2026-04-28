/**
 * Digest fetching and Markdown formatting for Daily Note injection.
 */

import { requestUrl } from 'obsidian';
import { DigestPayload, DigestWebsite } from './types';
import { BACKEND_URL } from './constants';

const BLOCK_START = '<!-- ranksage-digest-start -->';
const BLOCK_END = '<!-- ranksage-digest-end -->';

/**
 * Fetch the digest from the RankSage backend.
 * Uses requestUrl() to bypass CORS from within the Obsidian Electron process.
 *
 * @param accessToken - Valid OAuth access token
 * @param period - Time window for the digest data
 * @returns DigestPayload on success
 */
export async function fetchDigest(
  accessToken: string,
  period: 'daily' | 'weekly' | 'monthly'
): Promise<DigestPayload> {
  const response = await requestUrl({
    url: `${BACKEND_URL}/api/v1/digest?period=${period}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    throw: false,
  });

  if (response.status === 401) {
    throw new Error('UNAUTHORIZED');
  }
  if (response.status !== 200) {
    const body = response.json as { message?: string } | undefined;
    throw new Error(`Digest fetch failed: ${body?.message ?? response.status}`);
  }

  const data = response.json as { success: boolean; data: DigestPayload };
  return data.data;
}

// ── Markdown formatting ──────────────────────────────────────────────────────

const TREND_ARROW: Record<string, string> = { up: '▲', down: '▼', stable: '→' };
const SEVERITY_PREFIX: Record<string, string> = { critical: '🔴', warning: '⚠️', info: 'ℹ️' };

/**
 * Format a single website's digest as a Markdown section.
 */
function formatWebsiteSection(site: DigestWebsite, fetchedAt: string): string {
  const trafficArrow = TREND_ARROW[site.traffic.trend];
  const deltaStr =
    site.traffic.visitorsDelta !== null
      ? ` ${trafficArrow} ${Math.abs(site.traffic.visitorsDelta)}%`
      : '';

  const seoStr = site.seoScore !== null ? `${site.seoScore}` : 'N/A';
  const seoDeltaStr =
    site.seoScoreDelta !== null
      ? ` (${site.seoScoreDelta > 0 ? '+' : ''}${site.seoScoreDelta})`
      : '';

  const topMoverStr = site.keywords.topMover
    ? `🔑 Top mover: "${site.keywords.topMover.keyword}" ${site.keywords.topMover.positionDelta > 0 ? '▲' : '▼'} ${Math.abs(site.keywords.topMover.positionDelta)} positions`
    : '';

  const alertsStr =
    site.alerts.length > 0
      ? `⚠️ Alerts:\n${site.alerts.map((a) => `  - ${SEVERITY_PREFIX[a.severity]} ${a.message}`).join('\n')}`
      : '';

  const lines = [
    `**${site.domain}** · Traffic ${site.traffic.visitors.toLocaleString()}${deltaStr} · AI Visibility ${site.aiVisibility.mentionScore}/100 · SEO Score ${seoStr}${seoDeltaStr}`,
    site.keywords.tracked > 0
      ? `📊 Keywords: ${site.keywords.tracked} tracked · ${site.keywords.improved} improved · ${site.keywords.declined} declined`
      : '',
    topMoverStr,
    alertsStr,
    `→ [View Full Report](${site.dashboardUrl})`,
  ].filter(Boolean);

  return lines.join('\n');
}

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Daily Brief',
  weekly: 'Weekly Brief',
  monthly: 'Monthly Brief',
};

/**
 * Format the complete digest payload as a Markdown block.
 *
 * @param digest - Digest payload from the API
 * @param fetchedAt - ISO timestamp when this digest was fetched
 * @param period - Time window that was requested
 * @returns Markdown string wrapped in ranksage-digest-start/end comments
 */
export function formatDigestBlock(
  digest: DigestPayload,
  fetchedAt: string,
  period: 'daily' | 'weekly' | 'monthly' = 'daily'
): string {
  const date = new Date(fetchedAt).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sections =
    digest.websites.length > 0
      ? digest.websites.map((site) => formatWebsiteSection(site, fetchedAt)).join('\n\n---\n\n')
      : '_No websites tracked yet. [Add your first site →](https://app.ranksage.io/sites)_';

  const footer = `_Last updated: ${new Date(fetchedAt).toLocaleTimeString()} · [Refresh](obsidian://ranksage-refresh)_`;

  const heading = FREQUENCY_LABEL[period] ?? 'Brief';

  const block = [
    `## 🌐 RankSage ${heading} — ${date}`,
    '',
    sections,
    '',
    footer,
  ].join('\n');

  return `${BLOCK_START}\n${block}\n${BLOCK_END}`;
}

/**
 * Inject or replace the RankSage digest block in existing note content.
 *
 * WHY fenced block: using HTML comment markers ensures we can reliably find and
 * replace only the digest section on re-run, never touching user content above
 * or below. Standard Markdown renderers ignore HTML comments.
 *
 * @param existingContent - Current daily note content (may be empty)
 * @param digestBlock - The formatted digest block to inject
 * @param position - Where to inject: 'top', 'bottom', or 'after-h1'
 * @returns Updated note content with the digest block injected/replaced
 */
export function injectDigestBlock(
  existingContent: string,
  digestBlock: string,
  position: 'top' | 'bottom' | 'after-h1'
): string {
  // If a digest block already exists, replace it in-place (no duplicate)
  if (existingContent.includes(BLOCK_START)) {
    const startIdx = existingContent.indexOf(BLOCK_START);
    const endIdx = existingContent.indexOf(BLOCK_END);

    if (endIdx !== -1) {
      const before = existingContent.slice(0, startIdx);
      const after = existingContent.slice(endIdx + BLOCK_END.length);
      return `${before}${digestBlock}${after}`;
    }
  }

  // Fresh injection
  if (position === 'top') {
    return existingContent
      ? `${digestBlock}\n\n${existingContent}`
      : digestBlock;
  }

  if (position === 'after-h1') {
    // Find the first H1 line and inject after it
    const lines = existingContent.split('\n');
    const h1Index = lines.findIndex((line) => /^#\s/.test(line));
    if (h1Index !== -1) {
      lines.splice(h1Index + 1, 0, '', digestBlock, '');
      return lines.join('\n');
    }
    // Fallback to top if no H1 found
    return `${digestBlock}\n\n${existingContent}`;
  }

  // bottom
  return existingContent
    ? `${existingContent}\n\n${digestBlock}`
    : digestBlock;
}
