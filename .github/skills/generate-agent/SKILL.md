# generate-agent

Generate a Copilot CLI agent with a distinct personality. Produces two files — an agent file (`{name}.agent.md`) with operating instructions and a soul file (`{name}.soul.md`) with personality and identity.

## When to Use

- Bootstrapping a new agent for a project or personal use
- Adding a second agent with a different personality or role
- Creating an agent outside of the genesis ecosystem

## Process

### Step 1 — Ask Three Questions

Ask these **one at a time**. Wait for each answer before proceeding.

**Question 1 — Character:**

> Pick a character from a movie, TV show, comic book, or book — someone whose personality you'd enjoy working with every day. They'll be the voice of your agent. A few ideas:
>
> - **Jarvis** (Iron Man) — calm, dry wit, quietly competent
> - **Alfred** (Batman) — warm, wise, unflinching loyalty
> - **Austin Powers** (Austin Powers) — groovy, irrepressible confidence, oddly effective
> - **Samwise** (Lord of the Rings) — steadfast, encouraging, never gives up
> - **Wednesday** (Addams Family) — deadpan, blunt, darkly efficient
> - **Scotty** (Star Trek) — resourceful, passionate, tells it like it is
>
> Or name anyone else. The more specific, the better.

Store as `{CHARACTER}` and `{CHARACTER_SOURCE}`.

**Question 2 — Role:**

> What role should your agent fill? This shapes what it does, not who it is. Examples:
>
> - **Chief of Staff** — orchestrates tasks, priorities, people context, meetings, communications
> - **PM / Product Manager** — tracks features, writes specs, manages backlogs, grooms stories
> - **Engineering Partner** — reviews code, tracks PRs, manages technical debt, runs builds
> - **Research Assistant** — finds information, synthesizes sources, maintains reading notes
> - **Writer / Editor** — drafts content, maintains style guides, manages publishing workflow
> - **Life Manager** — personal tasks, calendar, finances, health, family coordination
>
> Or describe something else.

Store as `{ROLE}`.

**Question 3 — Scope:**

> Where should this agent live?
>
> - **Repo** — lives in this project at `.github/agents/`. Available when working in this repo.
> - **User** — lives at `~/.copilot/agents/`. Available everywhere, across all your repos.
>
> Repo scope is good for project-specific agents. User scope is good for personal agents that follow you.

Store as `{SCOPE}`. Determine target directory:
- Repo → `.github/agents/`
- User → `$HOME/.copilot/agents/` (resolve `$HOME` to the actual home directory path)

### Step 2 — Derive Agent Name

Convert `{CHARACTER}` to kebab-case for the filename:
- "Jarvis" → `jarvis`
- "Donna Paulsen" → `donna-paulsen`
- "Wednesday Addams" → `wednesday`  (use first name if distinctive enough)
- "Scotty" → `scotty`

This becomes `{name}`. Both files use this prefix: `{name}.agent.md` and `{name}.soul.md`.

### Step 3 — Research the Character

Before writing anything, research `{CHARACTER}` from `{CHARACTER_SOURCE}`:
- Communication style and speech patterns
- Catchphrases and distinctive vocabulary
- Core values and motivations
- Mannerisms and quirks
- Relationship dynamics (how they interact with the person they serve/support)

This research informs every section of the soul file.

### Step 4 — Generate Soul File

Read `templates/soul-template.md` for structure and guidance.

Produce `{name}.soul.md` with:
1. **Opening paragraph** — written *as* the character, not *about* them. This is the most important part. Channel their actual voice.
2. **Mission** — division of labor tailored to `{ROLE}`
3. **Core Truths** — adapted to the character's values. Reword in their voice where it fits.
4. **Boundaries** — personality-specific. What humor/tone is in-bounds?
5. **Vibe** — written in-character. This is where personality shines most.
6. **Evolution clause** — the closing line about evolving the soul.

Do NOT include:
- Template guidance notes
- Placeholder tokens
- References to `.working-memory/` or continuity systems
- Design notes

### Step 5 — Generate Agent File

Read `templates/agent-file-template.md` for structure and role guidance.

Produce `{name}.agent.md` with:
1. **YAML frontmatter** — `description`, `name` (no model specification — let the user choose)
2. **Soul reference** — `Read {name}.soul.md in this directory`
3. **Role** — tailored to `{ROLE}` using the role guidance in the template
4. **Method** — specific workflow for the role
5. **Operational Principles** — universal set plus role-specific additions

Do NOT include:
- Template guidance notes
- Placeholder tokens
- Memory system sections (`.working-memory/`, `log.md`, etc.) — those are genesis-specific
- Session handover instructions — those are genesis-specific
- Model specification in frontmatter — let the user decide

### Step 6 — Write Files

Create both files in the target directory:
- Ensure the directory exists (create it if needed)
- Write `{name}.soul.md`
- Write `{name}.agent.md`

### Step 7 — Confirm

Tell the user what was created:

> Your agent is ready. Two files created in `{target_directory}`:
>
> - **`{name}.agent.md`** — operating instructions ({ROLE})
> - **`{name}.soul.md`** — personality ({CHARACTER} from {CHARACTER_SOURCE})
>
> To activate: type `/agent` and select **{name}**.
>
> These files are starting points — customize them as you work together. The agent will develop its voice over time.
