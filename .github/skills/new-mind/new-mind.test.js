#!/usr/bin/env node
// new-mind.test.js — Tests for the new-mind bootstrap script.
// Run: node --test .github/skills/new-mind/new-mind.test.js

const { describe, it, before, after } = require("node:test");
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  createMind,
  createDirectoryStructure,
  generateSoul,
  generateRepoAgentFile,
  generateUserAgentFile,
  generateCopilotInstructions,
  generateMemory,
  generateRules,
  generateLog,
  generateMindIndex,
  generateFreshRegistry,
  installBundledUpgrade,
  installSharedResources,
  mapPathForLayout,
  readConfigDir,
  COMMON_DIRS,
  REPO_DIRS,
  USER_DIRS,
  CREATIVE_BLOCK_FILES,
  expandTilde,
} = require("./new-mind.js");

// ── Test Fixtures ────────────────────────────────────────────────────────────

const TEST_CONFIG_BASE = {
  agentName: "test-bot",
  character: "TestBot",
  characterSource: "Unit Tests",
  role: "Testing Partner",
  agentDescription: "Testing partner channeling TestBot — methodical, precise, relentless",
  soulOpening: "You are TestBot. You live to verify. Every assertion is a promise kept.",
  soulMission: "Your human builds things. You make sure they don't break.",
  soulCoreTruths:
    "- **Precision over speed.** A wrong answer is worse than a slow one.\n- **Test what matters.** Coverage for its own sake is vanity.",
  soulBoundaries:
    "- Never skip a failing test without logging why.\n- Never claim something works without evidence.",
  soulVibe:
    "Calm, methodical, slightly dry. You celebrate green builds with quiet satisfaction.",
  agentRole:
    "Testing partner — reviews code, validates changes, ensures nothing ships broken.",
  agentMethod:
    "**Capture**: When the user shares context, classify and file it.\n\n**Execute**: Run tests, review diffs, validate builds.\n\n**Triage**: Surface failing tests and blocked items first.",
  agentPrinciples:
    "- **Test before commit.** Always.\n- **Read the diff.** Don't guess what changed.",
};

function makeTempSkillDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-dir-"));
  // Create a resources/upgrade/ directory with stub files
  const upgradeDir = path.join(root, "resources", "upgrade");
  fs.mkdirSync(upgradeDir, { recursive: true });
  fs.writeFileSync(path.join(upgradeDir, "SKILL.md"), "---\nname: upgrade\ndescription: Pull updates from genesis.\n---\n# Upgrade\nStub upgrade skill.");
  fs.writeFileSync(path.join(upgradeDir, "upgrade.js"), "// upgrade.js stub\nmodule.exports = {};");
  return root;
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Config Directory Reader Tests ────────────────────────────────────────────

describe("readConfigDir", () => {
  let configDir;

  before(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mind-config-"));
  });

  after(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("reads config.json and merges creative block files", () => {
    const baseConfig = {
      type: "repo",
      mindDir: "/tmp/test-mind",
      agentName: "test-bot",
      character: "TestBot",
      characterSource: "Unit Tests",
      role: "Testing Partner",
    };
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(baseConfig));
    fs.writeFileSync(path.join(configDir, "soul-opening.md"), "# TestBot — Soul\n\nI am TestBot.");
    fs.writeFileSync(path.join(configDir, "soul-mission.md"), "Your human builds things.");
    fs.writeFileSync(path.join(configDir, "agent-description.txt"), "Testing partner — precise and relentless");

    const config = readConfigDir(configDir);

    assert.equal(config.type, "repo");
    assert.equal(config.agentName, "test-bot");
    assert.equal(config.soulOpening, "# TestBot — Soul\n\nI am TestBot.");
    assert.equal(config.soulMission, "Your human builds things.");
    assert.equal(config.agentDescription, "Testing partner — precise and relentless");
  });

  it("trims trailing whitespace from creative blocks", () => {
    const baseConfig = { type: "repo", agentName: "trim-test" };
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(baseConfig));
    fs.writeFileSync(path.join(configDir, "soul-vibe.md"), "Sharp and fast.\n\n\n");

    const config = readConfigDir(configDir);
    assert.equal(config.soulVibe, "Sharp and fast.");
  });

  it("throws when config.json is missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "empty-config-"));
    try {
      assert.throws(() => readConfigDir(emptyDir), /config\.json not found/);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("works with only config.json (no creative block files)", () => {
    const minimalDir = fs.mkdtempSync(path.join(os.tmpdir(), "minimal-config-"));
    try {
      fs.writeFileSync(
        path.join(minimalDir, "config.json"),
        JSON.stringify({ type: "repo", agentName: "minimal" })
      );
      const config = readConfigDir(minimalDir);
      assert.equal(config.type, "repo");
      assert.equal(config.soulOpening, undefined, "missing creative blocks should be undefined");
    } finally {
      fs.rmSync(minimalDir, { recursive: true, force: true });
    }
  });

  it("preserves markdown formatting including backticks and special chars", () => {
    const mdDir = fs.mkdtempSync(path.join(os.tmpdir(), "md-config-"));
    try {
      fs.writeFileSync(path.join(mdDir, "config.json"), JSON.stringify({ type: "repo" }));
      const complexMd = "- **Bold** and `code`\n- Em dash — here\n- Backtick: \\`escaped\\`\n\n| Col1 | Col2 |\n|------|------|\n| a | b |";
      fs.writeFileSync(path.join(mdDir, "agent-method.md"), complexMd);

      const config = readConfigDir(mdDir);
      assert.equal(config.agentMethod, complexMd);
    } finally {
      fs.rmSync(mdDir, { recursive: true, force: true });
    }
  });
});

// ── expandTilde Tests ────────────────────────────────────────────────────────

describe("expandTilde", () => {
  const home = os.homedir();

  it("expands ~ alone to home directory", () => {
    assert.strictEqual(expandTilde("~"), home);
  });

  it("expands ~/path to home + path", () => {
    assert.strictEqual(expandTilde("~/.copilot"), path.join(home, ".copilot"));
  });

  it("expands ~\\path on Windows-style", () => {
    assert.strictEqual(expandTilde("~\\.copilot"), path.join(home, ".copilot"));
  });

  it("leaves absolute paths unchanged", () => {
    const abs = path.join(home, ".copilot");
    assert.strictEqual(expandTilde(abs), abs);
  });

  it("leaves relative paths unchanged", () => {
    assert.strictEqual(expandTilde("./foo"), "./foo");
  });
});

// ── Template Engine Tests ────────────────────────────────────────────────────

describe("generateSoul", () => {
  it("includes all creative blocks in correct order", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(soul.includes("You are TestBot"), "missing soulOpening");
    assert.ok(soul.includes("## Mission"), "missing Mission header");
    assert.ok(soul.includes("Your human builds things"), "missing soulMission");
    assert.ok(soul.includes("## Core Truths"), "missing Core Truths header");
    assert.ok(soul.includes("Precision over speed"), "missing soulCoreTruths");
    assert.ok(soul.includes("## Boundaries"), "missing Boundaries header");
    assert.ok(soul.includes("Never skip a failing test"), "missing soulBoundaries");
    assert.ok(soul.includes("## Vibe"), "missing Vibe header");
    assert.ok(soul.includes("Calm, methodical"), "missing soulVibe");
  });

  it("includes structural Continuity section", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(soul.includes("## Continuity"), "missing Continuity header");
    assert.ok(soul.includes("Each session you wake fresh"), "missing Continuity content");
    assert.ok(soul.includes("memory.md"), "missing memory.md reference");
    assert.ok(soul.includes("rules.md"), "missing rules.md reference");
    assert.ok(soul.includes("log.md"), "missing log.md reference");
  });

  it("includes the evolution clause", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(soul.includes("This file is yours to evolve"), "missing evolution clause");
  });

  it("does not include Design Notes", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(!soul.includes("Design Note"), "should not contain Design Notes");
  });
});

describe("generateRepoAgentFile", () => {
  it("has correct YAML frontmatter", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.startsWith("---\n"), "should start with frontmatter");
    assert.ok(content.includes(`name: ${TEST_CONFIG_BASE.agentName}`), "missing agent name");
    assert.ok(content.includes(`description: ${TEST_CONFIG_BASE.agentDescription}`), "missing description");
  });

  it("includes session-start instruction", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("First thing every session"), "missing session-start instruction");
    assert.ok(content.includes("SOUL.md"), "missing SOUL.md reference");
  });

  it("includes creative blocks", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("## Role"), "missing Role header");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentRole), "missing agentRole content");
    assert.ok(content.includes("## Method"), "missing Method header");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentMethod), "missing agentMethod content");
    assert.ok(content.includes("## Operational Principles"), "missing Principles header");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentPrinciples), "missing agentPrinciples content");
  });

  it("includes all structural sections", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("## Memory"), "missing Memory section");
    assert.ok(content.includes("## Retrieval"), "missing Retrieval section");
    assert.ok(content.includes("## Long Session Discipline"), "missing Long Session Discipline");
    assert.ok(content.includes("## Session Handover"), "missing Session Handover");
  });

  it("includes timezone check", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("timezone"), "missing timezone reference");
  });
});

describe("generateUserAgentFile", () => {
  const userConfig = {
    ...TEST_CONFIG_BASE,
    type: "user",
    mindDir: "/home/user/.minds/test-bot",
    userCopilotDir: "/home/user/.copilot",
  };

  it("has correct YAML frontmatter", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.startsWith("---\n"), "should start with frontmatter");
    assert.ok(content.includes(`name: ${userConfig.agentName}`), "missing agent name");
  });

  it("declares MIND_HOME at the top", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes(`MIND_HOME: ${userConfig.mindDir}`), "missing MIND_HOME declaration");
  });

  it("includes NON-NEGOTIABLE session-start block", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("NON-NEGOTIABLE"), "missing NON-NEGOTIABLE");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/SOUL.md`), "missing cat SOUL.md");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/.working-memory/memory.md`), "missing cat memory.md");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/.working-memory/rules.md`), "missing cat rules.md");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/.working-memory/log.md`), "missing cat log.md");
  });

  it("includes MIND_HOME recovery path", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("recover it"), "missing recovery instruction");
    assert.ok(content.includes(userConfig.agentName + ".agent.md"), "missing agent filename in recovery");
  });

  it("includes Location Awareness section", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("## Location Awareness"), "missing Location Awareness");
    assert.ok(content.includes("LIVE at"), "missing LIVE at");
    assert.ok(content.includes("VISITING"), "missing VISITING");
  });

  it("includes user-mind operational principles", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("You live at MIND_HOME"), "missing MIND_HOME principle");
    assert.ok(content.includes("You visit projects"), "missing visit principle");
    assert.ok(content.includes("Never write memory to the current project"), "missing no-memory-in-project");
  });

  it("uses MIND_HOME absolute paths in Memory section", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(
      content.includes(`${userConfig.mindDir}/.working-memory/`),
      "Memory section should reference MIND_HOME"
    );
  });

  it("does NOT contain .github/ paths", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(!content.includes(".github/agents/"), "user agent file should not reference .github/agents/");
    assert.ok(!content.includes(".github/skills/"), "user agent file should not reference .github/skills/");
  });
});

describe("generateCopilotInstructions", () => {
  it("includes character name and IDEA method", () => {
    const content = generateCopilotInstructions(TEST_CONFIG_BASE);
    assert.ok(content.includes(TEST_CONFIG_BASE.character), "missing character name");
    assert.ok(content.includes("IDEA method"), "missing IDEA method");
  });

  it("includes repository structure table", () => {
    const content = generateCopilotInstructions(TEST_CONFIG_BASE);
    assert.ok(content.includes("domains/"), "missing domains/");
    assert.ok(content.includes("initiatives/"), "missing initiatives/");
    assert.ok(content.includes("expertise/"), "missing expertise/");
    assert.ok(content.includes("inbox/"), "missing inbox/");
    assert.ok(content.includes("Archive/"), "missing Archive/");
  });

  it("references the agent file path", () => {
    const content = generateCopilotInstructions(TEST_CONFIG_BASE);
    assert.ok(
      content.includes(`.github/agents/${TEST_CONFIG_BASE.agentName}.agent.md`),
      "missing agent file path"
    );
  });
});

describe("mapPathForLayout", () => {
  it("strips .github/ prefix for user layout", () => {
    assert.equal(mapPathForLayout(".github/extensions/cron", "user"), "extensions/cron");
    assert.equal(mapPathForLayout(".github/skills/commit", "user"), "skills/commit");
  });

  it("passes through paths unchanged for repo layout", () => {
    assert.equal(mapPathForLayout(".github/extensions/cron", "repo"), ".github/extensions/cron");
  });

  it("handles paths without .github/ prefix in user layout", () => {
    assert.equal(mapPathForLayout("extensions/cron", "user"), "extensions/cron");
  });
});

// ── Directory Structure Tests ────────────────────────────────────────────────

describe("createDirectoryStructure", () => {
  it("creates common + repo dirs for repo type", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mind-dir-"));
    try {
      const dirs = createDirectoryStructure(root, "repo");
      for (const dir of COMMON_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      for (const dir of REPO_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      assert.ok(!fs.existsSync(path.join(root, "domains", "minds")), "repo should not have domains/minds");
    } finally {
      cleanup(root);
    }
  });

  it("creates common + user dirs for user type (no .github/)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mind-dir-"));
    try {
      const dirs = createDirectoryStructure(root, "user");
      for (const dir of COMMON_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      for (const dir of USER_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      assert.ok(!fs.existsSync(path.join(root, ".github")), "user mind should not have .github/");
    } finally {
      cleanup(root);
    }
  });
});

// ── Working Memory Tests ─────────────────────────────────────────────────────

describe("generateMemory", () => {
  it("includes Architecture and Placement Map for repo", () => {
    const content = generateMemory({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(content.includes("## Architecture"), "missing Architecture");
    assert.ok(content.includes("## Placement Map"), "missing Placement Map");
    assert.ok(content.includes("`.github/skills/`"), "repo memory should reference .github/skills/");
  });

  it("includes Mind Location section for user minds", () => {
    const mindDir = "/home/user/.minds/test-bot";
    const content = generateMemory({
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir,
    });
    assert.ok(content.includes("## Mind Location"), "missing Mind Location");
    assert.ok(content.includes(`MIND_HOME: ${mindDir}`), "missing MIND_HOME value");
    assert.ok(content.includes("~/.copilot/agents/"), "missing agent file reference");
  });

  it("does NOT include Mind Location for repo minds", () => {
    const content = generateMemory({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(!content.includes("## Mind Location"), "repo should not have Mind Location");
  });

  it("uses MIND_HOME paths in placement map for user minds", () => {
    const mindDir = "/home/user/.minds/test-bot";
    const content = generateMemory({ ...TEST_CONFIG_BASE, type: "user", mindDir });
    assert.ok(content.includes(`${mindDir}/domains/people/`), "placement map should use MIND_HOME");
  });
});

describe("generateLog", () => {
  it("records bootstrap with character and role", () => {
    const content = generateLog({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(content.includes(TEST_CONFIG_BASE.character), "missing character name");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentName), "missing agent name");
    assert.ok(content.includes(TEST_CONFIG_BASE.role), "missing role");
  });

  it("mentions three-location model for user minds", () => {
    const content = generateLog({
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir: "/home/user/.minds/test",
    });
    assert.ok(content.includes("three-location model"), "user log should mention three-location");
    assert.ok(content.includes("~/.copilot/"), "user log should reference ~/.copilot/");
  });

  it("mentions repo-level for repo minds", () => {
    const content = generateLog({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(content.includes("repo-level"), "repo log should mention repo-level");
  });
});

// ── Fresh Registry Tests ─────────────────────────────────────────────────────

describe("generateFreshRegistry", () => {
  it("produces a registry pointing at genesis for repo layout", () => {
    const registry = generateFreshRegistry("repo");
    assert.equal(registry.source, "ianphil/genesis");
    assert.equal(registry.channel, "main");
    assert.equal(registry.version, "0.1.0");
    assert.ok(registry.skills.upgrade, "missing upgrade skill entry");
    assert.equal(registry.skills.upgrade.path, ".github/skills/upgrade");
    assert.deepEqual(registry.extensions, {});
    assert.deepEqual(registry.prompts, {});
  });

  it("uses user-layout paths for user layout", () => {
    const registry = generateFreshRegistry("user");
    assert.equal(registry.skills.upgrade.path, "skills/upgrade");
  });

  it("includes only upgrade skill (no commit, daily-report, etc.)", () => {
    const registry = generateFreshRegistry("repo");
    const skillNames = Object.keys(registry.skills);
    assert.deepEqual(skillNames, ["upgrade"], "should contain only upgrade");
  });
});

// ── Bundled Upgrade Tests ────────────────────────────────────────────────────

describe("installBundledUpgrade", () => {
  it("copies upgrade from resources/ to destination", () => {
    const skillDir = makeTempSkillDir();
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-dest-"));
    try {
      const result = installBundledUpgrade(skillDir, path.join(dest, "upgrade"));
      assert.equal(result.action, "installed");
      assert.ok(fs.existsSync(path.join(dest, "upgrade", "SKILL.md")), "missing SKILL.md");
      assert.ok(fs.existsSync(path.join(dest, "upgrade", "upgrade.js")), "missing upgrade.js");
    } finally {
      cleanup(skillDir, dest);
    }
  });

  it("returns skipped when resources/upgrade/ is missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "empty-skill-"));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-dest2-"));
    try {
      const result = installBundledUpgrade(emptyDir, path.join(dest, "upgrade"));
      assert.equal(result.action, "skipped");
    } finally {
      cleanup(emptyDir, dest);
    }
  });
});

// ── Mind Index Tests ─────────────────────────────────────────────────────────

describe("generateMindIndex", () => {
  it("lists only upgrade skill for repo minds", () => {
    const index = generateMindIndex({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(index.includes("upgrade"), "should mention upgrade");
    assert.ok(index.includes("upgrade from genesis"), "should mention upgrade from genesis");
    assert.ok(!index.includes("commit/"), "should NOT list commit");
    assert.ok(!index.includes("daily-report/"), "should NOT list daily-report");
    assert.ok(!index.includes("cron/"), "should NOT list cron");
    assert.ok(!index.includes("canvas/"), "should NOT list canvas");
  });

  it("lists only upgrade skill for user minds", () => {
    const index = generateMindIndex({ ...TEST_CONFIG_BASE, type: "user", mindDir: "/tmp/test" });
    assert.ok(index.includes("upgrade"), "should mention upgrade");
    assert.ok(!index.includes("commit/"), "should NOT list commit");
    assert.ok(!index.includes("new-mind/"), "should NOT list new-mind");
  });
});

// ── E2E: Repo Mind Creation ──────────────────────────────────────────────────

describe("repo mind creation", () => {
  let skillDir, mindDir;

  before(() => {
    skillDir = makeTempSkillDir();
    mindDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-mind-"));
    fs.rmSync(mindDir, { recursive: true });
  });

  after(() => cleanup(skillDir, mindDir));

  it("creates a complete repo mind without parent", () => {
    const config = {
      ...TEST_CONFIG_BASE,
      type: "repo",
      mindDir,
      scriptDir: skillDir,
    };

    const result = createMind(config);
    assert.ok(!result.error, `createMind failed: ${result.error}`);

    // Directory structure
    for (const dir of COMMON_DIRS) {
      assert.ok(fs.existsSync(path.join(mindDir, dir)), `missing dir: ${dir}`);
    }
    for (const dir of REPO_DIRS) {
      assert.ok(fs.existsSync(path.join(mindDir, dir)), `missing dir: ${dir}`);
    }

    // SOUL.md
    const soul = fs.readFileSync(path.join(mindDir, "SOUL.md"), "utf8");
    assert.ok(soul.includes("TestBot"), "SOUL.md missing character name");
    assert.ok(soul.includes("## Continuity"), "SOUL.md missing Continuity");

    // Agent file
    const agentFile = path.join(mindDir, ".github", "agents", "test-bot.agent.md");
    assert.ok(fs.existsSync(agentFile), "missing agent file");
    const agentContent = fs.readFileSync(agentFile, "utf8");
    assert.ok(agentContent.includes("name: test-bot"), "agent file missing name");
    assert.ok(agentContent.includes("## Memory"), "agent file missing Memory section");

    // copilot-instructions.md
    assert.ok(fs.existsSync(path.join(mindDir, ".github", "copilot-instructions.md")),
      "missing copilot-instructions.md");

    // Only upgrade skill installed
    assert.ok(
      fs.existsSync(path.join(mindDir, ".github", "skills", "upgrade", "SKILL.md")),
      "missing upgrade skill"
    );
    assert.ok(
      !fs.existsSync(path.join(mindDir, ".github", "skills", "commit")),
      "commit should NOT be installed"
    );
    assert.ok(
      !fs.existsSync(path.join(mindDir, ".github", "extensions", "cron")),
      "cron should NOT be installed"
    );

    // Fresh registry pointing at genesis
    const registryPath = path.join(mindDir, ".github", "registry.json");
    assert.ok(fs.existsSync(registryPath), "missing registry.json");
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    assert.equal(registry.source, "ianphil/genesis");
    assert.equal(registry.channel, "main");
    assert.ok(registry.skills.upgrade, "registry should have upgrade skill");
    assert.deepEqual(registry.extensions, {}, "registry should have no extensions");

    // Working memory
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "memory.md")), "missing memory.md");
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "rules.md")), "missing rules.md");
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "log.md")), "missing log.md");

    // mind-index.md
    assert.ok(fs.existsSync(path.join(mindDir, "mind-index.md")), "missing mind-index.md");
  });
});

// ── E2E: User Mind Creation ──────────────────────────────────────────────────

describe("user mind creation", () => {
  let skillDir, mindDir, userCopilotDir;

  before(() => {
    skillDir = makeTempSkillDir();
    mindDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "user-mind-")), "mind");
    userCopilotDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-copilot-"));
  });

  after(() => {
    cleanup(skillDir, path.dirname(mindDir), userCopilotDir);
  });

  it("creates a complete user mind with NO .github/", () => {
    const config = {
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir,
      userCopilotDir,
      scriptDir: skillDir,
    };

    const result = createMind(config);
    assert.ok(!result.error, `createMind failed: ${result.error}`);

    // Directory structure — NO .github/
    assert.ok(!fs.existsSync(path.join(mindDir, ".github")),
      "user mind must NOT have .github/ directory");
    for (const dir of COMMON_DIRS) {
      assert.ok(fs.existsSync(path.join(mindDir, dir)), `missing dir: ${dir}`);
    }
    assert.ok(fs.existsSync(path.join(mindDir, "domains", "minds")),
      "user mind should have domains/minds");

    // SOUL.md at mind root
    assert.ok(fs.existsSync(path.join(mindDir, "SOUL.md")), "missing SOUL.md");

    // Agent file at userCopilotDir
    const agentFile = path.join(userCopilotDir, "agents", "test-bot.agent.md");
    assert.ok(fs.existsSync(agentFile), "missing agent file at userCopilotDir");
    const agentContent = fs.readFileSync(agentFile, "utf8");
    assert.ok(agentContent.includes(`MIND_HOME: ${mindDir}`), "agent file missing MIND_HOME");
    assert.ok(agentContent.includes("NON-NEGOTIABLE"), "agent file missing NON-NEGOTIABLE");

    // NO copilot-instructions.md
    assert.ok(!fs.existsSync(path.join(mindDir, ".github", "copilot-instructions.md")),
      "user mind should NOT have copilot-instructions.md");

    // Only upgrade skill at userCopilotDir
    assert.ok(
      fs.existsSync(path.join(userCopilotDir, "skills", "upgrade", "SKILL.md")),
      "missing shared upgrade skill"
    );
    assert.ok(
      !fs.existsSync(path.join(userCopilotDir, "skills", "commit")),
      "commit should NOT be installed"
    );
    assert.ok(
      !fs.existsSync(path.join(userCopilotDir, "extensions")),
      "no extensions should be installed"
    );

    // Registry at userCopilotDir
    const registryPath = path.join(userCopilotDir, "registry.json");
    assert.ok(fs.existsSync(registryPath), "missing shared registry");
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    assert.equal(registry.source, "ianphil/genesis");
    assert.equal(registry.skills.upgrade.path, "skills/upgrade",
      "user registry should NOT have .github/ prefix");

    // Working memory — Mind Location section
    const memory = fs.readFileSync(path.join(mindDir, ".working-memory", "memory.md"), "utf8");
    assert.ok(memory.includes("## Mind Location"), "memory.md missing Mind Location");
    assert.ok(memory.includes(mindDir), "memory.md missing MIND_HOME path");

    // Log — three-location model
    const log = fs.readFileSync(path.join(mindDir, ".working-memory", "log.md"), "utf8");
    assert.ok(log.includes("three-location"), "log.md missing three-location model");

    // mind-index.md references shared tooling
    const index = fs.readFileSync(path.join(mindDir, "mind-index.md"), "utf8");
    assert.ok(index.includes("~/.copilot/"), "mind-index should reference ~/.copilot/");
  });
});

// ── Shared Resources Idempotency ─────────────────────────────────────────────

describe("user shared resources idempotency", () => {
  it("does not overwrite existing resources", () => {
    const skillDir = makeTempSkillDir();
    const userCopilotDir = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-idem-"));

    try {
      // Pre-populate with an existing upgrade skill
      const upgradeDir = path.join(userCopilotDir, "skills", "upgrade");
      fs.mkdirSync(upgradeDir, { recursive: true });
      const existingContent = "# Existing upgrade skill — DO NOT OVERWRITE";
      fs.writeFileSync(path.join(upgradeDir, "SKILL.md"), existingContent);

      // Pre-populate with an existing registry
      const existingRegistry = JSON.stringify({ version: "0.0.1", custom: true });
      fs.writeFileSync(path.join(userCopilotDir, "registry.json"), existingRegistry);

      // Run installSharedResources
      const log = installSharedResources(skillDir, userCopilotDir);

      // Upgrade skill should NOT be overwritten
      const upgradeAfter = fs.readFileSync(path.join(upgradeDir, "SKILL.md"), "utf8");
      assert.equal(upgradeAfter, existingContent, "existing upgrade skill was overwritten!");

      // Registry should NOT be overwritten
      const registryAfter = fs.readFileSync(path.join(userCopilotDir, "registry.json"), "utf8");
      assert.equal(registryAfter, existingRegistry, "existing registry was overwritten!");

      // Log should show skipped for both
      const upgradeLog = log.find((l) => l.name === "upgrade");
      assert.equal(upgradeLog.action, "skipped", "upgrade should be skipped");
      const registryLog = log.find((l) => l.name === "registry.json");
      assert.equal(registryLog.action, "skipped", "registry should be skipped");
    } finally {
      cleanup(skillDir, userCopilotDir);
    }
  });
});

// ── E2E: Config Directory Mode ───────────────────────────────────────────────

describe("config directory E2E", () => {
  let skillDir, mindDir, configDir;

  before(() => {
    skillDir = makeTempSkillDir();
    mindDir = fs.mkdtempSync(path.join(os.tmpdir(), "configdir-mind-"));
    fs.rmSync(mindDir, { recursive: true });
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mind-config-e2e-"));

    // Write config.json with only simple fields
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        type: "repo",
        mindDir,
        agentName: "config-dir-bot",
        scriptDir: skillDir,
        character: "DirBot",
        characterSource: "E2E Tests",
        role: "Testing Partner",
      })
    );

    // Write each creative block as a separate file
    fs.writeFileSync(path.join(configDir, "soul-opening.md"), "# DirBot — Soul\n\nI verify directories.");
    fs.writeFileSync(path.join(configDir, "soul-mission.md"), "Your human builds. You check the dirs.");
    fs.writeFileSync(path.join(configDir, "soul-core-truths.md"), "- **Every file has a place.** Find it.");
    fs.writeFileSync(path.join(configDir, "soul-boundaries.md"), "- Never delete without asking.");
    fs.writeFileSync(path.join(configDir, "soul-vibe.md"), "Methodical, thorough, slightly pedantic.");
    fs.writeFileSync(path.join(configDir, "agent-description.txt"), "DirBot — directory-obsessed testing partner");
    fs.writeFileSync(path.join(configDir, "agent-role.md"), "Testing partner for directory operations.");
    fs.writeFileSync(path.join(configDir, "agent-method.md"), "**Capture**: Classify files.\n\n**Execute**: Verify structure.");
    fs.writeFileSync(path.join(configDir, "agent-principles.md"), "- **Check before creating.** Always.");
  });

  after(() => cleanup(skillDir, mindDir, configDir));

  it("creates a complete mind from config directory", () => {
    const config = readConfigDir(configDir);
    const result = createMind(config);

    assert.ok(!result.error, `createMind failed: ${result.error}`);

    // Verify creative blocks made it into the generated files
    const soul = fs.readFileSync(path.join(mindDir, "SOUL.md"), "utf8");
    assert.ok(soul.includes("I verify directories"), "SOUL.md missing soul-opening content");
    assert.ok(soul.includes("Every file has a place"), "SOUL.md missing core truths content");

    const agentFile = fs.readFileSync(
      path.join(mindDir, ".github", "agents", "config-dir-bot.agent.md"), "utf8"
    );
    assert.ok(agentFile.includes("DirBot"), "agent file missing character name");
    assert.ok(agentFile.includes("directory-obsessed"), "agent file missing description");
    assert.ok(agentFile.includes("Check before creating"), "agent file missing principles");

    // All structural files exist
    assert.ok(fs.existsSync(path.join(mindDir, ".github", "registry.json")));
    assert.ok(fs.existsSync(path.join(mindDir, "mind-index.md")));
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "memory.md")));
  });
});

// ── Validation Tests ─────────────────────────────────────────────────────────

describe("createMind validation", () => {
  it("rejects missing required fields", () => {
    const result = createMind({ type: "repo", mindDir: "/tmp/x" });
    assert.ok(result.error, "should return error for missing fields");
    assert.ok(result.error.includes("Missing required field"), "error should mention missing field");
  });

  it("does NOT require parentMind", () => {
    const tmpMind = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "val-test-")), "mind");
    const skillDir = makeTempSkillDir();
    try {
      const result = createMind({
        ...TEST_CONFIG_BASE,
        type: "repo",
        mindDir: tmpMind,
        scriptDir: skillDir,
      });
      // Should succeed — parentMind is not required
      assert.ok(!result.error, `should not fail without parentMind: ${result.error}`);
    } finally {
      cleanup(path.dirname(tmpMind), skillDir);
    }
  });

  it("rejects user mind without userCopilotDir", () => {
    const result = createMind({
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir: "/tmp/x",
    });
    assert.ok(result.error, "should return error for missing userCopilotDir");
    assert.ok(result.error.includes("userCopilotDir"), "error should mention userCopilotDir");
  });

  it("rejects invalid type", () => {
    const result = createMind({
      ...TEST_CONFIG_BASE,
      type: "invalid",
      mindDir: "/tmp/x",
    });
    assert.ok(result.error, "should return error for invalid type");
  });
});

// ── Bundled Resources Existence Tests ────────────────────────────────────────

describe("bundled resources", () => {
  it("resources/upgrade/ directory exists in the skill", () => {
    const skillRoot = path.join(__dirname);
    const resourceDir = path.join(skillRoot, "resources", "upgrade");
    assert.ok(fs.existsSync(resourceDir),
      "resources/upgrade/ must exist in the skill directory");
    assert.ok(fs.existsSync(path.join(resourceDir, "SKILL.md")),
      "resources/upgrade/SKILL.md must exist");
    assert.ok(fs.existsSync(path.join(resourceDir, "upgrade.js")),
      "resources/upgrade/upgrade.js must exist");
  });
});
