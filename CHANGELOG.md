# Changelog

## [Unreleased]

### Added
- **GitHub Actions CI** — `.github/workflows/ci.yml` : compile + test (headless via `xvfb-run`) sur chaque push/PR vers `main`.
- **GitHub Actions publish** — `.github/workflows/publish.yml` : publication automatique sur VS Code Marketplace (`vsce publish`, secret `VSCE_PAT`) et Open VSX (`ovsx publish`, secret `OVSX_PAT`) à chaque tag `v*`.
- **README badges** — CI status, Marketplace version, installs et rating.

## [0.3.2] — 2026-04-03

### Added
- **Queue — Aperçu du prompt** — le texte de chaque item affiché jusqu'à 200 caractères, avec expand/collapse au clic sur la prévisualisation.
- **Queue — Badge de notification** — le nombre de prompts en attente s'affiche en badge sur l'icône de la vue Activity Bar (via `viewBadge` API, VS Code ≥ 1.83).
- **Queue — Terminal nommé** — nouveau paramètre `promptQueue.targetTerminalName` pour forcer la livraison vers un terminal spécifique (priorité absolue sur la détection heuristique).
- **Usage Monitor — Alertes de quota** — notification VS Code `showWarningMessage` quand l'usage 5h dépasse le seuil configurable `usage.quotaAlertThreshold` (défaut 80 %). Ne se déclenche pas deux fois pour le même pourcentage.
- **Usage Monitor — Sparkline 24h** — graphique en barres des 24 dernières heures dans le panneau Usage, alimenté par les données JSONL locales de Claude Code CLI.
- **Usage Monitor — Breakdown par modèle** — répartition des tokens 7j par modèle (claude-3-5-sonnet, opus, haiku…) affichée avec mini-barres de progression dans le panneau Usage.
- **Claude Commands — Prévisualisation inline** — bouton 👁 `preview` sur chaque commande avec fichier source : ouvre un panneau WebView côte à côte avec le contenu markdown rendu (sans ouvrir le fichier brut).
- **Claude Commands — Créer une commande** — bouton `＋` dans la barre de recherche : demande un nom, génère `.claude/commands/<nom>.md` avec un template YAML frontmatter pré-rempli et l'ouvre dans l'éditeur.

### Tests
- 25 nouveaux tests unitaires (`src/test/suite/p1features.test.ts`) : frontmatter, logique bucket horaire, validation du nom de commande, troncature preview 200 chars, logique quota alert.

## [0.3.1] — 2026-04-03

### Added
- **Claude Commands browser — agents & skills** — scans `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` (workspace + global `~/.claude/`) and displays them with dedicated badges (🤖 agents, ⚡ skills).
- **MCP server discovery** — reads `~/.claude/mcp.json` and workspace `.claude/settings.json` to list configured MCP servers (🔗 mcp category).

### Fixed
- `datesInRange` now uses UTC methods (`setUTCHours`) to avoid a timezone-induced off-by-one that added an extra day when the host timezone is ahead of UTC.

### Tests
- 29 new unit tests covering `parseFrontmatterDescription`, `scanAgents`, `scanSkills`, and `scanMcpServers` (`src/test/suite/commands.test.ts`).

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
