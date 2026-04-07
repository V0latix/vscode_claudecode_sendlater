# Changelog

## [0.3.6] — 2026-04-07

### Added
- **Sparkline 7 jours** — Le panel Usage Monitor affiche désormais un histogramme journalier (7 barres) en plus du sparkline horaire 24h. Masqué automatiquement quand l'usage cumulé est nul (évite les faux positifs visuels).

### Changed
- **Rate-limit detection** — La grande carte "Rate Limit" en haut du panel Queue est remplacée par un bouton compact "⚡ Rate-limited?" intégré à la ligne de délai. Un clic déclenche `promptQueue.imRateLimited` pour auto-détecter le message de rate-limit depuis le presse-papier et pré-remplir le délai.

### Fixed
- **Sparkline 7d : barres fantômes** — Le rendu forçait une hauteur minimale de 1% même pour les valeurs nulles, affichant une activité fictive. Les jours sans token sont maintenant dessinés à hauteur 0 ; le bloc est masqué si tous les jours sont à zéro.
- **Version manifest** — `package.json` bumped de 0.3.5 à 0.3.6 (incohérence de versioning corrigée).

## [0.3.5] — 2026-04-04

### Added
- **Export de la queue** — Bouton ⬇ dans le header Queue + commande palette `PromptQueue: Export Queue to JSON`. Exporte les items en attente dans un fichier JSON portable (les champs machine-spécifiques `workspaceFolder`, `targetTerminalName`, `deliveryAttempts` sont retirés).
- **Import de la queue** — Bouton ⬆ + commande palette `PromptQueue: Import Queue from JSON`. Valide les champs obligatoires (`id`, `promptText`, `notBefore`) avant insertion ; resets les champs machine-spécifiques aux valeurs locales ; ignore les doublons.
- **Mode "Pause queue"** — Bouton ⏸/▶ dans le header Queue + commande `PromptQueue: Pause / Resume Queue Processing`. Suspend le processor sans vider la queue. État persisté dans `globalState` et restauré au redémarrage. Bannière d'avertissement affichée quand pausé.
- **Raccourcis clavier** — `Ctrl+Alt+R` / `Cmd+Alt+R` → `promptQueue.imRateLimited` (hors terminal) · `Ctrl+Alt+Q` / `Cmd+Alt+Q` → `promptQueue.queueFromEditor` (focus éditeur).

### Fixed
- **Import : validation stricte** — `isValidQueueItemShape()` rejette tout item sans `id`, avec `promptText` vide ou avec `notBefore` invalide, évitant un crash `isOverdue(new Date(undefined))`.
- **Import : champs machine réinitialisés** — `workspaceFolder` et `targetTerminalName` sont remis aux valeurs de la machine courante à l'import pour éviter un `NonRetryableDeliveryError` silencieux (terminal introuvable).
- **Pause : persistance** — `_paused` n'était que mémoriel ; l'état est maintenant écrit dans `context.globalState` à chaque toggle et relu au démarrage.
- **`forceDeliver` + pause** — le bouton ➤ affiche un tooltip explicite `"Force-send (bypasses pause)"` quand la queue est pausée, rendant le comportement délibéré visible.
- **Keybindings** — `Ctrl+Shift+R` remplacé par `Ctrl+Alt+R` (évite le conflit avec Reload Window) ; ajout de conditions `when` (`!terminalFocus` / `editorTextFocus`) pour ne pas interférer hors contexte éditeur.
- **Indirection executeCommand supprimée** — export/import implémentés directement dans `QueueWebviewProvider.exportQueue()` / `importQueue()` ; les commandes de la palette délèguent au provider (pas de race condition au démarrage).
- **Toast CSS dark-mode** — les fallbacks `#1b4b6e` / `#5a4b00` (couleurs dark-mode) remplacés par `var(--vscode-inputValidation-infoBackground/warningBackground)` qui s'adaptent aux thèmes clairs.
- **Thème adaptatif** — `isValidQueueItemShape` exportée comme fonction testable depuis `QueueStore.ts`.

### Tests
- 18 nouveaux tests unitaires (`src/test/suite/p3features.test.ts`) : 12 tests `isValidQueueItemShape` (champs manquants, vides, dates invalides, shape portable) + 6 tests `QueueProcessor.pause` (état initial, toggle, double-toggle, `process()` retourne 0, `process()` reprend après resume, `onDidChange` déclenché).

## [0.3.4] — 2026-04-04

### Fixed
- **`detectWindowStart` extraction** — la fonction de détection de fenêtre de taux est désormais une fonction pure exportée depuis `src/util/windowDetection.ts` (au lieu d'une méthode privée non testable dans `ClaudeLocalProvider`). Les tests ciblent maintenant la vraie implémentation.
- **Effet de bord supprimé** — l'effacement de `_windowHint` après expiration a été déplacé dans `fetchUsage()` ; `detectWindowStart` reste une fonction pure sans mutation de l'état.
- **Debounce sur `setWindowHint()`** — `UsageService.setWindowHint()` ignore les appels concurrents (flag `_refreshing`) pour éviter les refreshs empilés lors de messages rate-limit rapprochés.
- **Affichage "fresh window" trompeur** — le compteur de fenêtre affiche désormais `"—"` (aucun historique) quand aucun token 7j n'est détecté, au lieu de `"fresh window"` qui suggérait incorrectement une fenêtre active vide.

### Tests
- Les tests de détection de fenêtre (suite `detectWindowStart`) importent et appellent la vraie fonction exportée ; les deux tests de hint testent maintenant le comportement réel (hint futur prioritaire, hint expiré ignoré).

## [0.3.3] — 2026-04-04

### Added
- **GitHub Actions CI** — `.github/workflows/ci.yml` : compile + test (headless via `xvfb-run`) sur chaque push/PR vers `main`.
- **GitHub Actions publish** — `.github/workflows/publish.yml` : publication automatique sur VS Code Marketplace (`vsce publish`, secret `VSCE_PAT`) et Open VSX (`ovsx publish`, secret `OVSX_PAT`) à chaque tag `v*`.
- **README badges** — CI status, Marketplace version, installs et rating.
- **Retry de livraison exponentiel** — le `QueueProcessor` retente la livraison jusqu'à `promptQueue.maxDeliveryRetries` fois (défaut 3) avec backoff 60 s / 120 s / 240 s quand le terminal cible est introuvable. Erreur finale affichée uniquement après épuisement des tentatives.
- **Log de livraison** — historique des 20 derniers items livrés (timestamp, statut, preview) persisté dans `globalState` et affiché dans la section "Delivery History" de la webview Queue.
- **Confirmation de réception (best-effort)** — après `terminal.sendText()`, vérification de `terminal.exitStatus` ; avertissement si le processus terminal est déjà sorti.
- **Alerte clé API invalide** — quand un provider retourne HTTP 401/403, une notification VS Code actionnable propose directement de mettre à jour la clé (affiché une seule fois par session).
- **Validation des IDs de configuration** — `openai.orgId` et `openai.projectId` sont validés par pattern JSON Schema dans les Settings (`org-…` / `proj-…`), avec message d'erreur inline.

### Removed
- **Fichiers legacy supprimés** — `src/ui/QueueViewProvider.ts` et `src/ui/UsageViewProvider.ts` (tree-views remplacées par les webviews depuis v0.2.0).

### Tests
- 30 nouveaux tests unitaires (`src/test/suite/p2features.test.ts`) : validation des patterns org/project ID, delivery log (cap 20, newest-first, statuts), `deliveryAttempts`, calcul du backoff exponentiel, détection de clé invalide (401/403).

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
