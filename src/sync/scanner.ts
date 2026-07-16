import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { localRelToRepoPath } from '../util/paths';
import { Agent, FileShaMap } from './types';

const IGNORED_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const IGNORED_DIRS = new Set(['.git']);

export function isIgnoredFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return IGNORED_FILES.has(lower) || lower.endsWith('.tmp');
}

/** Git blob SHA-1 of the content — identical to what GitHub reports for the same bytes. */
export function gitBlobSha(content: Buffer): string {
  const hash = createHash('sha1');
  hash.update(`blob ${content.length}\0`);
  hash.update(content);
  return hash.digest('hex');
}

/** Recursively scan one directory, adding `<repoDir>/<rel>` → git blob sha entries to `out`. */
async function scanDir(rootDir: string, repoDir: string, out: FileShaMap): Promise<void> {
  async function walk(absDir: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw e;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const childRel = rel ? `${rel}${path.sep}${entry.name}` : entry.name;
      const childAbs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name.toLowerCase())) {
          continue;
        }
        await walk(childAbs, childRel);
      } else if (entry.isFile()) {
        if (isIgnoredFileName(entry.name)) {
          continue;
        }
        const content = await fs.readFile(childAbs);
        out[localRelToRepoPath(repoDir, childRel)] = gitBlobSha(content);
      }
    }
  }
  await walk(rootDir, '');
}

/**
 * Scan every agent's local skills directory into a single repository-path → git blob sha map.
 * Missing directories contribute nothing (so agents the user doesn't use are simply empty).
 */
export async function scanAgents(agents: readonly Agent[]): Promise<FileShaMap> {
  const out: FileShaMap = {};
  for (const agent of agents) {
    await scanDir(agent.localPath, agent.repoDir, out);
  }
  return out;
}
