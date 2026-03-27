# Épic 02 — Usage Monitor
> Status: **Complete** (v0.1.x)

## Objectif
Permettre à l'utilisateur de suivre sa consommation de tokens Claude Code et OpenAI/Anthropic directement dans VS Code, sans quitter son environnement.

## Stories

- [x] S02-01 — `IUsageProvider` interface + `TokenUsage` types
- [x] S02-02 — `ClaudeLocalProvider` : lecture `~/.claude/projects/*.jsonl`
- [x] S02-03 — `OpenAIUsageProvider` : API admin OpenAI
- [x] S02-04 — `AnthropicUsageProvider` : API admin Anthropic
- [x] S02-05 — `LocalEstimateProvider` : estimation chars/4
- [x] S02-06 — `UsageService` : agrégation + cache + auto-refresh
- [x] S02-07 — `UsageWebviewProvider` : panneau UI avec tokens + breakdown
- [x] S02-08 — Commande `usage.setLimits` : calibration depuis claude.ai %
