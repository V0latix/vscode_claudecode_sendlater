# TODO — Propositions d'améliorations

> Pistes d'évolution priorisées pour la v0.4.0 et au-delà.
> Statuts : `[ ]` à faire · `[~]` en cours · `[x]` terminé

---

## P0 — Bloquants publication Marketplace

- [ ] **Ajouter `media/icon.png`** — package.json référence une PNG qui n'existe pas (seulement SVG). Générer une PNG 128×128 depuis l'SVG existant (`sharp` ou `imagemagick`).
- [ ] **Corriger les dates placeholder dans CHANGELOG.md** — `2026-03-XX` / `2026-XX-XX` empêchent une lecture propre du changelog.
- [ ] **README Marketplace** — Ajouter captures d'écran annotées (queue UI, usage panel, command browser) et un GIF de démonstration du flow rate-limit.

---

## P1 — Fonctionnalités à fort impact

### Queue

- [ ] **Édition in-place** — Permettre de modifier le texte ou l'heure d'un item en attente directement dans la webview (double-clic ou bouton crayon). Actuellement impossible sans supprimer et recréer.
- [ ] **Snooze rapide** — Bouton "+15 min" et "+1h" sur chaque item de la liste pour repousser rapidement sans rouvrir le formulaire.
- [ ] **Aperçu du prompt** — Tooltip ou expand au survol d'un item pour voir les 200 premiers caractères sans ouvrir le fichier.
- [ ] **Badge de notification** — Afficher un badge sur l'icône de l'activity bar lors de la livraison d'un item (via `viewBadge` API, dispo depuis VS Code 1.83).
- [ ] **Support multi-terminal nommé** — Permettre à l'utilisateur de configurer le nom exact du terminal cible (`promptQueue.targetTerminalName`) plutôt que de dépendre de la détection heuristique.

### Usage Monitor

- [ ] **Alertes de quota** — Déclencher une notification VS Code (`vscode.window.showWarningMessage`) quand l'utilisation dépasse un seuil configurable (ex. 80 % sur 5h).
- [ ] **Sparkline historique** — Graphique en barres minimaliste des dernières 24h dans le panel usage (données déjà disponibles dans `~/.claude/projects/*.jsonl`).
- [ ] **Breakdown par modèle** — Le `ClaudeLocalProvider` lit déjà `model` dans les JSONL : afficher la répartition claude-3-5-sonnet / claude-opus / haiku dans le panel.

### Claude Commands Browser

- [ ] **Prévisualisation inline** — Afficher le contenu complet d'une commande dans un split editor au clic plutôt que d'ouvrir le fichier brut (meilleure lisibilité du markdown).
- [ ] **Créer une commande depuis le browser** — Bouton "+ New command" qui génère un fichier `.claude/commands/nom.md` avec un template YAML frontmatter pré-rempli.

---

## P2 — Qualité & robustesse

### Nettoyage technique

- [ ] **Supprimer les fichiers legacy inutilisés** — `src/ui/QueueViewProvider.ts` et `src/ui/UsageViewProvider.ts` sont des tree-views remplacées par les webviews. Ils alourdissent le bundle (~50 lignes de code mort).
- [ ] **Valider les IDs de configuration** — Ajouter une validation légère de format pour `openai.orgId` (`org-…`), `openai.projectId` (`proj-…`) et `anthropic.orgId` au moment de la saisie, avec message d'erreur clair.
- [ ] **Gestion de l'expiration de clé API** — Actuellement, une clé révoquée donne une erreur silencieuse. Afficher un message actionnable ("Votre clé OpenAI est invalide — mettre à jour ?") avec bouton direct.

### Livraison de prompt

- [ ] **Timeout de livraison configurable** — Le processor tente la livraison puis abandonne silencieusement. Ajouter un retry avec délai exponentiel (max 3 tentatives sur 3 min).
- [ ] **Log de livraison** — Garder un historique des 20 derniers items livrés (timestamp + statut) accessible depuis la webview pour diagnostiquer des problèmes.
- [ ] **Confirmation de réception** — Après `terminal.sendText()`, vérifier (best-effort via parseOutput si possible) que le CLI a bien reçu la commande, sinon signaler un avertissement.

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

- [ ] **GitHub Actions — CI** — Ajouter un workflow `.github/workflows/ci.yml` : `npm run compile` + lint sur chaque PR.
- [ ] **GitHub Actions — publish** — Workflow de publication automatique sur le Marketplace à chaque tag `v*` (via `vsce publish` avec secret `VSCE_PAT`).
- [ ] **Open VSX** — Publier sur open-vsx.org pour les utilisateurs VSCodium / Gitpod / Eclipse Theia.
- [ ] **Badges README** — Ajouter badges Marketplace (installs, rating, version) et CI status.

---

## Notes d'architecture futures

- **WebSocket / file-watch** plutôt que polling 60s — remplacer l'interval du `QueueProcessor` par un `fs.watch` sur le fichier de state pour réduire la latence de livraison à ~0.
- **Provider plugin system** — Exposer une API d'extension pour que des tiers puissent ajouter leurs propres providers de quota (ex. Gemini, Mistral) via `contributes.usageProviders`.
