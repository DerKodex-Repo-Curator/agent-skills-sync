import * as vscode from 'vscode';
import { SyncStatus } from '../sync/types';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem('agentSkillsSync.status', vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'Agent Skills Sync';
    this.item.command = 'agentSkillsSync.openMenu';
    this.update({ kind: 'notConfigured' });
    this.item.show();
  }

  update(status: SyncStatus): void {
    this.item.backgroundColor = undefined;
    switch (status.kind) {
      case 'notConfigured':
        this.item.text = '$(cloud) Skills: Set Up';
        this.item.tooltip = 'Agent Skills Sync is not configured yet. Click to set up.';
        break;
      case 'signInRequired':
        this.item.text = '$(account) Skills: Sign In';
        this.item.tooltip = 'GitHub sign-in is required to sync your skills. Click to sign in.';
        break;
      case 'paused':
        this.item.text = '$(debug-pause) Skills Sync Paused';
        this.item.tooltip = 'Automatic sync is paused. Click to sync now.';
        break;
      case 'syncing':
        this.item.text = '$(sync~spin) Syncing Skills';
        this.item.tooltip = 'Synchronizing your skills…';
        break;
      case 'synced':
        this.item.text = '$(check) Skills Synced';
        this.item.tooltip = `Skills are in sync with ${status.repo} (last sync ${new Date(status.at).toLocaleTimeString()}).`;
        break;
      case 'conflict':
        this.item.text = '$(warning) Skill Conflict';
        this.item.tooltip = `Conflicting skill(s): ${status.skills.join(', ')}. Click to resolve.`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'error':
        this.item.text = '$(error) Skills Sync Error';
        this.item.tooltip = `Sync failed: ${status.message}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
