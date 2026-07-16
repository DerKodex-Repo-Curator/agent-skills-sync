# CLAUDE.md

Guidance for Claude Code when working in this repository. (User-facing docs live in
[README.md](README.md); keep development details here, not there.)

## What this is

**Agent Skills Sync** — a VS Code extension that bidirectionally synchronizes multiple AI
agents' global skills directories (Claude Code `~/.claude/skills`, Codex `~/.codex/skills`,
Cursor `~/.cursor/skills`) across machines through the user's own GitHub private repository.
No local git, no custom backend, zero runtime dependencies.

Full product spec: [agent-skills-sync-business-zadani.md](agent-skills-sync-business-zadani.md).

## Commands

```bash
npm run build         # bundle src/extension.ts → dist/extension.js (esbuild)
npm run watch         # rebuild on change
npm run typecheck     # tsc --noEmit
npm test              # unit tests (vitest) — engine + scanner + paths
npm run test:integration   # activation smoke test in a real Extension Host (see gotchas)
npm run package       # produce agent-skills-sync-<version>.vsix (vsce)
```

Press <kbd>F5</kbd> to launch the Extension Development Host.

## Multi-agent model

An **agent** (`src/sync/types.ts` → `Agent`) maps one local skills directory to one top-level
**namespace** (`repoDir`) in the repository. Known agents and defaults live in
`src/config/agents.ts` (`KNOWN_AGENTS`): `claude`→`claude/`, `codex`→`codex/`, `cursor`→`cursor/`.
Each is toggled + repointed via settings `agentSkillsSync.agents.<id>.{enabled,path}`.

- Repo layout: `<repoDir>/<skill>/<files…>`, e.g. `claude/pdf-processing/SKILL.md`.
- The **sync/conflict unit** is `<repoDir>/<skill>` (first two path segments) — see `unitOf` in
  `src/util/paths.ts`. Same skill name under two agents never collides.
- A missing agent directory contributes nothing (scanner returns `{}`), so unused agents are
  invisible.

## Architecture

Data flows one direction per module; UI never touches GitHub directly.

- `src/sync/engine.ts` — **pure** 3-way diff (`computeSyncPlan(local, remote, base, resolutions)`).
  No `vscode`/`node` imports → fully unit-tested. This is the heart; change it with tests.
- `src/sync/scanner.ts` — `scanAgents(agents)` walks each agent dir → `{ repoPath: gitBlobSha }`.
  Hash is the **git blob SHA-1** (`sha1("blob <len>\0" + bytes)`) so it compares directly to
  GitHub tree shas without downloading blobs.
- `src/config/agents.ts` — builds the enabled `Agent[]` from settings (`getEnabledAgents`).
- `src/util/paths.ts` — path mapping: `unitOf`, `localRelToRepoPath`, `repoPathToLocal(agents,…)`,
  `isValidRepoPath(repoDirs,…)`, `describeUnit`, `expandUserPath`.
- `src/sync/stateStore.ts` — BASE (last-synced) state as JSON in `globalStorage`; keyed by
  repo+branch, never committed to the repo.
- `src/sync/trash.ts` — local backup + Undo before a skill dir is deleted/overwritten locally.
- `src/sync/controller.ts` — orchestrates one run: scan → fetch remote tree → plan → write
  local → commit (blobs→tree→commit→updateRef) → save BASE. Handles non-fast-forward retry,
  empty-repo init, conflict/deletion notifications.
- `src/sync/scheduler.ts` — startup sync, one file watcher per agent dir + debounce, periodic
  poll, single-run queue (mutex). Watchers are only triggers; every run does a full scan, so
  missed events are harmless.
- `src/github/{auth,client.ts}` — VS Code built-in GitHub auth (`repo` scope, no OAuth app of
  our own) + dependency-free REST client over global `fetch` (Git Data API).
- `src/ui/*` — status bar, setup wizard, conflict resolution (native `vscode.diff` via a
  `TextDocumentContentProvider`), quick menu.
- `src/extension.ts` — activation (`onStartupFinished`), command registration, wiring.

## Invariants (do not break)

- **Never silently overwrite.** Same skill changed on both sides → conflict, surfaced per unit.
  Conflicted units are pulled out of the plan and keep their BASE entry until resolved; other
  skills keep syncing.
- **Conflicts aggregate at the unit level** (`<repoDir>/<skill>`), diffs at file level.
- **Path safety:** every repo path is validated (`isValidRepoPath`) before being written to disk —
  first segment must be a known agent namespace, no traversal/absolute/`..` segments. Keep this
  when adding write paths. Paths outside any known namespace (e.g. `README.md`, legacy `skills/`)
  are ignored, not deleted.
- **BASE is local-only** and must stay consistent with what was actually pushed (use GitHub's
  returned blob shas, not the pre-scan shas).

## Testing

- Unit tests cover the full decision table in `engine.ts` (`test/unit/engine.test.ts`,
  incl. cross-agent cases) and the scanner/hash/path-safety (`test/unit/scanner.test.ts`).
  Add a table row or a mapping rule → add a test.
- `gitBlobSha` is verified against known `git hash-object` vectors.

## Windows gotchas (integration test)

`@vscode/test-electron` breaks on this repo's path because it has spaces and because the parent
process may export `ELECTRON_RUN_AS_NODE`. To run the integration test:

1. `ELECTRON_RUN_AS_NODE` must NOT be set (else the downloaded `Code.exe` runs as Node and
   rejects VS Code flags as "bad option"). Clear it in the shell.
2. The dev path passed to the runner must have no spaces — create a junction and pass it via
   `ASS_DEV_PATH` (honored by `test/integration/runTest.ts`):

```powershell
cmd /c mklink /J F:\asstest "F:\path with spaces\agent-skills-sync"
npm run build; npx tsc -p tsconfig.integration.json
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ASS_DEV_PATH = "F:\asstest"
node F:\asstest\out-test\test\integration\runTest.js
```

These are environment/tooling constraints, not extension bugs.

## Packaging & publishing

- `npm run package` → VSIX. `.vscodeignore` keeps `src/`, tests, `CLAUDE.md`, and the business
  spec out of the package.
- `publisher` in `package.json` must match a Marketplace publisher the user owns; `repository.url`
  should point at the real repo.
- Marketplace: create a publisher at marketplace.visualstudio.com/manage + an Azure DevOps PAT
  (Marketplace › Manage, all orgs) → `vsce publish`.
- Open VSX (Cursor/VSCodium): create a namespace matching `publisher`, then upload the VSIX (web)
  or `ovsx publish <file> -p <token>`.

## Repo-layout note (0.1.0 → 0.2.0)

0.1.0 stored Claude skills under `skills/` in the repo; 0.2.0 uses `claude/`. Old `skills/` data
is ignored (not deleted) — it just becomes orphaned. No automatic migration; re-upload happens
naturally on the next sync.
