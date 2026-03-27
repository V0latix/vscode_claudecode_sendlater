# Story [N].[M] : [TITRE DESCRIPTIF]

> **Phase BMAD** : 4 — Implémentation
> **Agent création** : scrum-master (Bob) → commande `CS`
> **Agent implémentation** : developer → commande `DS`
> **Source** : docs/epic-[N].md, docs/architecture.md, docs/project-context.md

**Status**: `ready-for-dev`
*(valeurs possibles : draft | ready-for-dev | in-progress | complete | blocked)*

**Epic** : [N] — [Titre de l'épic]
**Estimation** : S / M / L
**Priorité** : haute / moyenne / basse

---

## Story

As a **[rôle utilisateur]**, I want **[action précise à réaliser]**, so that **[bénéfice concret obtenu]**.

---

## Acceptance Criteria

1. **[Critère 1]** : [Description mesurable, testable, sans ambiguïté]
2. **[Critère 2]** : [Description mesurable, testable, sans ambiguïté]
3. **[Critère 3]** : [Description mesurable, testable, sans ambiguïté]

> **Règle** : Chaque AC doit être indépendamment vérifiable.
> Mauvais : "L'interface est intuitive" ✗
> Bon : "Le formulaire affiche un message d'erreur sous chaque champ invalide" ✓

---

## Tasks / Subtasks

- [ ] **Task 1** : [Description de la tâche] *(AC: #1)*
  - [ ] Subtask 1.1 : [Détail précis de l'implémentation]
  - [ ] Subtask 1.2 : [Détail précis]
- [ ] **Task 2** : [Description] *(AC: #2)*
  - [ ] Subtask 2.1 : [Détail]
  - [ ] Subtask 2.2 : [Détail]
- [ ] **Task 3** : Tests *(AC: #1, #2, #3)*
  - [ ] Tests unitaires : [Ce qui est testé]
  - [ ] Tests d'intégration : [Flux testé]
  - [ ] Mise à jour des tests existants : [Fichiers concernés]
- [ ] **Task 4** : Vérifications finales
  - [ ] `npm run type-check` — 0 erreurs
  - [ ] `npm test` — tous au vert
  - [ ] `npm run lint` — 0 erreurs

---

## Dev Notes

> **Important** : Ces notes sont extraites de `docs/architecture.md` et `docs/project-context.md`.
> Le developer agent ne doit PAS avoir à lire ces documents — tout est ici.

### Patterns obligatoires

**Error handling** :
```typescript
// Pattern à utiliser (tiré de project-context.md)
const result = await someOperation()
if (!result.ok) return err(result.error)
```

**Auth** :
```typescript
// Vérification à faire dans la Server Action / Route Handler
const session = await auth()
if (!session?.user) return err(new UnauthorizedError())
```

**Async** :
```typescript
// Pattern concurrent si applicable
const [a, b] = await Promise.all([operationA(), operationB()])
```

### Fichiers à créer / modifier

| Fichier | Action | Description |
|---------|--------|-------------|
| `src/server/services/[feature].service.ts` | Créer | Service métier pour [feature] |
| `src/server/repositories/[feature].repository.ts` | Créer | Repository Prisma |
| `src/app/api/[route]/route.ts` | Créer/Modifier | Route Handler |
| `src/components/features/[feature]/[Component].tsx` | Créer | Composant UI |
| `src/server/services/[feature].service.test.ts` | Créer | Tests unitaires |
| `prisma/schema.prisma` | Modifier (si BDD) | Ajouter modèle [X] |

### Contraintes d'implémentation

- TypeScript strict — pas de `any` ni `as` non justifié
- [Contrainte spécifique 1 tirée de project-context.md]
- [Contrainte spécifique 2]
- Pas de régression sur [fonctionnalité existante liée]

### Migration BDD (si applicable)

```bash
npx prisma migrate dev --name [nom-migration]
```

Changements : [Description des changements de schéma]

### Project Structure Notes

- Alignement avec la structure existante : [chemins/conventions à respecter]
- Conflits identifiés : Aucun / [Description et résolution]

### References

- [Source: docs/architecture.md#Patterns-architecturaux]
- [Source: docs/project-context.md#Patterns-Obligatoires]
- [Source: docs/epic-[N].md#Critères-d-acceptation]

---

## Non inclus (scope guard)

> Ces éléments semblent liés mais sont explicitement hors scope de cette story.

- [Élément 1] → traité dans story [N].[M+1]
- [Élément 2] → hors périmètre MVP

---

## Dépendances

- **Dépend de** : Story [N].[M-1] — [Raison] *(Status: complete / in-progress)*
- **Bloque** : Story [N].[M+1] — [Raison]

---

## Dev Agent Record

*(Section remplie par le developer agent pendant l'implémentation)*

### Agent Model Used

[claude-opus-4-5 / claude-sonnet-4-5]

### Completion Notes

[Notes sur les décisions prises pendant l'implémentation, difficultés rencontrées, patterns découverts]

### Debug Log References

[Références aux logs de debug si applicable]

### File List (Actual)

> Fichiers réellement créés/modifiés (vs. prévus dans Dev Notes)

- `[chemin/fichier.ts]` — Créé / Modifié — [Notes]
- `[chemin/fichier.test.ts]` — Créé / Modifié
