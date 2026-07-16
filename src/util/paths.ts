import * as os from 'node:os';
import * as path from 'node:path';
import { Agent } from '../sync/types';

/** Expand a leading `~` and resolve to an absolute path. */
export function expandUserPath(p: string): string {
  const value = p.trim();
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

/** Convert a path relative to an agent's local dir into its repository path (forward slashes). */
export function localRelToRepoPath(repoDir: string, rel: string): string {
  return `${repoDir}/${rel.split(path.sep).join('/')}`;
}

/** The sync/conflict unit a repository path belongs to: `<repoDir>/<skill>`. */
export function unitOf(repoPath: string): string {
  const parts = repoPath.split('/');
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Human label for a unit, e.g. `pdf-processing (Claude Code)`. */
export function describeUnit(agents: readonly Agent[], unit: string): string {
  const [repoDir, skill] = unit.split('/');
  const agent = agents.find((a) => a.repoDir === repoDir);
  if (!skill) {
    return unit;
  }
  return agent ? `${skill} (${agent.label})` : `${skill} (${repoDir})`;
}

function areSegmentsSafe(segments: string[]): boolean {
  return (
    segments.length > 0 &&
    segments.every((s) => s.length > 0 && s !== '.' && s !== '..' && !s.includes('\\') && !s.includes(':'))
  );
}

/**
 * True when a repository path is a safe skills path: its first segment is a known agent
 * namespace, it has at least a skill segment, and no segment can escape the target directory.
 */
export function isValidRepoPath(repoDirs: ReadonlySet<string>, repoPath: string): boolean {
  const parts = repoPath.split('/');
  if (parts.length < 2 || !repoDirs.has(parts[0])) {
    return false;
  }
  return areSegmentsSafe(parts.slice(1));
}

/** Map a repository path to the absolute local path inside the owning agent's dir, or undefined. */
export function repoPathToLocal(agents: readonly Agent[], repoPath: string): string | undefined {
  const parts = repoPath.split('/');
  if (parts.length < 2) {
    return undefined;
  }
  const [repoDir, ...rest] = parts;
  if (!areSegmentsSafe(rest)) {
    return undefined;
  }
  const agent = agents.find((a) => a.repoDir === repoDir);
  if (!agent) {
    return undefined;
  }
  return path.join(agent.localPath, ...rest);
}
