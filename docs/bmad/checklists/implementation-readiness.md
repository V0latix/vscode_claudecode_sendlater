# Checklist — Implementation Readiness Check

> **Usage** : Gate obligatoire entre Phase 3 (Solutioning) et Phase 4 (Implémentation).
> **Agents** : architect (Winston) + product-manager (John) → commande `IR`
> **Verdict** : PASS ✅ | CONCERNS ⚠️ | FAIL ❌

---

## 🔍 Préparation

```bash
# Charger tous les artifacts Phase 3
cat docs/project-brief.md | head -20
cat docs/prd.md | head -40
cat docs/architecture.md | head -60
cat docs/project-context.md | head -40
ls docs/epic-*.md
ls docs/stories/ 2>/dev/null | head -20
```

---

## ✅ Section 1 — Cohérence PRD ↔ Architecture

### Couverture des fonctionnalités

- [ ] Chaque feature Must du PRD est couverte dans au moins un épic
- [ ] Les features Should sont dans les épics ou explicitement reportées
- [ ] Aucune feature de l'architecture n'est absente du PRD (scope creep)

### Cohérence technique

- [ ] L'architecture répond à toutes les exigences non-fonctionnelles du PRD
  - Performance : [SLOs définis dans architecture.md]
  - Sécurité : [Mécanismes auth/authz définis]
  - Scalabilité : [Stratégie définie]
- [ ] Les personas du PRD peuvent accomplir leurs user journeys avec l'architecture proposée

---

## ✅ Section 2 — Complétude de l'architecture

### Décisions techniques

- [ ] Stack technique complètement défini (versions précises)
- [ ] Schéma de données complet (tous les modèles du MVP)
- [ ] APIs définies (tous les endpoints nécessaires)
- [ ] Stratégie d'auth définie et documentée
- [ ] Pattern de gestion d'erreurs choisi et documenté
- [ ] Stratégie de tests définie

### Infrastructure

- [ ] Environnements définis (dev, staging, prod)
- [ ] Variables d'environnement listées (`.env.example` ou dans `architecture.md`)
- [ ] Stratégie de déploiement esquissée

### Risques architecturaux

- [ ] Tous les risques identifiés ont une mitigation
- [ ] Pas de décisions techniques reportées sine die ("on verra plus tard")

---

## ✅ Section 3 — Qualité des épics & stories

### Épics

- [ ] Tous les épics couvrent le périmètre du PRD
- [ ] Ordre de développement des épics logique (dépendances respectées)
- [ ] Chaque épic a des critères d'acceptation mesurables

### Stories

- [ ] Au moins les stories du premier épic sont créées et au status `ready-for-dev`
- [ ] Les stories sont autonomes (pas de références circulaires)
- [ ] La story 1.1 peut être implémentée immédiatement sans bloquer

---

## ✅ Section 4 — `project-context.md` (la constitution)

- [ ] Fichier créé et complet
- [ ] Stack avec versions exactes documenté
- [ ] Règles d'implémentation critiques listées
- [ ] Structure des dossiers documentée
- [ ] Patterns obligatoires avec exemples de code
- [ ] Anti-patterns et pièges documentés

---

## ✅ Section 5 — Faisabilité

### Estimation de charge

- [ ] Le périmètre MVP est réaliste pour les ressources disponibles
- [ ] Les stories du premier sprint sont estimées (S/M/L)
- [ ] Les dépendances externes (APIs tierces, infra) sont disponibles

### Risques de blocage

- [ ] Pas de dépendance critique non résolue
- [ ] Pas de décision d'architecture qui pourrait invalider plusieurs stories
- [ ] Pas d'ambiguïté sur les exigences qui pourrait bloquer l'implémentation

---

## 🚦 Verdict

### Critères de verdict

| Verdict | Condition |
|---------|-----------|
| ✅ PASS | Toutes les cases cochées |
| ⚠️ CONCERNS | 1-3 cases non cochées, avec mitigation documentée |
| ❌ FAIL | 4+ cases non cochées OU un item critique non résolu |

### Items critiques (FAIL automatique si non cochés)

- `project-context.md` créé et complet
- Story 1.1 au status `ready-for-dev`
- Schéma de données complet
- Stratégie d'auth définie

---

## Décision finale

```markdown
## Implementation Readiness Check — [Projet] — [Date]

**Verdict** : ✅ PASS / ⚠️ CONCERNS / ❌ FAIL

### Items non satisfaits (si CONCERNS ou FAIL)
1. [Item] — [Plan de résolution] — [Owner] — [Deadline]
2. [Item] — ...

### Decision
[✅ PASS] → Phase 4 autorisée. Démarrer avec `/workflows/bmad-greenfield` Phase 4.
[⚠️ CONCERNS] → Phase 4 autorisée avec vigilance. Concerns documentés dans architecture.md#known-concerns.
[❌ FAIL] → Retourner en Phase 3. Corriger les items critiques avant de relancer ce check.
```
