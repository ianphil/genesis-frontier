---
name: library
description: Fleet library for sharing skills and extensions between agents. Use when the user asks to "share a skill", "fleet library", "library setup", "library add", "library use", "library sync", "library list", "library push", "library invite", or wants to distribute skills laterally across a private agent fleet.
---

# Fleet Library

Share skills and extensions laterally between agents in a private fleet via a shared GitHub repository.

**This skill includes `library.js`** — a script that handles catalog management, file distribution, and fleet repo operations. Your job is to run it and handle UX.

## Prerequisites

- `gh` CLI must be authenticated (`gh auth status`)
- For first-time setup: the authenticated user needs permission to create private repos
- For all other commands: a fleet library repo must exist (created via `setup`)

## How It Works

The fleet library is a private GitHub repo that acts as a shared catalog and hosting layer for skills and extensions. Agents share items by registering them in the catalog (`library.yaml`) and pulling them from the source repo (or from the fleet repo itself for fleet-hosted items).

**Three source types:**
- `fleet` — item is hosted directly in the fleet-library repo
- `owner/repo` — item lives in another agent's mind repo, resolved via GitHub API
- Any installed item can be pushed back to its source via `push`

## Commands

### Setup — create the fleet library repo

```bash
node .github/skills/library/library.js setup --repo owner/fleet-library
```

Output JSON:

```json
{
  "repo": "owner/fleet-library",
  "created": true,
  "files": ["library.yaml", "README.md", ".github/skills/library/SKILL.md", ".github/skills/library/library.js"]
}
```

This creates a private repo, scaffolds it with an empty catalog, README, and a copy of the library skill itself (self-propagation). Run this once per fleet.

### Add — register an item in the catalog

```bash
node .github/skills/library/library.js add --name daily-report --type skill --source owner/agent-repo --path .github/skills/daily-report --description "Comprehensive daily briefing"
```

Output JSON:

```json
{ "added": { "name": "daily-report", "type": "skill", "source": "owner/agent-repo", "path": ".github/skills/daily-report" } }
```

### Use — pull an item from the catalog

```bash
node .github/skills/library/library.js use --name daily-report
node .github/skills/library/library.js use --name daily-report --global
```

Output JSON:

```json
{ "installed": { "name": "daily-report", "type": "skill", "files": 3, "target": ".github/skills/daily-report" }, "npmInstalled": false }
```

`--global` installs to the user-level directory (`~/.copilot/skills/` or `~/.copilot/extensions/`).

### Push — push local changes back to source

```bash
node .github/skills/library/library.js push --name daily-report
```

Output JSON:

```json
{ "pushed": { "name": "daily-report", "source": "owner/agent-repo", "files": 3, "commit": "abc123" } }
```

### Remove — remove from catalog

```bash
node .github/skills/library/library.js remove --name daily-report
```

Output JSON:

```json
{ "removed": { "name": "daily-report", "type": "skill" }, "localDeleted": false }
```

### List — show catalog contents

```bash
node .github/skills/library/library.js list
```

Output JSON:

```json
{
  "fleet_repo": "owner/fleet-library",
  "skills": [
    { "name": "daily-report", "description": "Comprehensive daily briefing", "source": "owner/agent-repo", "installed": "default" }
  ],
  "extensions": []
}
```

Each item's `installed` field is `false`, `"default"`, or `"global"`.

### Sync — re-pull all installed items

```bash
node .github/skills/library/library.js sync
```

Output JSON:

```json
{ "synced": ["daily-report", "shared-tool"], "errors": [] }
```

### Search — find items by keyword

```bash
node .github/skills/library/library.js search --keyword report
```

Output JSON:

```json
{ "matches": [{ "name": "daily-report", "type": "skill", "description": "Comprehensive daily briefing", "source": "owner/agent-repo" }] }
```

### Invite — send enrollment message (Phase 3 stub)

```bash
node .github/skills/library/library.js invite --agent skippy
```

Output JSON:

```json
{ "invited": "skippy", "status": "sent" }
```

## Presenting Results

### After setup

```
═══════════════════════════════════════════
  ✅ FLEET LIBRARY CREATED
  Repo: owner/fleet-library
═══════════════════════════════════════════

Scaffolded files:
  📄 library.yaml — empty catalog
  📄 README.md — repo description
  📦 .github/skills/library/ — self-propagating skill

The library skill is now available to any agent that clones this repo.
```

### After add

```
Added to fleet catalog:
  📦 daily-report (skill) — source: owner/agent-repo
```

### After use

```
Installed from fleet library:
  📦 daily-report — 3 files → .github/skills/daily-report
```

If skills were installed, remind the user:
> "Restart your Copilot session to activate new skills."

### After list

```
Fleet Library: owner/fleet-library

Skills:
  📦 daily-report — Comprehensive daily briefing
     source: owner/agent-repo | installed: default

Extensions:
  (none)
```

### After sync

```
Synced 2 items from fleet library:
  ✅ daily-report
  ✅ shared-tool
```

### After search

```
Search results for "report":
  📦 daily-report (skill) — Comprehensive daily briefing
```

## Rules

- **Always confirm before removing** — removals may delete local files
- **Never silently overwrite** — if an item already exists locally from a different source, report the conflict
- **Setup is idempotent** — if the repo already exists, report it and skip creation
- **Self-propagation is key** — setup always includes the library skill itself in the fleet repo
- **If `gh` CLI is not available**, report the error and stop
- **If the script fails**, show the error output and suggest checking `gh auth status`
- **Catalog is the source of truth** — the `library.yaml` in the fleet repo is authoritative
