---
name: copilot-extension
description: Reference for building and debugging Copilot CLI extensions. Use when working on anything in .github/extensions/, creating extension tools, or troubleshooting extension lifecycle and SDK behavior.
---

# Copilot Extension Development

Authoritative patterns for Copilot CLI extensions on SDK 1.0.20. This is about the **extension API**, not the out-of-process SDK client.

## What an extension is

Extensions are Node child processes discovered from:

```text
.github/extensions/<name>/extension.mjs
```

The CLI forks each extension, wires up JSON-RPC over stdio, and the extension joins the active foreground session with:

```js
import { joinSession } from "@github/copilot-sdk/extension";
```

Do **not** scan `~/.copilot/pkg` or import `CopilotClient` when writing an extension. That is for out-of-process code, not `.github/extensions/*/extension.mjs`.

## Workflow

1. **Scaffold**
   ```js
   extensions_manage({ operation: "scaffold", name: "my-extension" })
   ```
2. **Edit** `.github/extensions/my-extension/extension.mjs`
3. **Reload**
   ```js
   extensions_reload({})
   ```
4. **Verify**
   ```js
   extensions_manage({ operation: "list" })
   extensions_manage({ operation: "inspect", name: "my-extension" })
   ```

## Minimal skeleton

```js
import { joinSession } from "@github/copilot-sdk/extension";

const session = await joinSession({
  tools: [],
  hooks: {},
});
```

Notes:
- The file must be named `extension.mjs`
- Only `.mjs` is supported
- `@github/copilot-sdk` is provided automatically inside the extension process

## Tool registration

Tools are declared in the `tools` array:

```js
const session = await joinSession({
  tools: [
    {
      name: "my_tool",
      description: "Does something useful",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Tool input" },
        },
        required: ["input"],
      },
      handler: async (args, invocation) => {
        // invocation.sessionId
        // invocation.toolCallId
        // invocation.toolName
        return `Processed: ${args.input}`;
      },
    },
  ],
});
```

Rules:
- Tool names must be globally unique across all loaded extensions
- Handlers return either a string or:
  ```js
  { textResultForLlm: "message", resultType: "success" }
  ```
- Throwing from a handler produces a failure result
- Use JSON Schema for parameters

## Hooks

Available hook names:

```js
hooks: {
  onUserPromptSubmitted: async (input, invocation) => { ... },
  onPreToolUse: async (input, invocation) => { ... },
  onPostToolUse: async (input, invocation) => { ... },
  onSessionStart: async (input, invocation) => { ... },
  onSessionEnd: async (input, invocation) => { ... },
  onErrorOccurred: async (input, invocation) => { ... },
}
```

Most useful patterns:

### Add hidden context

```js
hooks: {
  onUserPromptSubmitted: async (input) => ({
    additionalContext: "Follow our repo conventions.",
  }),
}
```

### Deny a dangerous tool call

```js
hooks: {
  onPreToolUse: async (input) => {
    if (input.toolName === "bash") {
      const cmd = String(input.toolArgs?.command || "");
      if (/rm\s+-rf/i.test(cmd) || /Remove-Item\s+.*-Recurse/i.test(cmd)) {
        return {
          permissionDecision: "deny",
          permissionDecisionReason: "Destructive commands are not allowed.",
        };
      }
    }
  },
}
```

### Add startup context

```js
hooks: {
  onSessionStart: async () => ({
    additionalContext: "Remember to write tests for all changes.",
  }),
}
```

## Session object

`joinSession()` returns a `session` object with the APIs that matter most in extensions:

### Log to the timeline

```js
await session.log("Extension ready");
await session.log("Rate limit approaching", { level: "warning" });
await session.log("Temporary status", { ephemeral: true });
```

### Send a prompt programmatically

```js
await session.send({ prompt: "Analyze the test results." });
const response = await session.sendAndWait({ prompt: "What is 2 + 2?" });
```

### Subscribe to events

```js
session.on("assistant.message", (event) => {
  // event.data.content
});

session.on("tool.execution_complete", (event) => {
  // event.data.toolName, event.data.success, event.data.result
});
```

Useful event types:
- `assistant.message`
- `tool.execution_start`
- `tool.execution_complete`
- `user.message`
- `session.idle`
- `session.error`
- `permission.requested`
- `session.shutdown`

### Session metadata

- `session.workspacePath` — path to the session workspace if available
- `session.rpc` — low-level typed RPC access

## Shelling out from extensions

Extensions are often thin wrappers around local scripts or CLIs. On Windows in particular:

```js
import { exec } from "node:child_process";

await new Promise((resolve) => {
  exec("node scripts/my-tool.mjs", (err, stdout, stderr) => {
    if (err) resolve(`Error: ${stderr || err.message}`);
    else resolve(stdout);
  });
});
```

Notes:
- Prefer `exec()` for `.cmd`/shell-style commands on Windows
- If using PowerShell explicitly:
  ```js
  powershell -NoProfile -Command ...
  ```
- Keep stdout clean inside the extension process itself; return tool output from handlers

## Gotchas

- **stdout is reserved for JSON-RPC** — do not use `console.log()`. Use `session.log()`.
- **Tool name collisions are fatal** — namespace your tools.
- **Extensions reload on `/clear`** — any in-memory state is lost.
- **Do not call `session.send()` synchronously from `onUserPromptSubmitted`** — use `setTimeout(..., 0)` if needed to avoid loops.
- **Project extensions shadow user extensions** on name collision.
- **Only immediate subdirectories of `.github/extensions/` are scanned**.

## What changed from the old pattern

The following are **stale for extensions** and should be removed on sight:
- `CopilotClient`
- `CopilotSession`
- `approveAll` as a required default for extensions
- `createSession(...)`
- `defineTool(...)`
- Scanning `~/.copilot/pkg` to import the SDK for extension code

Those belong to a different authoring model. For extensions, use `joinSession()` directly.

## SDK docs to read first

These ship with the installed CLI and are the source of truth:

```text
~/.copilot/pkg/universal/<version>/copilot-sdk/docs/extensions.md
~/.copilot/pkg/universal/<version>/copilot-sdk/docs/agent-author.md
~/.copilot/pkg/universal/<version>/copilot-sdk/docs/examples.md
```

For exact types, read:

```text
~/.copilot/pkg/universal/<version>/copilot-sdk/extension.d.ts
~/.copilot/pkg/universal/<version>/copilot-sdk/session.d.ts
~/.copilot/pkg/universal/<version>/copilot-sdk/types.d.ts
```
