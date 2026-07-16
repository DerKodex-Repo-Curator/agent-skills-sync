import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gitBlobSha, scanAgents } from '../../src/sync/scanner';
import { Agent } from '../../src/sync/types';
import { describeUnit, expandUserPath, isValidRepoPath, repoPathToLocal } from '../../src/util/paths';

function agent(id: string, repoDir: string, localPath: string): Agent {
  return { id, label: id, repoDir, localPath };
}

describe('gitBlobSha', () => {
  it('matches git hash-object for known vectors', () => {
    // git hash-object of an empty file
    expect(gitBlobSha(Buffer.from(''))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    // echo "hello" | git hash-object --stdin
    expect(gitBlobSha(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('scanAgents', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    while (tmpDirs.length) {
      await fs.rm(tmpDirs.pop()!, { recursive: true, force: true });
    }
  });

  async function mkTmp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('returns an empty map for a missing directory', async () => {
    const result = await scanAgents([agent('claude', 'claude', path.join(os.tmpdir(), 'does-not-exist-xyz'))]);
    expect(result).toEqual({});
  });

  it('scans nested skills, prefixes with the agent repoDir, skips junk and .git', async () => {
    const dir = await mkTmp();
    await fs.mkdir(path.join(dir, 'pdf-processing', 'scripts'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pdf-processing', 'SKILL.md'), 'hello\n');
    await fs.writeFile(path.join(dir, 'pdf-processing', 'scripts', 'run.py'), 'print(1)\n');
    await fs.writeFile(path.join(dir, 'pdf-processing', '.DS_Store'), 'junk');
    await fs.writeFile(path.join(dir, 'pdf-processing', 'draft.tmp'), 'junk');
    await fs.mkdir(path.join(dir, '.git'));
    await fs.writeFile(path.join(dir, '.git', 'config'), 'junk');

    const result = await scanAgents([agent('claude', 'claude', dir)]);
    expect(Object.keys(result).sort()).toEqual(['claude/pdf-processing/SKILL.md', 'claude/pdf-processing/scripts/run.py']);
    expect(result['claude/pdf-processing/SKILL.md']).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('merges multiple agents under distinct namespaces', async () => {
    const claudeDir = await mkTmp();
    const codexDir = await mkTmp();
    await fs.mkdir(path.join(claudeDir, 'alpha'), { recursive: true });
    await fs.writeFile(path.join(claudeDir, 'alpha', 'SKILL.md'), 'a\n');
    await fs.mkdir(path.join(codexDir, 'alpha'), { recursive: true });
    await fs.writeFile(path.join(codexDir, 'alpha', 'SKILL.md'), 'b\n');

    const result = await scanAgents([agent('claude', 'claude', claudeDir), agent('codex', 'codex', codexDir)]);
    expect(Object.keys(result).sort()).toEqual(['claude/alpha/SKILL.md', 'codex/alpha/SKILL.md']);
  });
});

describe('repo path safety', () => {
  const repoDirs = new Set(['claude', 'codex', 'cursor']);

  it('accepts normal skills paths under a known agent namespace', () => {
    expect(isValidRepoPath(repoDirs, 'claude/alpha/SKILL.md')).toBe(true);
    expect(isValidRepoPath(repoDirs, 'codex/alpha/sub/deep.md')).toBe(true);
  });

  it('rejects paths outside a known namespace and traversal attempts', () => {
    expect(isValidRepoPath(repoDirs, 'README.md')).toBe(false);
    expect(isValidRepoPath(repoDirs, 'skills/alpha/SKILL.md')).toBe(false); // legacy/unknown namespace
    expect(isValidRepoPath(repoDirs, 'claude/../evil')).toBe(false);
    expect(isValidRepoPath(repoDirs, 'claude/a/../../evil')).toBe(false);
    expect(isValidRepoPath(repoDirs, 'claude//x')).toBe(false);
    expect(isValidRepoPath(repoDirs, 'claude/a\\b')).toBe(false);
    expect(isValidRepoPath(repoDirs, 'claude/c:/x')).toBe(false);
  });

  it('maps repo paths into the owning agent dir and refuses unsafe ones', () => {
    const claudeDir = path.join(os.tmpdir(), 'claude-skills');
    const agents = [agent('claude', 'claude', claudeDir)];
    expect(repoPathToLocal(agents, 'claude/alpha/SKILL.md')).toBe(path.join(claudeDir, 'alpha', 'SKILL.md'));
    expect(repoPathToLocal(agents, 'claude/../evil')).toBeUndefined();
    expect(repoPathToLocal(agents, 'codex/alpha/SKILL.md')).toBeUndefined(); // unknown agent
  });

  it('describes a unit with its agent label', () => {
    const agents = [agent('claude', 'claude', '/x'), { id: 'codex', label: 'Codex', repoDir: 'codex', localPath: '/y' }];
    expect(describeUnit(agents, 'codex/alpha')).toBe('alpha (Codex)');
    expect(describeUnit(agents, 'unknown/alpha')).toBe('alpha (unknown)');
  });

  it('expands ~ in user paths', () => {
    expect(expandUserPath('~/custom/skills')).toBe(path.join(os.homedir(), 'custom', 'skills'));
    expect(expandUserPath('~')).toBe(os.homedir());
  });
});
