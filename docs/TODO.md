# TODO — Propositions d'améliorations

> Pistes d'évolution priorisées pour la v0.4.0 et au-delà.
> Statuts : `[ ]` à faire · `[~]` en cours · `[x]` terminé

---

## P0 — Bloquants publication Marketplace

- [x] **Ajouter `media/icon.png`** — présent et fonctionnel.
- [x] **Corriger les dates placeholder dans CHANGELOG.md** — `0.2.0` → 2026-03-27, `0.1.1` → 2026-02-24.
- [x] **README Marketplace** — README entièrement reécrit : installation, usage détaillé, tableaux commandes/config, fonctionnement interne, sécurité.
- [ ] **Screenshots / GIF** — Captures d'écran annotées des 3 panels + GIF du flow rate-limit (à faire manuellement).
- [ ] **Créer les secrets GitHub** — Les workflows CI/publish sont prêts. Il reste à créer dans `GitHub → Settings → Secrets → Actions` :
  - `VSCE_PAT` : Personal Access Token Azure DevOps (scope **Marketplace > Manage**, org = "All accessible organizations").
  - `OVSX_PAT` : Token Open VSX depuis open-vsx.org.

---

## P1–P3 — Toutes terminées

Voir CHANGELOG v0.3.3–v0.3.5 pour le détail. Résumé des grandes features livrées :
- Queue : édition in-place, snooze, aperçu, badge, terminal nommé, retry exponentiel, log de livraison, export/import JSON, pause persistée.
- Usage Monitor : sparkline 24h, breakdown par modèle, alertes quota, détection fenêtre 5h par gap JSONL, hint rate-limit.
- Claude Commands Browser : preview inline, création de commande, scan agents/skills/MCP.
- CI/CD : GitHub Actions compile+test+publish.

---

## P4 — Personnalisation Claude Code

> **Contexte :** Claude Code stocke sa configuration dans `~/.claude/settings.json` (permissions, env vars, theme, co-author flag) et ses agents dans `~/.claude/agents/*.md` (frontmatter YAML : name, description, tools, model, color, permissionMode). Une UI VS Code pour gérer tout ça éviterait d'éditer ces fichiers à la main.

### Amélioration de l'UI

  - [x] **Retirer la partie haute du panel Prompt Queue** — La grande carte "Rate Limit" est remplacée par un bouton compact "⚡ Rate-limited?" intégré à la ligne de délai (v0.3.6).
  - [x] **Stats des tokens sur la semaine** — Sparkline 7 jours ajouté au panel Usage Monitor, en plus du sparkline horaire 24h. Masqué automatiquement si l'usage cumulé est nul (v0.3.6).

### Éditeur de settings Claude Code

  - [x] **Toggle `includeCoAuthoredBy`** — Checkbox dans le panel "Claude Settings" (v0.3.7).
  - [x] **`permissions.allow` / `permissions.deny`** — Listes éditables avec boutons +Add / ×Remove (v0.3.7).
  - [x] **Sélecteur de thème** — `light` / `dark` / `system` / *(not set)* — supprime la clé si non défini (v0.3.7).
  - [x] **Bouton "Ouvrir le fichier brut"** — Ouvre `~/.claude/settings.json` dans l'éditeur VS Code (v0.3.7).

### Agents Browser & Editor

- [ ] **Agent Browser étendu** — La vue Claude Commands scanne déjà `~/.claude/agents/*.md`. Amélioration : afficher les métadonnées complètes (model, tools, color, permissionMode) et trier par scope (global vs workspace).
- [ ] **Créer / éditer un agent** — Formulaire guidé pour générer ou modifier un fichier agent YAML+markdown :
  - Champs : `name`, `description`, `tools` (multi-select parmi Read/Write/Bash/Grep…), `model` (inherit/sonnet/opus/haiku), `color` (sélecteur visuel), `permissionMode`.
  - Aperçu du frontmatter généré en temps réel.
  - Validation : `name` doit être un slug alphanumérique.

### Buddy companion

- [ ] **Buddy Stats Widget** — Si `~/.claude/` contient des données buddy (généré par `/buddy` dans Claude Code ≥ 2.1.89 Pro), afficher dans le panel Usage :
  - Espèce + emoji + rareté (Common / Uncommon / Rare / Epic / Legendary).
  - Barre de 5 stats : DEBUGGING · PATIENCE · CHAOS · WISDOM · SNARK.
  - Lecture seule depuis le fichier de config buddy (pas de modification — les stats sont déterministes).
  - Masqué si aucun buddy détecté.

### Mémoire utilisateur CLAUDE.md

- [ ] **Éditeur CLAUDE.md global** — Ouvrir `~/.claude/CLAUDE.md` dans l'éditeur VS Code depuis la command palette (`Claude: Edit User Memory`). Crée le fichier s'il n'existe pas avec un template.
- [ ] **Ajouter un snippet à la mémoire** — Commande `Claude: Add to Memory` : envoie la sélection active (ou une saisie) en append dans `~/.claude/CLAUDE.md` avec un timestamp. Utile pour noter des préférences ou des règles importantes à la volée.

---

## P5 — Améliorations globales de l'extension

### Queue — robustesse & UX

- [ ] **File-watch sur QueueProcessor** — Remplacer le polling `setInterval(60s)` par `fs.watch` sur le fichier globalState (ou un fichier sentinel) pour une latence de livraison proche de 0. Garde le polling comme fallback.
- [ ] **Notification OS native** — Déclencher `vscode.window.showInformationMessage` + une notification système (via VS Code `vscode.env.openExternal` ou `node-notifier`) quand un prompt est livré, même si VS Code est en arrière-plan.
- [ ] **Prompts récurrents (CRON-lite)** — Permettre de configurer un item avec une répétition (`every: "1d"`, `"1w"`). À la livraison, un nouvel item est créé avec `notBefore = now + interval`.
- [ ] **Variables dans les prompts** — Support de tokens `{{FILE}}`, `{{SELECTION}}`, `{{WORKSPACE}}`, `{{DATE}}` dans le texte du prompt, résolus au moment de la livraison (pas de la mise en queue).

### Usage Monitor — précision & contexte

- [ ] **Projection de reset** — À partir des tokens courants et de l'heure de début de fenêtre, afficher "Reset estimé dans Xh" même sans message rate-limit reçu (calcul depuis `windowStart + 5h - now`). Déjà partiellement implémenté via `bestWindowEnd`.
- [ ] **Comparaison avec la veille** — Afficher `Δ vs yesterday` sur le compteur 5h (ex. +12% par rapport à la même heure hier) pour contextualiser l'usage.
- [ ] **Alertes visuelles inline** — Colorier le compteur de tokens en orange/rouge quand > 70%/90% du quota, sans nécessiter de popup.

### Claude Commands Browser — productivité

- [ ] **Exécuter une commande directement** — Bouton "Run" dans le browser : envoie `/command-name` au terminal Claude actif (via `terminal.sendText`) plutôt que de juste copier le nom.
- [ ] **Recherche full-text dans le contenu** — La recherche actuelle filtre sur le nom et la description. Étendre au corps du fichier markdown (utile pour retrouver une commande par un mot-clé dans son implémentation).
- [ ] **Sync bidirectionnelle** — Watcher `fs.watch` sur `.claude/commands/` pour que le browser se rafraîchisse automatiquement quand un fichier est créé/modifié/supprimé sans cliquer sur ↺.

### Architecture & qualité

- [ ] **WebSocket / IPC pour la livraison** — Remplacer le `terminal.sendText()` par une communication directe avec le processus Claude Code (si l'API le permet dans une future version) pour une livraison fiable sans dépendre du focus terminal.
- [ ] **Provider plugin system** — Exposer une contribution point `contributes.usageProviders` pour que des extensions tierces puissent ajouter des providers (Gemini, Mistral, Grok…) sans modifier cette extension.
- [ ] **Tests E2E avec @vscode/test-electron** — Les tests actuels sont des tests unitaires purs. Ajouter 2-3 tests E2E qui ouvrent une vraie fenêtre VS Code et valident les flux critiques (enqueue → process → delivery log).
- [ ] **Telemetry opt-in** — Compteur d'utilisation anonyme (nb de prompts livrés, providers configurés) via `vscode.env.isTelemetryEnabled`, pour prioriser les features futures.

---

## Notes d'architecture

- **File-watch vs polling** — `fs.watch` sur `~/.claude/projects/` permettrait de mettre à jour le Usage Monitor en temps réel sans attendre le refresh toutes les 10min.
- **Provider plugin system** — Déjà en roadmap. Design suggéré : `contributes.usageProviders` → tableau de `{ name, configKeys[], fetchUsage }`.
- **Agents + Commands unifiés** — Les agents (`~/.claude/agents/`) et les commands (`.claude/commands/`) sont conceptuellement similaires (fichiers markdown avec frontmatter). Envisager une vue unifiée "Claude Resources" avec tabs Agents / Commands / Skills / MCP.
