/** Map of repository-relative path (e.g. `claude/pdf-processing/SKILL.md`) to git blob SHA. */
export type FileShaMap = Record<string, string>;

/**
 * A synchronized AI agent. Each agent maps one local skills directory to one top-level
 * namespace (`repoDir`) in the repository, so multiple agents share one repo without collisions.
 */
export interface Agent {
  /** Stable identifier, e.g. `claude`, `codex`, `cursor`. */
  id: string;
  /** Human-readable name shown in the UI, e.g. `Claude Code`. */
  label: string;
  /** Top-level directory this agent's skills live under in the repository. */
  repoDir: string;
  /** Absolute path to the agent's local skills directory. */
  localPath: string;
}

/** The GitHub repository + branch the user selected during setup. */
export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
}

export type ConflictResolution = 'local' | 'remote';

export interface ConflictFile {
  path: string;
  localSha?: string;
  remoteSha?: string;
  baseSha?: string;
}

/** A conflict aggregated at skill level. `unit` is `<repoDir>/<skill>`, e.g. `claude/pdf-processing`. */
export interface SkillConflict {
  unit: string;
  files: ConflictFile[];
}

export interface SyncPlan {
  /** Local content to commit to the remote repository. */
  uploads: string[];
  /** Paths to delete from the remote repository. */
  removeRemote: string[];
  /** Remote content to write to the local skills directory. */
  downloads: string[];
  /** Paths to delete locally (backed up to trash first). */
  removeLocal: string[];
  /** Both sides changed to identical content — only the base state needs updating. */
  baseUpdates: string[];
  conflicts: SkillConflict[];
  /** Expected base (last-synced) state after the plan is executed. Conflicted paths keep their old base entry. */
  newBaseFiles: FileShaMap;
}

export type SyncStatus =
  | { kind: 'notConfigured' }
  | { kind: 'signInRequired' }
  | { kind: 'paused' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number; repo: string }
  | { kind: 'conflict'; skills: string[] }
  | { kind: 'error'; message: string };
