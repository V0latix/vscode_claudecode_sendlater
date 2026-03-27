# Front-end Specification — [NOM DU PROJET]

> **Phase BMAD** : 2 — Planning
> **Agent** : ux-expert (Sally)
> **Source** : docs/prd.md
> **Statut** : Draft | Approuvé

---

## Architecture Frontend

### Stack UI

| Technologie | Version | Rôle |
|-------------|---------|------|
| Next.js App Router | 15.x | Framework + routing |
| React | 18.x | UI components |
| Tailwind CSS | 3.x | Styling |
| [shadcn/ui / Radix / autre] | Latest | Composants de base |
| [Zustand / Jotai / Context] | Latest | State management |

### Stratégie de rendu

| Type | Usage |
|------|-------|
| Server Components (RSC) | Pages, layouts, data fetching |
| Client Components | Interactivité, état local, browser APIs |
| Server Actions | Mutations, formulaires |

### Structure des composants

```
src/components/
├── ui/                    # Composants atomiques (pas de logique métier)
│   ├── button.tsx
│   ├── input.tsx
│   └── ...
├── features/              # Composants de feature (logique métier)
│   └── [feature]/
│       ├── [Feature]Page.tsx      # Layout de la page
│       ├── [Feature]Form.tsx      # Formulaire
│       ├── [Feature]List.tsx      # Liste/tableau
│       └── [Feature]Card.tsx      # Carte/item
└── layouts/               # Layouts partagés
    ├── main-layout.tsx
    └── auth-layout.tsx
```

---

## Design System

### Palette de couleurs

```
Primary   : [hex] — Actions principales, CTA
Secondary : [hex] — Éléments secondaires
Accent    : [hex] — Highlights, badges
Success   : [hex] — Confirmations (#22c55e)
Warning   : [hex] — Alertes (#f59e0b)
Error     : [hex] — Erreurs (#ef4444)
Neutral   : [hex] — Textes, borders
Background: [hex] — Fond de page
```

### Typographie

```
Titre (h1)  : [font], [size], [weight]
Titre (h2)  : [font], [size], [weight]
Body        : [font], [size], [weight]
Caption     : [font], [size], [weight]
Code        : [font mono], [size]
```

### Espacements

Utiliser l'échelle Tailwind : 4px base (p-1=4px, p-2=8px, p-4=16px...)

### Composants clés

| Composant | Description | Variants |
|-----------|-------------|---------|
| Button | CTA principal et secondaire | primary, secondary, ghost, destructive |
| Input | Champs de formulaire | default, error, disabled |
| Card | Conteneur de contenu | default, interactive |
| Badge | Statuts et labels | success, warning, error, info |
| Modal | Dialogs et confirmations | default, fullscreen |

---

## Écrans principaux

### Écran 1 : [Nom de l'écran]

**Route** : `/[route]`
**Accès** : Public / Authentifié / Admin

#### Wireframe

```
┌─────────────────────────────────────────┐
│  Header: Logo │ Nav │ [User Avatar]     │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │  [Sidebar]   │  │  [Contenu        │  │
│  │              │  │   principal]     │  │
│  │  - Nav item  │  │                 │  │
│  │  - Nav item  │  │  [Liste/Table]  │  │
│  │  - Nav item  │  │                 │  │
│  └──────────────┘  └─────────────────┘  │
│                                         │
│  Footer                                 │
└─────────────────────────────────────────┘
```

#### Composants utilisés

- `MainLayout` — Layout de base
- `[FeatureList]` — Liste des éléments
- `[FeatureCard]` — Carte individuelle
- `Button` (primary) — CTA principal

#### États de l'écran

| État | Description | UI |
|------|-------------|-----|
| Loading | Données en cours de chargement | Skeleton loader |
| Empty | Pas de données | Empty state avec CTA |
| Error | Erreur de chargement | Error message + retry |
| Populated | Données disponibles | Liste/tableau |

### Écran 2 : [Nom]

...

---

## Flux utilisateur

### Flux 1 : [Nom du flux principal]

```
[Écran A] → (action utilisateur) → [Écran B] → (validation) → [Écran C]
                                        ↓
                                   (erreur)
                                        ↓
                                  [Message erreur]
```

**Étapes** :
1. L'utilisateur fait [action] sur [Écran A]
2. [Description de ce qui se passe]
3. Affichage de [Écran B] avec [données/état]
4. L'utilisateur [action 2]
5. Résultat : [Écran C / confirmation]

### Flux 2 : [Nom]

...

---

## Accessibilité (WCAG 2.1 AA)

### Règles obligatoires

- [ ] Contraste texte/fond ≥ 4.5:1 (normal), ≥ 3:1 (large)
- [ ] Tous les éléments interactifs accessibles au clavier
- [ ] Focus visible sur tous les éléments focusables
- [ ] Images avec attribut `alt` descriptif
- [ ] Formulaires : labels explicites pour chaque champ
- [ ] Messages d'erreur associés aux champs (`aria-describedby`)
- [ ] Navigation possible sans souris (tabindex, keyboard events)
- [ ] Regions ARIA pour navigation (`role="main"`, `role="nav"`)

### Points d'attention spécifiques

- [Point d'attention 1 spécifique au projet]
- [Point d'attention 2]

---

## Responsive Design

| Breakpoint | Taille | Comportement |
|------------|--------|--------------|
| Mobile | < 768px | [Comportement mobile] |
| Tablet | 768-1024px | [Comportement tablette] |
| Desktop | > 1024px | [Comportement desktop] |

---

## États de chargement

### Stratégie globale

- **Data fetching** : Suspense + skeleton loaders
- **Mutations** : État loading sur le bouton + optimistic updates
- **Erreurs** : Toast notifications + inline error messages

### Composants de loading

```tsx
// Skeleton pour les cartes
<CardSkeleton /> // dans src/components/ui/skeletons/

// Page loading
export default function Loading() {
  return <PageSkeleton />
}
```

---

## Conventions de nommage composants

- **Pages** : `[FeatureName]Page.tsx` — ex: `UserProfilePage.tsx`
- **Formulaires** : `[FeatureName]Form.tsx` — ex: `LoginForm.tsx`
- **Listes** : `[FeatureName]List.tsx` — ex: `ProductList.tsx`
- **Items** : `[FeatureName]Card.tsx` ou `[FeatureName]Row.tsx`
- **Modals** : `[Action][Resource]Modal.tsx` — ex: `DeleteUserModal.tsx`
- **Hooks** : `use[FeatureName].ts` — ex: `useProductList.ts`

---

## Prochaines étapes (Phase 3)

- [ ] Valider les wireframes avec les parties prenantes
- [ ] Créer l'architecture : `use architect agent` → commande `CA`
