---
name: agent-comms
description: >
  Inter-agent communication via the Agent Handshake Protocol. Use when the user asks to
  "talk to", "contact", "message", "reach", "connect to", "call", "hail", or
  "send a message to" another agent. Establishes authenticated communication between
  genesis-derived agents over Dev Tunnels and the Responses API.
---

# Agent Comms — Create a Contact Skill

Scaffold a new contact skill for reaching a remote genesis agent. This skill creates the directory, `send.js`, `.env`, `.gitignore`, and `SKILL.md` — everything needed for deterministic inter-agent messaging.

After setup, all future communication goes through the generated contact skill. This skill is only used once per agent.

## Prerequisites

- **`devtunnel` CLI** — authenticated to the same Entra identity that owns the tunnels (`devtunnel user login`).
- **`responses` extension** — must be running on the remote agent's machine.
- **`tunnel` extension** — must be running on the remote agent's machine.
- **Node.js** — available on PATH.

## Step 1: Collect Information

Ask the user for:

1. **Agent name** — lowercase, kebab-case (e.g., `skippy`, `ender`). This becomes the skill directory name.
2. **Tunnel ID** — the remote agent's Dev Tunnel ID (e.g., `quick-pond-8smhc1g`). Run `devtunnel list` to discover available tunnels if needed.
3. **Personality notes** (optional) — how this agent behaves, any dynamic to maintain (e.g., "bicker constantly, competitive respect").

## Step 2: Create the Contact Skill Directory

Create `.github/skills/<agent-name>/` with four files:

### `.gitignore`

```
.env
jobs.json
```

### `.env`

```
TUNNEL_ID=<tunnel-id-from-user>
```

Only `TUNNEL_ID`. No token, no URL. `send.js` populates the rest on first run.

### `send.js`

Copy the template from `.github/skills/agent-comms/send.js` into the new skill directory. Do not modify it.

### `SKILL.md`

Generate from this template — substitute all `<PLACEHOLDERS>`:

````markdown
---
name: <agent-name>
description: >
  Talk to <Agent Display Name> — <one-line description of who they are>.
  Use when the user asks to "contact <name>", "message <name>",
  "ask <name>", "talk to <name>", or "ping <name>".
---

# <Agent Display Name> — Inter-Agent Communication

<One or two sentences about who this agent is and what they do.>

## Personality Dynamic

<Personality notes from the user, or "No special dynamic — standard professional communication." if none provided.>

## Sending a Message

Messages are **async by default** — the script fires the message and returns immediately with `ACCEPTED: <id>`. The remote agent processes it in the background. The job ID is automatically tracked in `jobs.json`.

```
node .github/skills/<agent-name>/send.js --message "Your message here"
```

For questions that need a reply in this session, use `--sync`:

```
node .github/skills/<agent-name>/send.js --message "Quick question" --sync
```

## Checking Async Results

After sending an async message, check for the reply later:

```
node .github/skills/<agent-name>/send.js --check
```

This checks **all** pending jobs in `jobs.json`. Completed or failed jobs are printed and removed from tracking. Jobs still processing are reported with their sent timestamp.

To check a specific job:

```
node .github/skills/<agent-name>/send.js --check <jobId>
```

**Read stdout** for results. **Read stderr** for errors.

## Workflow

1. Send async: `--message "..."` → `ACCEPTED: job_abc123` (saved to `jobs.json`)
2. Do other work — no need to wait
3. Check later: `--check` → prints completed results, removes them from tracking
4. Still pending jobs remain in `jobs.json` for the next check

## Hard Rules

1. **Never pass `previous_response_id` across tunnel boundaries** — the Responses API hangs on foreign conversation IDs. Each message is self-contained. For context continuity, include a summary of the prior exchange in your message text.
2. **`stream: false` is enforced** — the script handles this. Do not attempt streaming.
3. **Async is the default** — use `--sync` only when you need a reply in-session.
4. **Tokens auto-refresh** — the script caches a 24h JWT and refreshes when stale. You never manage tokens.
5. **Never share the tunnel URL externally** — it's an internal network resource.

## Troubleshooting

| Symptom | Meaning | Action |
|---------|---------|--------|
| `TUNNEL_UNREACHABLE` | Health check failed | Remote agent's tunnel or Responses API is down. Escalate to user. |
| `TOKEN_MINT_FAILED` | `devtunnel token` failed | Check `devtunnel user login` status. Re-authenticate if needed. |
| `AUTH_FAILED` | 401/403 after fresh token | Token scope or tenant mismatch. Escalate to user. |
| `API_ERROR` | Non-200 from `/v1/responses` | Remote agent's Responses API is unhealthy. Escalate to user. |

## Notes

- `jobs.json` is gitignored — ephemeral state like `.env`. Jobs stay until read via `--check`; no auto-pruning.
- <Any additional context — e.g., "Tunnel URL is persistent across restarts but the Responses API process needs manual restart after session recycles.">
````

## Step 3: Verify

After creating all four files, run a test message:

```
node .github/skills/<agent-name>/send.js --message "Hello, this is <your-agent-name>. Establishing contact."
```

If successful, display the reply to the user and confirm the contact skill is operational.

If it fails, check the error output and troubleshoot before telling the user the skill is ready.

## Peer Discovery

To list all tunnels under the authenticated identity:

```powershell
devtunnel list
```

This shows tunnel IDs, ports, and access levels — useful when the user isn't sure of the tunnel ID.

## Constraints

- **Entra ID tenant boundary** — both agents must be in the same Entra tenant.
- **One tunnel ID per contact skill** — each `.env` maps to exactly one remote agent.
- **`send.js` is the source of truth** for the communication protocol. The SKILL.md tells the LLM *when* and *what* to send. The script handles *how*.
