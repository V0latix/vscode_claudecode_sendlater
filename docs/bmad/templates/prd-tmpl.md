# PRD — [NOM DU PROJET]

> **Phase BMAD** : 2 — Planning
> **Agent** : product-manager (John)
> **Source** : docs/project-brief.md
> **Statut** : Draft | En review | Approuvé

---

## Objectifs produit

### Vision

[1 phrase : ce que ce produit accomplit à terme]

### Objectifs pour ce cycle (MVP)

1. [Objectif mesurable 1]
2. [Objectif mesurable 2]
3. [Objectif mesurable 3]

### Métriques de succès (OKRs)

| Objectif | Indicateur clé | Cible | Délai |
|----------|---------------|-------|-------|
| [O1] | [KR1] | [Valeur] | [Date] |
| [O2] | [KR2] | [Valeur] | [Date] |

---

## Utilisateurs & Personas

### Persona 1 : [Nom]

**Profil** : [Description]
**Objectif principal** : [Ce qu'il veut accomplir]
**User journey principal** :
1. [Étape 1]
2. [Étape 2]
3. [Étape 3]

### Persona 2 : [Nom] *(si applicable)*

...

---

## Fonctionnalités par épic

### Épic 1 : [Titre] — [Priorité: Must/Should/Could]

**Objectif** : [Valeur métier de cet épic]

| Feature | Description | Priorité | Critères d'acceptation |
|---------|-------------|----------|----------------------|
| [F1.1] | [Description courte] | Must | [AC mesurable] |
| [F1.2] | [Description courte] | Should | [AC mesurable] |

### Épic 2 : [Titre] — [Priorité]

**Objectif** : ...

| Feature | Description | Priorité | AC |
|---------|-------------|----------|----|
| ... | ... | ... | ... |

### Épic 3 : [Titre] — [Priorité]

...

---

## Exigences non-fonctionnelles

### Performance

- Temps de réponse API : p95 < [X]ms
- Page load (LCP) : < [X]s
- Disponibilité : [X]%

### Sécurité

- Authentification : [Mécanisme]
- Autorisation : [RBAC / autres]
- Données sensibles : [RGPD, chiffrement, etc.]

### Accessibilité

- Standard : WCAG [2.1 AA / 2.2 AA]
- Navigateurs supportés : [Liste]
- Mobile : [Responsive / App native]

### Scalabilité

- Utilisateurs simultanés cibles : [X]
- Volume de données : [X]

---

## Hors périmètre (explicite)

> Ces éléments ne seront PAS livrés dans ce cycle, même s'ils semblent naturels.

- [Élément 1] — *raison : [pourquoi pas maintenant]*
- [Élément 2] — *raison : [pourquoi pas maintenant]*

---

## Dépendances & Intégrations

| Dépendance | Type | Impact | Owner |
|-----------|------|--------|-------|
| [API externe] | Technique | [Description] | [Équipe] |
| [Service tiers] | Business | [Description] | [Équipe] |

---

## Risques produit

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| [Risque 1] | Haute | Haute | [Plan] |
| [Risque 2] | Moyenne | Moyenne | [Plan] |

---

## Critères d'acceptation globaux

> Le produit sera considéré comme livré quand :

- [ ] [Critère 1 — testable]
- [ ] [Critère 2 — testable]
- [ ] [Critère 3 — testable]

---

## Changelog PRD

| Version | Date | Changement | Auteur |
|---------|------|------------|--------|
| 1.0 | [date] | Création initiale | product-manager |

---

## Prochaines étapes (Phase 3)

- [ ] Valider le PRD avec les parties prenantes
- [ ] Créer l'architecture : `use architect agent` → commande `CA`
- [ ] Créer la front-end spec (si UI) : `use ux-expert agent` → commande `CU`
