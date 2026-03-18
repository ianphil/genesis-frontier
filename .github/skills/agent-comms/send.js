#!/usr/bin/env node
// Agent Comms — send.js
// Deterministic inter-agent messaging over Dev Tunnels + Responses API.
// Reads .env from __dirname for tunnel config and token cache.
// Usage: node send.js --message "your message"

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, ".env");
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

// --- Send message ---

async function sendMessage(tunnelUrl, token, message) {
  const url = `${tunnelUrl}/v1/responses`;
  const body = JSON.stringify({
    model: "copilot",
    input: message,
    stream: false,
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

  if (!resp.ok) {
    const text = await resp.text();
    fatal("API_ERROR", `Responses API returned ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return { authFailed: false, data };
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
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--message" && i + 1 < args.length) {
      message = args[i + 1];
      i++;
    }
  }
  if (!message) {
    fatal("USAGE", "Usage: node send.js --message \"your message\"");
  }
  return { message };
}

// --- Main ---

async function main() {
  const { message } = parseArgs();
  const env = readEnv();

  if (!env.TUNNEL_ID) {
    fatal("NO_TUNNEL_ID", ".env is missing TUNNEL_ID.");
  }

  // Resolve tunnel URL if not cached
  if (!env.TUNNEL_URL) {
    env.TUNNEL_URL = resolveTunnelUrl(env.TUNNEL_ID);
    writeEnv(env);
  }

  // Mint or reuse token
  let token = env.TOKEN;
  if (!isTokenFresh(env)) {
    process.stderr.write("Minting fresh connect token...\n");
    token = mintToken(env.TUNNEL_ID);
    env.TOKEN = token;
    env.MINTED_AT = new Date().toISOString();
    writeEnv(env);
  }

  // Health check
  await healthCheck(env.TUNNEL_URL, token);

  // Send message
  let result = await sendMessage(env.TUNNEL_URL, token, message);

  // If auth failed, force refresh and retry once
  if (result.authFailed) {
    process.stderr.write("AUTH_FAILED: Token rejected. Minting fresh token and retrying...\n");
    token = mintToken(env.TUNNEL_ID);
    env.TOKEN = token;
    env.MINTED_AT = new Date().toISOString();
    writeEnv(env);

    result = await sendMessage(env.TUNNEL_URL, token, message);
    if (result.authFailed) {
      fatal("AUTH_FAILED", "Authentication failed even with a fresh token. Check tenant identity and tunnel ownership.");
    }
  }

  // Output the reply
  if (result.data && result.data.output_text) {
    process.stdout.write(result.data.output_text + "\n");
  } else if (result.data) {
    // Fallback: dump the full response for debugging
    process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
  }
}

main().catch((err) => {
  fatal("UNEXPECTED", err.message);
});
