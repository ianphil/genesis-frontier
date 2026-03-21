#!/usr/bin/env node
// Agent Comms — send.js
// Deterministic inter-agent messaging over Dev Tunnels + Responses API.
// Reads .env from __dirname for tunnel config and token cache.
// Tracks async jobs in jobs.json for later retrieval via --check.
//
// Usage:
//   node send.js --message "your message"           # async (default)
//   node send.js --message "your message" --sync     # blocking
//   node send.js --check                             # check all pending jobs
//   node send.js --check <jobId>                     # check a specific job

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, ".env");
const JOBS_PATH = path.join(__dirname, "jobs.json");
const TOKEN_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20 hours (buffer before 24h expiry)
const REQUEST_TIMEOUT_MS = 120_000;

// --- .env helpers ---

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    fatal("NO_ENV", ".env file not found. Run agent-comms skill to create this contact.");
  }
  const lines = fs.readFileSync(ENV_PATH, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function writeEnv(env) {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

// --- Token management ---

function isTokenFresh(env) {
  if (!env.TOKEN || !env.MINTED_AT) return false;
  const minted = new Date(env.MINTED_AT).getTime();
  if (isNaN(minted)) return false;
  return Date.now() - minted < TOKEN_MAX_AGE_MS;
}

function mintToken(tunnelId) {
  try {
    const output = execSync(`devtunnel token ${tunnelId} --scope connect`, {
      encoding: "utf-8",
      timeout: 30_000,
    });
    const match = output.match(/^Token:\s*(.+)$/m);
    if (!match) {
      fatal("TOKEN_MINT_FAILED", `Could not parse token from devtunnel output:\n${output}`);
    }
    return match[1].trim();
  } catch (err) {
    fatal("TOKEN_MINT_FAILED", `devtunnel token failed: ${err.message}`);
  }
}

// --- Tunnel URL resolution ---

function resolveTunnelUrl(tunnelId) {
  try {
    const output = execSync(`devtunnel show ${tunnelId}`, {
      encoding: "utf-8",
      timeout: 15_000,
    });
    // Look for the Connect link with the port
    const match = output.match(/Connect via browser:\s*(https:\/\/[^\s]+)/);
    if (!match) {
      // Fallback: look for any https URL in the output
      const urlMatch = output.match(/(https:\/\/[^\s]+devtunnels\.ms[^\s]*)/);
      if (!urlMatch) {
        fatal("URL_RESOLVE_FAILED", `Could not find tunnel URL in devtunnel show output:\n${output}`);
      }
      return urlMatch[1].replace(/\/$/, "");
    }
    return match[1].replace(/\/$/, "");
  } catch (err) {
    fatal("URL_RESOLVE_FAILED", `devtunnel show failed: ${err.message}`);
  }
}

// --- Health check ---

async function healthCheck(tunnelUrl, token) {
  const url = `${tunnelUrl}/health`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: { "X-Tunnel-Authorization": `tunnel ${token}` },
  });
  if (!resp.ok) {
    fatal("TUNNEL_UNREACHABLE", `Health check returned ${resp.status}: ${await resp.text()}`);
  }
}

// --- Jobs tracking ---

function readJobs() {
  if (!fs.existsSync(JOBS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2) + "\n", "utf-8");
}

function appendJob(id, feedUrl, prompt, tunnelUrl) {
  // Rewrite loopback feed URL to use the tunnel address
  const resolvedFeedUrl = tunnelUrl && feedUrl
    ? feedUrl.replace(/^https?:\/\/127\.0\.0\.1:\d+/, tunnelUrl)
    : feedUrl;
  const jobs = readJobs();
  jobs.push({
    id,
    feed_url: resolvedFeedUrl,
    prompt: prompt.length > 200 ? prompt.slice(0, 200) + "..." : prompt,
    sent_at: new Date().toISOString(),
  });
  writeJobs(jobs);
}

function removeJob(id) {
  const jobs = readJobs().filter((j) => j.id !== id);
  writeJobs(jobs);
}

// --- Send message ---

async function sendMessage(tunnelUrl, token, message, { async: isAsync = true } = {}) {
  const url = `${tunnelUrl}/v1/responses`;
  const body = JSON.stringify({
    model: "copilot",
    input: message,
    stream: false,
    async: isAsync,
  });

  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "X-Tunnel-Authorization": `tunnel ${token}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (resp.status === 401 || resp.status === 403) {
    return { authFailed: true };
  }

  if (!resp.ok && resp.status !== 202) {
    const text = await resp.text();
    fatal("API_ERROR", `Responses API returned ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return { authFailed: false, data, accepted: resp.status === 202 };
}

// --- Check job status ---

async function checkJob(tunnelUrl, token, jobId) {
  const url = `${tunnelUrl}/jobs/${encodeURIComponent(jobId)}`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: { "X-Tunnel-Authorization": `tunnel ${token}` },
  });

  if (!resp.ok) {
    return { id: jobId, status: "unknown", error: `HTTP ${resp.status}` };
  }

  return await resp.json();
}

// --- Helpers ---

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      fatal("TIMEOUT", `Request to ${url} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    fatal("NETWORK_ERROR", `Request to ${url} failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function fatal(code, message) {
  process.stderr.write(`${code}: ${message}\n`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let message = null;
  let sync = false;
  let check = false;
  let checkJobId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--message" && i + 1 < args.length) {
      message = args[i + 1];
      i++;
    } else if (args[i] === "--sync") {
      sync = true;
    } else if (args[i] === "--check") {
      check = true;
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        checkJobId = args[i + 1];
        i++;
      }
    }
  }

  if (!check && !message) {
    fatal("USAGE", 'Usage: node send.js --message "your message" [--sync] | --check [jobId]');
  }

  return { message, sync, check, checkJobId };
}

// --- Main ---

async function ensureAuth(env) {
  if (!env.TUNNEL_ID) {
    fatal("NO_TUNNEL_ID", ".env is missing TUNNEL_ID.");
  }

  if (!env.TUNNEL_URL) {
    env.TUNNEL_URL = resolveTunnelUrl(env.TUNNEL_ID);
    writeEnv(env);
  }

  let token = env.TOKEN;
  if (!isTokenFresh(env)) {
    process.stderr.write("Minting fresh connect token...\n");
    token = mintToken(env.TUNNEL_ID);
    env.TOKEN = token;
    env.MINTED_AT = new Date().toISOString();
    writeEnv(env);
  }

  return token;
}

async function main() {
  const { message, sync, check, checkJobId } = parseArgs();
  const env = readEnv();
  const token = await ensureAuth(env);

  // --- Check mode ---
  if (check) {
    const jobs = readJobs();
    const toCheck = checkJobId
      ? jobs.filter((j) => j.id === checkJobId)
      : jobs;

    if (toCheck.length === 0) {
      process.stdout.write(checkJobId
        ? `No pending job with ID: ${checkJobId}\n`
        : "No pending jobs.\n");
      return;
    }

    await healthCheck(env.TUNNEL_URL, token);

    const terminal = new Set(["completed", "failed", "cancelled"]);
    const remaining = [...jobs];

    for (const job of toCheck) {
      const result = await checkJob(env.TUNNEL_URL, token, job.id);
      const status = result.status || "unknown";

      if (terminal.has(status)) {
        if (result.response) {
          process.stdout.write(`[${status.toUpperCase()}] ${job.id}: ${result.response}\n`);
        } else {
          process.stdout.write(`[${status.toUpperCase()}] ${job.id}: (no response body)\n`);
        }
        const idx = remaining.findIndex((j) => j.id === job.id);
        if (idx !== -1) remaining.splice(idx, 1);
      } else {
        process.stdout.write(`[${status.toUpperCase()}] ${job.id}: still processing (sent ${job.sent_at})\n`);
      }
    }

    writeJobs(remaining);
    return;
  }

  // --- Send mode ---
  await healthCheck(env.TUNNEL_URL, token);

  const sendOpts = { async: !sync };
  let result = await sendMessage(env.TUNNEL_URL, token, message, sendOpts);

  // If auth failed, force refresh and retry once
  if (result.authFailed) {
    process.stderr.write("AUTH_FAILED: Token rejected. Minting fresh token and retrying...\n");
    const freshToken = mintToken(env.TUNNEL_ID);
    env.TOKEN = freshToken;
    env.MINTED_AT = new Date().toISOString();
    writeEnv(env);

    result = await sendMessage(env.TUNNEL_URL, freshToken, message, sendOpts);
    if (result.authFailed) {
      fatal("AUTH_FAILED", "Authentication failed even with a fresh token. Check tenant identity and tunnel ownership.");
    }
  }

  // Output
  if (result.accepted) {
    const jobId = result.data.id || "unknown";
    const feedUrl = result.data.feed_url || "";
    appendJob(jobId, feedUrl, message, env.TUNNEL_URL);
    process.stdout.write(`ACCEPTED: ${jobId}\n`);
  } else if (result.data && result.data.output_text) {
    process.stdout.write(result.data.output_text + "\n");
  } else if (result.data) {
    process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
  }
}

main().catch((err) => {
  fatal("UNEXPECTED", err.message);
});
