# Changelog

## [0.3.0] — 2026-04-03

### Added
- **At-time scheduling** in the Queue panel — toggle `[In X min] / [At time]` to specify a target hour directly (e.g. `22:00`). Automatically rolls to the next day if the time has already passed. Mode and value are persisted across sessions.
- When a rate-limit `resetAt` is detected, the panel now auto-switches to "At time" mode and pre-fills the exact hour.
- `enqueuePrompt` command now accepts `HH:MM` format in addition to minutes.
- **Claude Commands browser** — new `claudeCommandsView` panel in the Activity Bar sidebar. Scans `.claude/commands/**/*.md`, parses YAML frontmatter `description`, and displays commands grouped by category with live search, highlight, copy-to-clipboard on click, and open-file action.

## [0.2.0] — 2026-03-27

### Added
- Webview-based Queue panel (`QueueWebviewProvider`) replacing the tree-view approach — full form with rate-limit detection card, prompt textarea, and live queue list.
- Webview-based Usage Monitor panel (`UsageWebviewProvider`) with progress bars, limit calibration, and provider status.
- Claude local usage provider (`ClaudeLocalProvider`) reading `~/.claude/history.jsonl` — no API keys required.
- `promptQueue.imRateLimited` command — smart flow that auto-parses clipboard/editor/pasted text for reset times and walks the user through queuing.
- Rate-limit message parser (`parseRateLimitMessage`) handling Claude Code, Copilot, and generic formats (absolute times, relative durations, seconds).
- `Usage: Calibrate Limits from claude.ai %` command to set token limits from the claude.ai usage percentage.
- Force-send and delete actions on individual queue items.
- Queue processing triggered on VS Code window focus (handles wake-from-sleep).

### Changed
- Default delay unit changed from hours to **minutes** (`promptQueue.defaultDelayMinutes`, default `30`).

## [0.1.1] — 2026-02-24

### Fixed
- Queue processing reliability improvements.
- ID generation fix.

## [0.1.0] — Initial release

- Queue prompts for delayed delivery as `.md` files in `.prompt-queue/`.
- OpenAI and Anthropic usage providers (admin API keys).
- Local token estimate provider.
- Tree-view panels for queue and usage.
