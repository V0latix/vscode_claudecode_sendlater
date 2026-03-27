# PRD — Prompt Queue + Usage Monitor
> Créé le 2026-03-27 via /workflows/bmad-brownfield
> Version : 0.1.3

## Problème

Les développeurs utilisant des assistants IA (Claude Code CLI, Claude.ai, ChatGPT) se retrouvent régulièrement **rate-limités** : leur session expire ou leur quota est atteint, et ils doivent attendre avant de relancer un prompt. Le problème : ils oublient le contexte ou le prompt qu'ils voulaient envoyer, et perdent du temps à le reconstituer.

Par ailleurs, il n'existe pas de moyen simple dans VS Code de **suivre sa consommation de tokens** en temps réel, surtout pour Claude Code CLI qui n'expose pas de tableau de bord natif.

## Utilisateurs cibles

- Développeurs utilisant **Claude Code CLI** (principal)
- Développeurs utilisant **claude.ai** (navigateur)
- Développeurs utilisant **ChatGPT / OpenAI API** (secondaire)
- Utilisateurs VS Code souhaitant automatiser l'envoi de prompts différés

## Solution

Une extension VS Code qui :
1. **Met en file d'attente des prompts** avec un délai configurable — livraison sous forme de fichiers `.md` dans `.prompt-queue/`
2. **Détecte automatiquement le délai de rate limit** depuis le presse-papiers et pré-calcule le délai d'attente
3. **Monitore la consommation de tokens** en lisant les sessions locales Claude Code (sans credentials) et optionnellement via les APIs admin OpenAI/Anthropic

## Features livrées (v0.1.x)

### F1 — Queue de prompts
- [x] Commande `queuePrompt` : saisie texte + délai → enqueue
- [x] Commande `queueFromClipboard` : depuis le presse-papiers
- [x] Commande `queueFromEditor` : depuis le fichier actif
- [x] Polling 60s → livraison automatique dans `.prompt-queue/`
- [x] Persistance via `globalState` (survit aux redémarrages)
- [x] Panneau "Prompt Queue" (WebView) avec liste et actions

### F2 — Rate Limit Helper
- [x] Commande `imRateLimited` : parse le message de rate limit depuis le clipboard
- [x] `parseRateLimitMessage()` → détecte l'heure de reset, calcule le délai
- [x] Enqueue automatique avec le bon délai

### F3 — Usage Monitor
- [x] `ClaudeLocalProvider` : lit `~/.claude/projects/*.jsonl` — tokens réels, sans credentials
- [x] `OpenAIUsageProvider` : API admin OpenAI (optionnel)
- [x] `AnthropicUsageProvider` : API admin Anthropic (optionnel)
- [x] `LocalEstimateProvider` : estimation chars/4 depuis la queue
- [x] Panneau "Usage Monitor" (WebView) avec tokens 5h/7d et breakdown par modèle
- [x] Commande `usage.setLimits` : calibration depuis le % affiché sur claude.ai
- [x] Auto-refresh configurable (défaut : 10 min)

## Features planifiées

### F4 — Amélioration UX Queue
- [ ] Édition d'un item en attente (modifier le texte ou le délai)
- [ ] Notification au moment de la livraison (badge / toast)
- [ ] Visualisation du contenu d'un item sans quitter VS Code

### F5 — Amélioration Usage Monitor
- [ ] Graphique historique de consommation (sparkline)
- [ ] Alerte quand le quota approche d'un seuil configuré
- [ ] Support multi-workspace (agréger plusieurs projets Claude)

### F6 — Publication Marketplace
- [ ] Ajouter `media/icon.png` (actuellement manquant — seul SVG présent)
- [ ] Rédiger la page Marketplace (README enrichi, screenshots)
- [ ] Pipeline CI/CD pour publier automatiquement

## Métriques de succès

- Un prompt queué se retrouve bien dans `.prompt-queue/` dans la minute suivant `notBefore`
- `ClaudeLocalProvider` retourne des tokens cohérents avec les sessions réelles Claude Code
- Zéro dépendance runtime ajoutée (contrainte de légèreté)

## Contraintes

- VS Code engine `^1.85.0`
- Zéro dépendance npm runtime
- Doit fonctionner en Remote SSH, WSL, Codespaces
