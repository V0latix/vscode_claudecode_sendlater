# Project Context — Prompt Queue + Usage Monitor
> Généré le 2026-03-27 via /workflows/bmad-brownfield
> **Ce fichier est la constitution du projet. Le lire en premier avant tout développement.**

## Technology Stack & Versions

- Runtime : Node.js (via VS Code Extension Host)
- Type de projet : **VS Code Extension** (engine `^1.85.0`)
- Language : TypeScript 5.3.x (strict: oui)
- Module system : CommonJS (`"module": "commonjs"`)
- Target : ES2020
- Tests : Mocha 10 + `@vscode/test-electron` (instance VS Code requise)
- Packaging : `@vscode/vsce`
- Dépendances runtime : **aucune** — uniquement Node built-ins (`https`, `crypto`, `fs`, `os`, `path`)

## Structure du projet

```
src/
├── extension.ts              ← activate/deactivate, câblage de toutes les commandes
├── queue/
│   ├── QueueStore.ts         ← persistance via globalState (key: promptQueue.items)
│   └── QueueProcessor.ts     ← polling 60s, livraison des fichiers via workspace.fs
├── usage/
│   ├── IUsageProvider.ts     ← interface: TokenUsage, ProviderStatus, IUsageProvider
│   ├── ClaudeLocalProvider.ts← lit ~/.claude/history.jsonl, estime les tokens
│   ├── OpenAIUsageProvider.ts← GET /v1/usage?date=, clé org admin
│   ├── AnthropicUsageProvider.ts ← GET /v1/organizations/{orgId}/usage, clé admin
│   ├── LocalEstimateProvider.ts  ← estimation chars/4 depuis la queue (sans clé)
│   └── UsageService.ts       ← agrège providers, cache, émet onDidChange
├── ui/
│   ├── UsageWebviewProvider.ts   ← WebviewViewProvider pour 'usageMonitorView'
│   ├── QueueWebviewProvider.ts   ← WebviewViewProvider pour 'promptQueueView' (797 lignes)
│   ├── UsageViewProvider.ts      ← TreeDataProvider legacy (usage)
│   └── QueueViewProvider.ts      ← TreeDataProvider legacy (queue)
├── util/
│   ├── time.ts               ← formatTimestamp, isOverdue, parseRateLimitMessage, addHours/addMinutes
│   ├── crypto.ts             ← generateShortId (randomBytes hex)
│   └── fs.ts                 ← ensureDir, resolveCollision, writeText via workspace.fs
└── test/
    ├── runTest.ts             ← runner @vscode/test-electron
    └── suite/
        ├── index.ts           ← Mocha, fs.readdirSync (pas de glob)
        ├── time.test.ts       ← tests purs (pas de dep vscode)
        └── queue.test.ts      ← mock Memento, pas de dep vscode
```

## Commandes VS Code

| Command ID | Titre | Description |
|------------|-------|-------------|
| `promptQueue.queuePrompt` | Queue Prompt (Send Later) | Queue depuis sélection, clipboard ou input |
| `promptQueue.queueFromClipboard` | Queue From Clipboard | Queue directement depuis le presse-papiers |
| `promptQueue.queueFromEditor` | Queue From Current Editor | Queue le contenu du fichier actif |
| `promptQueue.imRateLimited` | I'm Rate Limited — Queue for Later | Parse le message de rate limit, calcule le délai |
| `promptQueue.processNow` | Process Queue Now | Force le traitement immédiat de la queue |
| `usage.refresh` | Refresh Usage | Force le rechargement des données d'usage |
| `usage.showSummary` | Show Usage Summary | Affiche un résumé dans une notification |
| `usage.setOpenAIKey` | Set OpenAI API Key (Secret) | Stocke dans SecretStorage |
| `usage.setAnthropicKey` | Set Anthropic Admin API Key (Secret) | Stocke dans SecretStorage |
| `usage.setLimits` | Calibrate Limits from claude.ai % | Configure les limites depuis le % affiché sur claude.ai |

## Settings

| Clé | Défaut | Description |
|-----|--------|-------------|
| `promptQueue.defaultDelayMinutes` | 30 | Délai par défaut en minutes |
| `promptQueue.outputDir` | `.prompt-queue` | Dossier de livraison (relatif au workspace) |
| `promptQueue.filenameTemplate` | `{timestamp}_{id}.md` | Template de nom de fichier |
| `openai.orgId` | — | ID d'organisation OpenAI |
| `openai.projectId` | — | ID de projet OpenAI |
| `anthropic.orgId` | — | ID d'organisation Anthropic |
| `usage.refreshIntervalMinutes` | 10 | Intervalle d'auto-refresh (0 = désactivé) |
| `claude.tokenLimit5h` | 0 | Limite tokens fenêtre 5h (calibrée via commande) |
| `claude.tokenLimitWeekly` | 0 | Limite tokens hebdomadaire |

## Secret Storage Keys

| Clé | Fournisseur |
|-----|-------------|
| `openai.adminApiKey` | OpenAIUsageProvider |
| `anthropic.adminApiKey` | AnthropicUsageProvider |

## Critical Implementation Rules

### TypeScript
- `strict: true` partout — `any` interdit, utiliser `unknown` + type guards
- Imports : chemins relatifs (`./queue/QueueStore`)
- Pas d'alias `@/` — paths simples
- `esModuleInterop: true`, `resolveJsonModule: true`

### Patterns Obligatoires
- **Pas de dépendances runtime** — uniquement Node built-ins et l'API VS Code
- **Pas de `glob`** — utiliser `fs.readdirSync` (le paquet a été retiré)
- **Error handling** : `try/catch` + log dans OutputChannel, jamais de throw silencieux
- **Async** : async/await partout, pas de callbacks
- **Persistance** : `context.globalState` pour la queue, `context.secrets` pour les clés API
- **Fichiers** : `vscode.workspace.fs` pour écrire les fichiers livrés (cross-platform)

### Organisation des tests
- Tests purs (pas de dep vscode) → peuvent tourner avec mocha directement
- Tests avec dep vscode → nécessitent `@vscode/test-electron` (instance VS Code réelle)
- Pas de mocks vscode — utiliser `MockMemento` pour globalState

### Ce qu'il NE FAUT PAS faire
- Ajouter des dépendances npm (même légères) — zéro dep runtime est une contrainte forte
- Utiliser `glob` (retiré — utiliser `fs.readdirSync`)
- Utiliser les clés projet OpenAI (sk-proj-…) pour l'usage API — il faut une clé org admin (sk-org-…)
- Utiliser l'endpoint Anthropic usage pour des utilisateurs Claude Code CLI (ils n'ont pas de clé admin)
- Lire directement stdout/stderr du terminal — impossible en VS Code Extension

## Flow Rate Limit

Le flow `promptQueue.imRateLimited` :
1. Lit le presse-papiers (texte du message de rate limit)
2. `parseRateLimitMessage()` dans `time.ts` → retourne `RateLimitInfo { delayHours, resetAt, rawMatch, confidence }`
3. Propose un délai pré-calculé à l'utilisateur
4. Enqueue avec `notBefore = now + délai`

## Commandes utiles

```bash
npm install          # Installer les dépendances dev
npm run compile      # tsc -p ./ → out/
npm run watch        # tsc en mode watch
npm test             # Compiler + lancer les tests (nécessite VS Code)
npm run package      # vsce package --no-dependencies → .vsix
```

## Historique récent

| Commit | Message |
|--------|---------|
| bf39d51 | /r |
| 838266c | Debug |
| 70cc981 | 0.1.1 |
| 3d65ea5 | Correction queue |
| b9aff87 | Usage Limite |
| ccff1e9 | ID |
| 432f65b | Initial commit |
