import * as path from 'node:path';
import * as vscode from 'vscode';
import { getEnabledAgents } from './config/agents';
import { SyncController } from './sync/controller';
import { SyncScheduler } from './sync/scheduler';
import { StateStore } from './sync/stateStore';
import { Trash } from './sync/trash';
import { Agent, RepoConfig } from './sync/types';
import { RemoteContentProvider, REMOTE_SCHEME, resolveConflictsFlow } from './ui/conflicts';
import { openMenu } from './ui/menu';
import { runSetupWizard } from './ui/setupWizard';
import { StatusBar } from './ui/statusBar';

const KEY_REPO = 'agentSkillsSync.repo';
const KEY_CONFIRMED = 'agentSkillsSync.initialSyncConfirmed';
const KEY_WELCOMED = 'agentSkillsSync.welcomed';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Agent Skills Sync', { log: true });

  const getConfig = (): RepoConfig | undefined => context.globalState.get<RepoConfig>(KEY_REPO);
  const settings = () => vscode.workspace.getConfiguration('agentSkillsSync');
  const getAgents = (): Agent[] => getEnabledAgents();
  const autoSyncEnabled = (): boolean => settings().get<boolean>('autoSync', true);

  const storageDir = context.globalStorageUri.fsPath;
  const stateStore = new StateStore(storageDir);
  const trash = new Trash(path.join(storageDir, 'trash'), log);
  const controller = new SyncController(getConfig, getAgents, stateStore, trash, log);
  const statusBar = new StatusBar();
  const scheduler = new SyncScheduler(
    controller,
    getAgents,
    () => ({
      debounceMs: Math.max(1, settings().get<number>('debounceSeconds', 3)) * 1000,
      pollMs: Math.max(1, settings().get<number>('pollIntervalMinutes', 5)) * 60_000,
    }),
    log
  );
  controller.setSyncRequester((reason) => scheduler.requestSync(reason));
  context.globalState.setKeysForSync([KEY_REPO]);

  context.subscriptions.push(
    log,
    statusBar,
    scheduler,
    controller,
    controller.onDidChangeStatus((s) => statusBar.update(s)),
    vscode.workspace.registerTextDocumentContentProvider(REMOTE_SCHEME, new RemoteContentProvider(controller))
  );

  const startOrRequest = (reason: string): void => {
    if (!scheduler.isStarted() && autoSyncEnabled()) {
      scheduler.start(); // includes an initial sync
    } else {
      scheduler.requestSync(reason);
    }
  };

  const runSetupFlow = async (): Promise<void> => {
    const previous = getConfig();
    const cfg = await runSetupWizard(log);
    if (!cfg) {
      return;
    }
    const changed =
      !previous || previous.owner !== cfg.owner || previous.repo !== cfg.repo || previous.branch !== cfg.branch;
    await context.globalState.update(KEY_REPO, cfg);
    if (changed) {
      await controller.resetAfterRepoChange();
    }

    let counts: { localSkills: number; remoteSkills: number };
    try {
      counts = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Agent Skills Sync: checking your skills…' },
        () => controller.getFirstSyncCounts()
      );
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Agent Skills Sync: could not read the repository state: ${e instanceof Error ? e.message : String(e)}`
      );
      return;
    }

    const { localSkills, remoteSkills } = counts;
    let confirmed = true;
    if (localSkills > 0 && remoteSkills === 0) {
      confirmed =
        (await vscode.window.showInformationMessage(
          `${localSkills} local skill(s) found. Upload them to ${cfg.owner}/${cfg.repo}?`,
          { modal: true },
          'Upload'
        )) === 'Upload';
    } else if (remoteSkills > 0 && localSkills === 0) {
      confirmed =
        (await vscode.window.showInformationMessage(
          `${remoteSkills} skill(s) available remotely. Download now?`,
          { modal: true },
          'Download'
        )) === 'Download';
    } else if (localSkills > 0 && remoteSkills > 0) {
      confirmed =
        (await vscode.window.showInformationMessage(
          `Found ${localSkills} local and ${remoteSkills} remote skill(s). Merge and sync now? Conflicting skills will be shown for review.`,
          { modal: true },
          'Sync'
        )) === 'Sync';
    }

    await context.globalState.update(KEY_CONFIRMED, confirmed);
    if (confirmed) {
      startOrRequest('setup');
    } else {
      controller.setPaused();
      void vscode.window.showInformationMessage(
        "Setup saved. Run 'Agent Skills Sync: Sync Now' whenever you're ready — your skills are stored in your own GitHub repository."
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('agentSkillsSync.setup', runSetupFlow),
    vscode.commands.registerCommand('agentSkillsSync.syncNow', async () => {
      if (!getConfig()) {
        await runSetupFlow();
        return;
      }
      await context.globalState.update(KEY_CONFIRMED, true);
      startOrRequest('manual');
    }),
    vscode.commands.registerCommand('agentSkillsSync.resolveConflicts', () =>
      resolveConflictsFlow(controller, getAgents, (reason) => scheduler.requestSync(reason))
    ),
    vscode.commands.registerCommand('agentSkillsSync.openRepository', () => {
      const cfg = getConfig();
      if (cfg) {
        void vscode.env.openExternal(
          vscode.Uri.parse(`https://github.com/${cfg.owner}/${cfg.repo}/tree/${cfg.branch}`)
        );
      }
    }),
    vscode.commands.registerCommand('agentSkillsSync.showLog', () => log.show()),
    vscode.commands.registerCommand('agentSkillsSync.openMenu', () =>
      openMenu(controller, getConfig, (reason) => scheduler.requestSync(reason))
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('agentSkillsSync')) {
        scheduler.restart();
        if (autoSyncEnabled() && getConfig() && context.globalState.get<boolean>(KEY_CONFIRMED)) {
          scheduler.start();
        }
      }
    }),
    vscode.authentication.onDidChangeSessions((e) => {
      if (e.provider.id === 'github' && getConfig() && scheduler.isStarted()) {
        scheduler.requestSync('auth-change');
      }
    })
  );

  // Startup behaviour.
  const cfg = getConfig();
  if (cfg && autoSyncEnabled() && context.globalState.get<boolean>(KEY_CONFIRMED)) {
    scheduler.start();
  } else if (cfg) {
    controller.setPaused();
  } else if (!context.globalState.get<boolean>(KEY_WELCOMED)) {
    void context.globalState.update(KEY_WELCOMED, true);
    void vscode.window
      .showInformationMessage(
        'Agent Skills Sync keeps your personal AI agent skills in sync across your machines — stored in your own GitHub repository.',
        'Set Up'
      )
      .then((choice) => {
        if (choice === 'Set Up') {
          void vscode.commands.executeCommand('agentSkillsSync.setup');
        }
      });
  }

  log.info(
    `Agent Skills Sync activated. Agents: ${getAgents()
      .map((a) => `${a.label} → ${a.localPath}`)
      .join(', ')}`
  );
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
