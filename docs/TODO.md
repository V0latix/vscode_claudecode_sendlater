# TODO — Propositions d'améliorations

> Pistes d'évolution priorisées pour la v0.4.0 et au-delà.
> Statuts : `[ ]` à faire · `[~]` en cours · `[x]` terminé

---

## P0 — Bloquants publication Marketplace

- [x] **Ajouter `media/icon.png`** — présent et fonctionnel.
- [x] **Corriger les dates placeholder dans CHANGELOG.md** — `0.2.0` → 2026-03-27, `0.1.1` → 2026-02-24.
- [x] **README Marketplace** — README entièrement reécrit : installation, usage détaillé, tableaux commandes/config, fonctionnement interne, sécurité.
- [ ] **Screenshots / GIF** — Captures d'écran annotées des 3 panels + GIF du flow rate-limit (à faire manuellement).

---

## P1 — Fonctionnalités à fort impact

### Queue

- [x] **Édition in-place** — Bouton ✏ sur chaque item ; ouvre un formulaire inline avec textarea + datetime-local. Sauvegarde via `editItem` → `QueueStore.update()`.
- [x] **Snooze rapide** — Boutons +15m et +1h sur chaque item. Reporte depuis `max(now, notBefore)` via `snoozeItem` → `QueueStore.update()`.
- [x] **Aperçu du prompt** — Tooltip ou expand au survol d'un item pour voir les 200 premiers caractères sans ouvrir le fichier.
- [x] **Badge de notification** — Afficher un badge sur l'icône de l'activity bar lors de la livraison d'un item (via `viewBadge` API, dispo depuis VS Code 1.83).
- [x] **Support multi-terminal nommé** — Permettre à l'utilisateur de configurer le nom exact du terminal cible (`promptQueue.targetTerminalName`) plutôt que de dépendre de la détection heuristique.

### Usage Monitor

- [x] **Alertes de quota** — Déclencher une notification VS Code (`vscode.window.showWarningMessage`) quand l'utilisation dépasse un seuil configurable (ex. 80 % sur 5h).
- [x] **Sparkline historique** — Graphique en barres minimaliste des dernières 24h dans le panel usage (données déjà disponibles dans `~/.claude/projects/*.jsonl`).
- [x] **Breakdown par modèle** — Le `ClaudeLocalProvider` lit déjà `model` dans les JSONL : afficher la répartition claude-3-5-sonnet / claude-opus / haiku dans le panel.

### Claude Commands Browser

- [x] **Prévisualisation inline** — Afficher le contenu complet d'une commande dans un split editor au clic plutôt que d'ouvrir le fichier brut (meilleure lisibilité du markdown).
- [x] **Créer une commande depuis le browser** — Bouton "+ New command" qui génère un fichier `.claude/commands/nom.md` avec un template YAML frontmatter pré-rempli.

---

## P2 — Qualité & robustesse

### Nettoyage technique

- [x] **Supprimer les fichiers legacy inutilisés** — `src/ui/QueueViewProvider.ts` et `src/ui/UsageViewProvider.ts` supprimés.
- [x] **Valider les IDs de configuration** — Pattern JSON schema (`org-…`, `proj-…`) dans `package.json` ; erreur inline dans l'UI Settings.
- [x] **Gestion de l'expiration de clé API** — `isInvalidKey` propagé depuis les providers (HTTP 401/403) ; `UsageService` affiche une notification actionnable avec bouton "Update key" (une fois par session).

### Livraison de prompt

- [x] **Retry avec délai exponentiel** — `QueueProcessor` retente jusqu'à `promptQueue.maxDeliveryRetries` fois (défaut 3) avec backoff 60s/120s/240s. Erreur finale affichée après épuisement des tentatives.
- [x] **Log de livraison** — `DeliveryLogEntry[]` persisté dans `globalState` (max 20 entrées, newest-first). Section "Delivery History" dans la webview Queue.
- [x] **Confirmation de réception (best-effort)** — Après `terminal.sendText()`, vérification de `terminal.exitStatus` ; warning si le processus est déjà sorti.

---

## P3 — Nouvelles fonctionnalités

- [ ] **Export de la queue** — Bouton "Export as JSON" pour sauvegarder les items en attente (backup ou migration entre workspaces).
- [ ] **Import de la queue** — Charger un JSON exporté précédemment.
- [ ] **Thème adaptatif** — Les webviews utilisent des couleurs CSS codées en dur par endroits. Migrer vers les variables CSS de VS Code (`--vscode-*`) pour respecter pleinement les thèmes custom.
- [ ] **Agrégation multi-workspace** — Le `UsageService` ne voit qu'un workspace. Permettre d'agréger l'usage de plusieurs dossiers de projets Claude (`~/.claude/projects/` liste tous les projets).
- [ ] **Mode "Pause queue"** — Bouton global pour suspendre le processor sans vider la queue (utile en réunion ou démo).
- [ ] **Raccourcis clavier** — Enregistrer des keybindings par défaut pour les commandes les plus fréquentes (`promptQueue.imRateLimited`, `promptQueue.queueFromEditor`).

---

## P4 — Publication & CI

- [x] **GitHub Actions — CI** — Workflow `.github/workflows/ci.yml` : compile + test (xvfb) sur push/PR vers main.
- [x] **GitHub Actions — publish** — Workflow `.github/workflows/publish.yml` : publish Marketplace + Open VSX sur tag `v*` (secrets `VSCE_PAT` + `OVSX_PAT`).
- [x] **Open VSX** — Inclus dans le workflow publish via `ovsx publish`.
- [x] **Badges README** — CI status + Marketplace version/installs/rating.
- [ ] **Créer les secrets GitHub** — Les workflows CI/publish sont prêts et le code est en place. Il reste uniquement à créer les deux secrets dans `GitHub → Settings → Secrets → Actions` :
  - `VSCE_PAT` : Personal Access Token Azure DevOps (dev.azure.com → User Settings → Personal Access Tokens → New Token → scope **Marketplace > Manage**). Attention : l'organisation doit être "All accessible organizations".
  - `OVSX_PAT` : Token Open VSX depuis open-vsx.org (compte gratuit → User Settings → Access Tokens).

---

## Notes d'architecture futures

- **WebSocket / file-watch** plutôt que polling 60s — remplacer l'interval du `QueueProcessor` par un `fs.watch` sur le fichier de state pour réduire la latence de livraison à ~0.
- **Provider plugin system** — Exposer une API d'extension pour que des tiers puissent ajouter leurs propres providers de quota (ex. Gemini, Mistral) via `contributes.usageProviders`.
