import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getGitHubSession } from '../github/auth';
import { GitHubClient, GitHubError, TreeEntry } from '../github/client';
import { forEachLimit } from '../util/async';
import { describeUnit, isValidRepoPath, repoPathToLocal, unitOf } from '../util/paths';
import { repoReadmeContent } from '../util/repoTemplate';
import { computeSyncPlan, countSkills, mapsEqual } from './engine';
import { scanAgents } from './scanner';
import { StateStore } from './stateStore';
import { Trash } from './trash';
import { Agent, ConflictResolution, FileShaMap, RepoConfig, SkillConflict, SyncPlan, SyncStatus } from './types';

const MAX_PUSH_ATTEMPTS = 3;
const BLOB_CONCURRENCY = 6;

interface RemovedSkill {
  unit: string;
  label: string;
  targetDir: string;
  backupPath?: string;
}

/**
 * Orchestrates a single synchronization run: scan local state, fetch remote state,
 * compute the 3-way plan, apply local writes, push a commit, persist the new BASE.
 */
export class SyncController implements vscode.Disposable {
  private readonly statusEmitter = new vscode.EventEmitter<SyncStatus>();
  readonly onDidChangeStatus = this.statusEmitter.event;

  private status: SyncStatus = { kind: 'notConfigured' };
  private conflicts: SkillConflict[] = [];
  private readonly resolutions = new Map<string, ConflictResolution>();
  private readonly blobTextCache = new Map<string, string>();
  private requestSync: (reason: string) => void = () => {};
  private lastClient?: GitHubClient;
  private lastCfg?: RepoConfig;

  /** True while the controller itself is writing to a skills dir — the watcher ignores those events. */
  applyingLocalChanges = false;

  constructor(
    private readonly getConfig: () => RepoConfig | undefined,
    private readonly getAgents: () => Agent[],
    private readonly stateStore: StateStore,
    private readonly trash: Trash,
    private readonly log: vscode.LogOutputChannel
  ) {}

  dispose(): void {
    this.statusEmitter.dispose();
  }

  setSyncRequester(fn: (reason: string) => void): void {
    this.requestSync = fn;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getConflicts(): SkillConflict[] {
    return this.conflicts;
  }

  setPaused(): void {
    this.setStatus({ kind: 'paused' });
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.statusEmitter.fire(status);
  }

  private repoDirs(): Set<string> {
    return new Set(this.getAgents().map((a) => a.repoDir));
  }

  /** Absolute local directory for a conflict/removal unit (`<repoDir>/<skill>`), or undefined. */
  private unitDir(unit: string): string | undefined {
    const [repoDir, skill] = unit.split('/');
    const agent = this.getAgents().find((a) => a.repoDir === repoDir);
    return agent && skill ? path.join(agent.localPath, skill) : undefined;
  }

  /** Called after the user picks a (different) repository in the setup wizard. */
  async resetAfterRepoChange(): Promise<void> {
    this.conflicts = [];
    this.resolutions.clear();
    this.blobTextCache.clear();
    await this.stateStore.reset();
  }

  /** Record the user's conflict decision; the next sync run enforces it for the whole skill. */
  async resolveConflict(unit: string, resolution: ConflictResolution): Promise<void> {
    if (resolution === 'remote') {
      const dir = this.unitDir(unit);
      if (dir) {
        await this.trash.backup(dir, unit);
      }
    }
    this.resolutions.set(unit, resolution);
    this.log.info(`Conflict for ${unit} resolved as '${resolution}'`);
  }

  /** Remote file content for the diff editor, fetched by blob sha (cached). */
  async getRemoteFileText(sha: string): Promise<string> {
    if (!sha) {
      return '';
    }
    const cached = this.blobTextCache.get(sha);
    if (cached !== undefined) {
      return cached;
    }
    if (!this.lastClient || !this.lastCfg) {
      throw new Error('Not connected to GitHub yet.');
    }
    const buf = await this.lastClient.getBlob(this.lastCfg.owner, this.lastCfg.repo, sha);
    const text = buf.toString('utf8');
    if (this.blobTextCache.size > 50) {
      this.blobTextCache.clear();
    }
    this.blobTextCache.set(sha, text);
    return text;
  }

  /** Skill counts for the post-setup prompts ("N local skills found", "N skills available remotely"). */
  async getFirstSyncCounts(): Promise<{ localSkills: number; remoteSkills: number }> {
    const cfg = this.getConfig();
    if (!cfg) {
      throw new Error('Not configured');
    }
    const session = await getGitHubSession(false);
    if (!session) {
      throw new Error('GitHub sign-in required');
    }
    const client = this.createClient(session.accessToken, cfg);
    const local = await scanAgents(this.getAgents());
    const headSha = await client.getBranchHeadSha(cfg.owner, cfg.repo, cfg.branch);
    let remote: FileShaMap = {};
    if (headSha) {
      const { treeSha } = await client.getCommit(cfg.owner, cfg.repo, headSha);
      remote = await this.fetchRemoteFiles(client, cfg, treeSha);
    }
    return { localSkills: countSkills(local), remoteSkills: countSkills(remote) };
  }

  /** Entry point for the scheduler. Never throws; failures end up in the status + log. */
  async sync(trigger: string): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg) {
      this.setStatus({ kind: 'notConfigured' });
      return;
    }
    this.setStatus({ kind: 'syncing' });
    this.log.info(`Sync started (${trigger}) → ${cfg.owner}/${cfg.repo}@${cfg.branch}`);
    try {
      const session = await getGitHubSession(false);
      if (!session) {
        this.log.warn('No GitHub session — sign-in required.');
        this.setStatus({ kind: 'signInRequired' });
        return;
      }
      const client = this.createClient(session.accessToken, cfg);

      for (let attempt = 1; ; attempt++) {
        const done = await this.syncOnce(client, cfg);
        if (done) {
          break;
        }
        if (attempt >= MAX_PUSH_ATTEMPTS) {
          throw new Error('Remote repository kept changing during upload — will retry on the next sync.');
        }
        this.log.info(`Remote moved during upload, retrying (attempt ${attempt + 1})…`);
      }
    } catch (e) {
      if (e instanceof GitHubError && e.status === 401) {
        this.log.warn('GitHub token rejected — sign-in required.');
        this.setStatus({ kind: 'signInRequired' });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      this.log.error(`Sync failed: ${message}`);
      this.setStatus({ kind: 'error', message });
    }
  }

  private createClient(token: string, cfg: RepoConfig): GitHubClient {
    const client = new GitHubClient(token, (m) => this.log.debug(m));
    this.lastClient = client;
    this.lastCfg = cfg;
    return client;
  }

  /** One sync pass. Returns false when the push lost a race with another device and the pass must be re-run. */
  private async syncOnce(client: GitHubClient, cfg: RepoConfig): Promise<boolean> {
    const agents = this.getAgents();
    const local = await scanAgents(agents);
    const base = await this.stateStore.load(cfg);
    const headSha = await client.getBranchHeadSha(cfg.owner, cfg.repo, cfg.branch);

    // Cheap no-op detection: nothing changed anywhere since the last sync.
    if (headSha === base.commitSha && mapsEqual(local, base.files) && this.resolutions.size === 0) {
      this.log.info('Nothing to sync.');
      this.finish(cfg);
      return true;
    }

    let remoteFiles: FileShaMap = {};
    let headTreeSha: string | undefined;
    if (headSha) {
      const { treeSha } = await client.getCommit(cfg.owner, cfg.repo, headSha);
      headTreeSha = treeSha;
      remoteFiles = await this.fetchRemoteFiles(client, cfg, treeSha);
    } else {
      // Branch missing: distinguish an empty repository from a wrong branch name.
      const branches = await client.listBranches(cfg.owner, cfg.repo);
      if (branches.length > 0) {
        throw new Error(
          `Branch '${cfg.branch}' not found in ${cfg.owner}/${cfg.repo}. Run "Agent Skills Sync: Set Up / Change Repository" again.`
        );
      }
    }

    const plan = computeSyncPlan(local, remoteFiles, base.files, this.resolutions);
    this.log.info(
      `Plan: ${plan.uploads.length} upload(s), ${plan.downloads.length} download(s), ` +
        `${plan.removeRemote.length} remote deletion(s), ${plan.removeLocal.length} local deletion(s), ` +
        `${plan.conflicts.length} conflict(s)`
    );

    // 1) Apply remote → local changes.
    let removedSkills: RemovedSkill[] = [];
    this.applyingLocalChanges = true;
    try {
      await this.applyDownloads(client, cfg, agents, plan, remoteFiles, local);
      removedSkills = await this.applyLocalRemovals(agents, plan);
    } finally {
      this.applyingLocalChanges = false;
    }

    // 2) Apply local → remote changes as a single commit.
    let newHead = headSha;
    if (plan.uploads.length > 0 || plan.removeRemote.length > 0) {
      if (!newHead) {
        // Empty repository: create the initial commit (README), then re-run the pass on the new head.
        await this.initializeEmptyRepo(client, cfg);
        return false;
      }
      const blobShaByPath: Record<string, string> = {};
      await forEachLimit(plan.uploads, BLOB_CONCURRENCY, async (p) => {
        const localPath = repoPathToLocal(agents, p);
        if (!localPath) {
          return;
        }
        const content = await fs.readFile(localPath);
        blobShaByPath[p] = await client.createBlob(cfg.owner, cfg.repo, content);
      });
      const entries: TreeEntry[] = [
        ...plan.uploads
          .filter((p) => blobShaByPath[p] !== undefined)
          .map((p) => ({ path: p, mode: '100644', type: 'blob', sha: blobShaByPath[p] })),
        ...plan.removeRemote.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
      ];
      const treeSha = await client.createTree(cfg.owner, cfg.repo, entries, headTreeSha);
      const message = buildCommitMessage(plan, base.files);
      const commitSha = await client.createCommit(cfg.owner, cfg.repo, message, treeSha, [newHead]);
      try {
        await client.updateRef(cfg.owner, cfg.repo, cfg.branch, commitSha);
      } catch (e) {
        if (e instanceof GitHubError && (e.status === 422 || e.status === 409)) {
          return false; // non-fast-forward: another device pushed meanwhile
        }
        throw e;
      }
      newHead = commitSha;
      // The actual blob shas reported by GitHub become the BASE entries (file may have changed since scan).
      for (const [p, sha] of Object.entries(blobShaByPath)) {
        plan.newBaseFiles[p] = sha;
      }
      this.log.info(`Pushed commit ${commitSha.slice(0, 8)}: ${message}`);
    }

    // 3) Persist the new BASE and surface the result.
    await this.stateStore.save({
      owner: cfg.owner,
      repo: cfg.repo,
      branch: cfg.branch,
      commitSha: newHead ?? null,
      files: plan.newBaseFiles,
    });

    const previouslyConflicted = new Set(this.conflicts.map((c) => c.unit));
    this.conflicts = plan.conflicts;
    this.resolutions.clear();
    this.finish(cfg);

    this.notifyRemovedSkills(removedSkills);
    const newConflicts = plan.conflicts.filter((c) => !previouslyConflicted.has(c.unit));
    if (newConflicts.length > 0) {
      this.notifyConflicts(newConflicts);
    }
    return true;
  }

  private finish(cfg: RepoConfig): void {
    if (this.conflicts.length > 0) {
      const agents = this.getAgents();
      this.setStatus({ kind: 'conflict', skills: this.conflicts.map((c) => describeUnit(agents, c.unit)) });
    } else {
      this.setStatus({ kind: 'synced', at: Date.now(), repo: `${cfg.owner}/${cfg.repo}` });
    }
  }

  private async fetchRemoteFiles(client: GitHubClient, cfg: RepoConfig, treeSha: string): Promise<FileShaMap> {
    const tree = await client.getTreeRecursive(cfg.owner, cfg.repo, treeSha);
    const repoDirs = this.repoDirs();
    const files: FileShaMap = {};
    for (const entry of tree) {
      if (entry.type !== 'blob') {
        continue;
      }
      if (!isValidRepoPath(repoDirs, entry.path)) {
        continue; // outside a known agent namespace (e.g. README.md) or unsafe path
      }
      if (entry.mode === '120000') {
        this.log.warn(`Skipping symlink in repository: ${entry.path}`);
        continue;
      }
      files[entry.path] = entry.sha;
    }
    return files;
  }

  private async applyDownloads(
    client: GitHubClient,
    cfg: RepoConfig,
    agents: readonly Agent[],
    plan: SyncPlan,
    remoteFiles: FileShaMap,
    localFiles: FileShaMap
  ): Promise<void> {
    if (plan.downloads.length === 0) {
      return;
    }
    // Guard against case-collisions on case-insensitive file systems (Windows/macOS).
    const localByLower = new Map<string, string>();
    for (const p of Object.keys(localFiles)) {
      localByLower.set(p.toLowerCase(), p);
    }
    await forEachLimit(plan.downloads, BLOB_CONCURRENCY, async (p) => {
      const localPath = repoPathToLocal(agents, p);
      if (!localPath) {
        this.log.warn(`Skipping unsafe or unknown repository path: ${p}`);
        delete plan.newBaseFiles[p];
        return;
      }
      const existing = localByLower.get(p.toLowerCase());
      if (existing && existing !== p) {
        this.log.warn(`Skipping '${p}': collides with local '${existing}' on a case-insensitive file system.`);
        delete plan.newBaseFiles[p];
        return;
      }
      const content = await client.getBlob(cfg.owner, cfg.repo, remoteFiles[p]);
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, content);
      this.log.info(`Downloaded ${p}`);
    });
  }

  private async applyLocalRemovals(agents: readonly Agent[], plan: SyncPlan): Promise<RemovedSkill[]> {
    if (plan.removeLocal.length === 0) {
      return [];
    }
    const byUnit = new Map<string, string[]>();
    for (const p of plan.removeLocal) {
      const unit = unitOf(p);
      const list = byUnit.get(unit) ?? [];
      list.push(p);
      byUnit.set(unit, list);
    }
    const removed: RemovedSkill[] = [];
    for (const [unit, paths] of byUnit) {
      const unitDir = this.unitDir(unit);
      const backupPath = unitDir ? await this.trash.backup(unitDir, unit) : undefined;
      for (const p of paths) {
        const localPath = repoPathToLocal(agents, p);
        if (localPath) {
          await fs.rm(localPath, { force: true });
          this.log.info(`Removed local ${p} (deleted on another device)`);
        }
      }
      if (unitDir) {
        await pruneEmptyDirs(unitDir);
        removed.push({ unit, label: describeUnit(agents, unit), targetDir: unitDir, backupPath });
      }
    }
    return removed;
  }

  private notifyRemovedSkills(removed: RemovedSkill[]): void {
    for (const item of removed) {
      if (!item.backupPath) {
        continue;
      }
      void vscode.window
        .showInformationMessage(
          `Skill '${item.label}' was removed (deleted on another device). A local backup was kept.`,
          'Undo'
        )
        .then(async (choice) => {
          if (choice === 'Undo') {
            try {
              await this.trash.restore(item.backupPath!, item.targetDir);
              this.requestSync('undo-removal');
            } catch (e) {
              void vscode.window.showErrorMessage(`Failed to restore skill '${item.label}': ${String(e)}`);
            }
          }
        });
    }
  }

  private notifyConflicts(conflicts: SkillConflict[]): void {
    const agents = this.getAgents();
    const names = conflicts.map((c) => describeUnit(agents, c.unit)).join(', ');
    void vscode.window.showWarningMessage(`Skill conflict detected: ${names}`, 'Resolve Conflicts').then((choice) => {
      if (choice === 'Resolve Conflicts') {
        void vscode.commands.executeCommand('agentSkillsSync.resolveConflicts');
      }
    });
  }

  private async initializeEmptyRepo(client: GitHubClient, cfg: RepoConfig): Promise<void> {
    this.log.info(`Initializing empty repository ${cfg.owner}/${cfg.repo}…`);
    const commitSha = await client.createFileViaContents(
      cfg.owner,
      cfg.repo,
      'README.md',
      Buffer.from(repoReadmeContent(cfg), 'utf8'),
      'Initialize Agent Skills Sync'
    );
    const repo = await client.getRepo(cfg.owner, cfg.repo);
    if (repo.default_branch !== cfg.branch) {
      await client.createRef(cfg.owner, cfg.repo, cfg.branch, commitSha);
    }
  }
}

async function pruneEmptyDirs(dir: string): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await pruneEmptyDirs(path.join(dir, entry.name));
    }
  }
  try {
    const remaining = await fs.readdir(dir);
    if (remaining.length === 0) {
      await fs.rmdir(dir);
    }
  } catch {
    // ignore — non-empty or already gone
  }
}

function buildCommitMessage(plan: SyncPlan, baseFiles: FileShaMap): string {
  const baseUnits = new Set(Object.keys(baseFiles).map(unitOf));
  const uploadUnits = new Set(plan.uploads.map(unitOf));
  const removeUnits = new Set(plan.removeRemote.map(unitOf));

  const added = [...uploadUnits].filter((s) => !baseUnits.has(s)).sort();
  const updated = [...uploadUnits].filter((s) => baseUnits.has(s)).sort();
  const removed = [...removeUnits].filter((s) => !uploadUnits.has(s)).sort();

  const fmt = (units: string[]): string => {
    const shown = units.slice(0, 8).join(', ');
    return units.length > 8 ? `${shown} +${units.length - 8} more` : shown;
  };
  const parts: string[] = [];
  if (added.length > 0) {
    parts.push(`add ${fmt(added)}`);
  }
  if (updated.length > 0) {
    parts.push(`update ${fmt(updated)}`);
  }
  if (removed.length > 0) {
    parts.push(`remove ${fmt(removed)}`);
  }
  return `Sync from ${os.hostname()}: ${parts.join('; ') || 'update skills'}`;
}
