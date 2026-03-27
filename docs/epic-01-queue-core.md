# Épic 01 — Queue Core
> Status: **Complete** (v0.1.x)

## Objectif
Permettre à l'utilisateur de mettre en file d'attente des prompts avec un délai, et de les livrer automatiquement sous forme de fichiers `.md`.

## Stories

- [x] S01-01 — Commande `queuePrompt` : saisie texte + délai
- [x] S01-02 — Commande `queueFromClipboard`
- [x] S01-03 — Commande `queueFromEditor`
- [x] S01-04 — `QueueStore` : persistance `globalState`
- [x] S01-05 — `QueueProcessor` : polling 60s + livraison fichier
- [x] S01-06 — `QueueWebviewProvider` : panneau UI avec liste/actions
- [x] S01-07 — Commande `imRateLimited` + `parseRateLimitMessage()`
