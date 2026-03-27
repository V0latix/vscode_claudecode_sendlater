# Checklist — Product Manager Review

> **Usage** : Vérifier la qualité du PRD avant de passer en Phase 3.
> **Agent** : product-manager (John)
> Exécuter après la création de `docs/prd.md`.

---

## ✅ Section 1 — Clarté et complétude

### Vision et objectifs

- [ ] La vision produit est exprimée en 1-2 phrases compréhensibles par n'importe qui
- [ ] Les objectifs sont SMART (Spécifiques, Mesurables, Atteignables, Réalistes, Temporels)
- [ ] Les métriques de succès ont une valeur baseline ET un objectif cible
- [ ] Le lien entre les features et les métriques de succès est explicite

### Fonctionnalités

- [ ] Chaque feature a une description qui dit QUOI, pas COMMENT (pas de détails d'implémentation)
- [ ] La priorisation MoSCoW est appliquée à toutes les features
- [ ] Les features Must constituent un MVP cohérent et livrable
- [ ] Les critères d'acceptation sont mesurables (testables) pour chaque feature

---

## ✅ Section 2 — Utilisateurs et valeur

### Personas

- [ ] Les personas correspondent aux utilisateurs réels du project-brief.md
- [ ] Les user journeys couvrent les flux principaux
- [ ] Les user journeys identifient les points de friction actuels

### Valeur métier

- [ ] Chaque épic a une valeur métier claire (pas "implémenter X")
- [ ] Le lien feature → bénéfice utilisateur est explicite
- [ ] Le ROI attendu du MVP est justifié

---

## ✅ Section 3 — Scope et limites

### Hors périmètre

- [ ] La section "Hors périmètre" est remplie avec au moins 3 éléments explicites
- [ ] Chaque élément hors périmètre a une justification
- [ ] Les features reportées sont distinguées des features refusées définitivement

### Risques

- [ ] Les risques produit (pas juste techniques) sont identifiés
- [ ] Chaque risque a une mitigation ou un plan de contingence
- [ ] Les hypothèses non validées du project-brief sont traitées

---

## ✅ Section 4 — Cohérence interne

- [ ] Pas de contradiction entre les fonctionnalités et les exigences non-fonctionnelles
- [ ] Les contraintes (temps, budget, tech) du project-brief sont respectées
- [ ] L'ordre des épics est cohérent (les épics dépendants viennent après)
- [ ] Les intégrations et dépendances externes sont toutes référencées

---

## ✅ Section 5 — Prêt pour l'architecture

- [ ] L'architecte peut déduire le schéma de données des features décrites
- [ ] Les API nécessaires sont identifiables depuis les user journeys
- [ ] Les exigences de performance sont suffisamment précises pour dimensionner
- [ ] Les contraintes de sécurité/compliance sont explicites

---

## Résultat

```
PRD [Projet] v[X.X] — [Date]

✅ Approuvé — prêt pour Phase 3
→ use architect agent → CA

OU

⚠️ Corrections nécessaires :
- [Point 1 à corriger]
- [Point 2 à corriger]
→ Corriger et soumettre à nouveau
```
