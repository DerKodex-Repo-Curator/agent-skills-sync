# Agent Skills Sync

**Keep your personal AI agent skills on every computer you use — automatically.**

---

## What is this?

If you use AI coding agents like **Claude Code**, **Codex**, or **Cursor**, you probably build
up your own personal *skills* over time — reusable instructions, prompts, and helper files that
teach the agent how you like to work. These normally live in a folder on one computer, for
example `~/.claude/skills/`.

The problem starts the moment you switch machines:

```
   Your Mac at home            Your PC at work
   ─────────────────           ─────────────────
   pdf-processing              pdf-processing
   data-analysis               ❌ missing
   code-review                 ❌ missing
   financial-modeling          ❌ missing
```

You end up copying folders by hand, juggling a Git repository, or just recreating skills you
already made. **Agent Skills Sync fixes this.** Install it on each of your computers, connect it
once to a private GitHub repository you own, and from then on your skills follow you everywhere —
quietly, in the background.

> Think of it as **Dropbox for your AI agents' skills**, or **Settings Sync**, but for the
> skills that make your agents genuinely yours.

## What it does

- 📥 **Downloads** your skills when you open VS Code, so a new machine catches up automatically.
- 📤 **Uploads** new and changed skills on its own, a few seconds after you edit them.
- 🔀 **Handles conflicts safely** when you changed the same skill on two machines — it shows you
  both versions instead of silently overwriting one.
- 🗑️ **Syncs deletions carefully** — a removed skill is kept as a local backup with an **Undo**
  button, and your full history always stays in your GitHub repository.
- 🧭 **Shows its status** in the VS Code status bar at all times.

## Which agents are supported

Out of the box it can sync the skills of:

| Agent | Default folder |
| --- | --- |
| **Claude Code** | `~/.claude/skills` |
| **Codex** | `~/.codex/skills` |
| **Cursor** | `~/.cursor/skills` |

All three are on by default, but an agent whose folder doesn't exist is simply skipped — so if
you only use Claude Code, nothing else gets in the way. You can turn each agent on or off and
point it at a custom folder in the settings.

---

## Getting started

### Your first computer

1. Install the extension. You'll see **Skills: Set Up** in the status bar (bottom-right).
2. Click it (or run the command **Agent Skills Sync: Set Up / Change Repository**).
3. **Sign in with GitHub** when prompted.
4. Choose where your skills should live:
   - **Create a new private repository** (recommended — e.g. `my-agent-skills`), or
   - pick an existing repository of yours.
5. Pick a branch (usually `main`).
6. Confirm the upload when it asks *"N local skills found — upload them?"*.

That's it. Your skills are now safely stored in your own private GitHub repository.

### Your next computer

1. Install the extension there too and start the same setup.
2. Sign in with the **same GitHub account** and pick the **same repository**.
3. When it says *"N skills available remotely — download now?"*, confirm.

Within a few minutes both machines have exactly the same skills — and they'll stay that way.

> **The 5-minute promise:** install on two computers and have identical skills on both, in about
> five minutes, with no Git commands and no manual copying.

---

## How it works

You never have to think about any of this — but here's what's happening behind the scenes, in
case you're curious.

### Everything lives in *your* repository

The extension doesn't have a server or cloud of its own. Your skills are stored in the private
GitHub repository **you** chose, organized by agent:

```
my-agent-skills/
├── README.md
├── claude/
│   ├── pdf-processing/
│   │   └── SKILL.md
│   └── data-analysis/
│       └── SKILL.md
├── codex/
│   └── refactoring/
│       └── SKILL.md
└── cursor/
    └── test-writing/
        └── SKILL.md
```

You own the data completely. You can browse it on github.com, and every change is an ordinary
commit, so nothing is ever truly lost. You don't need to know anything about Git to use the
extension — GitHub is just the reliable, private place your skills are kept.

### Smart, safe synchronization

The extension compares three things for every file:

- **your machine** (what's on this computer now),
- **the repository** (what's on GitHub),
- **the last synced state** (what was identical the last time it synced).

Comparing all three — rather than just "which file is newer" — lets it tell the difference
between *"I changed this"*, *"the other machine changed this"*, and *"we both changed this"*:

| What happened | What the extension does |
| --- | --- |
| You edited a skill | Uploads it |
| Another machine edited a skill | Downloads it |
| You deleted a skill | Removes it from the repository |
| Another machine deleted a skill | Removes it locally (keeps a backup + Undo) |
| Both machines made the **same** edit | Nothing to do |
| Both machines made **different** edits | Flags a **conflict** for you to resolve |

### Conflicts are never resolved behind your back

If the same skill was changed differently on two computers, the extension will **not** guess.
It marks that skill as conflicted (the status bar turns to ⚠ **Skill Conflict**) and lets you
decide, skill by skill:

- **Compare versions** — opens VS Code's normal side-by-side diff so you can see exactly what
  differs,
- **Keep local** — your version wins and is uploaded,
- **Use remote** — the repository's version wins (your local copy is backed up first).

Meanwhile, every *other* skill keeps syncing normally. Only the skill in question waits for you.

### When you delete a skill

Deletions sync too, but gently. If a skill was removed on another machine, this machine removes
it as well — but first it tucks a copy into a local backup and shows you an **Undo** button. And
because everything is in your Git history, you can always recover an older version from GitHub.

### The status bar

The little indicator in the bottom-right tells you where things stand at a glance:

| Indicator | Meaning |
| --- | --- |
| ✓ **Skills Synced** | Everything is up to date |
| ↻ **Syncing Skills** | A sync is in progress |
| ⚠ **Skill Conflict** | Something needs your decision — click to resolve |
| ✕ **Sync Error** | Something went wrong — click for details |
| **Skills: Set Up** | Not connected yet — click to start |

Click it any time for a quick menu: sync now, resolve conflicts, open your repository on GitHub,
or view the log.

---

## Settings

Open **Settings** and search for *Agent Skills Sync*, or click **Settings** in the status-bar
menu.

| Setting | Default | What it does |
| --- | --- | --- |
| `agentSkillsSync.agents.claude.enabled` | `true` | Sync Claude Code skills |
| `agentSkillsSync.agents.claude.path` | `~/.claude/skills` | Where Claude Code skills live |
| `agentSkillsSync.agents.codex.enabled` | `true` | Sync Codex skills |
| `agentSkillsSync.agents.codex.path` | `~/.codex/skills` | Where Codex skills live |
| `agentSkillsSync.agents.cursor.enabled` | `true` | Sync Cursor skills |
| `agentSkillsSync.agents.cursor.path` | `~/.cursor/skills` | Where Cursor skills live |
| `agentSkillsSync.autoSync` | `true` | Sync automatically in the background |
| `agentSkillsSync.pollIntervalMinutes` | `5` | How often to check for changes from other machines |
| `agentSkillsSync.debounceSeconds` | `3` | How long to wait after an edit before uploading |

Leave a path empty to use its default. Paths support `~` for your home folder.

## Commands

Open the Command Palette (`Ctrl`/`Cmd` + `Shift` + `P`) and type *Agent Skills Sync*:

- **Set Up / Change Repository** — connect GitHub or switch repositories
- **Sync Now** — sync immediately
- **Resolve Conflicts** — review and resolve conflicting skills
- **Open Repository on GitHub** — view your skills online
- **Show Log** — see what the extension has been doing

---

## Your data & privacy

- Your skills are stored **only** in the private GitHub repository you choose. The extension has
  no backend and sends your files nowhere else.
- Sign-in uses VS Code's built-in GitHub account — no separate app to authorize, and the
  extension never sees or stores your password.
- Everything the extension does is an ordinary Git commit in your repository, so your full
  history is always yours to inspect or restore.

## What this version doesn't do (yet)

To keep it simple and dependable, this release deliberately leaves out: syncing project-level
skills, other parts of your agent's configuration, a public skill marketplace, and non-GitHub
storage. Support for more agents, more storage options, and skill "profiles" (e.g. Work vs.
Personal) are ideas for the future.

## Requirements

- VS Code 1.90 or newer, on **Windows** or **macOS** (Linux is expected to work too).
- A GitHub account (a free account is fine — private repositories are included).

---

*Questions or ideas? Open an issue in the repository linked on this extension's page.*
