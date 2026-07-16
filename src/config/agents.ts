import * as vscode from 'vscode';
import { Agent } from '../sync/types';
import { expandUserPath } from '../util/paths';

interface KnownAgent {
  id: string;
  label: string;
  repoDir: string;
  /** Default local skills directory (supports `~`). */
  defaultPath: string;
}

/**
 * Agents the extension knows how to synchronize. Each maps to its own top-level namespace
 * in the repository so several agents can share one repo. Paths and enablement are configurable.
 */
export const KNOWN_AGENTS: readonly KnownAgent[] = [
  { id: 'claude', label: 'Claude Code', repoDir: 'claude', defaultPath: '~/.claude/skills' },
  { id: 'codex', label: 'Codex', repoDir: 'codex', defaultPath: '~/.codex/skills' },
  { id: 'cursor', label: 'Cursor', repoDir: 'cursor', defaultPath: '~/.cursor/skills' },
];

/** Build the list of enabled agents from settings, resolving each to an absolute local path. */
export function getEnabledAgents(): Agent[] {
  const cfg = vscode.workspace.getConfiguration('agentSkillsSync');
  const agents: Agent[] = [];
  for (const known of KNOWN_AGENTS) {
    if (!cfg.get<boolean>(`agents.${known.id}.enabled`, true)) {
      continue;
    }
    const configured = (cfg.get<string>(`agents.${known.id}.path`, '') ?? '').trim();
    agents.push({
      id: known.id,
      label: known.label,
      repoDir: known.repoDir,
      localPath: expandUserPath(configured || known.defaultPath),
    });
  }
  return agents;
}
