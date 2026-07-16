import { describe, expect, it } from 'vitest';
import { computeSyncPlan, countSkills, mapsEqual, unitOf } from '../../src/sync/engine';
import { ConflictResolution } from '../../src/sync/types';

const A = 'claude/alpha/SKILL.md';
const A2 = 'claude/alpha/notes.md';
const B = 'claude/beta/SKILL.md';
const CODEX = 'codex/alpha/SKILL.md';

function res(entries: Record<string, ConflictResolution>): Map<string, ConflictResolution> {
  return new Map(Object.entries(entries));
}

describe('unitOf / countSkills / mapsEqual', () => {
  it('extracts the agent/skill unit from a repo path', () => {
    expect(unitOf('claude/alpha/SKILL.md')).toBe('claude/alpha');
    expect(unitOf('claude/alpha/sub/deep.md')).toBe('claude/alpha');
    expect(unitOf('codex/alpha/SKILL.md')).toBe('codex/alpha');
  });

  it('counts distinct skills across agents', () => {
    expect(countSkills({ [A]: '1', [A2]: '2', [B]: '3', [CODEX]: '4' })).toBe(3);
    expect(countSkills({})).toBe(0);
  });

  it('compares file maps', () => {
    expect(mapsEqual({ [A]: '1' }, { [A]: '1' })).toBe(true);
    expect(mapsEqual({ [A]: '1' }, { [A]: '2' })).toBe(false);
    expect(mapsEqual({ [A]: '1' }, {})).toBe(false);
  });
});

describe('computeSyncPlan — decision table', () => {
  it('no changes anywhere → empty plan, base preserved', () => {
    const plan = computeSyncPlan({ [A]: '1' }, { [A]: '1' }, { [A]: '1' });
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
    expect(plan.removeRemote).toEqual([]);
    expect(plan.removeLocal).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.newBaseFiles).toEqual({ [A]: '1' });
  });

  it('local added → upload', () => {
    const plan = computeSyncPlan({ [A]: '1' }, {}, {});
    expect(plan.uploads).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({ [A]: '1' });
  });

  it('local modified, remote unchanged → upload', () => {
    const plan = computeSyncPlan({ [A]: '2' }, { [A]: '1' }, { [A]: '1' });
    expect(plan.uploads).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({ [A]: '2' });
  });

  it('remote added → download', () => {
    const plan = computeSyncPlan({}, { [A]: '1' }, {});
    expect(plan.downloads).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({ [A]: '1' });
  });

  it('remote modified, local unchanged → download', () => {
    const plan = computeSyncPlan({ [A]: '1' }, { [A]: '2' }, { [A]: '1' });
    expect(plan.downloads).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({ [A]: '2' });
  });

  it('deleted locally, remote unchanged → delete remotely', () => {
    const plan = computeSyncPlan({}, { [A]: '1' }, { [A]: '1' });
    expect(plan.removeRemote).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({});
  });

  it('deleted remotely, local unchanged → delete locally', () => {
    const plan = computeSyncPlan({ [A]: '1' }, {}, { [A]: '1' });
    expect(plan.removeLocal).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({});
  });

  it('both modified with identical content → base update only', () => {
    const plan = computeSyncPlan({ [A]: '2' }, { [A]: '2' }, { [A]: '1' });
    expect(plan.baseUpdates).toEqual([A]);
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
    expect(plan.newBaseFiles).toEqual({ [A]: '2' });
  });

  it('both added with identical content → base update only', () => {
    const plan = computeSyncPlan({ [A]: '1' }, { [A]: '1' }, {});
    expect(plan.baseUpdates).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({ [A]: '1' });
  });

  it('both deleted → nothing, base entry dropped', () => {
    const plan = computeSyncPlan({}, {}, { [A]: '1' });
    expect(plan.conflicts).toEqual([]);
    expect(plan.removeLocal).toEqual([]);
    expect(plan.removeRemote).toEqual([]);
    expect(plan.newBaseFiles).toEqual({});
  });

  it('both modified differently → conflict, base entry kept', () => {
    const plan = computeSyncPlan({ [A]: '2' }, { [A]: '3' }, { [A]: '1' });
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].unit).toBe('claude/alpha');
    expect(plan.conflicts[0].files).toEqual([{ path: A, localSha: '2', remoteSha: '3', baseSha: '1' }]);
    expect(plan.newBaseFiles).toEqual({ [A]: '1' });
  });

  it('modified locally, deleted remotely → conflict', () => {
    const plan = computeSyncPlan({ [A]: '2' }, {}, { [A]: '1' });
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.removeLocal).toEqual([]);
  });

  it('deleted locally, modified remotely → conflict', () => {
    const plan = computeSyncPlan({}, { [A]: '2' }, { [A]: '1' });
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.removeRemote).toEqual([]);
  });

  it('both added differently → conflict', () => {
    const plan = computeSyncPlan({ [A]: '1' }, { [A]: '2' }, {});
    expect(plan.conflicts).toHaveLength(1);
  });
});

describe('computeSyncPlan — skill-level conflict aggregation', () => {
  it('pulls the whole skill out of the action lists when any of its files conflict', () => {
    const local = { [A]: '2', [A2]: '9' }; // A conflicts, A2 would be a plain upload
    const remote = { [A]: '3', [A2]: '1' };
    const base = { [A]: '1', [A2]: '1' };
    const plan = computeSyncPlan(local, remote, base);
    expect(plan.uploads).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].unit).toBe('claude/alpha');
    expect(plan.conflicts[0].files.map((f) => f.path).sort()).toEqual([A, A2]);
    // base kept for the entire skill so the conflict persists until resolved
    expect(plan.newBaseFiles).toEqual({ [A]: '1', [A2]: '1' });
  });

  it('other skills keep syncing while one skill is conflicted', () => {
    const local = { [A]: '2', [B]: '5' };
    const remote = { [A]: '3', [B]: '4' };
    const base = { [A]: '1', [B]: '5' };
    const plan = computeSyncPlan(local, remote, base);
    expect(plan.conflicts.map((c) => c.unit)).toEqual(['claude/alpha']);
    expect(plan.downloads).toEqual([B]);
    expect(plan.newBaseFiles[B]).toBe('4');
  });

  it('same skill name under different agents does not collide', () => {
    // claude/alpha conflicts; codex/alpha is an independent plain upload
    const local = { [A]: '2', [CODEX]: '7' };
    const remote = { [A]: '3' };
    const base = { [A]: '1' };
    const plan = computeSyncPlan(local, remote, base);
    expect(plan.conflicts.map((c) => c.unit)).toEqual(['claude/alpha']);
    expect(plan.uploads).toEqual([CODEX]);
  });
});

describe('computeSyncPlan — conflict resolutions', () => {
  it("'local' forces uploads and remote deletions for the whole skill", () => {
    const local = { [A]: '2' };
    const remote = { [A]: '3', [A2]: '7' }; // A2 exists only remotely
    const base = { [A]: '1', [A2]: '7' };
    const plan = computeSyncPlan(local, remote, base, res({ 'claude/alpha': 'local' }));
    expect(plan.conflicts).toEqual([]);
    expect(plan.uploads).toEqual([A]);
    expect(plan.removeRemote).toEqual([A2]);
    expect(plan.newBaseFiles).toEqual({ [A]: '2' });
  });

  it("'remote' forces downloads and local deletions for the whole skill", () => {
    const local = { [A]: '2', [A2]: '9' }; // A2 exists only locally
    const remote = { [A]: '3' };
    const base = { [A]: '1' };
    const plan = computeSyncPlan(local, remote, base, res({ 'claude/alpha': 'remote' }));
    expect(plan.conflicts).toEqual([]);
    expect(plan.downloads).toEqual([A]);
    expect(plan.removeLocal).toEqual([A2]);
    expect(plan.newBaseFiles).toEqual({ [A]: '3' });
  });

  it('resolution with identical content on both sides just updates the base', () => {
    const plan = computeSyncPlan({ [A]: '2' }, { [A]: '2' }, { [A]: '1' }, res({ 'claude/alpha': 'local' }));
    expect(plan.baseUpdates).toEqual([A]);
    expect(plan.newBaseFiles).toEqual({ [A]: '2' });
  });
});
