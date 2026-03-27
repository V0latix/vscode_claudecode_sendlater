# Rapport Brownfield — Prompt Queue + Usage Monitor
> Généré le 2026-03-27 via /workflows/bmad-brownfield

## État des artifacts BMAD

| Artifact | Statut | Action |
|----------|--------|--------|
| `docs/project-context.md` | ✅ Créé | — |
| `docs/architecture.md` | ✅ Créé | — |
| `docs/prd.md` | ✅ Créé | — |
| `docs/epic-01-queue-core.md` | ✅ Créé | — |
| `docs/epic-02-usage-monitor.md` | ✅ Créé | — |
| `docs/epic-03-ux-improvements.md` | ✅ Créé | — |
| `docs/epic-04-marketplace.md` | ✅ Créé | — |
| Stories | ⬜ Non créées individuellement | → utiliser `/tools/bmad-story` |

## État du codebase

- Fichiers TypeScript : 20 (hors tests)
- Fichiers de test : 2 (time.test.ts, queue.test.ts)
- Couverture de tests : non mesurée
- Version : 0.1.3
- Dernière activité : commit `bf39d51` (/r)
- Dépendances runtime : **aucune**

## Observations importantes

### Points forts
- Architecture claire et modulaire : queue / usage / ui / util bien séparés
- `ClaudeLocalProvider` : lecture locale des sessions Claude Code sans credentials — élégant
- Zéro dépendance runtime : légèreté maximale, pas de risque supply-chain
- `QueueProcessor` en polling 60s avec livraison via `workspace.fs` : fonctionne en Remote SSH/WSL
- Tests purs sur les utilitaires (time, queue) sans dep VS Code

### Risques identifiés
- **`media/icon.png` manquant** : bloque la publication Marketplace (package.json le référence)
- **2 TreeDataProviders legacy** (`UsageViewProvider`, `QueueViewProvider`) côtoient les WebviewProviders — duplication potentielle, à clarifier
- **Couverture de tests faible** : uniquement `time.ts` et `QueueStore` testés
- **ClaudeLocalProvider** dépend du format de `~/.claude/projects/*.jsonl` — peut casser si Anthropic change le format

### Pièges à éviter
- Ne pas utiliser `glob` — il a été retiré du projet (utiliser `fs.readdirSync`)
- Ne pas utiliser les clés projet OpenAI (sk-proj-…) pour l'usage API — seules les clés org admin (sk-org-…) fonctionnent
- Ne pas ajouter de dépendances runtime — contrainte forte, même pour de petits utilitaires

## Recommandations

### Prochaine étape suggérée
- Pour ajouter une feature → `/workflows/feature-dev [nom-feature]`
- Pour un fix rapide → `/workflows/bmad-quick [description]`
- Pour préparer la publication → commencer l'épic 04 (icon.png + README)

### Stories prioritaires identifiées
1. **S04-01** — Ajouter `media/icon.png` (bloquant pour la publication)
2. **S03-02** — Notification toast à la livraison (UX basique manquante)
3. **S03-01** — Édition d'un item en attente (demande fréquente)
