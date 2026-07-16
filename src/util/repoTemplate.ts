import { RepoConfig } from '../sync/types';

/** README committed into the user's skills repository when the extension creates/initializes it. */
export function repoReadmeContent(cfg: Pick<RepoConfig, 'owner' | 'repo'>): string {
  return `# Personal Agent Skills

This repository stores personal AI agent skills, kept in sync across machines by the
**Agent Skills Sync** VS Code extension.

- Each agent has its own top-level directory: \`claude/\`, \`codex/\`, \`cursor/\`, one
  subdirectory per skill.
- Commits are created automatically by the extension.
- You normally don't need to edit this repository manually — changes made here are
  downloaded to your machines on the next sync.
`;
}
