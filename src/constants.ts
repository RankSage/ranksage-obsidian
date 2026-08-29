/**
 * Compile-time constants for the RankSage Obsidian plugin.
 *
 * WHY hardcoded URL: user-editable API endpoints are a security risk —
 * a compromised or misconfigured device could redirect the plugin to a
 * malicious server and exfiltrate OAuth tokens. The URL is compiled into
 * the bundle; the actual data protection is the OAuth access token, not
 * URL obscurity. This pattern is standard for consumer integrations
 * (Slack, Linear, Notion all hardcode their API origins at build time).
 */
export const BACKEND_URL = 'https://api.ranksage.com';
