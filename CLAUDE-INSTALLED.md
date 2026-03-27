# Claude Code Architecture — Modules installés

**Date :** 2026-03-27
**Modules :** core process dev frontend devops ai-llm bmad vscode data mobile

## Commandes disponibles

### Core Foundation

- `/tools/git-status — Git status enrichi avec suggestions`
- `/tools/env-check — Recenser les variables d'environnement`
- `/tools/changelog [version] — Générer le CHANGELOG depuis git`
- `/tools/deps-audit — Audit sécurité et obsolescence des dépendances`
- `/tools/continue — Sauvegarder l'état de session pour reprise`

### TDD & Development Process

- `/tools/write-plan [feature] — Plan TDD granulaire dans docs/plans/ (tâches 2-5 min)`
- `/tools/execute-plan [chemin] — Exécuter un plan task par task avec TDD + verification`

### General Software Development

- `use developer agent — Implémentation, debugging, refactoring`
- `use architect agent — Design système, ADR, choix tech`
- `use code-reviewer agent — Review multi-critères en parallèle`
- `use qa-engineer agent — Tests, qualité, couverture`
- `use doc-writer agent — Documentation technique`
- `use analyst agent — Brainstorming, recherche, briefs`
- `/workflows/feature-dev [feature] — Développement E2E`
- `/workflows/code-review [fichier] — Review par 5 agents en parallèle`
- `/workflows/refactor [cible] — Refactoring intelligent`
- `/workflows/full-context [feature] — Analyse multi-agents complète`
- `/workflows/new-project-setup — Scaffold complet nouveau projet`
- `/workflows/repo-context [repo] — Analyse repo → génère tout le contexte`
- `/workflows/verify-goal [feature] — Vérification orientée-objectif (GSD)`
- `/tools/scaffold [composant] — Scaffolding de composants/modules`
- `/tools/test-gen [fichier] — Générer des tests automatiquement`
- `/tools/create-docs — Générer la documentation`
- `/tools/update-docs — Synchroniser docs/code`

### Frontend & UI Development

- `use frontend-specialist agent — Implémentation React/Next.js (code UI)`
- `use ui-expert agent — UI app end-to-end (design system, shadcn/ui, animations, dark mode)`
- `use ux-expert agent — UI/UX, wireframes, design system`

### DevOps & Infrastructure

- `use devops-engineer agent — CI/CD, Docker, Kubernetes, infra`
- `use incident-responder agent — Incidents production, postmortems`
- `use security-auditor agent — Audit sécurité, OWASP, SAST`
- `use performance-engineer agent — Profiling, optimisation, benchmarks`
- `/workflows/security-audit [module] — Audit sécurité complet (OWASP)`
- `/workflows/performance-audit [module] — Profiling, benchmarks, optimisation DB`
- `/workflows/incident-postmortem [incident] — Triage, résolution, postmortem blameless`
- `/workflows/api-design-review [api] — Design/review API REST, OpenAPI, sécurité`

### AI & LLM Applications

- `use ai-engineer agent — Applications LLM, RAG, chatbots, agents IA`
- `/workflows/ai-feature [feature] — Développement feature IA/LLM/RAG end-to-end`

### BMAD Methodology

- `use bmad-orchestrator agent — Orchestration BMAD, routing de phase, gates`
- `use product-manager agent — PRD, spécifications, roadmap`
- `use scrum-master agent — Stories, sprints, agile`
- `/workflows/bmad-greenfield [projet] — BMAD nouveau projet : Brief → PRD → Archi → Dev loop`
- `/workflows/bmad-brownfield [projet] — Découverte projet existant : diagnostic, project-context.md, architecture, épics`
- `/workflows/bmad-quick [changement] — BMAD Quick Flow : spec rapide → dev direct`
- `/tools/bmad-story [description] — Créer une story BMAD prête pour le développement`

### VSCode Extension Development

- `use vscode-developer agent — Extensions VSCode : TreeView, Webview, LSP, Chat Participant, Marketplace`
- `/workflows/vscode-extension-dev [ext] — Développement extension VSCode end-to-end → Marketplace`
- `/tools/vscode-scaffold [nom] [type] — Scaffold extension VSCode (command|treeview|webview|language|chat-participant)`

### Data Science & Engineering

- `use data-scientist agent — Analyse de données, ML, statistiques`
- `/workflows/data-pipeline [pipeline] — Pipeline ELT, dbt, qualité des données, Airflow`

### Mobile Development

- `use mobile-developer agent — Applications React Native / Flutter (cross-platform)`

