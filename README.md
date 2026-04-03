# Prompt Queue + Usage Monitor

[![CI](https://github.com/V0latix/vscode_claudecode_sendlater/actions/workflows/ci.yml/badge.svg)](https://github.com/V0latix/vscode_claudecode_sendlater/actions/workflows/ci.yml)
[![Version](https://img.shields.io/visual-studio-marketplace/v/v0latix.prompt-queue-usage-monitor)](https://marketplace.visualstudio.com/items?itemName=v0latix.prompt-queue-usage-monitor)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/v0latix.prompt-queue-usage-monitor)](https://marketplace.visualstudio.com/items?itemName=v0latix.prompt-queue-usage-monitor)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/v0latix.prompt-queue-usage-monitor)](https://marketplace.visualstudio.com/items?itemName=v0latix.prompt-queue-usage-monitor)

> Queue prompts for later · Monitor AI token usage · Browse Claude slash commands

A VS Code extension built for developers who use Claude Code, Copilot, or any AI assistant with rate limits. When you're blocked, queue your next prompt — the extension delivers it automatically when the time comes.

---

## What it does

| Panel | Purpose |
|---|---|
| **Prompt Queue** | Queue prompts with a delay or at a specific time; auto-delivers to your Claude terminal |
| **Usage Monitor** | Track token consumption over 5h and 7-day windows without leaving VS Code |
| **Commands Browser** | Search and copy all your `.claude/commands/**/*.md` slash commands in one click |

---

## Installation

### From VSIX (recommended while in preview)

```bash
code --install-extension prompt-queue-usage-monitor-0.3.0.vsix
```

### From source

```bash
git clone <repo>
cd send_later_extension
npm install
npm run compile
```

Press **F5** to open the Extension Development Host.

---

## Usage

### Queue a prompt when you're rate-limited

The fastest path: hit a rate limit → run the smart command → done.

1. Copy the rate-limit message to your clipboard (e.g. *"Try again in 1h 30m"* or *"Resets at 22:00"*).
2. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3. Run **PromptQueue: I'm Rate Limited — Queue for Later**.
4. The extension parses the reset time automatically and pre-fills the delay. Confirm and queue.
5. When the timer fires, the prompt is sent directly to your Claude terminal — or written as a `.md` file in `.prompt-queue/` if no terminal is open.

You can also queue prompts manually:

- **Queue Prompt (Send Later)** — type or paste your prompt, set a delay in minutes (`30`) or a target time (`22:00`)
- **Queue From Clipboard** — queues the current clipboard content
- **Queue From Current Editor** — queues the whole file or your current selection

The queue **survives VS Code restarts** (persisted in global state).

---

### Monitor token usage

Open the **Prompt Queue** Activity Bar icon → click the **Usage** tab.

The panel shows:
- A progress bar for your **last 5 hours** of token usage
- A progress bar for your **last 7 days**
- Provider status (which data source is active)

No setup required: the **Claude Local** provider reads `~/.claude/projects/*.jsonl` automatically. For OpenAI or Anthropic admin data, add your keys (see below).

#### Calibrate limits from claude.ai

1. Open [claude.ai](https://claude.ai) and note the percentage shown (e.g. *"68% used"*).
2. Run **Usage: Calibrate Limits from claude.ai %**.
3. Enter the percentage — the extension back-calculates your token ceiling and stores it.

#### Set API keys (optional)

Keys are stored in VS Code **SecretStorage** (OS keychain) — never written to `settings.json`.

**OpenAI** — requires an organization admin key (`sk-org-…`), not a project key:
```
Usage: Set OpenAI API Key (Secret)
```

**Anthropic** — requires an admin API key from [console.anthropic.com](https://console.anthropic.com):
```
Usage: Set Anthropic Admin API Key (Secret)
```

---

### Browse Claude slash commands

Open the **Commands** tab in the Activity Bar panel.

- All `.claude/commands/**/*.md` files in your workspace are scanned automatically
- Commands are grouped by folder (category)
- **Click** a command card → slash path copied to clipboard (e.g. `/workflows/code-review`)
- **Search** filters by name and description with live highlight
- **Open** button opens the full command file in the editor
- **↻** button rescans the workspace

---

## All commands

| Command | Description |
|---|---|
| `PromptQueue: Queue Prompt (Send Later)` | Queue from selection or input |
| `PromptQueue: Queue From Clipboard` | Queue current clipboard |
| `PromptQueue: Queue From Current Editor` | Queue file or selection |
| `PromptQueue: I'm Rate Limited — Queue for Later` | Smart flow: parses reset time automatically |
| `PromptQueue: Process Queue Now` | Force-process all due items |
| `Usage: Refresh` | Fetch latest usage from all providers |
| `Usage: Show Summary` | Usage summary in a Markdown panel |
| `Usage: Calibrate Limits from claude.ai %` | Set token limits from the claude.ai percentage |
| `Usage: Set OpenAI API Key (Secret)` | Store OpenAI key in SecretStorage |
| `Usage: Set Anthropic Admin API Key (Secret)` | Store Anthropic key in SecretStorage |
| `Usage: Clear OpenAI API Key` | Remove stored OpenAI key |
| `Usage: Clear Anthropic Admin API Key` | Remove stored Anthropic key |

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `promptQueue.defaultDelayMinutes` | `30` | Default delivery delay in minutes |
| `promptQueue.outputDir` | `.prompt-queue` | Output directory (workspace-relative) |
| `promptQueue.filenameTemplate` | `{timestamp}_{id}.md` | Filename template — `{timestamp}` = `YYYYMMDD_HHMM`, `{id}` = 8-char hex |
| `openai.orgId` | — | OpenAI Organization ID (optional) |
| `openai.projectId` | — | OpenAI Project ID (optional) |
| `anthropic.orgId` | — | Anthropic Org/Workspace ID (optional) |
| `usage.refreshIntervalMinutes` | `10` | Auto-refresh interval; `0` = disabled |
| `claude.tokenLimit5h` | `0` | Claude 5h token ceiling (set via Calibrate command) |
| `claude.tokenLimitWeekly` | `0` | Claude weekly token ceiling (set via Calibrate command) |

---

## How it works

### Prompt delivery

Every 60 seconds (and on VS Code focus) the processor checks all queued items. For each due item:

1. **Finds your Claude terminal** — searches by name hint → "Claude" → any terminal containing "claude".
2. **If found** → sends the prompt via `terminal.sendText()` (bracketed paste, ESC-stripped).
3. **If not found** → creates a new terminal, saves prompt to a temp file, runs `claude "$(cat file)"`, cleans up.
4. Writes a `.md` file to `<outputDir>/` via `workspace.fs` (works on Remote / WSL / SSH).

If VS Code is closed when a prompt is due, it is delivered on the **next activation**.

### Rate-limit parser

The parser recognises patterns from Claude Code, Copilot, and generic API messages:

| Pattern example | Result |
|---|---|
| `resets at 22:30` | Absolute time → calculates delay to 22:30 |
| `try again in 1h 30m` | Relative → 90 min delay |
| `after 45 minutes` | Relative → 45 min delay |
| `for 30 seconds` | Relative → ~1 min delay |

A **5-minute safety buffer** is added automatically to every parsed delay.

### Usage providers

| Provider | Data source | Keys needed |
|---|---|---|
| **Claude Local** | `~/.claude/projects/*.jsonl` | None |
| **OpenAI** | `GET /v1/usage?date=…` (hourly buckets) | Org admin key |
| **Anthropic** | `GET /v1/organizations/{id}/usage` | Admin API key |
| **Local Estimate** | Queued prompts in store (≈ chars ÷ 4) | None |

---

## Security

- **No secrets in `settings.json`** — API keys use `vscode.SecretStorage` (OS keychain on macOS, Credential Manager on Windows, libsecret on Linux).
- **No telemetry** — nothing is collected or sent.
- **No hard-coded credentials**.
- Network requests go only to `api.openai.com` and `api.anthropic.com`, and only when keys are configured.

---

## Development

```bash
npm install          # install deps
npm run watch        # compile in watch mode
# Press F5 → Extension Development Host
npm test             # run unit tests (pure, no VS Code instance needed)
npx vsce package     # build .vsix
```

### Project structure

```
src/
  extension.ts                         ← Activation, command wiring
  queue/
    QueueStore.ts                      ← Persistent queue (globalState Memento)
    QueueProcessor.ts                  ← 60s interval + terminal delivery
  usage/
    IUsageProvider.ts                  ← Interface + shared types
    ClaudeLocalProvider.ts             ← ~/.claude/projects/*.jsonl reader
    OpenAIUsageProvider.ts             ← Admin usage API
    AnthropicUsageProvider.ts          ← Admin usage API
    LocalEstimateProvider.ts           ← chars/4 fallback
    UsageService.ts                    ← Aggregation + caching
  ui/
    QueueWebviewProvider.ts            ← Prompt Queue panel
    UsageWebviewProvider.ts            ← Usage Monitor panel
    ClaudeCommandsWebviewProvider.ts   ← Commands browser
  util/
    time.ts                            ← Time helpers + rate-limit parser
    crypto.ts                          ← 8-char hex ID generator
    fs.ts                              ← workspace.fs helpers
  test/
    suite/
      time.test.ts                     ← Pure unit tests
      queue.test.ts                    ← MockMemento queue tests
```

---

## License

MIT
