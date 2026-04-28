import { App, PluginSettingTab, Setting } from 'obsidian';
import type RankSagePlugin from './main';

/**
 * Settings tab shown in Obsidian Settings → Community Plugins → RankSage Daily Brief.
 */
export class RankSageSettingsTab extends PluginSettingTab {
  plugin: RankSagePlugin;

  constructor(app: App, plugin: RankSagePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'RankSage Daily Brief' });

    // ── Connection status ──────────────────────────────────────────────────
    const isConnected = !!this.plugin.pluginData.refreshToken;
    const statusEl = containerEl.createEl('p', {
      text: isConnected
        ? '✅ Connected to RankSage'
        : '❌ Not connected — click "Connect RankSage" to start',
      cls: isConnected ? 'ranksage-status-connected' : 'ranksage-status-disconnected',
    });

    new Setting(containerEl)
      .setName('RankSage Account')
      .setDesc(isConnected ? 'Disconnect the plugin from your RankSage account.' : 'Connect your RankSage account to enable the daily brief.')
      .addButton((btn) => {
        if (isConnected) {
          btn
            .setButtonText('Disconnect')
            .setWarning()
            .onClick(async () => {
              await this.plugin.disconnect();
              this.display(); // re-render the tab
            });
        } else {
          btn
            .setButtonText('Connect RankSage')
            .setCta()
            .onClick(async () => {
              await this.plugin.startOAuthFlow();
            });
        }
      });

    // ── Backend URL ────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Backend URL')
      .setDesc('RankSage API URL. Leave as default unless self-hosting.')
      .addText((text) =>
        text
          .setPlaceholder('https://api.ranksage.io')
          .setValue(this.plugin.settings.backendUrl)
          .onChange(async (value) => {
            this.plugin.settings.backendUrl = value.trim() || 'https://api.ranksage.io';
            await this.plugin.saveSettings();
          })
      );

    // ── Inject position ────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Inject position')
      .setDesc('Where to insert the daily brief in your daily note.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('top', 'Top of note')
          .addOption('after-h1', 'After first heading')
          .addOption('bottom', 'Bottom of note')
          .setValue(this.plugin.settings.injectPosition)
          .onChange(async (value) => {
            this.plugin.settings.injectPosition = value as 'top' | 'bottom' | 'after-h1';
            await this.plugin.saveSettings();
          })
      );

    // ── Auto-inject ────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Auto-inject on startup')
      .setDesc('Automatically fetch and inject the digest when Obsidian starts.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoInjectOnStartup).onChange(async (value) => {
          this.plugin.settings.autoInjectOnStartup = value;
          await this.plugin.saveSettings();
        })
      );

    // ── Manual refresh ─────────────────────────────────────────────────────
    if (isConnected) {
      new Setting(containerEl)
        .setName('Manual refresh')
        .setDesc('Fetch the latest digest and inject it into today\'s daily note now.')
        .addButton((btn) =>
          btn
            .setButtonText('Refresh Daily Brief')
            .onClick(async () => {
              await this.plugin.runDigestInjection();
            })
        );
    }

    // ── Last fetched info ──────────────────────────────────────────────────
    if (this.plugin.pluginData.lastFetchedAt) {
      containerEl.createEl('p', {
        text: `Last fetched: ${new Date(this.plugin.pluginData.lastFetchedAt).toLocaleString()}`,
        cls: 'setting-item-description',
      });
    }
  }
}
