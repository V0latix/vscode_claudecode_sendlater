# Prompt Queue + Usage Monitor

A VS Code extension that lets you **queue prompts for later delivery** (ideal when you hit a rate limit), **monitor your AI token usage** (Claude / OpenAI Codex), and **browse your Claude Code slash commands** — all directly in the editor.

---

## Features

### A — Send Prompt After Rate-Limit

Queue any prompt now; the extension automatically creates a ready-to-use Markdown file in your workspace when the timer expires.

- Select text in any editor → **PromptQueue: Queue Prompt (Send Later)**
- Or paste from clipboard → **PromptQueue: Queue From Clipboard**
- Or take the whole current file → **PromptQueue: Queue From Current Editor**
- **Delay mode**: enter a delay in minutes (e.g. `30`)
- **At-time mode**: enter a target time directly (e.g. `22:00`) — automatically rolls to the next day if the time has already passed
- Auto-detects "try again in X hours" / "resets at HH:MM" in clipboard text and pre-fills the delay
- File is created in `.prompt-queue/YYYYMMDD_HHMM_<id>.md` with a clean header
- Survives VS Code restarts (queue is persisted in global state)

### B — Token Usage Monitor

View your last-5-hour and last-7-day token consumption via a panel in the Activity Bar.

- **Claude** local history (reads `~/.claude/history.jsonl`)
- **OpenAI** usage via the organization Usage API
- **Anthropic** usage via the Admin API
- **Local estimate** (no keys needed) — counts queued prompt tokens as a rough proxy

### C — Claude Commands Browser

Browse all your Claude Code slash commands (`/tools/…`, `/workflows/…`) directly in the sidebar.

- Scans `.claude/commands/**/*.md` in your workspace automatically
- Shows command name, category, and description (from YAML frontmatter)
- **Click** any command card to copy its slash path (e.g. `/tools/git-status`) to the clipboard
- **Search** to filter by name or description with live highlight
- **Open** button to view the full command file in the editor
- Refreshes on demand with the ↻ button

---

## Quick Start

### 1. Install and Open

```bash
# From source
npm install
```

Press **F5** → a new VS Code Extension Development Host opens.

Click the **clock icon** in the Activity Bar to open the *Prompt Queue* panel.

### 2. Queue a Prompt

1. Write or select your prompt in any editor.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **PromptQueue: Queue Prompt (Send Later)**.
4. Enter a delay in minutes (`30`) **or** a specific time (`22:00`).
5. Confirmation: *"Prompt queued for 2024-06-15 22:00 [id: abc12345]"*.

When the time arrives, a file appears in `.prompt-queue/` and a notification pops up.

### 3. Configure API Keys (optional, for accurate usage data)

Keys are stored in VS Code **SecretStorage** — never written to `settings.json` or disk in plain text.

#### OpenAI

1. Get an **organization admin key** from [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys).
   *(Standard project keys `sk-proj-…` cannot access the usage endpoint.)*
2. Run: **Usage: Set OpenAI API Key (Secret)** from the Command Palette.
3. Optionally set `openai.orgId` and `openai.projectId` in Settings.

#### Anthropic

1. Get an **admin API key** from [console.anthropic.com](https://console.anthropic.com).
2. Run: **Usage: Set Anthropic Admin API Key (Secret)**.
3. If your org requires it, set `anthropic.orgId` in Settings.

---

## Commands

| Command | Description |
|---|---|
| `PromptQueue: Queue Prompt (Send Later)` | Queue from selection or input box |
| `PromptQueue: Queue From Clipboard` | Queue current clipboard content |
| `PromptQueue: Queue From Current Editor` | Queue entire file (or selection) |
| `PromptQueue: I'm Rate Limited — Queue for Later` | Smart flow: auto-detects reset time from clipboard/editor |
| `PromptQueue: Process Queue Now` | Force-process all due items immediately |
| `Usage: Refresh` | Fetch latest usage from all providers |
| `Usage: Show Summary` | Show usage summary in a side panel |
| `Usage: Set OpenAI API Key (Secret)` | Store OpenAI key in SecretStorage |
| `Usage: Set Anthropic Admin API Key (Secret)` | Store Anthropic key in SecretStorage |
| `Usage: Clear OpenAI API Key` | Remove OpenAI key |
| `Usage: Clear Anthropic Admin API Key` | Remove Anthropic key |
| `Usage: Calibrate Limits from claude.ai %` | Set token limits from your claude.ai usage percentage |

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `promptQueue.defaultDelayMinutes` | `30` | Default delivery delay (minutes) |
| `promptQueue.outputDir` | `.prompt-queue` | Workspace-relative output directory |
| `promptQueue.filenameTemplate` | `{timestamp}_{id}.md` | Filename template (`{timestamp}` = `YYYYMMDD_HHMM`, `{id}` = 8-char hex) |
| `openai.orgId` | `` | OpenAI Organization ID (optional) |
| `openai.projectId` | `` | OpenAI Project ID (optional) |
| `anthropic.orgId` | `` | Anthropic Org/Workspace ID (optional) |
| `usage.refreshIntervalMinutes` | `10` | Auto-refresh interval; `0` = disabled |
| `claude.tokenLimit5h` | `0` | Claude token limit for the 5-hour window (set via Calibrate command) |
| `claude.tokenLimitWeekly` | `0` | Claude token limit for the weekly window (set via Calibrate command) |

---

## How It Works

### Queue persistence

Items are stored in `vscode.ExtensionContext.globalState` (a Memento backed by SQLite inside VS Code). They survive restarts and work across workspaces.

### Delivery

Every 60 seconds (and on activation), the extension checks whether any queued item's `notBefore` timestamp is in the past. For each due item it:

1. Resolves the target workspace folder.
2. Creates `<outputDir>/<filename>` via `workspace.fs` (works on Remote / WSL / SSH).
3. Handles filename collisions (`_2`, `_3`, …).
4. Marks the item as processed.
5. Shows an actionable notification.

If VS Code is closed when the time arrives, the item is processed on the **next activation**.

### Usage data

| Provider | Source | Keys needed |
|---|---|---|
| Claude Local | `~/.claude/history.jsonl` | None |
| OpenAI | `GET /v1/usage?date=…` (hourly buckets) | Org admin key |
| Anthropic | `GET /v1/organizations/{id}/usage` | Admin API key |
| Local Estimate | Queued prompts in store, ≈ chars/4 | None |

---

## Security

- **No secrets in settings.json** — all API keys use `vscode.SecretStorage` (OS keychain on macOS, Credential Manager on Windows, libsecret on Linux).
- **No telemetry** — this extension collects nothing.
- **No hard-coded credentials**.
- Network requests go only to `api.openai.com` and `api.anthropic.com` (when keys are configured).

---

## Development

```bash
# Install deps
npm install

# Compile (watch)
npm run watch

# Press F5 in VS Code to launch Extension Development Host

# Run unit tests
npm test

# Package as VSIX
npm run package
```

### Project structure

```
src/
  extension.ts               ← Activation, command wiring
  queue/
    QueueStore.ts            ← Persistent queue (globalState)
    QueueProcessor.ts        ← Timer + file delivery
  usage/
    IUsageProvider.ts        ← Interface + types
    ClaudeLocalProvider.ts   ← ~/.claude/history.jsonl reader
    OpenAIUsageProvider.ts
    AnthropicUsageProvider.ts
    LocalEstimateProvider.ts
    UsageService.ts          ← Aggregation + caching
  ui/
    UsageWebviewProvider.ts  ← Usage Monitor panel
    QueueWebviewProvider.ts  ← Prompt Queue panel (delay / at-time modes)
    ClaudeCommandsWebviewProvider.ts ← Claude Commands browser
  util/
    time.ts                  ← Pure time helpers + rate-limit parser
    crypto.ts                ← ID generation
    fs.ts                    ← workspace.fs helpers
  test/
    runTest.ts
    suite/
      time.test.ts
      queue.test.ts
```

---

## License

MIT
