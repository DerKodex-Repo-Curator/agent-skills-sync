import * as assert from 'assert';
import * as vscode from 'vscode';

/** Minimal smoke suite executed inside the Extension Development Host (no test framework needed). */
export async function run(): Promise<void> {
  // Locate by package name so the test doesn't depend on the publisher id.
  const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === 'agent-skills-sync');
  assert.ok(ext, 'Extension agent-skills-sync not found');

  await ext.activate();
  assert.ok(ext.isActive, 'Extension failed to activate');

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'agentSkillsSync.setup',
    'agentSkillsSync.syncNow',
    'agentSkillsSync.resolveConflicts',
    'agentSkillsSync.openRepository',
    'agentSkillsSync.showLog',
    'agentSkillsSync.openMenu',
  ]) {
    assert.ok(commands.includes(command), `Command not registered: ${command}`);
  }
  console.log('Integration smoke suite passed.');
}
