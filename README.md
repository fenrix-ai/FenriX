# FenriX

AI-powered competitive analytics games. Built with agentic AI frameworks.

## Repository Structure

- `docs/` — Organization documentation (onboarding, workflows, tech stack)
- `templates/` — Reusable starter templates for new game projects
- `games/` — Individual game projects (each game is a subfolder)
- `shared/` — Shared modules reused across games (auth, leaderboard, analytics)
- `.github/` — PR and issue templates

## Getting Started

See [docs/onboarding.md](docs/onboarding.md) for the full team setup guide.

## Local Dev Quick-Start (Bakery Bash)

```bash
# 1. Frontend
cd games/bakery-bash/app
npm install
cp .env.example .env.local         # then fill in Firebase web config
npm run dev                        # http://localhost:5173

# 2. Backend / Firebase Functions (separate terminal)
cd games/bakery-bash/backend
npm install
cd functions && npm install        # function runtime deps
firebase emulators:start           # auth:9099  firestore:8080  functions:5001  ui:4000
```

Firebase web SDK config can be pulled with:

```bash
firebase apps:sdkconfig WEB --project bakery-bash-54d12
```

Switching the active Firebase account:

```bash
firebase login:list
firebase login:use <email>         # the account that owns bakery-bash-54d12
```

**Recommended**: clone the repo onto a local SSD (e.g. `D:\FenriX-AI`) rather than working inside a synced Google Drive folder — npm/Vite/Firebase tooling is dramatically faster on a non-synced volume.

## Current Projects

| Project | Path | Firebase Project | Status |
|---------|------|------------------|--------|
| Bakery Bash | `games/bakery-bash/` | `bakery-bash-54d12` | In Development |
