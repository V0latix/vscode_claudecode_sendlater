# Checklist — Story Definition of Done (DoD)

> **Usage** : Exécuter avant de passer le status de la story à `complete`.
> **Agent** : code-reviewer → commande `CR`
> Toutes les cases doivent être cochées pour valider la story.

---

## ✅ Fonctionnel

- [ ] **AC satisfaits** : Tous les Acceptance Criteria sont implémentés et vérifiables
- [ ] **Comportement correct** : La feature se comporte exactement comme décrit dans la story
- [ ] **Cas d'erreur** : Les erreurs sont gérées (validation, réseau, auth, etc.)
- [ ] **États UI** : Loading, empty, error, populated states implémentés (si UI)

---

## ✅ Qualité du code

- [ ] **TypeScript strict** : Zéro `any`, pas de `as` non justifié, pas de `!` non justifié
- [ ] **Patterns respectés** : Utilise exactement les patterns de `docs/project-context.md`
- [ ] **Error handling** : Pattern Result type / throw utilisé conformément au projet
- [ ] **Auth** : Vérification de session sur toutes les routes/actions protégées
- [ ] **Validation** : Inputs validés côté serveur (Zod ou équivalent)
- [ ] **Pas de secrets** : Aucune clé API ou donnée sensible en dur dans le code

---

## ✅ Tests

- [ ] **Tests unitaires** : Fonctions métier testées (coverage des cas nominaux et cas d'erreur)
- [ ] **Tests d'intégration** : Flux principaux testés de bout en bout (sans E2E browser)
- [ ] **Tests existants** : Suite de tests existante toujours au vert (pas de régression)
- [ ] **Nommage** : Tests nommés selon `should [comportement] when [condition]`
- [ ] **Coverage** : Pas de baisse du coverage global en dessous du seuil projet

```bash
# Vérifier
npx vitest run --coverage 2>/dev/null | tail -20
```

---

## ✅ Vérifications techniques

- [ ] **Type check** : `npm run type-check` → 0 erreurs

```bash
npx tsc --noEmit
```

- [ ] **Lint** : `npm run lint` → 0 erreurs, 0 warnings critiques

```bash
npm run lint
```

- [ ] **Build** : `npm run build` → succès (si applicable)

---

## ✅ Scope

- [ ] **Scope respecté** : Rien de superflu au-delà des tasks de la story
- [ ] **Scope guard respecté** : Les éléments "Non inclus" ne sont pas implémentés
- [ ] **Pas de refactoring non planifié** : Si refactoring découvert, créer une nouvelle story

---

## ✅ Documentation

- [ ] **Dev Agent Record rempli** : Section remplie dans le fichier story
  - Agent model utilisé
  - Notes de complétion
  - Liste des fichiers réellement modifiés
- [ ] **project-context.md mis à jour** : Si nouveaux patterns ont été découverts
- [ ] **API docs** : Mis à jour si une API publique a changé de contrat
- [ ] **Migrations** : Si migration BDD, vérifier qu'elle est backward-compatible

---

## ✅ Git

- [ ] **Commits conventionnels** : `feat:`, `fix:`, `chore:`, etc.
- [ ] **Commits atomiques** : 1 commit logique par changement cohérent
- [ ] **Pas de fichiers sensibles** : `.env`, secrets, logs non committés

---

## Résultat final

```
Story [N].[M] : [Titre]

✅ Tous les critères DoD satisfaits
→ Status : complete

OU

❌ Critères manquants :
- [ ] [Critère non satisfait]
→ Retourner au developer agent
```
