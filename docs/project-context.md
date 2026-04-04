# Project Context — Prompt Queue + Usage Monitor
> Mis à jour le 2026-04-04 — v0.3.5
> **Ce fichier est la constitution du projet. Le lire en premier avant tout développement.**

## Technology Stack & Versions

- Runtime : Node.js (via VS Code Extension Host)
- Type de projet : **VS Code Extension** (engine `^1.85.0`)
- Language : TypeScript 5.3.x (`strict: true`)
- Module system : CommonJS (`"module": "commonjs"`)
- Target : ES2020
- Tests : Mocha 10 + `@vscode/test-electron` (instance VS Code requise pour tests d'intégration)
- Packaging : `@vscode/vsce`
- Dépendances runtime : **aucune** — uniquement Node built-ins (`https`, `crypto`, `fs`, `os`, `path`) + API VS Code

## Structure du projet

```
src/
├── extension.ts                   ← activate/deactivate, câblage de toutes les commandes
├── queue/
│   ├── QueueStore.ts              ← persistance via globalState (clés: promptQueue.items, promptQueue.deliveryLog)
│   └── QueueProcessor.ts         ← polling 60s, livraison terminal, retry exponentiel, pause
├── usage/
│   ├── IUsageProvider.ts          ← interfaces: TokenUsage, ModelBreakdown, ProviderStatus, IUsageProvider
│   ├── ClaudeLocalProvider.ts     ← lit ~/.claude/projects/*/*.jsonl, détecte fenêtre 5h par gap
│   ├── OpenAIUsageProvider.ts     ← GET /v1/usage?date=, clé org admin (sk-org-…)
│   ├── AnthropicUsageProvider.ts  ← GET /v1/organizations/{orgId}/usage, clé admin
│   ├── LocalEstimateProvider.ts   ← estimation chars/4 depuis la queue (sans clé)
│   └── UsageService.ts            ← agrège providers, cache, émet onDidChange, setWindowHint
├── ui/
│   ├── UsageWebviewProvider.ts    ← WebviewViewProvider pour 'usageMonitorView'
│   ├── QueueWebviewProvider.ts    ← WebviewViewProvider pour 'promptQueueView'
│   └── ClaudeCommandsWebviewProvider.ts ← WebviewViewProvider pour 'claudeCommandsView'
├── util/
│   ├── time.ts                    ← formatTimestamp, isOverdue, parseRateLimitMessage, addHours/addMinutes, getWindowStart5h/7d
│   ├── windowDetection.ts         ← detectWindowStart() : algorithme pur de détection de fenêtre 5h par gap JSONL
│   ├── crypto.ts                  ← generateShortId() (randomBytes hex 8 chars)
│   └── fs.ts                      ← ensureDir, resolveCollision, writeText via workspace.fs
└── test/
    ├── runTest.ts                 ← runner @vscode/test-electron
    └── suite/
        ├── index.ts               ← Mocha, fs.readdirSync récursif (pas de glob)
        ├── time.test.ts           ← tests purs : parseRateLimitMessage, datesInRange, etc.
        ├── queue.test.ts          ← tests purs : QueueStore (mock Memento)
        ├── commands.test.ts       ← tests purs : parseFrontmatterDescription, scanAgents, scanSkills, scanMcpServers
        ├── p1features.test.ts     ← tests purs : frontmatter, bucket horaire, quota alert, nom de commande
        ├── p2features.test.ts     ← tests purs : delivery log, deliveryAttempts, retry backoff, window detection, invalid key
        └── p3features.test.ts     ← tests purs : isValidQueueItemShape, QueueProcessor.pause
```

## Commandes VS Code

| Command ID | Titre | Keybinding | Description |
|------------|-------|------------|-------------|
| `promptQueue.queuePrompt` | Queue Prompt (Send Later) | — | Queue depuis sélection, clipboard ou input |
| `promptQueue.queueFromClipboard` | Queue From Clipboard | — | Queue directement depuis le presse-papiers |
| `promptQueue.queueFromEditor` | Queue From Current Editor | `Ctrl/Cmd+Alt+Q` (éditeur) | Queue le contenu ou la sélection du fichier actif |
| `promptQueue.imRateLimited` | I'm Rate Limited — Queue for Later | `Ctrl/Cmd+Alt+R` (hors terminal) | Parse le message de rate limit, guide le flow complet |
| `promptQueue.processNow` | Process Queue Now | — | Force le traitement immédiat des items dus |
| `promptQueue.exportQueue` | Export Queue to JSON | — | Exporte les items pending dans un fichier JSON portable |
| `promptQueue.importQueue` | Import Queue from JSON | — | Importe des items depuis un JSON (valide + déduplique) |
| `promptQueue.togglePause` | Pause / Resume Queue Processing | — | Suspend/reprend le processor (persisté dans globalState) |
| `usage.refresh` | Refresh Usage | — | Force le rechargement des données d'usage |
| `usage.showSummary` | Show Usage Summary | — | Affiche un résumé dans un panneau WebView |
| `usage.setOpenAIKey` | Set OpenAI API Key (Secret) | — | Stocke dans SecretStorage |
| `usage.clearOpenAIKey` | Clear OpenAI API Key | — | Supprime la clé de SecretStorage |
| `usage.setAnthropicKey` | Set Anthropic Admin API Key (Secret) | — | Stocke dans SecretStorage |
| `usage.clearAnthropicKey` | Clear Anthropic Admin API Key | — | Supprime la clé de SecretStorage |
| `usage.setLimits` | Calibrate Limits from claude.ai % | — | Configure les limites depuis le % affiché sur claude.ai |

## Settings

| Clé | Défaut | Description |
|-----|--------|-------------|
| `promptQueue.defaultDelayMinutes` | `30` | Délai par défaut en minutes |
| `promptQueue.outputDir` | `.prompt-queue` | Dossier de livraison (relatif au workspace) |
| `promptQueue.filenameTemplate` | `{timestamp}_{id}.md` | Template de nom de fichier livré |
| `promptQueue.targetTerminalName` | `""` | Nom exact du terminal cible (vide = auto-détection) |
| `promptQueue.maxDeliveryRetries` | `3` | Tentatives de livraison max (backoff exponentiel 60s/120s/240s) |
| `openai.orgId` | `""` | ID organisation OpenAI (`org-…`) — validé par pattern JSON Schema |
| `openai.projectId` | `""` | ID projet OpenAI (`proj-…`) — validé par pattern JSON Schema |
| `anthropic.orgId` | `""` | ID organisation Anthropic |
| `usage.refreshIntervalMinutes` | `10` | Intervalle d'auto-refresh (0 = désactivé) |
| `usage.quotaAlertThreshold` | `80` | Seuil d'alerte quota en % (0 = désactivé) |
| `claude.tokenLimit5h` | `0` | Limite tokens fenêtre 5h (calibrée via commande setLimits) |
| `claude.tokenLimitWeekly` | `0` | Limite tokens hebdomadaire (calibrée via commande setLimits) |

## GlobalState Keys (persistance non-secrète)

| Clé | Type | Description |
|-----|------|-------------|
| `promptQueue.items` | `QueueItem[]` | Items de la queue (pending + processed récents) |
| `promptQueue.deliveryLog` | `DeliveryLogEntry[]` | Log des 20 dernières livraisons (newest-first) |
| `promptQueue.paused` | `boolean` | État pause du processor (restauré au démarrage) |

## Secret Storage Keys

| Clé | Provider |
|-----|----------|
| `openai.adminApiKey` | `OpenAIUsageProvider` |
| `anthropic.adminApiKey` | `AnthropicUsageProvider` |

## Interfaces principales

### `QueueItem` (QueueStore.ts)

```typescript
interface QueueItem {
  id: string;                     // 8-char hex (generateShortId)
  createdAt: string;              // ISO 8601
  notBefore: string;              // ISO 8601 — ne pas livrer avant
  promptText: string;             // Texte complet du prompt
  workspaceFolder: string;        // Chemin absolu du workspace (ou '')
  processed: boolean;             // Livré ou non
  targetTerminalName?: string;    // Hint de terminal (au moment de l'enqueue)
  deliveryAttempts?: number;      // Nb de tentatives échouées (backoff)
}
```

### `DeliveryLogEntry` (QueueStore.ts)

```typescript
interface DeliveryLogEntry {
  itemId: string;
  timestamp: string;              // ISO 8601
  status: "delivered" | "failed";
  error?: string;                 // Message d'erreur si status = failed
  promptPreview: string;          // 80 premiers chars du prompt
}
```

### `TokenUsage` (IUsageProvider.ts)

```typescript
interface TokenUsage {
  tokensLast5h: number;
  tokensLast7d: number;
  lastUpdated: Date;
  error?: string;
  isInvalidKey?: boolean;         // HTTP 401/403 → déclenche notification
  breakdown?: ModelBreakdown[];   // Répartition par modèle
  hourlyLast24h?: number[];       // 24 buckets pour sparkline
  currentWindowStart?: Date;      // Début de la fenêtre 5h en cours
  currentWindowEnd?: Date;        // Fin estimée de la fenêtre 5h
}
```

## Critical Implementation Rules

### TypeScript
- `strict: true` partout — `any` interdit, utiliser `unknown` + type guards
- Imports : chemins relatifs (`./queue/QueueStore`)
- Pas d'alias `@/`
- `esModuleInterop: true`, `resolveJsonModule: true`

### Patterns Obligatoires
- **Pas de dépendances runtime** — uniquement Node built-ins et l'API VS Code
- **Pas de `glob`** — utiliser `fs.readdirSync` (le paquet a été retiré)
- **Error handling** : `try/catch` + log dans OutputChannel, jamais de throw silencieux
- **Async** : async/await partout, pas de callbacks
- **Persistance** : `context.globalState` pour la queue/pause, `context.secrets` pour les clés API
- **Fichiers livrés** : `terminal.sendText()` vers le terminal Claude actif (pas `workspace.fs.writeFile`)
- **Export/Import JSON** : `vscode.workspace.fs.writeFile/readFile` + `isValidQueueItemShape()` pour validation

### Window Detection (ClaudeLocalProvider)
L'algorithme de détection de fenêtre 5h est dans `src/util/windowDetection.ts` (fonction pure `detectWindowStart`).
- Scanne les entrées JSONL triées par timestamp
- Un gap ≥ 5h entre deux entrées consécutives = reset de la fenêtre
- Une `windowHint` injectée via `setWindowHint(resetAt)` prend la priorité si elle est dans le futur
- `ClaudeLocalProvider.fetchUsage()` efface le hint expiré après appel (séparation pure/impure)

### Organisation des tests
- Tests purs (sans dep vscode) : `time.test.ts`, `queue.test.ts`, `commands.test.ts`, `p1features.test.ts`, `p2features.test.ts`, `p3features.test.ts`
- Tests d'intégration : nécessitent `@vscode/test-electron` (instance VS Code réelle)
- `MockMemento` pour simuler `globalState`

### Ce qu'il NE FAUT PAS faire
- Ajouter des dépendances npm (même légères) — zéro dep runtime
- Utiliser `glob` (retiré — utiliser `fs.readdirSync`)
- Utiliser les clés projet OpenAI (sk-proj-…) pour l'usage API — il faut une clé org admin (sk-org-…)
- Utiliser l'endpoint Anthropic usage pour des utilisateurs Claude Code CLI (ils n'ont pas de clé admin)
- Lire directement stdout/stderr du terminal — impossible en VS Code Extension
- Appeler `terminal.sendText()` sans vérifier `terminal.exitStatus` au préalable (zombie terminal)

## Flow Rate Limit (complet)

```
1. Utilisateur rate-limité → copie le message d'erreur → commande imRateLimited
2. Lit presse-papiers → parseRateLimitMessage(text) → RateLimitInfo { delayHours, resetAt, confidence }
3. Propose un délai pré-calculé à l'utilisateur (QuickPick)
4. Enqueue avec notBefore = now + délai
5. Si resetAt présent → usageService.setWindowHint(resetAt) → refresh immédiat du panel Usage
```

## Flow Livraison (QueueProcessor)

```
QueueProcessor.process() [60s interval + focus window]:
  Si _paused → return 0
  Pour chaque item due (notBefore ≤ now):
    deliver(item):
      Si targetTerminalName configuré mais terminal absent → NonRetryableDeliveryError
      Trouve terminal Claude (priority: config > hint > name "Claude" > contains "claude" > active)
      Vérifie terminal.exitStatus avant sendText (zombie terminal → warning)
      terminal.sendText(sanitizedPrompt, false) + sendText("\r", false)
      store.addDeliveryLogEntry({ status: "delivered" }) AVANT store.remove (atomicité)
    Sur erreur transiente → backoff exponentiel (60s, 120s, 240s) jusqu'à maxDeliveryRetries
    Sur NonRetryableDeliveryError → garder en queue, notifier l'utilisateur
```

## Commandes utiles

```bash
npm install          # Installer les dépendances dev
npm run compile      # tsc -p ./ → out/
npm run watch        # tsc en mode watch
npm test             # Compiler + lancer les tests (nécessite VS Code)
npm run package      # vsce package → .vsix
npx vsce package     # Package avec vsce directement
```
