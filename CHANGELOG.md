# Change Log

## 0.2.0

- **Multi-agent support.** In addition to Claude Code, the extension now syncs **Codex**
  (`~/.codex/skills`) and **Cursor** (`~/.cursor/skills`). Each agent can be enabled/disabled
  and repointed independently in the settings.
- Skills are now organized per agent in the repository (`claude/`, `codex/`, `cursor/`), so the
  same skill name under different agents never collides. Conflicts are tracked per agent + skill.
- Rewrote the README for end users.

> Upgrading from 0.1.0: Claude skills previously lived under `skills/` in your repository and now
> live under `claude/`. Old `skills/` data is left untouched (not deleted); your local skills are
> re-uploaded to `claude/` on the next sync. You can delete the old `skills/` folder on GitHub
> once you've confirmed everything synced.

## 0.1.0

Initial MVP release.

- Sign in with GitHub and select or create a private repository for your skill library.
- Automatic bidirectional sync of the global Claude Code skills directory (`~/.claude/skills/`)
  on startup, on file changes (debounced), and on a periodic poll.
- State-based (LOCAL / REMOTE / BASE) 3-way synchronization.
- Per-skill conflict detection with resolution via the native diff editor
  (Compare / Keep Local / Use Remote); conflicts are never overwritten silently.
- Propagated deletions keep a local backup with an Undo action.
- Status bar indicator and quick menu (Sync Now, Resolve Conflicts, Open Repository, Show Log).
