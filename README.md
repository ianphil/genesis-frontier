# genesis-frontier

Experimental extensions and skills for [genesis](https://github.com/ianphil/genesis)-based agents. Install via the **packages** skill.

## Install

```bash
# Install everything
node .github/skills/packages/packages.js install ianphil/genesis-frontier

# Install selectively
node .github/skills/packages/packages.js install ianphil/genesis-frontier --items heartbeat,microui
```

Or ask your agent: *"install the frontier package"*

## What's included

### Extensions

| Extension | Version | Description |
|-----------|---------|-------------|
| **heartbeat** | 0.1.2 | Memory maintenance — consolidate session log, decay stale entries, reinforce active ones |
| **code-exec** | 0.1.2 | Universal MCP connector — discover, call, and orchestrate enterprise tools |
| **tunnel** | 0.1.0 | Expose local ports via Microsoft Dev Tunnels |
| **microui** | 0.1.0 | Lightweight native WebView windows (WebView2/WKWebView/WebKitGTK) |

### Skills

| Skill | Version | Description |
|-------|---------|-------------|
| **copilot-extension** | 0.1.1 | SDK reference for building and debugging Copilot CLI extensions |
| **new-mind** | 0.1.0 | Bootstrap new minds — repo-level or user-level |
| **agent-comms** | 0.1.0 | Inter-agent communication via the Agent Handshake Protocol |

### Prompts

No prompts yet — the plumbing is in place for prompt distribution via the fleet library.

## Migrating from frontier branch

If you were using `channel: "frontier"` in your genesis agent, run:

```bash
node .github/skills/upgrade/upgrade.js migrate --source ianphil/genesis-frontier
```

This rewrites your registry to use packages instead of the frontier branch. No files are moved or deleted — it's a pure registry rewrite. After migrating, `upgrade` pulls from main and frontier items are managed by the packages skill.

## Graduation

Items that prove stable graduate to the main genesis template. When that happens, `upgrade` automatically detects the overlap and promotes the package-installed copy to template-owned (removing the `package` field and cleaning `packages[]`).

## License

[MIT](https://github.com/ianphil/genesis/blob/main/LICENSE)
