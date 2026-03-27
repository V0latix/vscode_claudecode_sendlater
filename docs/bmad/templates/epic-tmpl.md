# Épic [N] : [TITRE DE L'ÉPIC]

> **Phase BMAD** : 3 — Solutioning
> **Agent** : scrum-master (Bob) + product-manager (John)
> **Source** : docs/prd.md, docs/architecture.md
> **Statut** : Draft | Prêt | En cours | Terminé

---

## Objectif métier

[2-3 phrases décrivant la valeur métier de cet épic. Pourquoi est-ce important pour les utilisateurs ?]

**Valeur livrée** : [Ce que l'utilisateur peut faire après cet épic qu'il ne pouvait pas faire avant]

---

## Lien avec le PRD

- **Features couvertes** : [F1.1], [F1.2], [F1.3] (référence au PRD)
- **Persona(s) concerné(s)** : [Persona 1], [Persona 2]
- **Priorité PRD** : Must / Should / Could

---

## Critères d'acceptation de l'épic

> L'épic est considéré comme terminé quand TOUS ces critères sont satisfaits.

- [ ] **AC-E[N].1** : [Critère mesurable et testable]
- [ ] **AC-E[N].2** : [Critère mesurable et testable]
- [ ] **AC-E[N].3** : [Critère mesurable et testable]

---

## Stories

| # | Titre | Priorité | Dépendances | Status |
|---|-------|----------|-------------|--------|
| [N].1 | [Titre story 1] | Haute | — | Draft |
| [N].2 | [Titre story 2] | Haute | [N].1 | Draft |
| [N].3 | [Titre story 3] | Moyenne | [N].1 | Draft |
| [N].4 | [Titre story 4] | Basse | [N].2, [N].3 | Draft |

**Ordre de développement suggéré** : [N].1 → [N].2 → [N].3 → [N].4

---

## Composants techniques impliqués

> Tirés de `docs/architecture.md`

- `src/server/services/[service].ts` — [Nouveau / Modifié]
- `src/server/repositories/[repo].ts` — [Nouveau / Modifié]
- `src/app/api/[route]/route.ts` — [Nouveau / Modifié]
- `src/components/features/[feature]/` — [Nouveau / Modifié]
- `prisma/schema.prisma` — [Nouveau modèle / Migration]

---

## Dépendances

### Dépend de

- **Épic [M]** : [Raison de la dépendance] — Status: [Terminé / En cours]
- **Infrastructure** : [Service externe si applicable]

### Bloque

- **Épic [N+1]** : [Raison]

---

## Risques techniques

| Risque | Probabilité | Mitigation |
|--------|-------------|------------|
| [Risque 1] | Moyenne | [Mitigation] |
| [Risque 2] | Faible | [Mitigation] |

---

## Définition de Done (épic)

- [ ] Toutes les stories de l'épic sont au status `complete`
- [ ] Tous les AC de l'épic sont validés
- [ ] Tests E2E couvrant le parcours utilisateur principal
- [ ] Documentation mise à jour si API publique modifiée
- [ ] `docs/project-context.md` mis à jour avec les nouveaux patterns
- [ ] Rétrospective faite (`docs/retrospective-epic-[N].md`)

---

## Notes

[Informations complémentaires, décisions prises, points d'attention]
