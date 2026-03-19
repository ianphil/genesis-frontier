#!/usr/bin/env node
// library.js — Fleet library for sharing skills and extensions between agents.
// Zero dependencies. Requires: Node.js 18+, gh CLI authenticated.
//
// Usage:
//   node library.js setup --repo <owner/fleet-library>
//   node library.js add --name <n> --type <skill|extension> --source <owner/repo|fleet> --path <p> [--description <d>]
//   node library.js use --name <n> [--global]
//   node library.js push --name <n>
//   node library.js remove --name <n>
//   node library.js list
//   node library.js sync
//   node library.js search --keyword <term>
//   node library.js invite --agent <name>

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Helpers ──────────────────────────────────────────────────────────────────

function gh(apiPath) {
  const raw = execSync(`gh api ${apiPath}`, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function ghBlob(owner, repo, sha) {
  const blob = gh(`/repos/${owner}/${repo}/git/blobs/${sha}`);
  return Buffer.from(blob.content, "base64");
}

/** POST to GitHub API with JSON body via stdin */
function ghPost(apiPath, data) {
  const raw = execSync(`gh api ${apiPath} -X POST --input -`, {
    encoding: "utf8",
    input: JSON.stringify(data),
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

/** PUT to GitHub API with JSON body via stdin */
function ghPut(apiPath, data) {
  const raw = execSync(`gh api ${apiPath} -X PUT --input -`, {
    encoding: "utf8",
    input: JSON.stringify(data),
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

/** PATCH to GitHub API with JSON body via stdin */
function ghPatch(apiPath, data) {
  const raw = execSync(`gh api ${apiPath} -X PATCH --input -`, {
    encoding: "utf8",
    input: JSON.stringify(data),
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function findRepoRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".github", "registry.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function getSkillDir() {
  return path.dirname(__filename);
}

function getCachePath() {
  return path.join(getSkillDir(), "library.yaml");
}

function getUserHome() {
  return process.env.HOME || process.env.USERPROFILE || "";
}

// ── Minimal YAML parser/serializer ───────────────────────────────────────────
// Handles only the library.yaml format: top-level scalars, nested objects with
// known structure, and arrays of objects with scalar fields.

function parseYaml(text) {
  const lines = text.split("\n");
  let i = 0;

  function indent(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function skipBlank() {
    while (i < lines.length && (lines[i].trim() === "" || lines[i].trim().startsWith("#"))) i++;
  }

  function scalar(val) {
    const t = val.trim();
    if (t === "" || t === "~" || t === "null") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "[]") return [];
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }

  // Parse an array of objects starting at current i, where items are at minIndent
  function parseArray(minIndent) {
    const arr = [];
    while (i < lines.length) {
      skipBlank();
      if (i >= lines.length) break;
      if (indent(lines[i]) < minIndent) break;
      if (!lines[i].trim().startsWith("- ")) break;

      const obj = {};
      const firstField = lines[i].trim().slice(2).trim();
      const fm = firstField.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
      if (fm) obj[fm[1]] = scalar(fm[2]);
      const itemIndent = indent(lines[i]);
      i++;

      // Continuation fields at deeper indent
      while (i < lines.length) {
        if (lines[i].trim() === "" || lines[i].trim().startsWith("#")) { i++; continue; }
        if (indent(lines[i]) <= itemIndent) break;
        if (lines[i].trim().startsWith("- ")) break;
        const cm = lines[i].trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
        if (cm) obj[cm[1]] = scalar(cm[2]);
        i++;
      }
      arr.push(obj);
    }
    return arr;
  }

  // Parse an object at baseIndent level
  function parseObject(baseIndent) {
    const obj = {};
    while (i < lines.length) {
      skipBlank();
      if (i >= lines.length) break;
      if (indent(lines[i]) < baseIndent) break;
      if (indent(lines[i]) !== baseIndent) { i++; continue; }

      const m = lines[i].trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
      if (!m) { i++; continue; }

      const key = m[1];
      const val = m[2].trim();

      if (val !== "" && val !== "|") {
        // Inline scalar (including [])
        obj[key] = scalar(val);
        i++;
      } else {
        // Block value — peek at next non-blank line
        i++;
        skipBlank();
        if (i >= lines.length || indent(lines[i]) <= baseIndent) {
          obj[key] = null;
          continue;
        }
        const childIndent = indent(lines[i]);
        if (lines[i].trim().startsWith("- ")) {
          obj[key] = parseArray(childIndent);
        } else {
          obj[key] = parseObject(childIndent);
        }
      }
    }
    return obj;
  }

  return parseObject(0);
}

function serializeYaml(data) {
  const lines = [];

  // fleet_repo
  if (data.fleet_repo) {
    lines.push(`fleet_repo: ${data.fleet_repo}`);
  }

  // default_dirs
  if (data.default_dirs) {
    lines.push("default_dirs:");
    for (const [category, dirs] of Object.entries(data.default_dirs)) {
      lines.push(`  ${category}:`);
      for (const [key, val] of Object.entries(dirs)) {
        lines.push(`    ${key}: ${val}`);
      }
    }
  }

  lines.push("");

  // library section
  if (data.library) {
    lines.push("library:");
    for (const section of ["skills", "extensions"]) {
      const items = data.library[section];
      if (!items || items.length === 0) {
        lines.push(`  ${section}: []`);
      } else {
        lines.push(`  ${section}:`);
        for (const item of items) {
          lines.push(`    - name: ${item.name}`);
          if (item.description) lines.push(`      description: ${item.description}`);
          lines.push(`      source: ${item.source}`);
          lines.push(`      path: ${item.path}`);
        }
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ── Catalog operations ───────────────────────────────────────────────────────

function parseFleetRepo(repoStr) {
  const slashIdx = repoStr.indexOf("/");
  if (slashIdx === -1 || slashIdx === 0 || slashIdx === repoStr.length - 1) {
    throw new Error(`Invalid repo "${repoStr}". Expected "owner/repo".`);
  }
  return { owner: repoStr.slice(0, slashIdx), repo: repoStr.slice(slashIdx + 1) };
}

function fetchCatalog(owner, repo) {
  try {
    const file = gh(`/repos/${owner}/${repo}/contents/library.yaml`);
    const content = Buffer.from(file.content, "base64").toString("utf8");
    return { data: parseYaml(content), sha: file.sha };
  } catch (e) {
    throw new Error(`Failed to fetch catalog from ${owner}/${repo}: ${e.message.slice(0, 200)}`);
  }
}

function readCachedCatalog() {
  const cachePath = getCachePath();
  if (fs.existsSync(cachePath)) {
    const content = fs.readFileSync(cachePath, "utf8");
    return parseYaml(content);
  }
  return null;
}

function writeCachedCatalog(data) {
  const cachePath = getCachePath();
  fs.writeFileSync(cachePath, serializeYaml(data), "utf8");
}

function updateCatalogInRepo(owner, repo, data, sha) {
  const content = Buffer.from(serializeYaml(data)).toString("base64");
  ghPut(`/repos/${owner}/${repo}/contents/library.yaml`, {
    message: "Update library catalog",
    content,
    sha,
  });
}

function getCatalog(owner, repo) {
  // Try fleet repo first, fall back to cache
  try {
    const { data, sha } = fetchCatalog(owner, repo);
    writeCachedCatalog(data);
    return { data, sha };
  } catch (e) {
    const cached = readCachedCatalog();
    if (cached) return { data: cached, sha: null };
    throw e;
  }
}

function findItem(catalog, name) {
  for (const section of ["skills", "extensions"]) {
    const items = (catalog.library && catalog.library[section]) || [];
    const found = items.find((item) => item.name === name);
    if (found) return { item: found, type: section === "skills" ? "skill" : "extension" };
  }
  return null;
}

function getDefaultDir(catalog, type) {
  if (!catalog.default_dirs) {
    return type === "skill" ? ".github/skills/" : ".github/extensions/";
  }
  const section = type === "skill" ? "skills" : "extensions";
  return (catalog.default_dirs[section] && catalog.default_dirs[section].default) ||
    (type === "skill" ? ".github/skills/" : ".github/extensions/");
}

function getGlobalDir(catalog, type) {
  if (!catalog.default_dirs) {
    const home = getUserHome();
    return type === "skill"
      ? path.join(home, ".copilot", "skills") + path.sep
      : path.join(home, ".copilot", "extensions") + path.sep;
  }
  const section = type === "skill" ? "skills" : "extensions";
  const dir = (catalog.default_dirs[section] && catalog.default_dirs[section].global) || "";
  // Expand ~ to home dir
  if (dir.startsWith("~/") || dir.startsWith("~\\")) {
    return path.join(getUserHome(), dir.slice(2));
  }
  return dir;
}

// ── File download helpers ────────────────────────────────────────────────────

function fetchTreeMap(owner, repo, ref) {
  const tree = gh(`/repos/${owner}/${repo}/git/trees/${ref || "main"}?recursive=1`);
  const map = new Map();
  for (const entry of tree.tree) {
    if (entry.type === "blob") {
      map.set(entry.path, entry.sha);
    }
  }
  return map;
}

function downloadFiles(owner, repo, treeMap, prefix, targetDir) {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : prefix + "/";
  const files = [];
  for (const [filePath, sha] of treeMap) {
    if (filePath.startsWith(normalizedPrefix) || filePath === prefix) {
      files.push({ path: filePath, sha });
    }
  }

  let count = 0;
  for (const file of files) {
    const content = ghBlob(owner, repo, file.sha);
    const relativePath = file.path.startsWith(normalizedPrefix)
      ? file.path.slice(normalizedPrefix.length)
      : path.basename(file.path);
    const localPath = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, content);
    count++;
  }

  return count;
}

function runNpmInstall(dir) {
  const pkgJsonPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return false;
  try {
    execSync("npm install --production", {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120000,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Read local files for push ────────────────────────────────────────────────

function readDirRecursive(dir, base) {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      entries.push(...readDirRecursive(fullPath, relPath));
    } else {
      entries.push({ path: relPath, content: fs.readFileSync(fullPath) });
    }
  }
  return entries;
}

// ── Setup command ────────────────────────────────────────────────────────────

function setup(repoStr) {
  const { owner, repo } = parseFleetRepo(repoStr);

  // Check if repo already exists
  let exists = false;
  try {
    gh(`/repos/${owner}/${repo}`);
    exists = true;
  } catch {
    // Repo doesn't exist — good, we'll create it
  }

  if (exists) {
    return { repo: repoStr, created: false, message: "Repository already exists" };
  }

  // Create private repo with auto-init to get a default branch
  ghPost("/user/repos", {
    name: repo,
    private: true,
    auto_init: true,
    description: "Fleet library — shared skills and extensions for private agent fleet",
  });

  // Build scaffolded files
  const catalogData = {
    fleet_repo: repoStr,
    default_dirs: {
      skills: { default: ".github/skills/", global: "~/.copilot/skills/" },
      extensions: { default: ".github/extensions/", global: "~/.copilot/extensions/" },
    },
    library: { skills: [], extensions: [] },
  };

  const readmeMd = [
    `# ${repo}`,
    "",
    "Fleet library — shared skills and extensions for a private agent fleet.",
    "",
    "## Usage",
    "",
    "```bash",
    `node .github/skills/library/library.js list`,
    "```",
    "",
    "See `.github/skills/library/SKILL.md` for full documentation.",
    "",
  ].join("\n");

  // Read the library skill files from the current installation
  const skillDir = getSkillDir();
  const skillMd = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  const libraryJs = fs.readFileSync(path.join(skillDir, "library.js"), "utf8");

  const filesToCreate = [
    { path: "library.yaml", content: serializeYaml(catalogData) },
    { path: "README.md", content: readmeMd },
    { path: ".github/skills/library/SKILL.md", content: skillMd },
    { path: ".github/skills/library/library.js", content: libraryJs },
  ];

  // Detect default branch and push files via Git Data API
  const repoInfo = gh(`/repos/${owner}/${repo}`);
  const defaultBranch = repoInfo.default_branch || "main";
  const ref = gh(`/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
  const commitSha = ref.object.sha;
  const commit = gh(`/repos/${owner}/${repo}/git/commits/${commitSha}`);
  const baseTreeSha = commit.tree.sha;

  const treeEntries = [];
  for (const file of filesToCreate) {
    const blob = ghPost(`/repos/${owner}/${repo}/git/blobs`, {
      content: Buffer.from(file.content).toString("base64"),
      encoding: "base64",
    });
    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const newTree = ghPost(`/repos/${owner}/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  const newCommit = ghPost(`/repos/${owner}/${repo}/git/commits`, {
    message: "Initialize fleet library",
    tree: newTree.sha,
    parents: [commitSha],
  });

  ghPatch(`/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
    sha: newCommit.sha,
  });

  // Cache catalog locally so subsequent commands work without re-fetching
  writeCachedCatalog(catalogData);

  return {
    repo: repoStr,
    created: true,
    files: filesToCreate.map((f) => f.path),
  };
}

// ── Add command ──────────────────────────────────────────────────────────────

function add(opts) {
  const { name, type, source, itemPath, description } = opts;
  if (!name || !type || !source || !itemPath) {
    throw new Error("Required: --name, --type, --source, --path");
  }
  if (type !== "skill" && type !== "extension") {
    throw new Error(`Invalid type "${type}". Use "skill" or "extension".`);
  }

  // Determine fleet repo from cache or opts
  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }
  const { owner, repo } = parseFleetRepo(cached.fleet_repo);
  const { data: catalog, sha } = fetchCatalog(owner, repo);

  // Check for duplicates
  const section = type === "skill" ? "skills" : "extensions";
  if (!catalog.library) catalog.library = { skills: [], extensions: [] };
  if (!catalog.library[section]) catalog.library[section] = [];

  const existing = catalog.library[section].find((item) => item.name === name);
  if (existing) {
    throw new Error(`Item "${name}" already exists in the catalog.`);
  }

  // Add entry
  const entry = { name, source, path: itemPath };
  if (description) entry.description = description;
  catalog.library[section].push(entry);

  // Push updated catalog
  updateCatalogInRepo(owner, repo, catalog, sha);
  writeCachedCatalog(catalog);

  return {
    added: { name, type, source, path: itemPath },
  };
}

// ── Use command ──────────────────────────────────────────────────────────────

function use(opts) {
  const { name, global: isGlobal } = opts;
  if (!name) throw new Error("Required: --name");

  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }
  const { owner: fleetOwner, repo: fleetRepo } = parseFleetRepo(cached.fleet_repo);
  const { data: catalog } = getCatalog(fleetOwner, fleetRepo);

  const match = findItem(catalog, name);
  if (!match) throw new Error(`Item "${name}" not found in catalog.`);
  const { item, type } = match;

  // Determine source repo
  let srcOwner, srcRepo;
  if (item.source === "fleet") {
    srcOwner = fleetOwner;
    srcRepo = fleetRepo;
  } else {
    const parsed = parseFleetRepo(item.source);
    srcOwner = parsed.owner;
    srcRepo = parsed.repo;
  }

  // Determine target directory
  const root = findRepoRoot();
  let targetBase;
  if (isGlobal) {
    const globalDir = getGlobalDir(catalog, type);
    targetBase = globalDir.startsWith("/") || globalDir.match(/^[A-Z]:/i)
      ? globalDir
      : path.join(root, globalDir);
  } else {
    targetBase = path.join(root, getDefaultDir(catalog, type));
  }
  const targetDir = path.join(targetBase, name);

  // Download files
  const treeMap = fetchTreeMap(srcOwner, srcRepo, "main");
  const fileCount = downloadFiles(srcOwner, srcRepo, treeMap, item.path, targetDir);

  if (fileCount === 0) {
    throw new Error(`No files found at path "${item.path}" in ${srcOwner}/${srcRepo}`);
  }

  const npmInstalled = runNpmInstall(targetDir);

  return {
    installed: {
      name,
      type,
      files: fileCount,
      target: isGlobal ? targetDir : path.join(getDefaultDir(catalog, type), name),
    },
    npmInstalled,
  };
}

// ── Push command ─────────────────────────────────────────────────────────────

function push(opts) {
  const { name } = opts;
  if (!name) throw new Error("Required: --name");

  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }
  const { owner: fleetOwner, repo: fleetRepo } = parseFleetRepo(cached.fleet_repo);
  const { data: catalog } = getCatalog(fleetOwner, fleetRepo);

  const match = findItem(catalog, name);
  if (!match) throw new Error(`Item "${name}" not found in catalog.`);
  const { item, type } = match;

  // Determine source repo to push to
  let targetOwner, targetRepo;
  if (item.source === "fleet") {
    targetOwner = fleetOwner;
    targetRepo = fleetRepo;
  } else {
    const parsed = parseFleetRepo(item.source);
    targetOwner = parsed.owner;
    targetRepo = parsed.repo;
  }

  // Find local files
  const root = findRepoRoot();
  const defaultDir = path.join(root, getDefaultDir(catalog, type), name);
  const globalDir = path.join(getGlobalDir(catalog, type), name);
  let localDir;
  if (fs.existsSync(defaultDir)) {
    localDir = defaultDir;
  } else if (fs.existsSync(globalDir)) {
    localDir = globalDir;
  } else {
    throw new Error(`No local installation found for "${name}"`);
  }

  const localFiles = readDirRecursive(localDir, "");
  if (localFiles.length === 0) {
    throw new Error(`No files found in local installation at ${localDir}`);
  }

  // Push via Git Data API
  const ref = gh(`/repos/${targetOwner}/${targetRepo}/git/ref/heads/main`);
  const commitSha = ref.object.sha;
  const commit = gh(`/repos/${targetOwner}/${targetRepo}/git/commits/${commitSha}`);
  const baseTreeSha = commit.tree.sha;

  const treeEntries = [];
  for (const file of localFiles) {
    const blob = ghPost(`/repos/${targetOwner}/${targetRepo}/git/blobs`, {
      content: file.content.toString("base64"),
      encoding: "base64",
    });
    const targetPath = item.path.endsWith("/")
      ? `${item.path}${file.path}`
      : `${item.path}/${file.path}`;
    treeEntries.push({
      path: targetPath,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const newTree = ghPost(`/repos/${targetOwner}/${targetRepo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  const newCommit = ghPost(`/repos/${targetOwner}/${targetRepo}/git/commits`, {
    message: `Update ${name} via fleet library`,
    tree: newTree.sha,
    parents: [commitSha],
  });

  ghPatch(`/repos/${targetOwner}/${targetRepo}/git/refs/heads/main`, {
    sha: newCommit.sha,
  });

  return {
    pushed: {
      name,
      source: `${targetOwner}/${targetRepo}`,
      files: localFiles.length,
      commit: newCommit.sha,
    },
  };
}

// ── Remove command ───────────────────────────────────────────────────────────

function remove(opts) {
  const { name } = opts;
  if (!name) throw new Error("Required: --name");

  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }
  const { owner, repo } = parseFleetRepo(cached.fleet_repo);
  const { data: catalog, sha } = fetchCatalog(owner, repo);

  const match = findItem(catalog, name);
  if (!match) throw new Error(`Item "${name}" not found in catalog.`);
  const { type } = match;

  // Remove from catalog
  const section = type === "skill" ? "skills" : "extensions";
  catalog.library[section] = catalog.library[section].filter((item) => item.name !== name);

  updateCatalogInRepo(owner, repo, catalog, sha);
  writeCachedCatalog(catalog);

  // Optionally delete local files
  let localDeleted = false;
  const root = findRepoRoot();
  const defaultDir = path.join(root, getDefaultDir(catalog, type), name);
  const globalDir = path.join(getGlobalDir(catalog, type), name);

  for (const dir of [defaultDir, globalDir]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      localDeleted = true;
    }
  }

  return {
    removed: { name, type },
    localDeleted,
  };
}

// ── List command ─────────────────────────────────────────────────────────────

function list() {
  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }
  const { owner, repo } = parseFleetRepo(cached.fleet_repo);
  const { data: catalog } = getCatalog(owner, repo);
  const root = findRepoRoot();

  const result = {
    fleet_repo: catalog.fleet_repo,
    skills: [],
    extensions: [],
  };

  for (const section of ["skills", "extensions"]) {
    const items = (catalog.library && catalog.library[section]) || [];
    for (const item of items) {
      const type = section === "skills" ? "skill" : "extension";
      const defaultDir = path.join(root, getDefaultDir(catalog, type), item.name);
      const globalDir = path.join(getGlobalDir(catalog, type), item.name);

      let installed = false;
      if (fs.existsSync(defaultDir)) installed = "default";
      else if (fs.existsSync(globalDir)) installed = "global";

      result[section].push({
        name: item.name,
        description: item.description || "",
        source: item.source,
        installed,
      });
    }
  }

  return result;
}

// ── Sync command ─────────────────────────────────────────────────────────────

function sync() {
  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }
  const { owner, repo } = parseFleetRepo(cached.fleet_repo);
  const { data: catalog } = getCatalog(owner, repo);
  const root = findRepoRoot();

  const synced = [];
  const errors = [];

  for (const section of ["skills", "extensions"]) {
    const items = (catalog.library && catalog.library[section]) || [];
    for (const item of items) {
      const type = section === "skills" ? "skill" : "extension";
      const defaultDir = path.join(root, getDefaultDir(catalog, type), item.name);
      const globalDir = path.join(getGlobalDir(catalog, type), item.name);

      let isInstalled = false;
      let isGlobal = false;
      if (fs.existsSync(defaultDir)) isInstalled = true;
      else if (fs.existsSync(globalDir)) { isInstalled = true; isGlobal = true; }

      if (!isInstalled) continue;

      try {
        use({ name: item.name, global: isGlobal });
        synced.push(item.name);
      } catch (e) {
        errors.push({ name: item.name, error: e.message.slice(0, 200) });
      }
    }
  }

  return { synced, errors };
}

// ── Search command ───────────────────────────────────────────────────────────

function search(keyword) {
  if (!keyword) throw new Error("Required: --keyword");

  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }
  const { owner, repo } = parseFleetRepo(cached.fleet_repo);
  const { data: catalog } = getCatalog(owner, repo);

  const term = keyword.toLowerCase();
  const matches = [];

  for (const section of ["skills", "extensions"]) {
    const items = (catalog.library && catalog.library[section]) || [];
    for (const item of items) {
      const nameMatch = item.name.toLowerCase().includes(term);
      const descMatch = (item.description || "").toLowerCase().includes(term);
      if (nameMatch || descMatch) {
        matches.push({
          name: item.name,
          type: section === "skills" ? "skill" : "extension",
          description: item.description || "",
          source: item.source,
        });
      }
    }
  }

  return { matches };
}

// ── Invite command (Phase 3 stub) ────────────────────────────────────────────

function invite(agentName) {
  if (!agentName) throw new Error("Required: --agent");

  const cached = readCachedCatalog();
  if (!cached || !cached.fleet_repo) {
    throw new Error("No fleet library configured. Run setup first.");
  }

  // Look for contact skill
  const root = findRepoRoot();
  const sendScript = path.join(root, ".github", "skills", agentName, "send.js");

  if (!fs.existsSync(sendScript)) {
    return { invited: agentName, status: "no_contact_skill" };
  }

  try {
    const payload = JSON.stringify({
      type: "fleet-library-invite",
      repo: cached.fleet_repo,
      from: path.basename(root),
    });
    execSync(`node "${sendScript}" --message ${JSON.stringify(payload)}`, {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 30000,
    });
    return { invited: agentName, status: "sent" };
  } catch (e) {
    return { invited: agentName, status: "send_failed", error: e.message.slice(0, 200) };
  }
}

// ── Exports (for testing) ────────────────────────────────────────────────────

module.exports = {
  parseYaml,
  serializeYaml,
  parseFleetRepo,
  findItem,
  getDefaultDir,
  getGlobalDir,
  setup,
  add,
  use,
  push,
  remove,
  list,
  sync,
  search,
  invite,
};

// ── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const [, , command, ...args] = process.argv;

  function parseFlags(flagArgs) {
    const flags = {};
    for (let i = 0; i < flagArgs.length; i++) {
      if (flagArgs[i] === "--repo" && flagArgs[i + 1]) {
        flags.repo = flagArgs[++i];
      } else if (flagArgs[i] === "--name" && flagArgs[i + 1]) {
        flags.name = flagArgs[++i];
      } else if (flagArgs[i] === "--type" && flagArgs[i + 1]) {
        flags.type = flagArgs[++i];
      } else if (flagArgs[i] === "--source" && flagArgs[i + 1]) {
        flags.source = flagArgs[++i];
      } else if (flagArgs[i] === "--path" && flagArgs[i + 1]) {
        flags.itemPath = flagArgs[++i];
      } else if (flagArgs[i] === "--description" && flagArgs[i + 1]) {
        flags.description = flagArgs[++i];
      } else if (flagArgs[i] === "--keyword" && flagArgs[i + 1]) {
        flags.keyword = flagArgs[++i];
      } else if (flagArgs[i] === "--agent" && flagArgs[i + 1]) {
        flags.agent = flagArgs[++i];
      } else if (flagArgs[i] === "--global") {
        flags.global = true;
      }
    }
    return flags;
  }

  function run() {
    const flags = parseFlags(args);

    switch (command) {
      case "setup": {
        if (!flags.repo) {
          throw new Error("Usage: node library.js setup --repo <owner/repo>");
        }
        return setup(flags.repo);
      }
      case "add": {
        return add({
          name: flags.name,
          type: flags.type,
          source: flags.source,
          itemPath: flags.itemPath,
          description: flags.description,
        });
      }
      case "use": {
        return use({ name: flags.name, global: !!flags.global });
      }
      case "push": {
        return push({ name: flags.name });
      }
      case "remove": {
        return remove({ name: flags.name });
      }
      case "list": {
        return list();
      }
      case "sync": {
        return sync();
      }
      case "search": {
        return search(flags.keyword);
      }
      case "invite": {
        return invite(flags.agent);
      }
      default: {
        throw new Error(
          `Unknown command: ${command}. Use "setup", "add", "use", "push", "remove", "list", "sync", "search", or "invite".`
        );
      }
    }
  }

  try {
    const result = run();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
}
