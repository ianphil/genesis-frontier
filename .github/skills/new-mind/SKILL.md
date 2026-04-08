---
name: new-mind
description: Bootstrap a new AI agent mind. Use when user asks to "create a new mind", "new agent", "spawn a mind", "bootstrap another agent", or wants to set up a new agent persona. Supports repo-level and user-level minds.
---

# New Mind

Bootstrap a new AI agent mind — self-contained, no parent mind required.

**Rules:**
- Ask ONE question at a time. Wait for the answer.
- Generate files after each phase so progress is visible.
- Be brief — workshop, not lecture.
- Templates carry Design Notes — absorb the patterns but strip them from generated files.

---

## Phase 1: Locate the Skill

Before starting the interview, locate the new-mind skill directory. This contains the
templates and bootstrap script.

Search for the skill in these locations (in order):
1. The current plugin/skill directory (if running from a plugin)
2. `.github/skills/new-mind/` (repo-level)
3. `~/.copilot/skills/new-mind/` (user-level)

On Windows (PowerShell):
```powershell
$SKILL_DIR = (Get-ChildItem -Recurse -Filter "new-mind.js" -Path . | Select-Object -First 1).DirectoryName
```

On macOS/Linux:
```bash
SKILL_DIR=$(find . -name "new-mind.js" -path "*/new-mind/*" -exec dirname {} \; | head -1)
```

Verify the skill has templates:
```bash
test -d "$SKILL_DIR/templates" || echo "ERROR: templates not found"
```

Hold `{SKILL_DIR}` for subsequent phases — template reads and the bootstrap script reference it.

---

## Phase 2: Mind Type

Ask:

> "What type of mind should we create?
>
> - **Repo mind** — self-contained, anchored to a specific directory. Identical to a standard
>   genesis bootstrap. The agent file lives inside the repo at `.github/agents/`.
>
> - **User mind** — headless mind repo paired with a user-level agent file installed to
>   `~/.copilot/agents/`. The agent is available from *any* directory, not just one repo.
>
> Which fits your use case?"

Store their answer as `{MIND_TYPE}` (`repo` or `user`).

---

## Phase 3: Location

**For repo minds**, ask:

> "Where should the new mind live? Provide an absolute path to the directory.
> (e.g., `~/minds/alfred` or `/Users/you/projects/my-agent`)"

Store as `{MIND_PATH}`.

**For user minds**, ask:

> "Where should the mind repo live? This is the body of the mind — all memory and knowledge
> will be stored here. Provide an absolute path.
> (e.g., `~/minds/q` or `/Users/you/minds/wednesday`)"

Store as `{MIND_HOME}`.

---

## Phase 4: Character

Ask:

> "Pick a character from a movie, TV show, comic book, or book — someone whose personality
> you'd enjoy working with every day. They'll be the voice of your agent. A few ideas:
>
> - **Jarvis** (Iron Man) — calm, dry wit, quietly competent
> - **Alfred** (Batman) — warm, wise, unflinching loyalty
> - **Austin Powers** (Austin Powers) — groovy, irrepressible confidence, oddly effective
> - **Samwise** (Lord of the Rings) — steadfast, encouraging, never gives up
> - **Wednesday** (Addams Family) — deadpan, blunt, darkly efficient
> - **Scotty** (Star Trek) — resourceful, passionate, tells it like it is
>
> Or name anyone else. The more specific, the better."

Store as `{CHARACTER}` and `{CHARACTER_SOURCE}`.

Derive `{AGENT_NAME}` from `{CHARACTER}` in kebab-case (e.g., "jarvis", "donna-paulsen", "wednesday").

---

## Phase 5: Role

Ask:

> "What role should this agent fill? Examples:
>
> - **Chief of Staff** — orchestrates tasks, priorities, people context, meetings, communications
> - **PM / Product Manager** — tracks features, writes specs, manages backlogs, grooms stories
> - **Engineering Partner** — reviews code, tracks PRs, manages technical debt, runs builds
> - **Research Assistant** — finds information, synthesizes sources, maintains reading notes
> - **Writer / Editor** — drafts content, maintains style guides, manages publishing workflow
> - **Life Manager** — personal tasks, calendar, finances, health, family coordination
>
> Or describe something else."

Store as `{ROLE}`.

---

## Phase 6: Research Character

Before generating any files, research `{CHARACTER}` from `{CHARACTER_SOURCE}`:

- Communication style, catchphrases, mannerisms
- Core values and personality traits
- How they handle pressure, humor, loyalty
- What makes them distinctly *them*

Hold this research in context — it shapes SOUL.md, the agent file, and all generated content.

---

## Phase 7: Generate the Mind

Set `{MIND_DIR}` = `{MIND_PATH}` (repo mind) or `{MIND_HOME}` (user mind).

Read templates from `{SKILL_DIR}/templates/` for reference — they
show the patterns and structure for each file. Use them as guides when writing creative blocks.

### 7.1 Write Creative Blocks as Files

Create a config directory at `{MIND_DIR}/.mind-config/`. Use your **file creation tool** (not
shell commands) to write each creative block as a separate file. This avoids all escaping issues
with quotes, backticks, em-dashes, and other special characters in markdown.

**`.mind-config/config.json`** — simple fields only (no creative content):

```json
{
  "type": "{repo|user}",
  "mindDir": "{MIND_DIR}",
  "agentName": "{AGENT_NAME}",
  "userCopilotDir": "~/.copilot",
  "character": "{CHARACTER}",
  "characterSource": "{CHARACTER_SOURCE}",
  "role": "{ROLE}"
}
```

Note: `userCopilotDir` is only needed for user minds. Omit it for repo minds.

**Creative block files** — one file per block, written with the file creation tool:

| File | Template Reference | Content |
|------|--------------------|---------|
| `.mind-config/soul-opening.md` | `soul-template.md` | Opening paragraph channeling `{CHARACTER}`'s voice. Include `# {Character} — Soul` heading. |
| `.mind-config/soul-mission.md` | `soul-template.md` | Mission section tailored to `{ROLE}` |
| `.mind-config/soul-core-truths.md` | `soul-template.md` | Core Truths adapted to the character's values |
| `.mind-config/soul-boundaries.md` | `soul-template.md` | Personality-specific boundaries |
| `.mind-config/soul-vibe.md` | `soul-template.md` | Vibe section in the character's actual voice |
| `.mind-config/agent-description.txt` | — | One sentence combining `{ROLE}` and `{CHARACTER}` |
| `.mind-config/agent-role.md` | `agent-file-template.md` | Role section tailored to `{ROLE}` |
| `.mind-config/agent-method.md` | `agent-file-template.md` | Method section (capture/execute/triage for the role) |
| `.mind-config/agent-principles.md` | `agent-file-template.md` | Operational principles specific to the role |

### 7.2 Run the Bootstrap Script

```bash
cd {MIND_DIR}
git init
node {SKILL_DIR}/new-mind.js create --config-dir .mind-config
```

The script reads the config directory, then handles all filesystem operations: directory creation,
file generation, upgrade skill installation, and registry generation (pointing at genesis for
future updates).

The script outputs JSON with the list of created files. Verify it completed without errors.

Clean up the config directory after the script completes:

```bash
rm -rf .mind-config
```

---

## Phase 8: Commit & Remote

```bash
cd {MIND_DIR}
git add -A
git commit -m "feat: bootstrap {AGENT_NAME} mind"
```

Offer to create a private GitHub repo:

> "Your mind is committed locally. Want me to create a private GitHub repo for it?
> I can run `gh repo create` to set it up and push."

If yes, run:

```bash
gh repo create {AGENT_NAME} --private --source={MIND_DIR} --push
```

---

## Phase 9: Activate

**For repo minds**, tell the user:

> "Your mind is alive. 🧬
>
> **Meet your agent.** Open `{MIND_DIR}` in a new terminal, run `copilot`,
> and type `/agent` to select **{AGENT_NAME}**. Start a conversation — tell it
> about your work, your priorities, your team.
>
> **Get more skills.** Your mind ships with one skill: `upgrade`. Say
> **"upgrade from genesis"** to pull in the full toolkit — commit, daily-report,
> new-mind, and more. You only need to do this once.
>
> **What's next?** Correct mistakes — every correction becomes a rule.
> It takes about a week to feel genuinely useful. Context compounds."

**For user minds**, tell the user:

> "Your mind is alive and available everywhere. 🧬
>
> **Two locations to know:**
> - **Mind repo**: `{MIND_HOME}` — your identity (SOUL.md), memory, and knowledge
> - **Shared tooling**: `~/.copilot/` — agent file, skills, extensions, registry (shared by all user-level agents)
>
> **To use it:** Open *any* directory. Run `copilot`. Type `/agent` and
> select **{AGENT_NAME}**. The agent will load its identity, then shell out to read its
> memory from `{MIND_HOME}`.
>
> **Get more skills.** Say **"upgrade from genesis"** to pull in the full toolkit —
> commit, daily-report, new-mind, and more. You only need to do this once.
>
> **The memory model:**
> - All memory writes go to `{MIND_HOME}/.working-memory/`
> - Project notes go to `{MIND_HOME}/domains/projects/{repo-name}/`
> - When you commit, the skill commits *both* the project and the mind
>
> **Multiple user-level agents?** No conflict — each agent has its own `MIND_HOME`.
> Shared skills and extensions at `~/.copilot/` defer to whatever `MIND_HOME` is in context.
>
> It takes about a week to feel genuinely useful. Context compounds."
