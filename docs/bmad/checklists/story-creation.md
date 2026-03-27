# Checklist — Création de Story BMAD

> **Usage** : Exécuter AVANT de passer le status d'une story à `ready-for-dev`.
> **Agent** : scrum-master → commande `CS`
> Objectif : prévenir les erreurs les plus coûteuses avant que le developer ne commence.

---

## 🔍 Analyse préalable (avant de créer la story)

### Sources à lire obligatoirement

- [ ] `docs/project-context.md` — chargé et compris
- [ ] `docs/architecture.md` — section(s) pertinente(s) lue(s)
- [ ] `docs/epic-[N].md` — l'épic parent compris
- [ ] Stories précédentes de l'épic — patterns respectés
- [ ] `git log --oneline -20` — comprendre ce qui a été fait récemment

### Analyse du codebase existant

```bash
# La fonctionnalité existe-t-elle déjà ?
grep -r "[mot-clé-feature]" src/ --include="*.ts" -l 2>/dev/null

# Fichiers à modifier — chemins exacts
find src -name "[pattern]" 2>/dev/null

# Tests existants liés
find src -name "*.test.ts" | xargs grep -l "[mot-clé]" 2>/dev/null

# Patterns utilisés dans le projet pour cette feature
find src -name "*.service.ts" | head -2 | xargs cat 2>/dev/null | head -50
```

---

## ✅ Prévention des disasters (avant d'écrire)

### Pas de réinvention de l'existant

- [ ] La fonctionnalité demandée n'existe pas déjà dans le code
- [ ] Pas de duplication d'un service/composant existant
- [ ] Utilise les utilitaires et helpers déjà présents

### Bons fichiers et chemins

- [ ] Les chemins de fichiers dans `Dev Notes` ont été vérifiés avec `find`
- [ ] Les noms de fichiers respectent les conventions du projet (kebab-case, etc.)
- [ ] Les nouveaux fichiers sont créés au bon endroit (selon `architecture.md`)

### Bonnes bibliothèques et versions

- [ ] Les bibliothèques référencées dans la story sont celles installées dans `package.json`
- [ ] Pas de suggestion d'une nouvelle dépendance sans l'avoir mentionné explicitement
- [ ] Les versions spécifiées dans `project-context.md` sont respectées

### Pas de risque de régression

- [ ] Les fichiers à modifier ont été analysés pour comprendre leur usage actuel
- [ ] Les tests existants couvrant ces fichiers sont identifiés
- [ ] La task "Mettre à jour les tests existants" est présente si applicable

---

## ✅ Qualité de la story

### User Story

- [ ] Format "As a [rôle], I want [action], so that [bénéfice]" respecté
- [ ] Le rôle est un persona réel du PRD (pas "en tant qu'utilisateur" générique)
- [ ] L'action est précise et mesurable
- [ ] Le bénéfice est une valeur métier réelle

### Acceptance Criteria

- [ ] Chaque AC est mesurable et testable indépendamment
- [ ] Les ACs couvrent les cas nominaux ET les cas d'erreur
- [ ] Pas d'AC vague comme "l'interface est intuitive"
- [ ] Maximum 5-7 ACs (si plus, découper la story)

### Tasks

- [ ] Chaque task référence le(s) AC qu'elle satisfait (`AC: #N`)
- [ ] La dernière task est toujours "Tests" (couvrant tous les ACs)
- [ ] Pas de task vague comme "Implémenter la feature"
- [ ] L'ordre des tasks est logique (dépendances respectées)

### Dev Notes

- [ ] Les patterns de `project-context.md` sont copiés verbatim (pas paraphrasés)
- [ ] La table "Fichiers à créer/modifier" est complète avec chemins exacts
- [ ] Les contraintes d'implémentation sont explicites et actionnables
- [ ] Les références pointent vers des sections réelles des documents sources

### Scope Guard

- [ ] La section "Non inclus" est remplie avec au moins 1 élément
- [ ] Les éléments hors scope sont explicitement liés à une autre story ou au post-MVP

---

## ✅ Autonomie de la story

> Test d'autonomie : un developer agent peut implémenter cette story en lisant UNIQUEMENT ce fichier, sans devoir consulter d'autres documents.

- [ ] Tous les patterns nécessaires sont dans les Dev Notes (pas besoin de lire `project-context.md`)
- [ ] Tous les chemins de fichiers sont précis (pas besoin de chercher avec `find`)
- [ ] Les contraintes d'auth/permission sont explicites
- [ ] Les conventions de nommage sont précisées

---

## ✅ Cohérence avec l'épic

- [ ] La story contribue à au moins 1 AC de l'épic parent
- [ ] Le numéro et titre de l'épic sont corrects
- [ ] Les dépendances avec les autres stories sont à jour
- [ ] L'estimation (S/M/L) est réaliste

---

## Résultat

```
Story [N].[M] : [Titre]

✅ Prête pour développement
→ Status : ready-for-dev

OU

⚠️ Issues détectées :
- [Issue 1 — à corriger avant ready-for-dev]
- [Issue 2]
→ Corriger et re-valider
```
